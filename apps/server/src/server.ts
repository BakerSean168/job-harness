import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Server as HttpServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { createCareerApplicationService } from '@job-harness/application';
import { createResumeApplicationService, createResumeArtifactService } from '@job-harness/resume-application';
import { createJobHarnessMcpRuntime } from '@job-harness/mcp';
import { SqliteApplyStore, SqliteCareerStore, SqliteResumeStore } from '@job-harness/persistence-sqlite';
import { generateJobHarnessOpenApiDocument } from '@job-harness/contracts';
import { createApplyControlPlane } from '@job-harness/apply-runtime';
import { API_PREFIX, registerJobHarnessApi } from './api';
import { registerJobHarnessDataAdminApi } from './data-admin';
import { registerResumeApi } from './resume-api';
import { registerApplyApi } from './apply-api';
import { createApplyBundleFactory } from './apply-bundle';
import { createFileSystemResumeArtifactStorage, createHttpResumePdfRenderer } from './resume-artifacts';
import { getResumeRendererFingerprint, renderResumePreviewHtml } from '@job-harness/resume-renderer';

export interface JobHarnessServerOptions {
  readonly databasePath: string;
  readonly host?: string;
  readonly port?: number;
  readonly authToken?: string | null;
  readonly executorAuthToken?: string | null;
  readonly artifactDirectory?: string;
  readonly resumeRendererUrl?: string | null;
  readonly resumeRendererToken?: string | null;
  readonly submissionReconcileIntervalMs?: number | null;
  readonly submissionStaleAfterMs?: number;
  readonly submissionMaxAutomaticRetries?: number;
  readonly submissionReconcileBatchSize?: number;
}

export interface RunningJobHarnessServer {
  readonly url: string;
  readonly mcpUrl: string;
  readonly apiUrl: string;
  readonly openApiUrl: string;
  readonly server: HttpServer;
  close(): Promise<void>;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'null';
}

export function createProtocolServer(runtime: ReturnType<typeof createJobHarnessMcpRuntime>): McpServer {
  const server = new McpServer({ name: 'job-harness', version: '0.2.0' });
  for (const tool of runtime.listTools()) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: tool.mutability === 'read',
          destructiveHint: false,
          idempotentHint: tool.idempotent !== false,
          openWorldHint: false,
        },
      },
      async (args) => {
        try {
          const result = await runtime.invoke(tool.name, args);
          const structuredContent = result && typeof result === 'object' && !Array.isArray(result)
            ? result as Record<string, unknown>
            : { result };
          return {
            content: [{ type: 'text' as const, text: safeJson(result) }],
            structuredContent,
          };
        } catch (error) {
          const payload = {
            error: error instanceof Error ? error.name : 'Error',
            message: error instanceof Error ? error.message : String(error),
            ...(
              error && typeof error === 'object' && 'code' in error
                ? { code: String((error as { code?: unknown }).code ?? 'UNKNOWN') }
                : {}
            ),
          };
          return {
            isError: true,
            content: [{ type: 'text' as const, text: safeJson(payload) }],
          };
        }
      },
    );
  }
  return server;
}

