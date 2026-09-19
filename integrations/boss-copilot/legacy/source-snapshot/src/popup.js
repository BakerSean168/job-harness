const els = {
  status: document.getElementById("status"),
  openOptions: document.getElementById("openOptions"),
  profileVariantSelect: document.getElementById("profileVariantSelect"),
  profileMeta: document.getElementById("profileMeta"),
  reloadProfileBundleBtn: document.getElementById("reloadProfileBundleBtn"),
  openPrivateChannelBtn: document.getElementById("openPrivateChannelBtn"),
  startAutofillBtn: document.getElementById("startAutofillBtn"),
  attachResumeBtn: document.getElementById("attachResumeBtn"),
  showProfilePanelBtn: document.getElementById("showProfilePanelBtn"),
  clearMarksBtn: document.getElementById("clearMarksBtn"),
  scoreJobBtn: document.getElementById("scoreJobBtn"),
  jobScoreResult: document.getElementById("jobScoreResult"),
  switchRecommendedBtn: document.getElementById("switchRecommendedBtn"),
  copyGreetingBtn: document.getElementById("copyGreetingBtn"),
  recordAppliedBtn: document.getElementById("recordAppliedBtn"),
  applicationCount: document.getElementById("applicationCount")
};

let profileBundle = null;
let lastScore = null;
let lastRecommendation = null;

els.openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
els.profileVariantSelect.addEventListener("change", () => void selectProfile());
els.reloadProfileBundleBtn.addEventListener("click", () => void reloadProfileBundle());
els.openPrivateChannelBtn.addEventListener("click", () => void openPrivateChannel());
els.startAutofillBtn.addEventListener("click", () => void startAutofill());
els.attachResumeBtn.addEventListener("click", () => void attachActiveResume());
els.showProfilePanelBtn.addEventListener("click", () => void showProfilePanel());
els.clearMarksBtn.addEventListener("click", () => void clearMarks());
els.scoreJobBtn.addEventListener("click", () => void scoreCurrentJob());
els.switchRecommendedBtn.addEventListener("click", () => void switchToRecommendedProfile());
els.copyGreetingBtn.addEventListener("click", () => void copyGreeting());
els.recordAppliedBtn.addEventListener("click", () => void recordApplied());

void initialize();

async function initialize() {
  try {
    await Promise.all([
      loadProfileBundle(),
      loadApplicationCount(),
      syncRuntimeState()
    ]);
  } catch (error) {
    setStatus(`初始化失败：${error.message}`, true);
  }
}

async function loadProfileBundle() {
  profileBundle = await sendRuntimeMessage({ type: "JAC_GET_PROFILE_BUNDLE" });
  const profiles = Array.isArray(profileBundle?.profiles) ? profileBundle.profiles : [];
  els.profileVariantSelect.replaceChildren();

  for (const profile of profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.label || profile.id;
    option.selected = profile.id === profileBundle.activeProfileId;
    els.profileVariantSelect.appendChild(option);
  }

  if (profiles.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "未找到简历资料包";
    els.profileVariantSelect.appendChild(option);
    els.profileVariantSelect.disabled = true;
    els.profileMeta.textContent = "请先从 resume-harness 同步 profile-bundle.json。";
    return;
  }

  els.profileVariantSelect.disabled = false;
  renderActiveProfile();
}

function renderActiveProfile() {
  const profile = getActiveProfile();
  if (!profile) {
    els.profileMeta.textContent = "未选择简历版本。";
    return;
  }
  els.profileMeta.textContent = [
    profile.positioning || profile.label,
    profile.resumePdfName ? `建议上传：${profile.resumePdfName}` : ""
  ].filter(Boolean).join("\n");
}

function getActiveProfile() {
  const profiles = Array.isArray(profileBundle?.profiles) ? profileBundle.profiles : [];
  const id = els.profileVariantSelect.value || profileBundle?.activeProfileId;
  return profiles.find((item) => item.id === id) || profiles[0] || null;
}

