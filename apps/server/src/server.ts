import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Server as HttpServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { createCareerApplicationService } from '@job-harness/application';
import { createResumeApplicationService, createResumeArtifactService } from '@job-harness/resume-application';
import { CAREER_MCP_TOOLS, createCareerMcpRuntime } from '@job-harness/mcp';
import { SqliteCareerStore, SqliteResumeStore } from '@job-harness/persistence-sqlite';
import { generateJobHarnessOpenApiDocument } from '@job-harness/contracts';
import { API_PREFIX, registerJobHarnessApi } from './api';
import { registerJobHarnessDataAdminApi } from './data-admin';
import { registerResumeApi } from './resume-api';
import { createFileSystemResumeArtifactStorage, createHttpResumePdfRenderer } from './resume-artifacts';
import { getResumeRendererFingerprint, renderResumePreviewHtml } from '@job-harness/resume-renderer';

export interface JobHarnessServerOptions {
  readonly databasePath: string;
  readonly host?: string;
  readonly port?: number;
  readonly authToken?: string | null;
  readonly artifactDirectory?: string;
  readonly resumeRendererUrl?: string | null;
  readonly resumeRendererToken?: string | null;
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

export function createProtocolServer(runtime: ReturnType<typeof createCareerMcpRuntime>): McpServer {
  const server = new McpServer({ name: 'job-harness', version: '0.2.0' });
  for (const tool of CAREER_MCP_TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: tool.mutability === 'read',
          destructiveHint: false,
          idempotentHint: true,
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
  const application = createCareerApplicationService(store);
  const resumeStore = new SqliteResumeStore(options.databasePath);
  const resume = createResumeApplicationService(resumeStore);
  const artifactDirectory = options.artifactDirectory ?? join(dirname(options.databasePath), 'resume-artifacts');
  const resumeArtifacts = createResumeArtifactService(resumeStore, {
    htmlRenderer: {
      rendererId: 'nunjucks-classic',
      rendererVersion: getResumeRendererFingerprint(),
      renderHtml: (revision) => renderResumePreviewHtml(revision.resolvedDocumentSnapshot, { variant: revision.profileId }),
    },
    storage: createFileSystemResumeArtifactStorage(artifactDirectory),
    pdfRenderer: options.resumeRendererUrl
      ? createHttpResumePdfRenderer({ baseUrl: options.resumeRendererUrl, token: options.resumeRendererToken })
      : null,
  });
  const runtime = createCareerMcpRuntime(application);
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

  app.use((req, res, next) => {
    const protectedPath = req.path === '/mcp' || req.path.startsWith(`${API_PREFIX}/`);
    if (protectedPath && authToken && req.headers.authorization !== `Bearer ${authToken}`) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Bearer token is required' } });
      return;
    }
    next();
  });

  registerJobHarnessDataAdminApi(app, options.databasePath, API_PREFIX);
  registerJobHarnessApi(app, application);
  registerResumeApi(app, resume, resumeArtifacts, API_PREFIX);

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

  return {
    url,
    mcpUrl: `${url}/mcp`,
    apiUrl: `${url}${API_PREFIX}`,
    openApiUrl: `${url}/openapi.json`,
    server,
    async close() {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      resumeStore.close();
      store.close();
    },
  };
}