export async function startJobHarnessServer(options: JobHarnessServerOptions): Promise<RunningJobHarnessServer> {
  mkdirSync(dirname(options.databasePath), { recursive: true });
  const store = new SqliteCareerStore(options.databasePath);
  const resumeStore = new SqliteResumeStore(options.databasePath);
  const applyStore = new SqliteApplyStore(options.databasePath);
  const application = createCareerApplicationService(store, {
    resumeEvidence: {
      async getProfile(profileId) {
        const profile = await resumeStore.getProfile(profileId);
        return profile ? { id: profile.id } : null;
      },
      async getRevision(revisionId) {
        const revision = await resumeStore.getRevision(revisionId);
        return revision ? { id: revision.id, profileId: revision.profileId } : null;
      },
      async getArtifact(artifactId) {
        const artifact = await resumeStore.getArtifact(artifactId);
        return artifact ? { id: artifact.id, revisionId: artifact.revisionId } : null;
      },
    },
  });
  const resume = createResumeApplicationService(resumeStore);
  const apply = createApplyControlPlane(
    applyStore,
    createApplyBundleFactory(application, resumeStore),
    {
      async markManualReview(input) {
        await application.submissionIntents.fail({
          intentId: input.intentId,
          occurredAt: input.occurredAt,
          status: 'needs_manual_review',
          error: input.error,
          externalEvidence: input.evidence,
        });
      },
    },
  );
  const artifactDirectory = options.artifactDirectory ?? join(dirname(options.databasePath), 'resume-artifacts');
  const pdfRenderer = options.resumeRendererUrl
    ? createHttpResumePdfRenderer({ baseUrl: options.resumeRendererUrl, token: options.resumeRendererToken })
    : null;
  const resumeArtifacts = createResumeArtifactService(resumeStore, {
    htmlRenderer: {
      rendererId: 'nunjucks-classic',
      rendererVersion: getResumeRendererFingerprint(),
      renderHtml: (revision) => renderResumePreviewHtml(revision.resolvedDocumentSnapshot, { variant: revision.profileId }),
    },
    storage: createFileSystemResumeArtifactStorage(artifactDirectory),
    pdfRenderer,
  });
  const runtime = createJobHarnessMcpRuntime(application, resume, resumeArtifacts);
  const host = options.host ?? '127.0.0.1';
  const app = createMcpExpressApp({ host });
  const authToken = options.authToken?.trim() || null;

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, service: 'job-harness', version: '0.2.0' });
  });

  app.get('/openapi.json', (_req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.json(generateJobHarnessOpenApiDocument());
  });

  const executorAuthToken = options.executorAuthToken?.trim() || null;
  function isExecutorWorkerRoute(method: string, path: string): boolean {
    if (method !== 'POST') return false;
    return path === `${API_PREFIX}/executors/register`
      || /^\/api\/v1\/executors\/[^/]+\/heartbeat$/.test(path)
      || path === `${API_PREFIX}/execution-attempts/claim`
      || /^\/api\/v1\/execution-attempts\/[^/]+\/(heartbeat|start|waiting|complete|fail|resume-artifact)$/.test(path);
  }
  app.use((req, res, next) => {
    const protectedPath = req.path === '/mcp' || req.path.startsWith(`${API_PREFIX}/`);
    if (!protectedPath || !authToken) { next(); return; }
    const authorization = req.headers.authorization;
    if (authorization === `Bearer ${authToken}`) { next(); return; }
    if (executorAuthToken && authorization === `Bearer ${executorAuthToken}` && isExecutorWorkerRoute(req.method, req.path)) {
      next();
      return;
    }
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Bearer token is required' } });
  });

  registerJobHarnessDataAdminApi(app, options.databasePath, API_PREFIX);
  registerJobHarnessApi(app, application);
  registerResumeApi(app, resume, resumeArtifacts, pdfRenderer, API_PREFIX);
  registerApplyApi(app, apply, resumeArtifacts);

  app.post('/mcp', async (req, res) => {
    const protocolServer = createProtocolServer(runtime);
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    try {
      await protocolServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: error instanceof Error ? error.message : 'Internal server error' },
          id: null,
        });
      }
    } finally {
      await transport.close();
      await protocolServer.close();
    }
  });

  app.get('/mcp', (_req, res) => {
    res.status(405).set('Allow', 'POST').json({ error: 'method_not_allowed' });
  });
  app.delete('/mcp', (_req, res) => {
    res.status(405).set('Allow', 'POST').json({ error: 'method_not_allowed' });
  });

  const requestedPort = options.port ?? 3000;
  const server = await new Promise<HttpServer>((resolve, reject) => {
    const listener = app.listen(requestedPort, host, () => resolve(listener));
    listener.once('error', reject);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : requestedPort;
  const displayHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  const url = `http://${displayHost}:${port}`;

  const reconcileIntervalMs = options.submissionReconcileIntervalMs === undefined ? 300_000 : options.submissionReconcileIntervalMs;
  const staleAfterMs = options.submissionStaleAfterMs ?? 2 * 60 * 60 * 1000;
  const maxAutomaticRetries = options.submissionMaxAutomaticRetries ?? 8;
  const reconcileBatchSize = options.submissionReconcileBatchSize ?? 100;
  let reconcileRunning = false;
  async function reconcileSubmissionIntents(): Promise<void> {
    if (reconcileRunning) return;
    reconcileRunning = true;
    try {
      const staleBefore = new Date(Date.now() - staleAfterMs).toISOString();
      await application.submissionIntents.reconcilePending({
        limit: reconcileBatchSize,
        staleBefore,
        maxAutomaticRetries,
      });
    } catch (error) {
      console.error('Job Harness submission-intent reconciliation failed', error);
    } finally {
      reconcileRunning = false;
    }
  }
  const reconciliationTimer = reconcileIntervalMs && reconcileIntervalMs > 0
    ? setInterval(() => { void reconcileSubmissionIntents(); }, reconcileIntervalMs)
    : null;
  reconciliationTimer?.unref();
  if (reconciliationTimer) queueMicrotask(() => { void reconcileSubmissionIntents(); });

  return {
    url,
    mcpUrl: `${url}/mcp`,
    apiUrl: `${url}${API_PREFIX}`,
    openApiUrl: `${url}/openapi.json`,
    server,
    async close() {
      if (reconciliationTimer) clearInterval(reconciliationTimer);
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      applyStore.close();
      resumeStore.close();
      store.close();
    },
  };
}