async function reloadProfileBundle() {
  try {
    els.reloadProfileBundleBtn.disabled = true;
    els.reloadProfileBundleBtn.textContent = "同步中...";
    const result = await sendRuntimeMessage({ type: "JAC_SYNC_REMOTE_BUNDLE" });
    await loadProfileBundle();
    lastScore = null;
    lastRecommendation = null;
    resetScorePanel();
    const exportedAt = result.channel?.profileExportedAt ? `（${formatSyncTime(result.channel.profileExportedAt)}）` : "";
    setStatus(`已从 Oracle2 同步最新 Resume Profile ${exportedAt}。`, false);
  } catch (error) {
    try {
      await sendRuntimeMessage({ type: "JAC_RELOAD_PACKAGED_BUNDLE" });
      await loadProfileBundle();
      setStatus(`Oracle2 暂时不可达，已保留扩展内置资料：${error.message}`, true);
    } catch {
      setStatus(`同步资料包失败：${error.message}`, true);
    }
  } finally {
    els.reloadProfileBundleBtn.disabled = false;
    els.reloadProfileBundleBtn.textContent = "从 Oracle2 同步资料";
  }
}

async function openPrivateChannel() {
  try {
    await sendRuntimeMessage({ type: "JAC_OPEN_PRIVATE_CHANNEL" });
    setStatus("已打开 Oracle2 私有下载页。", false);
  } catch (error) {
    setStatus(`打开私有下载页失败：${error.message}`, true);
  }
}

function formatSyncTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return date.toLocaleString("zh-CN", { hour12: false });
}

async function selectProfile() {
  const profileId = els.profileVariantSelect.value;
  if (!profileId) return;

  try {
    const result = await sendRuntimeMessage({
      type: "JAC_SET_ACTIVE_PROFILE",
      payload: { profileId }
    });
    profileBundle.activeProfileId = result.activeProfileId;
    lastScore = null;
    lastRecommendation = null;
    resetScorePanel();
    renderActiveProfile();
    setStatus(`已切换到 ${result.profile?.label || profileId}。自动填表会立即使用这套资料。`);
  } catch (error) {
    setStatus(`切换简历失败：${error.message}`, true);
  }
}

async function startAutofill() {
  try {
    els.startAutofillBtn.disabled = true;
    els.startAutofillBtn.textContent = "扫描中...";
    setStatus("正在扫描当前表单并填写高置信度字段。不会自动提交。");
    const response = await sendToActiveTab({ type: "OJAF_START_AUTOFILL" });
    const data = response?.data || {};
    if (data.filled != null) {
      setStatus(`填写完成：已填写 ${data.filled || 0} 项，待处理 ${getPendingCount(data)} 项。`);
    } else if (data.reason === "no candidates") {
      setStatus("当前页面没有找到可自动填写字段，可打开资料面板手动复制。", true);
    } else if (data.reason === "busy") {
      setStatus("当前已有扫描任务在运行。", true);
    } else {
      setStatus("已完成当前页面扫描。橙色字段需要人工确认。", false);
    }
  } catch (error) {
    setStatus(`自动填写失败：${error.message}`, true);
  } finally {
    await syncRuntimeState({ updateStatus: false });
  }
}

async function attachActiveResume() {
  try {
    els.attachResumeBtn.disabled = true;
    els.attachResumeBtn.textContent = "准备附件中...";
    setStatus("正在读取当前简历 PDF，并只处理明确的简历上传框。");
    const response = await sendToActiveTab({ type: "JAC_ATTACH_ACTIVE_RESUME" });
    const data = response?.data || {};
    setStatus(data.message || (data.attached > 0 ? `已上传 ${data.fileName || "当前简历"}。` : "没有找到可处理的简历上传框。"), data.found > 0 && !data.attached);
  } catch (error) {
    setStatus(`上传简历附件失败：${error.message}`, true);
  } finally {
    els.attachResumeBtn.disabled = false;
    els.attachResumeBtn.textContent = "上传当前简历附件";
  }
}

async function showProfilePanel() {
  try {
    await sendToActiveTab({ type: "OJAF_SHOW_PROFILE_PANEL" });
    setStatus("已打开当前简历的资料面板。", false);
  } catch (error) {
    setStatus(`打开资料面板失败：${error.message}`, true);
  }
}

