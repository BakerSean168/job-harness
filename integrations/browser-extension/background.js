const DEFAULTS = Object.freeze({
  enabled: false,
  bridgeUrl: "",
  agentId: "windows-chrome-primary",
  agentName: "Windows Chrome",
  agentToken: "",
  resumeUpload: false,
  screenshots: false,
});
const POLL_ALARM = "job-harness-browser-bridge-poll";
const DRIVER_COMMANDS = Object.freeze([
  "session_acquire", "navigate", "current_url", "title", "body_text", "exists", "text", "fill",
  "select", "set_checked", "click", "wait", "scan_controls", "scan_actions", "form_state_hash",
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
  await response.json();
}

async function executeEnvelope(config, envelope) {
  const commandId = String(envelope?.commandId || "");
  if (!commandId) return;
  try {
    const result = await executeCommand(envelope);
    await postResult(config, { commandId, ok: true, result });
  } catch (error) {
    await postResult(config, { commandId, ok: false, error: sanitizeError(error) });
  }
}

async function postResult(config, result) {
  const response = await bridgeFetch(config, `/agents/${encodeURIComponent(config.agentId)}/results`, {
    method: "POST",
    body: JSON.stringify(result),
  });
  if (response.status !== 204) throw new Error(`result HTTP ${response.status}`);
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
  return executePageDriver(tabId, command);
}

async function acquireSession(payload) {
  const preferredUrl = payload?.preferredUrl ? validateHttpUrl(payload.preferredUrl) : null;
  let tab = null;
  if (payload?.reuseLiveSession && preferredUrl) {
    const host = new URL(preferredUrl).hostname;
    const tabs = await chrome.tabs.query({});
    tab = tabs.find((candidate) => {
      try { return candidate.id != null && candidate.url && new URL(candidate.url).hostname === host; } catch { return false; }
    }) || null;
  }
  if (!tab && payload?.reuseLiveSession) {
    const active = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = active.find((candidate) => candidate.id != null) || null;
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

async function executePageDriver(tabId, command) {
  await ensurePageDriver(tabId);
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "JH_PAGE_DRIVER_COMMAND", command });
    return unwrapPageDriverResponse(response);
  } catch (error) {
    // A SPA/full navigation may have replaced the content-script world between
    // injection and delivery. Retry injection once; never retry the page action.
    await ensurePageDriver(tabId);
    const response = await chrome.tabs.sendMessage(tabId, { type: "JH_PAGE_DRIVER_COMMAND", command });
    return unwrapPageDriverResponse(response);
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
  await chrome.scripting.executeScript({ target: { tabId }, files: ["page-driver.js"] });
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
  return fetch(`${base}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      authorization: `Bearer ${config.agentToken}`,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
}

async function settings() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) };
}
function publicSettings(value) {
  return { enabled: Boolean(value.enabled), bridgeUrl: value.bridgeUrl, agentId: value.agentId, agentName: value.agentName, resumeUpload: Boolean(value.resumeUpload), screenshots: Boolean(value.screenshots), tokenConfigured: Boolean(value.agentToken) };
}
function updateState(connected, detail) {
  lastState = { connected, detail: String(detail || "").slice(0, 500), lastSeenAt: new Date().toISOString() };
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
