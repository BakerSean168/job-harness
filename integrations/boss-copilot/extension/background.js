const MESSAGE_TYPE = 'JH_BOSS_COMPAT_HTTP';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== MESSAGE_TYPE) return false;
  void handleRequest(message.details).then(
    (result) => sendResponse({ ok: true, result }),
    (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
  );
  return true;
});

async function handleRequest(raw) {
  const details = raw && typeof raw === 'object' ? raw : {};
  const url = new URL(String(details.url || ''));
  if (url.protocol !== 'https:' || url.hostname !== 'oracle.taile92a8e.ts.net' || url.port !== '10444') {
    throw new Error('BOSS compatibility HTTP proxy only allows the Job Harness BOSS bridge');
  }
  const method = String(details.method || 'GET').toUpperCase();
  if (!['GET', 'POST'].includes(method)) throw new Error('Unsupported BOSS compatibility HTTP method');
  const timeout = Math.max(1000, Math.min(10 * 60 * 1000, Number(details.timeout || 10 * 60 * 1000)));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url.toString(), {
      method,
      headers: normalizeHeaders(details.headers),
      body: method === 'GET' || details.data == null ? undefined : String(details.data),
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
    });
    return {
      status: response.status,
      response: await response.text(),
      finalUrl: response.url,
    };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeHeaders(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const headers = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') headers[key] = value;
  }
  return headers;
}