async function clearMarks() {
  try {
    await sendToActiveTab({ type: "OJAF_CLEAR_MARKS" });
    setStatus("已清除页面颜色标记，不会修改已填写内容。", false);
  } catch (error) {
    setStatus(`清除标记失败：${error.message}`, true);
  }
}

async function scoreCurrentJob() {
  els.scoreJobBtn.disabled = true;
  els.scoreJobBtn.textContent = "评估中...";
  try {
    const capture = await sendToActiveTab({ type: "JAC_CAPTURE_JOB_CONTEXT" });
    const job = capture?.data || {};
    const comparison = await sendRuntimeMessage({
      type: "JAC_SCORE_JOB_ALL",
      payload: { job }
    });
    const result = comparison.active;
    lastScore = result;
    lastRecommendation = comparison.recommended || null;
    renderJobScore(result, comparison);
    renderRecommendationAction(comparison);
    els.copyGreetingBtn.disabled = !result?.greeting;
    els.recordAppliedBtn.disabled = !result;
    if (comparison.recommended?.profileId !== result?.profileId && comparison.recommendationDelta > 0) {
      setStatus(`当前 ${result.profileLabel} ${result.score} 分；推荐 ${comparison.recommended.profileLabel} ${comparison.recommended.score} 分（+${comparison.recommendationDelta}）。`);
    } else {
      setStatus(`当前 ${result.profileLabel} 为三套简历中的最佳匹配，得分 ${result.score}。`);
    }
  } catch (error) {
    lastScore = null;
    lastRecommendation = null;
    resetScorePanel();
    setStatus(`岗位评估失败：${error.message}`, true);
  } finally {
    els.scoreJobBtn.disabled = false;
    els.scoreJobBtn.textContent = "评估当前岗位";
  }
}

function renderJobScore(result, comparison = {}) {
  const strong = collectKeywords(result.matches?.detailStrong, result.matches?.titleStrong, 6);
  const negative = collectKeywords(result.matches?.titleBlock, result.matches?.detailNegative, 4);
  const decision = result.decision === "strong-match"
    ? "优先投递"
    : result.decision === "review"
      ? "值得人工复核"
      : "低匹配";

  els.jobScoreResult.classList.remove("empty");
  els.jobScoreResult.innerHTML = "";

  const score = document.createElement("div");
  score.className = `score-number ${result.decision || ""}`;
  score.textContent = `${result.score}/100 · ${decision}`;

  const title = document.createElement("div");
  title.className = "score-job-title";
  title.textContent = [result.job?.company, result.job?.title].filter(Boolean).join(" · ") || "当前岗位";

  const signals = document.createElement("div");
  signals.className = "score-signals";
  const positiveText = strong.length ? `命中：${strong.join("、")}` : "未命中明显强信号";
  const negativeText = negative.length ? `；风险：${negative.join("、")}` : "";
  signals.textContent = `${positiveText}${negativeText}`;

  const resume = document.createElement("div");
  resume.className = "score-resume";
  resume.textContent = result.resumePdfName ? `当前简历：${result.resumePdfName}` : "";

  els.jobScoreResult.append(score, title, signals, resume);

  const recommended = comparison.recommended;
  if (recommended && recommended.profileId !== result.profileId) {
    const recommendation = document.createElement("div");
    recommendation.className = "score-recommendation";
    recommendation.textContent = `三版本推荐：${recommended.profileLabel} ${recommended.score}/100${comparison.recommendationDelta ? `（比当前 +${comparison.recommendationDelta}）` : ""}`;
    els.jobScoreResult.append(recommendation);
  }
}

function renderRecommendationAction(comparison = {}) {
  const recommended = comparison.recommended;
  const active = comparison.active;
  const shouldSwitch = Boolean(
    recommended &&
    active &&
    recommended.profileId !== active.profileId &&
    Number(comparison.recommendationDelta || 0) >= 5
  );
  els.switchRecommendedBtn.disabled = !shouldSwitch;
  els.switchRecommendedBtn.textContent = shouldSwitch
    ? `切换到推荐简历：${recommended.profileLabel}`
    : "当前简历已是推荐版本";
}

