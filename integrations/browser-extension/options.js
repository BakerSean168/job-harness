const ids = ["bridgeUrl", "agentId", "agentName", "enabled", "resumeUpload", "screenshots"];
const defaults = { bridgeUrl: "", agentId: "windows-chrome-primary", agentName: "Windows Chrome", agentToken: "", agentTokenExpiresAt: null, enabled: false, resumeUpload: false, screenshots: false };
const baseDriverCommands = ["session_acquire", "navigate", "current_url", "title", "body_text", "exists", "text", "fill", "select", "set_checked", "click", "wait", "scan_controls", "scan_actions", "form_state_hash"];
const form = document.getElementById("settings");
const status = document.getElementById("status");
void load();
form.addEventListener("submit", (event) => { event.preventDefault(); void save(); });
document.getElementById("unpair").addEventListener("click", () => { void unpair(); });

async function load() {
  const value = { ...defaults, ...(await chrome.storage.local.get(defaults)) };
  for (const id of ids) { const el = document.getElementById(id); if (el.type === "checkbox") el.checked = Boolean(value[id]); else el.value = value[id] || ""; }
  status.textContent = value.agentToken ? `已配对${value.agentTokenExpiresAt ? `，Token 有效至 ${new Date(value.agentTokenExpiresAt).toLocaleString()}` : ""}。` : "尚未配对。";
}

async function save() {
  const existing = { ...defaults, ...(await chrome.storage.local.get(defaults)) };
  const value = { ...existing };
  for (const id of ids) { const el = document.getElementById(id); value[id] = el.type === "checkbox" ? el.checked : el.value.trim(); }
  if (value.enabled) {
    const granted = await requestSitePermissions(value.bridgeUrl);
    if (!granted) { status.textContent = "需要授权招聘网站与 Bridge 的 HTTPS 访问权限。"; return; }
    const pairingCode = document.getElementById("pairingCode").value.trim();
    if (!value.agentToken || pairingCode) {
      if (!pairingCode) { status.textContent = "首次启用需要一次性配对码。"; return; }
      try {
        const paired = await exchangePairing(value, pairingCode);
        value.agentToken = paired.agentToken;
        value.agentTokenExpiresAt = paired.tokenExpiresAt;
        document.getElementById("pairingCode").value = "";
      } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); return; }
    }
  }
  await chrome.storage.local.set(value);
  chrome.runtime.sendMessage({ type: "JH_BRIDGE_RESTART" });
  status.textContent = value.agentToken ? "已保存、已配对并请求重连。" : "已保存。";
}

async function exchangePairing(value, pairingCode) {
  const base = normalizedBridgeUrl(value.bridgeUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("配对请求超时")), 15000);
  let response;
  try {
    response = await fetch(`${base}/pair`, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        pairingCode,
        agentId: value.agentId,
        name: value.agentName || "Windows Chrome",
        version: chrome.runtime.getManifest().version,
        browserName: "Chrome",
        platform: navigator.platform || null,
        capabilities: {
          humanControl: true,
          persistentSession: true,
          resumeUpload: Boolean(value.resumeUpload),
          screenshots: Boolean(value.screenshots),
          driverCommands: [...baseDriverCommands, ...(value.resumeUpload ? ["upload"] : []), ...(value.screenshots ? ["screenshot"] : [])],
        },
      }),
    });
  } finally {
    clearTimeout(timer);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || `配对失败：HTTP ${response.status}`);
  if (!body?.agentToken) throw new Error("配对响应缺少 Agent Token");
  return body;
}

async function requestSitePermissions(bridgeUrl) {
  let bridge;
  try { bridge = new URL(bridgeUrl); } catch { status.textContent = "Bridge URL 无效。"; return false; }
  const origins = ["https://*/*"];
  if (bridge.protocol === "http:" && ["127.0.0.1", "localhost"].includes(bridge.hostname)) origins.push(`${bridge.origin}/*`);
  return chrome.permissions.request({ origins });
}

async function unpair() {
  await chrome.storage.local.set({ agentToken: "", agentTokenExpiresAt: null, enabled: false });
  document.getElementById("enabled").checked = false;
  document.getElementById("pairingCode").value = "";
  chrome.runtime.sendMessage({ type: "JH_BRIDGE_RESTART" });
  status.textContent = "已解除本地配对；如需重新连接，请在 Job Harness 生成新的配对码。";
}

function normalizedBridgeUrl(raw) {
  const value = String(raw || "").replace(/\/+$/, "");
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) throw new Error("Bridge URL 必须使用 HTTPS（本机开发可用 localhost HTTP）");
  return value;
}
