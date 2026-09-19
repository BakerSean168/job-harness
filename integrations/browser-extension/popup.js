const state = document.getElementById("state");
const meta = document.getElementById("meta");
const reference = document.getElementById("reference");
document.getElementById("options").addEventListener("click", () => chrome.runtime.openOptionsPage());
reference.addEventListener("click", () => {
  const url = reference.dataset.url;
  if (url) void chrome.tabs.create({ url: url + "/settings#applicant-reference", active: true });
});
chrome.runtime.sendMessage({ type: "JH_BRIDGE_STATUS" }, (response) => {
  if (chrome.runtime.lastError || !response) {
    state.textContent = "未连接";
    return;
  }
  state.textContent = response.state.connected ? "已连接" : "未连接";
  meta.textContent = `${response.settings.agentId || "—"} · ${response.state.detail || ""}`;
  const webUrl = String(response.settings.webUrl || "").replace(/\/+$/, "");
  if (webUrl) {
    reference.dataset.url = webUrl;
    reference.disabled = false;
  }
});