async function switchToRecommendedProfile() {
  const target = lastRecommendation;
  if (!target?.profileId || target.profileId === els.profileVariantSelect.value) {
    return;
  }
  try {
    els.profileVariantSelect.value = target.profileId;
    await selectProfile();
    await scoreCurrentJob();
  } catch (error) {
    setStatus(`切换推荐简历失败：${error.message}`, true);
  }
}

function resetScorePanel() {
  els.jobScoreResult.classList.add("empty");
  els.jobScoreResult.textContent = "打开岗位详情页后点击评估。";
  els.switchRecommendedBtn.disabled = true;
  els.switchRecommendedBtn.textContent = "当前简历已是推荐版本";
  els.copyGreetingBtn.disabled = true;
  els.recordAppliedBtn.disabled = true;
}

async function copyGreeting() {
  if (!lastScore?.greeting) return;
  try {
    await navigator.clipboard.writeText(lastScore.greeting);
    setStatus("已复制当前简历方向的打招呼文案。", false);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = lastScore.greeting;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    setStatus("已复制当前简历方向的打招呼文案。", false);
  }
}

async function recordApplied() {
  if (!lastScore) return;
  try {
    const result = await sendRuntimeMessage({
      type: "JAC_RECORD_APPLICATION",
      payload: {
        status: "applied",
        profileId: lastScore.profileId,
        profileLabel: lastScore.profileLabel,
        resumePdfName: lastScore.resumePdfName,
        title: lastScore.job?.title,
        company: lastScore.job?.company,
        url: lastScore.job?.url,
        score: lastScore.score
      }
    });
    els.applicationCount.textContent = `已记录 ${result.total || 0} 条投递`;
    setStatus("已记录为已投递。", false);
  } catch (error) {
    setStatus(`记录投递失败：${error.message}`, true);
  }
}

async function loadApplicationCount() {
  try {
    const result = await sendRuntimeMessage({
      type: "JAC_GET_APPLICATIONS",
      payload: { limit: 1 }
    });
    els.applicationCount.textContent = `已记录 ${result.total || 0} 条投递`;
  } catch {
    els.applicationCount.textContent = "投递记录暂不可用";
  }
}

async function syncRuntimeState(options = {}) {
  try {
    const response = await sendToActiveTab({ type: "OJAF_GET_RUNTIME_STATE" });
    const state = response?.data || {};
    const busy = Boolean(state.autofillInProgress);
    els.startAutofillBtn.disabled = busy;
    els.startAutofillBtn.textContent = busy ? "扫描中..." : "开始填写当前页面";
    if (busy && options.updateStatus !== false) {
      setStatus("当前已有自动填表任务在运行。", false);
    }
  } catch {
    els.startAutofillBtn.disabled = false;
    els.startAutofillBtn.textContent = "开始填写当前页面";
  }
}

function collectKeywords(...args) {
  const limit = typeof args.at(-1) === "number" ? args.pop() : 6;
  const seen = new Set();
  const result = [];
  for (const list of args) {
    for (const item of Array.isArray(list) ? list : []) {
      const keyword = item?.keyword;
      if (!keyword || seen.has(keyword)) continue;
      seen.add(keyword);
      result.push(keyword);
      if (result.length >= limit) return result;
    }
  }
  return result;
}

function getPendingCount(summary = {}) {
  return Number(summary.pending ?? Number(summary.skipped || 0) + Number(summary.failed || 0));
}

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle("error", isError);
}

async function sendToActiveTab(message) {
  const [tab] = await queryTabs({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("没有可用的活动页面。");
  await executeScript(tab.id, "src/content.js");
  try {
    return await sendTabMessage(tab.id, message);
  } catch (firstError) {
    await executeScript(tab.id, "src/content.js");
    try {
      return await sendTabMessage(tab.id, message);
    } catch {
      throw firstError;
    }
  }
}

function queryTabs(query) {
  return new Promise((resolve) => chrome.tabs.query(query, resolve));
}

function executeScript(tabId, file) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript({ target: { tabId }, files: [file] }, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) return reject(new Error(error.message));
      if (!response?.ok) return reject(new Error(response?.error || "页面消息执行失败。"));
      resolve(response);
    });
  });
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) return reject(new Error(error.message));
      if (!response?.ok) return reject(new Error(response?.error || "后台消息执行失败。"));
      resolve(response.data);
    });
  });
}
