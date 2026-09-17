import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { ExecutionAttemptSchema, type ExecutionAttempt } from '@job-harness/apply-contracts';
import { PlaywrightBrowserDriver } from '@job-harness/apply-browser';
import { chromium } from 'playwright';
import {
  ApplySiteAdapterRegistry,
  GenericAtsSiteAdapter,
  InMemoryApplicantDataProvider,
  type ApplyFillAssets,
  type ApplySiteAdapter,
} from '@job-harness/apply-adapters';
import { FormFillExecutionEngine } from './form-fill-engine';
import { SubmitExecutionEngine } from './submit-engine';

const resumeBytes = new TextEncoder().encode('%PDF-1.7\nJob Harness synthetic resume\n%%EOF');
const resumeSha = createHash('sha256').update(resumeBytes).digest('hex');

class SyntheticAtsAdapter implements ApplySiteAdapter {
  private readonly generic = new GenericAtsSiteAdapter();
  readonly descriptor = {
    id: 'synthetic-ats',
    version: '1.0.0',
    semantics: 'formal_application' as const,
    priority: 1000,
    capabilities: { inspect: true, fill: true, validate: true, submit: true },
  };

  probe(input: { url: string }) {
    const url = new URL(input.url);
    const supported = (url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.pathname === '/apply';
    return { supported, score: supported ? 1 : 0, reason: supported ? 'synthetic-ats' : 'not-synthetic-ats' };
  }

  inspect(browser: Parameters<ApplySiteAdapter['inspect']>[0], input: Parameters<ApplySiteAdapter['inspect']>[1]) {
    return this.generic.inspect(browser, input);
  }

  fill(
    browser: Parameters<NonNullable<ApplySiteAdapter['fill']>>[0],
    form: Parameters<NonNullable<ApplySiteAdapter['fill']>>[1],
    plan: Parameters<NonNullable<ApplySiteAdapter['fill']>>[2],
    applicant: Parameters<NonNullable<ApplySiteAdapter['fill']>>[3],
    assets?: ApplyFillAssets,
  ) {
    return this.generic.fill(browser, form, plan, applicant, assets);
  }

  async validate(
    form: Parameters<ApplySiteAdapter['validate']>[0],
    plan: Parameters<ApplySiteAdapter['validate']>[1],
    fillReport?: Parameters<ApplySiteAdapter['validate']>[2],
  ) {
    const result = await this.generic.validate(form, plan, fillReport);
    return { ...result, readyForSubmit: result.readyForReview };
  }

  async submit(browser: Parameters<NonNullable<ApplySiteAdapter['submit']>>[0]) {
    const before = browser.currentUrl();
    await browser.click('#submit-application');
    await browser.wait(100);
    const after = browser.currentUrl();
    const body = await browser.bodyText(10_000);
    const parsed = new URL(after);
    const reference = parsed.searchParams.get('ref');
    const success = parsed.pathname === '/success' && body.includes('Application received') && Boolean(reference);
    const now = new Date().toISOString();
    return {
      outcome: success ? 'success' as const : 'uncertain' as const,
      appliedAt: now,
      confirmedAt: now,
      externalReference: reference,
      evidence: { beforeHost: new URL(before).hostname, afterPath: parsed.pathname, confirmationKind: 'synthetic-success-page' },
      error: success ? null : 'Synthetic ATS did not expose explicit success evidence',
    };
  }
}

function syntheticAttempt(applyUrl: string): ExecutionAttempt {
  return ExecutionAttemptSchema.parse({
    id: 'synthetic-attempt-1', intentId: 'synthetic-intent-1', executorId: 'synthetic-worker', requiredAdapterId: 'synthetic-ats', adapterId: 'synthetic-ats', adapterVersion: '1.0.0',
    preferredBrowserBackend: 'local-browser', browserBackend: 'local-browser', browserSessionHandoff: null,
    executionMode: 'review_then_submit', state: 'running', leaseOwner: 'synthetic-worker', leaseExpiresAt: '2099-01-01T00:00:00.000Z', lastHeartbeatAt: new Date().toISOString(), checkpoint: 'synthetic-review',
    externalEffectState: 'not_crossed', requiredCapabilities: ['resumeUpload','humanControl'], policySnapshot: { syntheticValidation: true },
    bundle: {
      intentId: 'synthetic-intent-1', attemptId: 'synthetic-attempt-1', jobId: 'synthetic-job-1', listingId: 'synthetic-listing-1', listingUrl: applyUrl,
      company: 'Synthetic ATS Co', title: 'Frontend Engineer', city: 'Hangzhou', resumeProfileId: 'frontend', resumeRevisionId: 'revision-synthetic-1',
      resumeArtifact: { id: 'artifact-synthetic-1', revisionId: 'revision-synthetic-1', sha256: resumeSha, byteSize: resumeBytes.byteLength, mimeType: 'application/pdf' },
      applicantCatalogVersion: null, answerSetVersion: null, answerSetHash: null, policySnapshot: { syntheticValidation: true }, createdAt: new Date().toISOString(),
    },
    bundleHash: 'a'.repeat(64), dispatchRequestHash: 'b'.repeat(64), reviewHash: null, submitAuthorizationId: 'synthetic-auth-1', errorCode: null, errorSummary: null,
    startedAt: new Date().toISOString(), completedAt: null, idempotencyKey: 'synthetic-dispatch-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
}

async function startSyntheticAts(): Promise<{ server: Server; baseUrl: string; submitCount: () => number; lastSubmission: () => Record<string, unknown> | null }> {
  let submits = 0;
  let lastSubmission: Record<string, unknown> | null = null;
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://172.17.0.1');
    if (req.method === 'GET' && url.pathname === '/apply') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html><head><title>Synthetic ATS</title><style>body{font-family:sans-serif;max-width:760px;margin:30px auto}label{display:block;margin:12px 0}input,select,button{display:block;width:100%;min-height:36px}</style></head><body>
        <h1>Frontend Engineer application</h1>
        <form id="application-form">
          <fieldset><legend>Basic information</legend>
            <label>姓名<input id="full-name" name="full_name" required></label>
            <label>电子邮箱<input id="email" name="email" type="email" required></label>
          </fieldset>
          <fieldset><legend>Education</legend>
            <label>学校<input id="school" name="school" required></label>
            <label>专业<input id="major" name="major" required></label>
          </fieldset>
          <fieldset><legend>Resume</legend>
            <label>上传简历<input id="resume" name="resume" type="file" accept="application/pdf,.pdf" required></label>
          </fieldset>
          <fieldset><legend>Compliance</legend>
            <label>Will you require visa sponsorship?<select id="visa" name="visa"><option value="">Please select</option><option value="yes">Yes</option><option value="no">No</option></select></label>
          </fieldset>
          <button id="submit-application" type="submit">Submit application</button>
        </form>
        <script>
          const hex = (bytes) => [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
          document.getElementById('application-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const file = document.getElementById('resume').files[0];
            const digest = file ? await crypto.subtle.digest('SHA-256', await file.arrayBuffer()) : null;
            const payload = {
              full_name: document.getElementById('full-name').value,
              email: document.getElementById('email').value,
              school: document.getElementById('school').value,
              major: document.getElementById('major').value,
              visa: document.getElementById('visa').value,
              resume: file ? { name: file.name, type: file.type, size: file.size, sha256: hex(digest) } : null,
            };
            const response = await fetch('/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
            const result = await response.json();
            location.href = '/success?ref=' + encodeURIComponent(result.reference);
          });
        </script>
      </body></html>`);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/submit') {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        submits += 1;
        try { lastSubmission = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>; }
        catch { lastSubmission = { parseError: true }; }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ reference: `synthetic-${submits}` }));
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/success') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<html><head><title>Success</title></head><body><h1>Application received</h1><p>Reference ${url.searchParams.get('ref') ?? ''}</p></body></html>`);
      return;
    }
    res.writeHead(404); res.end('not found');
  });
  const bindHost = process.env.JOB_HARNESS_SYNTHETIC_ATS_BIND_HOST || '127.0.0.1';
  server.listen(0, bindHost);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Synthetic ATS failed to bind');
  return { server, baseUrl: `http://${bindHost}:${address.port}`, submitCount: () => submits, lastSubmission: () => lastSubmission };
}

