const GLOBAL_STATE_KEY = '__jobHarnessApplyCanaryState';
const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

type CanaryRecord = {
  submitCount: number;
  lastSubmission: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type CanaryGlobal = typeof globalThis & {
  [GLOBAL_STATE_KEY]?: Map<string, CanaryRecord>;
};

function records(): Map<string, CanaryRecord> {
  const root = globalThis as CanaryGlobal;
  if (!root[GLOBAL_STATE_KEY]) root[GLOBAL_STATE_KEY] = new Map();
  return root[GLOBAL_STATE_KEY]!;
}

function runIdFrom(request: Request): string {
  const value = new URL(request.url).searchParams.get('run')?.trim() ?? '';
  if (!RUN_ID_RE.test(value)) throw new Error('A valid synthetic canary run id is required');
  return value;
}

function ensureRecord(runId: string): CanaryRecord {
  const store = records();
  const existing = store.get(runId);
  if (existing) return existing;
  const now = new Date().toISOString();
  const created = { submitCount: 0, lastSubmission: null, createdAt: now, updatedAt: now } satisfies CanaryRecord;
  store.set(runId, created);
  return created;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow, noarchive',
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  let runId: string;
  try { runId = runIdFrom(request); }
  catch (error) { return json({ error: error instanceof Error ? error.message : String(error) }, 400); }
  const record = ensureRecord(runId);
  const url = new URL(request.url);
  if (url.searchParams.get('format') === 'status') {
    return json({ runId, ...record });
  }
  return new Response(renderPage(runId, record.submitCount), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'x-robots-tag': 'noindex, nofollow, noarchive',
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  let runId: string;
  try { runId = runIdFrom(request); }
  catch (error) { return json({ error: error instanceof Error ? error.message : String(error) }, 400); }
  const record = ensureRecord(runId);
  const raw = await request.json().catch(() => null);
  const payload = isRecord(raw) ? sanitizeSubmission(raw) : { parseError: true };
  const next: CanaryRecord = {
    ...record,
    submitCount: record.submitCount + 1,
    lastSubmission: payload,
    updatedAt: new Date().toISOString(),
  };
  records().set(runId, next);
  return json({ ok: true, runId, submitCount: next.submitCount, synthetic: true });
}

function sanitizeSubmission(raw: Record<string, unknown>): Record<string, unknown> {
  // This endpoint exists only to prove that a fill-only canary did not cross
  // the submit boundary. Keep only field-presence/length evidence; never retain
  // applicant values in the Web process.
  const output: Record<string, unknown> = {};
  for (const key of ['full_name', 'email', 'school', 'major', 'visa']) {
    const value = raw[key];
    output[key] = typeof value === 'string' ? { present: value.length > 0, length: value.length } : null;
  }
  return output;
}

function renderPage(runId: string, submitCount: number): string {
  const safeRunId = escapeHtml(runId);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Job Harness Synthetic ATS Canary</title>
  <style>
    :root{color-scheme:light dark;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    body{max-width:760px;margin:40px auto;padding:0 20px;line-height:1.55}
    .warning{border:2px solid currentColor;border-radius:12px;padding:14px 16px;margin-bottom:24px}
    fieldset{border:1px solid #8886;border-radius:12px;margin:18px 0;padding:16px}
    label{display:block;margin:14px 0;font-weight:600}
    input,select,button{box-sizing:border-box;display:block;width:100%;min-height:42px;margin-top:6px;padding:8px 10px;font:inherit}
    button{margin-top:22px;font-weight:700}
    code{word-break:break-all}.muted{opacity:.72}.status{font-variant-numeric:tabular-nums}
  </style>
</head>
<body>
  <div class="warning" id="canary-banner">
    <strong>Job Harness Synthetic ATS Canary</strong><br>
    这是本地验证页面，不对应任何真实公司或岗位，不会向招聘网站发送申请。
  </div>
  <h1>Frontend Engineer application</h1>
  <p class="muted">Run: <code id="canary-run">${safeRunId}</code></p>
  <p class="status">Synthetic submit count: <strong id="submit-count">${submitCount}</strong></p>
  <form id="application-form" autocomplete="on">
    <fieldset><legend>基本信息</legend>
      <label>姓名<input id="full-name" name="full_name" autocomplete="name" required></label>
      <label>电子邮箱<input id="email" name="email" type="email" autocomplete="email" required></label>
    </fieldset>
    <fieldset><legend>教育经历</legend>
      <label>学校<input id="school" name="school" autocomplete="organization" required></label>
      <label>专业<input id="major" name="major" required></label>
    </fieldset>
    <fieldset><legend>合规问题（应保持人工处理）</legend>
      <label>Will you require visa sponsorship?
        <select id="visa" name="visa"><option value="">Please select</option><option value="yes">Yes</option><option value="no">No</option></select>
      </label>
    </fieldset>
    <button id="submit-application" type="submit">Submit application</button>
  </form>
  <p id="submit-warning" class="warning" hidden>Canary submit boundary was crossed. This should remain hidden during fill-only validation.</p>
  <script>
    const form = document.getElementById('application-form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        full_name: document.getElementById('full-name').value,
        email: document.getElementById('email').value,
        school: document.getElementById('school').value,
        major: document.getElementById('major').value,
        visa: document.getElementById('visa').value,
      };
      const response = await fetch(location.pathname + '?run=' + encodeURIComponent(${JSON.stringify(runId)}), {
        method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(payload), cache: 'no-store'
      });
      const result = await response.json();
      document.getElementById('submit-count').textContent = String(result.submitCount ?? '?');
      document.getElementById('submit-warning').hidden = false;
    });
  </script>
</body>
</html>`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
