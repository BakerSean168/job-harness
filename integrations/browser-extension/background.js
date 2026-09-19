const DEFAULTS = Object.freeze({
  enabled: false,
  bridgeUrl: "",
  agentId: "windows-chrome-primary",
  agentName: "Windows Chrome",
  agentToken: "",
  resumeUpload: false,
  screenshots: false,
  webUrl: "",
});
const POLL_ALARM = "job-harness-browser-bridge-poll";
const DRIVER_COMMANDS = Object.freeze([
  "session_acquire", "navigate", "current_url", "title", "body_text", "exists", "text", "value_matches", "fill",
  "select", "set_checked", "click", "wait", "scroll", "scan_controls", "scan_actions", "form_state_hash",
  "boss_detail_snapshot", "boss_prepare_chat", "boss_send_message", "boss_scan_unread_contacts", "boss_open_contact",
  "boss_chat_snapshot", "boss_prepare_resume", "boss_confirm_resume",
]);
let loopRunning = false;
let stopRequested = false;
let lastState = { connected: false, lastSeenAt: null, detail: "Not connected" };

chrome.runtime.onInstalled.addListener(() => { void ensureAlarm(); void runLoop(); });
chrome.runtime.onStartup.addListener(() => { void ensureAlarm(); void runLoop(); });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === POLL_ALARM) void runLoop(); });
chrome.storage.onChanged.addListener((_changes, area) => { if (area === "local") { stopRequested = true; setTimeout(() => { stopRequested = false; void runLoop(); }, 100); } });
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "JH_BRIDGE_STATUS") {
    void settings().then((value) => sendResponse({ settings: publicSettings(value), state: lastState }));
    return true;
  }
  if (message?.type === "JH_BRIDGE_RESTART") {
    stopRequested = true;
    setTimeout(() => { stopRequested = false; void runLoop(); }, 100);
    sendResponse({ ok: true });
  }
  return false;
});
void ensureAlarm();
void runLoop();

async function ensureAlarm() {
  await chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 });
}

async function runLoop() {
  if (loopRunning) return;
  loopRunning = true;
  try {
    while (!stopRequested) {
      const config = await settings();
      if (!config.enabled || !config.bridgeUrl || !config.agentToken || !config.agentId) {
        updateState(false, "Configure and enable the bridge in Options.");
        return;
      }
      try {
        await register(config);
        updateState(true, "Connected");
        const response = await bridgeFetch(config, `/agents/${encodeURIComponent(config.agentId)}/poll`, {
          method: "POST",
          body: JSON.stringify({ waitMs: 20000 }),
        });
        const body = await response.json();
        const envelope = body?.command;
        if (!envelope) continue;
        await executeEnvelope(config, envelope);
      } catch (error) {
        updateState(false, sanitizeError(error));
        await sleep(3000);
      }
    }
  } finally {
    loopRunning = false;
  }
}

async function register(config) {
  const response = await bridgeFetch(config, "/agents/register", {
    method: "POST",
    body: JSON.stringify({
      agentId: config.agentId,
      name: config.agentName || "Chrome",
      version: chrome.runtime.getManifest().version,
      browserName: "Chrome",
      platform: navigator.platform || null,
      capabilities: {
        humanControl: true,
        persistentSession: true,
        resumeUpload: Boolean(config.resumeUpload),
        screenshots: Boolean(config.screenshots),
        driverCommands: [
          ...DRIVER_COMMANDS,
          ...(config.resumeUpload ? ["upload"] : []),
          ...(config.screenshots ? ["screenshot"] : []),
        ],
      },
    }),
  });
  if (!response.ok) throw new Error(`register HTTP ${response.status}`);
  const body = await response.json();
  const webUrl = normalizeWebUrl(body?.webUrl);
  if (webUrl && webUrl !== config.webUrl) await chrome.storage.local.set({ webUrl });
}

async function executeEnvelope(config, envelope) {
  const commandId = String(envelope?.commandId || "");
  if (!commandId) return;
  let report;
  try {
    validateEnvelope(config, envelope);
    const result = await executeCommand(envelope);
    report = { commandId, ok: true, result };
  } catch (error) {
    report = { commandId, ok: false, error: sanitizeError(error) };
  }
  // Execute a browser command exactly once. If the HTTP acknowledgement is
  // uncertain, retry only this immutable result record with the same commandId.
  await postResultWithRetry(config, report);
}

