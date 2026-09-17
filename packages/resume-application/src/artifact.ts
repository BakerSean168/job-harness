import { createHash, randomUUID } from 'node:crypto';
import {
  MaterializeResumeArtifactInputSchema,
  MaterializeResumeArtifactOutputSchema,
  type MaterializeResumeArtifactInput,
  type MaterializeResumeArtifactOutput,
  type ResumeArtifact,
  type ResumeRevision,
} from '@job-harness/resume-contracts';
import { ResumeNotFoundError } from './service';
import { canonicalResumeJson } from './revision';
import type { ResumeStorePort } from './store';

export interface ResumeHtmlRendererPort {
  readonly rendererId: string;
  readonly rendererVersion: string;
  renderHtml(revision: ResumeRevision): Promise<string> | string;
}

export interface ResumePdfRendererDescriptor {
  readonly rendererId: string;
  readonly rendererVersion: string;
}

export interface ResumePdfRendererPort {
  describe(): Promise<ResumePdfRendererDescriptor>;
  renderPdf(html: string): Promise<Uint8Array>;
}

export interface ResumeArtifactStoragePort {
  write(input: { artifactId: string; revisionId: string; extension: string; bytes: Uint8Array }): Promise<string>;
  read(storageUri: string): Promise<Uint8Array>;
  remove(storageUri: string): Promise<void>;
}

export interface ResumeArtifactContent {
  readonly artifact: ResumeArtifact;
  readonly bytes: Uint8Array;
}

export interface ResumeArtifactRuntimePorts {
  materialize(input: MaterializeResumeArtifactInput): Promise<MaterializeResumeArtifactOutput>;
  getContent(artifactId: string): Promise<ResumeArtifactContent | null>;
}

export class ResumeArtifactCapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResumeArtifactCapabilityError';
  }
}

export class ResumeArtifactIntegrityError extends Error {
  constructor(readonly artifactId: string) {
    super(`ResumeArtifact '${artifactId}' failed SHA-256 verification`);
    this.name = 'ResumeArtifactIntegrityError';
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function extension(kind: MaterializeResumeArtifactInput['kind']): string {
  if (kind === 'html') return 'html';
  if (kind === 'pdf') return 'pdf';
  return 'json';
}

export function createResumeArtifactService(
  store: ResumeStorePort,
  ports: {
    htmlRenderer: ResumeHtmlRendererPort;
    storage: ResumeArtifactStoragePort;
    pdfRenderer?: ResumePdfRendererPort | null;
    now?: () => string;
  },
): ResumeArtifactRuntimePorts {
  const now = ports.now ?? (() => new Date().toISOString());

  async function descriptor(kind: MaterializeResumeArtifactInput['kind']) {
    if (kind === 'html') return { rendererId: ports.htmlRenderer.rendererId, rendererVersion: ports.htmlRenderer.rendererVersion };
    if (kind === 'json') return { rendererId: 'resolved-resume-json', rendererVersion: '1' };
    if (!ports.pdfRenderer) throw new ResumeArtifactCapabilityError('PDF renderer is not configured');
    return ports.pdfRenderer.describe();
  }

  async function render(revision: ResumeRevision, kind: MaterializeResumeArtifactInput['kind']): Promise<Uint8Array> {
    if (kind === 'json') return Buffer.from(`${canonicalResumeJson(revision.resolvedDocumentSnapshot)}\n`, 'utf8');
    const html = await ports.htmlRenderer.renderHtml(revision);
    if (kind === 'html') return Buffer.from(html, 'utf8');
    if (!ports.pdfRenderer) throw new ResumeArtifactCapabilityError('PDF renderer is not configured');
    return ports.pdfRenderer.renderPdf(html);
  }

  return {
    async materialize(input) {
      const parsed = MaterializeResumeArtifactInputSchema.parse(input);
      const revision = await store.getRevision(parsed.revisionId);
      if (!revision) throw new ResumeNotFoundError('ResumeRevision', parsed.revisionId);
      const renderInfo = await descriptor(parsed.kind);
      const existing = (await store.listArtifacts(revision.id)).find((artifact) =>
        artifact.kind === parsed.kind
        && artifact.rendererId === renderInfo.rendererId
        && artifact.rendererVersion === renderInfo.rendererVersion,
      );
      if (existing) return MaterializeResumeArtifactOutputSchema.parse({ artifact: existing, reused: true });

      // Expensive rendering is deliberately outside the SQLite write transaction.
      const bytes = await render(revision, parsed.kind);
      if (bytes.byteLength === 0) throw new ResumeArtifactCapabilityError(`Renderer produced an empty ${parsed.kind} artifact`);
      const digest = sha256(bytes);
      const artifactId = `resume-artifact-${randomUUID()}`;
      let storageUri: string | null = null;
      try {
        return await store.transaction(async (tx) => {
          const raced = (await tx.listArtifacts(revision.id)).find((artifact) =>
            artifact.kind === parsed.kind
            && artifact.rendererId === renderInfo.rendererId
            && artifact.rendererVersion === renderInfo.rendererVersion,
          );
          if (raced) return MaterializeResumeArtifactOutputSchema.parse({ artifact: raced, reused: true });
          storageUri = await ports.storage.write({ artifactId, revisionId: revision.id, extension: extension(parsed.kind), bytes });
          const artifact: ResumeArtifact = {
            id: artifactId,
            revisionId: revision.id,
            kind: parsed.kind,
            mimeType: parsed.kind === 'html' ? 'text/html; charset=utf-8' : parsed.kind === 'pdf' ? 'application/pdf' : 'application/json; charset=utf-8',
            storageUri,
            sha256: digest,
            byteSize: bytes.byteLength,
            rendererId: renderInfo.rendererId,
            rendererVersion: renderInfo.rendererVersion,
            createdAt: now(),
          };
          await tx.insertArtifact(artifact);
          return MaterializeResumeArtifactOutputSchema.parse({ artifact, reused: false });
        });
      } catch (error) {
        if (storageUri) await ports.storage.remove(storageUri).catch(() => undefined);
        throw error;
      }
    },

    async getContent(artifactId) {
      const artifact = await store.getArtifact(artifactId);
      if (!artifact) return null;
      const bytes = await ports.storage.read(artifact.storageUri);
      if (sha256(bytes) !== artifact.sha256) throw new ResumeArtifactIntegrityError(artifact.id);
      return { artifact, bytes };
    },
  };
}