async function main() {
  const ats = await startSyntheticAts();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const driver = new PlaywrightBrowserDriver(page);
    const applyUrl = `${ats.baseUrl}/apply`;
    const attempt = syntheticAttempt(applyUrl);
    const adapter = new SyntheticAtsAdapter();
    const registry = new ApplySiteAdapterRegistry([adapter]);
    const applicant = new InMemoryApplicantDataProvider('synthetic-applicant-v1', [
      { entry: { key: 'person.full_name', label: '姓名', valueType: 'text', sensitivity: 'personal', aliases: ['姓名','name','full name'], allowAiMapping: false, requiresLiteral: true, source: 'synthetic' }, value: 'Synthetic Candidate', provenance: 'synthetic' },
      { entry: { key: 'contact.email', label: '邮箱', valueType: 'email', sensitivity: 'sensitive', aliases: ['邮箱','电子邮箱','email'], allowAiMapping: false, requiresLiteral: true, source: 'synthetic' }, value: 'candidate@example.test', provenance: 'synthetic' },
      { entry: { key: 'education[0].school', label: '学校', valueType: 'text', sensitivity: 'personal', aliases: ['学校','院校','毕业院校'], allowAiMapping: false, requiresLiteral: true, source: 'synthetic' }, value: 'Synthetic University', provenance: 'synthetic' },
      { entry: { key: 'education[0].major', label: '专业', valueType: 'text', sensitivity: 'personal', aliases: ['专业','所学专业'], allowAiMapping: false, requiresLiteral: true, source: 'synthetic' }, value: 'Software Engineering', provenance: 'synthetic' },
    ]);
    const formEngine = new FormFillExecutionEngine({ siteAdapters: registry, applicant });
    const submitEngine = new SubmitExecutionEngine({ siteAdapters: registry });

    await driver.navigate(applyUrl);
    const result = await formEngine.execute({
      attempt,
      browser: driver,
      observedAt: new Date().toISOString(),
      resumeFile: { name: '卢楼豪-前端开发工程师.pdf', mimeType: 'application/pdf', bytes: resumeBytes, sha256: resumeSha },
    });
    if (result.outcome !== 'review_ready' || !result.review.summary.readyForSubmit) throw new Error(`Synthetic form did not reach review_ready: ${JSON.stringify(result.payload)}`);
    const reviewedHash = result.review.formStateHash;
    await driver.fill('#full-name', 'Tampered Candidate');
    const tamperedHash = await driver.formStateHash();
    if (tamperedHash === reviewedHash) throw new Error('Form-state hash failed to detect review drift');
    await driver.fill('#full-name', 'Synthetic Candidate');
    if (await driver.formStateHash() !== reviewedHash) throw new Error('Restored reviewed form did not return to the exact review hash');

    const submission = await submitEngine.execute({ attempt, browser: driver });
    if (submission.outcome !== 'success') throw new Error(`Synthetic submit was not explicitly verified: ${JSON.stringify(submission)}`);
    if (ats.submitCount() !== 1) throw new Error(`Expected exactly one external submit, got ${ats.submitCount()}`);
    const submitted = ats.lastSubmission();
    if (!submitted) throw new Error('Synthetic ATS did not receive a submission payload');
    if (submitted.full_name !== 'Synthetic Candidate' || submitted.email !== 'candidate@example.test' || submitted.school !== 'Synthetic University' || submitted.major !== 'Software Engineering') throw new Error(`Synthetic ATS received incorrect applicant values: ${JSON.stringify(submitted)}`);
    if (submitted.visa !== '') throw new Error('Legal field was unexpectedly filled');
    const submittedResume = submitted.resume as Record<string, unknown> | null;
    if (!submittedResume || submittedResume.name !== '卢楼豪-前端开发工程师.pdf' || submittedResume.sha256 !== resumeSha || submittedResume.size !== resumeBytes.byteLength) throw new Error(`Synthetic ATS received incorrect resume evidence: ${JSON.stringify(submittedResume)}`);
    console.log(JSON.stringify({
      ok: true,
      filled: result.review.summary.filled,
      requiredPending: result.review.summary.requiredPending,
      legalFieldLeftBlank: true,
      resumeFileName: submittedResume.name,
      reviewHashDriftDetected: true,
      submitCount: ats.submitCount(),
      externalReference: submission.externalReference,
      finalPath: new URL(driver.currentUrl()).pathname,
    }, null, 2));
  } finally {
    await browser.close();
    ats.server.close();
    await once(ats.server, 'close').catch(() => undefined);
  }
}

void main();