function validateEnvelope(config, envelope) {
  if (!envelope || typeof envelope !== "object") throw new Error("Invalid browser command envelope");
  if (String(envelope.agentId || "") !== config.agentId) throw new Error("Browser command agentId does not match this paired agent");
  const expiresAt = Date.parse(String(envelope.expiresAt || ""));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error("Browser command envelope is expired or has an invalid expiry");
  const type = String(envelope.command?.type || "");
  const allowed = new Set([
    ...DRIVER_COMMANDS,
    ...(config.resumeUpload ? ["upload"] : []),
    ...(config.screenshots ? ["screenshot"] : []),
  ]);
  if (!allowed.has(type)) throw new Error(`Unsupported or disabled browser command '${type}'`);
}

async function postResultWithRetry(config, result) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await postResult(config, result);
      return;
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      if (status && status !== 429 && status < 500) throw error;
      if (attempt < 2) await sleep(250 * (attempt + 1));
    }
  }
  throw lastError || new Error("Browser result acknowledgement failed");
}

async function postResult(config, result) {
  const response = await bridgeFetch(config, `/agents/${encodeURIComponent(config.agentId)}/results`, {
    method: "POST",
    body: JSON.stringify(result),
  });
  if (response.status !== 204) {
    const error = new Error(`result HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
}

async function executeCommand(envelope) {
  const command = envelope?.command;
  const type = String(command?.type || "");
  if (type === "session_acquire") return acquireSession(command.payload || {});
  const tabId = parseSessionRef(envelope?.sessionRef);
  if (type === "navigate") {
    const url = validateHttpUrl(command.payload?.url);
    await chrome.tabs.update(tabId, { url, active: true });
    await waitForTabComplete(tabId, 45000);
    return null;
  }
  if (type === "current_url") return (await requireTab(tabId)).url || "about:blank";
  if (type === "title") return (await requireTab(tabId)).title || "";
  if (type === "wait") { await sleep(boundedInt(command.payload?.milliseconds, 0, 60000)); return null; }
  if (type === "screenshot") return captureScreenshot(tabId);
  if (type.startsWith("boss_")) return executeBossDriver(tabId, command);
  return executePageDriver(tabId, command);
}

async function acquireSession(payload) {
  const preferredUrl = payload?.preferredUrl ? validateHttpUrl(payload.preferredUrl) : null;
  let tab = null;
  if (payload?.reuseLiveSession && preferredUrl) {
    const tabs = await chrome.tabs.query({});
    tab = tabs.find((candidate) => candidate.id != null && candidate.url && sameReusableTarget(candidate.url, preferredUrl)) || null;
    // Non-staged reuse may fall back to another tab on the same host. A
    // requireLiveSession request is an exact human-staged handoff and must never
    // silently bind to another job or to the current active tab.
    if (!tab && !payload?.requireLiveSession) {
      const host = new URL(preferredUrl).hostname;
      tab = tabs.find((candidate) => {
        try { return candidate.id != null && candidate.url && new URL(candidate.url).hostname === host; } catch { return false; }
      }) || null;
    }
  }
  if (!tab && payload?.reuseLiveSession && !payload?.requireLiveSession) {
    const active = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = active.find((candidate) => candidate.id != null) || null;
  }
  if (!tab && payload?.requireLiveSession) {
    throw new Error('No reusable live Chrome tab matched the exact requested target');
  }
  if (!tab) {
    tab = await chrome.tabs.create({ url: preferredUrl || "about:blank", active: true });
    if (tab.id == null) throw new Error("Chrome did not return a tab id");
    if (preferredUrl) await waitForTabComplete(tab.id, 45000);
    tab = await requireTab(tab.id);
  }
  if (tab.id == null) throw new Error("Selected Chrome tab has no id");
  return { sessionRef: `chrome-tab:${tab.id}`, currentUrl: tab.url || "about:blank" };
}

function sameReusableTarget(candidateUrl, preferredUrl) {
  try {
    const candidate = new URL(candidateUrl);
    const preferred = new URL(preferredUrl);
    return candidate.protocol === preferred.protocol
      && candidate.hostname === preferred.hostname
      && candidate.port === preferred.port
      && candidate.pathname === preferred.pathname;
  } catch { return false; }
}

async function executeBossDriver(tabId, command) {
  const response = await deliverBossDriverCommand(tabId, command);
  return unwrapPageDriverResponse(response);
}

async function deliverBossDriverCommand(tabId, command) {
  await ensureBossDriver(tabId);
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "JH_BOSS_DRIVER_COMMAND", command });
  } catch {
    await ensureBossDriver(tabId);
    return chrome.tabs.sendMessage(tabId, { type: "JH_BOSS_DRIVER_COMMAND", command });
  }
}

async function ensureBossDriver(tabId) {
  const tab = await requireTab(tabId);
  const url = String(tab.url || "");
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error(`Cannot inject BOSS driver into ${url || "this tab"}`); }
  if (parsed.protocol !== "https:" || !["www.zhipin.com", "zhipin.com"].includes(parsed.hostname)) {
    throw new Error(`BOSS driver is restricted to zhipin.com, got ${url}`);
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ["boss-driver.js"] });
}

async function executePageDriver(tabId, command) {
  const response = await deliverPageDriverCommand(tabId, command);
  // Application/page-driver errors are intentionally unwrapped outside the
  // delivery retry boundary. Once a receiver accepted a command, never replay
  // that browser action merely because the command itself reported failure.
  return unwrapPageDriverResponse(response);
}

async function deliverPageDriverCommand(tabId, command) {
  await ensurePageDriver(tabId);
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "JH_PAGE_DRIVER_COMMAND", command });
  } catch {
    // A SPA/full navigation may have replaced the content-script world between
    // injection and delivery. Retry only receiver delivery once.
    await ensurePageDriver(tabId);
    return chrome.tabs.sendMessage(tabId, { type: "JH_PAGE_DRIVER_COMMAND", command });
  }
}

function unwrapPageDriverResponse(response) {
  if (response && typeof response === "object" && response.__jobHarnessDriverError) throw new Error(String(response.__jobHarnessDriverError));
  return response;
}

async function ensurePageDriver(tabId) {
  const tab = await requireTab(tabId);
  const url = String(tab.url || "");
  if (!/^https?:\/\//i.test(url)) throw new Error(`Cannot inject page driver into ${url || "this tab"}`);
  await chrome.scripting.executeScript({ target: { tabId }, files: ["form-engine.js", "page-driver.js"] });
}

async function captureScreenshot(tabId) {
  const config = await settings();
  if (!config.screenshots) throw new Error("Screenshot capability is disabled");
  const tab = await requireTab(tabId);
  if (tab.windowId == null) throw new Error("Chrome tab has no window id");
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  return String(dataUrl).replace(/^data:image\/png;base64,/, "");
}

function parseSessionRef(value) {
  const match = /^chrome-tab:(\d+)$/.exec(String(value || ""));
  if (!match) throw new Error("Invalid or missing extension sessionRef");
  return Number(match[1]);
}

async function requireTab(tabId) {
  try { return await chrome.tabs.get(tabId); } catch { throw new Error(`Chrome tab ${tabId} is no longer available`); }
}

async function waitForTabComplete(tabId, timeoutMs) {
  const current = await requireTab(tabId);
  if (current.status === "complete") return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Chrome tab ${tabId} navigation timed out`)); }, timeoutMs);
    const listener = (changedTabId, changeInfo) => {
      if (changedTabId === tabId && changeInfo.status === "complete") { cleanup(); resolve(); }
    };
    function cleanup() { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function bridgeFetch(config, path, init = {}) {
  const base = String(config.bridgeUrl || "").replace(/\/+$/, "");
  if (!/^https:\/\//i.test(base) && !/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?/i.test(base)) {
    throw new Error("Bridge URL must use HTTPS (or localhost for development)");
  }
  const timeoutMs = /\/poll$/.test(path) ? 30000 : 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Bridge request timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    return await fetch(`${base}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${config.agentToken}`,
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function settings() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) };
}
function publicSettings(value) {
  return { enabled: Boolean(value.enabled), bridgeUrl: value.bridgeUrl, webUrl: value.webUrl || "", agentId: value.agentId, agentName: value.agentName, resumeUpload: Boolean(value.resumeUpload), screenshots: Boolean(value.screenshots), tokenConfigured: Boolean(value.agentToken) };
}
function updateState(connected, detail) {
  lastState = { connected, detail: String(detail || "").slice(0, 500), lastSeenAt: new Date().toISOString() };
}
function normalizeWebUrl(raw) {
  if (!raw) return "";
  try {
    const url = new URL(String(raw));
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) return "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch { return ""; }
}
function validateHttpUrl(raw) {
  const url = new URL(String(raw || ""));
  if (!/^https?:$/.test(url.protocol)) throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  return url.toString();
}
function boundedInt(value, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error("Expected an integer command value");
  return Math.max(min, Math.min(max, number));
}
function sanitizeError(error) {
  return (error instanceof Error ? error.message : String(error || "error")).replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 1000);
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
