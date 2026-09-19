import { scoreJob } from "./job-score.js";

const DEFAULT_API_CONFIG = {
  mode: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  endpointPath: "/chat/completions",
  apiKey: "",
  model: "your-model-name",
  useJsonResponseFormat: false,
  extraHeadersJson: "{}",
  customUrl: "",
  customMethod: "POST",
  customHeadersJson: "{}",
  customBodyTemplate:
    '{\n  "model": {{modelJson}},\n  "messages": {{messagesJson}},\n  "temperature": 0\n}',
  customResponsePath: "choices.0.message.content"
};

const PROFILE_SCHEMA_VERSION = 2;
const DEFAULT_PROFILE_V2 = {
  schemaVersion: PROFILE_SCHEMA_VERSION,
  updatedAt: "",
  sections: {},
  customSections: []
};

const STORAGE_KEYS = {
  profileV2: "profileV2",
  apiConfig: "apiConfig",
  updateState: "updateState",
  profileBundle: "jacProfileBundle",
  activeProfileId: "jacActiveProfileId",
  applications: "jacApplications"
};

const PROFILE_PANEL_STATE_KEY = "OJAF_PROFILE_PANEL_STATE";
const MAX_PROFILE_PANEL_STATE_ITEMS = 20;
const UPDATE_ALARM_NAME = "OJAF_CHECK_RELEASE_UPDATE";
const UPDATE_CHECK_INTERVAL_MINUTES = 12 * 60;
const UPDATE_REPOSITORY = "Br1an67/OpenJobAutofill";
const UPDATE_LATEST_RELEASE_API = `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`;
const UPDATE_RELEASES_URL = `https://github.com/${UPDATE_REPOSITORY}/releases`;
const COPILOT_BUILD_VERSION = "0.3.1";
const PRIVATE_CHANNEL_BASE_URL = "https://oracle.taile92a8e.ts.net:10443";
const CENTRAL_LEDGER_BASE_URL = "https://oracle.taile92a8e.ts.net:10444";

chrome.runtime.onInstalled.addListener(async () => {
  await initializeBaseSettings();
  await seedPackagedProfileBundle();
  await syncExistingApplicationsToLedger().catch(() => undefined);
});

chrome.runtime.onStartup?.addListener(() => {
  void initializeBaseSettings()
    .then(() => syncExistingApplicationsToLedger())
    .catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    !message ||
    typeof message.type !== "string" ||
    (!message.type.startsWith("OJAF_") && !message.type.startsWith("JAC_"))
  ) {
    return undefined;
  }

  handleMessage(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});

async function handleMessage(message) {
  switch (message.type) {
    case "OJAF_GET_SETTINGS":
      return getSettings();
    case "OJAF_OPEN_OPTIONS":
      await chrome.runtime.openOptionsPage();
      return {};
    case "OJAF_SAVE_SETTINGS":
      return saveSettings(message.payload || {});
    case "OJAF_CLEAR_SETTINGS":
      return clearSettings();
    case "OJAF_MAP_FIELDS":
      return mapFields(message.payload || {});
    case "OJAF_ANALYZE_PAGE_STRUCTURE":
      return analyzePageStructure(message.payload || {});
    case "OJAF_SAVE_PROFILE_PANEL_STATE":
      return saveProfilePanelState(message.payload || {});
    case "OJAF_GET_PROFILE_PANEL_STATE":
      return getProfilePanelState(message.payload || {});
    case "OJAF_LIST_MODELS":
      return listModels(message.payload || {});
    case "OJAF_TEST_CONNECTION":
      return testApi(message.payload || {});
    case "OJAF_GET_UPDATE_STATUS":
      return getUpdateState();
    case "OJAF_CHECK_FOR_UPDATE":
      return checkForUpdate({ reason: message.payload?.reason || "manual" });
    case "OJAF_OPEN_UPDATE_PAGE":
      return openUpdatePage(message.payload || {});
    case "JAC_GET_PROFILE_BUNDLE":
      return ensureCopilotProfileBundle();
    case "JAC_RELOAD_PACKAGED_BUNDLE":
      return seedPackagedProfileBundle({ force: true });
    case "JAC_SYNC_REMOTE_BUNDLE":
      return syncRemoteProfileBundle();
    case "JAC_GET_PRIVATE_CHANNEL_STATUS":
      return getPrivateChannelStatus();
    case "JAC_OPEN_PRIVATE_CHANNEL":
      return openPrivateChannel();
    case "JAC_GET_ACTIVE_RESUME_FILE":
      return getActiveResumeFile(message.payload || {});
    case "JAC_IMPORT_PROFILE_BUNDLE":
      return importCopilotProfileBundle(message.payload || {});
    case "JAC_SET_ACTIVE_PROFILE":
      return setActiveCopilotProfile(message.payload || {});
    case "JAC_SCORE_JOB":
      return scoreCopilotJob(message.payload || {});
    case "JAC_SCORE_JOB_ALL":
      return scoreCopilotJobAll(message.payload || {});
    case "JAC_RECORD_APPLICATION":
      return recordCopilotApplication(message.payload || {});
    case "JAC_GET_APPLICATIONS":
      return getCopilotApplications(message.payload || {});
    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

async function getSettings() {
  const values = await chrome.storage.local.get([
    STORAGE_KEYS.profileV2,
    STORAGE_KEYS.apiConfig
  ]);
  return {
    profileV2: normalizeProfileV2(values[STORAGE_KEYS.profileV2] || DEFAULT_PROFILE_V2),
    apiConfig: { ...DEFAULT_API_CONFIG, ...(values[STORAGE_KEYS.apiConfig] || {}) }
  };
}

async function saveSettings(payload) {
  const next = {};

  if (payload.profileV2) {
    const normalizedProfile = normalizeProfileV2(payload.profileV2);
    next[STORAGE_KEYS.profileV2] = normalizedProfile;

    const stored = await chrome.storage.local.get([
      STORAGE_KEYS.profileBundle,
      STORAGE_KEYS.activeProfileId
    ]);
    const bundle = normalizeCopilotBundle(stored[STORAGE_KEYS.profileBundle]);
    const activeProfileId = String(stored[STORAGE_KEYS.activeProfileId] || bundle.activeProfileId || "");
    const activeIndex = bundle.profiles.findIndex((item) => item.id === activeProfileId);
    if (activeIndex >= 0) {
      bundle.profiles[activeIndex] = {
        ...bundle.profiles[activeIndex],
        profileV2: normalizedProfile
      };
      bundle.activeProfileId = activeProfileId;
      next[STORAGE_KEYS.profileBundle] = bundle;
    }
  }

  if (payload.apiConfig) {
    next[STORAGE_KEYS.apiConfig] = { ...DEFAULT_API_CONFIG, ...payload.apiConfig };
  }

  await chrome.storage.local.set(next);
  return { saved: Object.keys(next) };
}

async function clearSettings() {
  await chrome.storage.local.clear();
  return { cleared: true };
}

async function initializeBaseSettings() {
  const existing = await chrome.storage.local.get([
    STORAGE_KEYS.profileV2,
    STORAGE_KEYS.apiConfig,
    STORAGE_KEYS.applications
  ]);
  const next = {};
  if (!existing[STORAGE_KEYS.profileV2]) {
    next[STORAGE_KEYS.profileV2] = DEFAULT_PROFILE_V2;
  }
  if (!existing[STORAGE_KEYS.apiConfig]) {
    next[STORAGE_KEYS.apiConfig] = DEFAULT_API_CONFIG;
  }
  if (!Array.isArray(existing[STORAGE_KEYS.applications])) {
    next[STORAGE_KEYS.applications] = [];
  }
  if (Object.keys(next).length > 0) {
    await chrome.storage.local.set(next);
  }
}

async function seedPackagedProfileBundle(options = {}) {
  const existing = await chrome.storage.local.get([
    STORAGE_KEYS.profileBundle,
    STORAGE_KEYS.activeProfileId
  ]);
  if (existing[STORAGE_KEYS.profileBundle] && !options.force) {
    return getCopilotProfileBundle();
  }

  try {
    const response = await fetch(chrome.runtime.getURL("data/profile-bundle.json"), { cache: "no-store" });
    if (!response.ok) {
      return { seeded: false, reason: `profile bundle HTTP ${response.status}` };
    }
    const bundle = normalizeCopilotBundle(await response.json());
    if (bundle.profiles.length === 0) {
      return { seeded: false, reason: "empty profile bundle" };
    }
    return importCopilotProfileBundle({ bundle });
  } catch (error) {
    return {
      seeded: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

async function getCopilotProfileBundle() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.profileBundle,
    STORAGE_KEYS.activeProfileId
  ]);
  const bundle = normalizeCopilotBundle(stored[STORAGE_KEYS.profileBundle]);
  const activeProfileId = String(
    stored[STORAGE_KEYS.activeProfileId] || bundle.activeProfileId || bundle.profiles[0]?.id || ""
  );
  return {
    ...bundle,
    activeProfileId
  };
}

async function ensureCopilotProfileBundle() {
  let bundle = await getCopilotProfileBundle();
  if (bundle.profiles.length > 0) {
    return bundle;
  }
  await seedPackagedProfileBundle({ force: true });
  bundle = await getCopilotProfileBundle();
  return bundle;
}

async function getPrivateChannelStatus() {
  const channel = await fetchPrivateChannelJson();
  const latestVersion = String(channel.extension?.version || "");
  return {
    currentVersion: COPILOT_BUILD_VERSION,
    latestVersion,
    updateAvailable: latestVersion ? compareVersions(latestVersion, COPILOT_BUILD_VERSION) > 0 : false,
    publishedAt: String(channel.publishedAt || ""),
    downloadUrl: `${PRIVATE_CHANNEL_BASE_URL}${channel.extension?.latestDownloadPath || "/download/job-application-copilot-latest.zip"}`,
    profileExportedAt: String(channel.profile?.exportedAt || ""),
    profiles: Array.isArray(channel.profile?.profiles) ? channel.profile.profiles : []
  };
}

async function syncRemoteProfileBundle() {
  const channel = await fetchPrivateChannelJson();
  const profilePath = String(channel.profile?.path || "/api/profile-bundle.json");
  const profileUrl = new URL(profilePath, `${PRIVATE_CHANNEL_BASE_URL}/`).toString();
  const response = await fetch(profileUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Oracle2 profile sync failed (HTTP ${response.status})`);
  const text = await response.text();
  const expectedSha256 = String(channel.profile?.sha256 || "").toLowerCase();
  if (expectedSha256) {
    const actualSha256 = await sha256Hex(text);
    if (actualSha256 !== expectedSha256) throw new Error("Oracle2 profile bundle SHA-256 mismatch.");
  }
  let bundle;
  try {
    bundle = JSON.parse(text);
  } catch {
    throw new Error("Oracle2 profile bundle is not valid JSON.");
  }
  const current = await getCopilotProfileBundle();
  const currentProfileId = String(current.activeProfileId || "");
  if (currentProfileId && Array.isArray(bundle.profiles) && bundle.profiles.some((item) => item?.id === currentProfileId)) {
    bundle.activeProfileId = currentProfileId;
  }
  const imported = await importCopilotProfileBundle({ bundle });
  return {
    ...imported,
    channel: {
      currentVersion: COPILOT_BUILD_VERSION,
      latestVersion: String(channel.extension?.version || ""),
      publishedAt: String(channel.publishedAt || ""),
      profileExportedAt: String(channel.profile?.exportedAt || "")
    }
  };
}

async function fetchPrivateChannelJson() {
  const response = await fetch(`${PRIVATE_CHANNEL_BASE_URL}/channel.json`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Oracle2 private channel unavailable (HTTP ${response.status})`);
  const channel = await response.json();
  if (!channel || channel.format !== "JobApplicationCopilotPrivateChannel") {
    throw new Error("Oracle2 private channel returned an unsupported manifest.");
  }
  return channel;
}

async function openPrivateChannel() {
  await chrome.tabs.create({ url: PRIVATE_CHANNEL_BASE_URL });
  return { opened: true, url: PRIVATE_CHANNEL_BASE_URL };
}

async function getActiveResumeFile(payload = {}) {
  const bundle = await ensureCopilotProfileBundle();
  const requestedProfileId = String(payload.profileId || bundle.activeProfileId || "").trim();
  const profile = bundle.profiles.find((item) => item.id === requestedProfileId) || bundle.profiles[0];
  if (!profile) {
    throw new Error("尚未导入可用的简历版本。");
  }

  let remoteError = "";
  try {
    const channel = await fetchPrivateChannelJson();
    const remoteProfile = Array.isArray(channel.profile?.profiles)
      ? channel.profile.profiles.find((item) => item?.id === profile.id)
      : null;
    const resumeMeta = remoteProfile?.resume;
    if (resumeMeta?.path) {
      const resumeUrl = new URL(String(resumeMeta.path), `${PRIVATE_CHANNEL_BASE_URL}/`).toString();
      const response = await fetch(resumeUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Oracle2 resume fetch failed (HTTP ${response.status})`);
      }
      const buffer = await response.arrayBuffer();
      const expectedSha256 = String(resumeMeta.sha256 || "").toLowerCase();
      if (expectedSha256) {
        const actualSha256 = await sha256ArrayBuffer(buffer);
        if (actualSha256 !== expectedSha256) {
          throw new Error("Oracle2 resume PDF SHA-256 mismatch.");
        }
      }
      return buildResumeFilePayload(profile, buffer, {
        source: "oracle2-private-channel",
        filename: resumeMeta.filename || profile.resumePdfName
      });
    }
    remoteError = "Oracle2 private channel has no resume asset metadata yet.";
  } catch (error) {
    remoteError = error instanceof Error ? error.message : String(error);
  }

  const packagedUrl = chrome.runtime.getURL(`data/resumes/${encodeURIComponent(profile.id)}.pdf`);
  const packagedResponse = await fetch(packagedUrl, { cache: "no-store" });
  if (!packagedResponse.ok) {
    throw new Error(`无法获取当前简历 PDF。Oracle2：${remoteError || "不可用"}；扩展内置文件：HTTP ${packagedResponse.status}`);
  }
  const packagedBuffer = await packagedResponse.arrayBuffer();
  return buildResumeFilePayload(profile, packagedBuffer, {
    source: "packaged-personal-build",
    filename: profile.resumePdfName,
    remoteError
  });
}

function buildResumeFilePayload(profile, buffer, options = {}) {
  return {
    profileId: profile.id,
    profileLabel: profile.label,
    fileName: String(options.filename || profile.resumePdfName || `${profile.id}.pdf`),
    mimeType: "application/pdf",
    size: buffer.byteLength,
    source: String(options.source || "packaged-personal-build"),
    remoteError: String(options.remoteError || ""),
    base64: arrayBufferToBase64(buffer)
  };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

async function sha256ArrayBuffer(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function importCopilotProfileBundle(payload = {}) {
  const bundle = normalizeCopilotBundle(payload.bundle || payload);
  if (bundle.profiles.length === 0) {
    throw new Error("Copilot 资料包中没有可用简历版本。");
  }
  const requested = String(bundle.activeProfileId || "");
  const active = bundle.profiles.find((item) => item.id === requested) || bundle.profiles[0];
  bundle.activeProfileId = active.id;
  await chrome.storage.local.set({
    [STORAGE_KEYS.profileBundle]: bundle,
    [STORAGE_KEYS.activeProfileId]: active.id,
    [STORAGE_KEYS.profileV2]: normalizeProfileV2(active.profileV2)
  });
  return {
    imported: true,
    activeProfileId: active.id,
    profiles: bundle.profiles.map(profileSummary)
  };
}

async function setActiveCopilotProfile(payload = {}) {
  const profileId = String(payload.profileId || "").trim();
  if (!profileId) {
    throw new Error("缺少 profileId。");
  }
  const bundle = await ensureCopilotProfileBundle();
  const active = bundle.profiles.find((item) => item.id === profileId);
  if (!active) {
    throw new Error(`找不到简历版本：${profileId}`);
  }
  bundle.activeProfileId = active.id;
  await chrome.storage.local.set({
    [STORAGE_KEYS.profileBundle]: bundle,
    [STORAGE_KEYS.activeProfileId]: active.id,
    [STORAGE_KEYS.profileV2]: normalizeProfileV2(active.profileV2)
  });
  return {
    activeProfileId: active.id,
    profile: profileSummary(active)
  };
}

async function scoreCopilotJob(payload = {}) {
  const job = normalizeCopilotJob(payload.job);
  const bundle = await ensureCopilotProfileBundle();
  const active = bundle.profiles.find((item) => item.id === bundle.activeProfileId) || bundle.profiles[0];
  if (!active) {
    throw new Error("尚未导入 Copilot 简历资料包。");
  }
  return scoreForCopilotProfile(active, job);
}

async function scoreCopilotJobAll(payload = {}) {
  const job = normalizeCopilotJob(payload.job);
  const bundle = await ensureCopilotProfileBundle();
  if (bundle.profiles.length === 0) {
    throw new Error("尚未导入 Copilot 简历资料包。");
  }

  const results = bundle.profiles
    .map((profile) => scoreForCopilotProfile(profile, job))
    .sort((left, right) => right.score - left.score || left.profileId.localeCompare(right.profileId));
  const active = results.find((item) => item.profileId === bundle.activeProfileId) || results[0];
  const recommended = results[0];

  return {
    job,
    activeProfileId: bundle.activeProfileId,
    active,
    recommended,
    recommendationDelta: Math.max(0, Number(recommended?.score || 0) - Number(active?.score || 0)),
    results
  };
}

function scoreForCopilotProfile(profile, job) {
  const result = scoreJob(job, profile.scoring || {});
  return {
    ...result,
    profileId: profile.id,
    profileLabel: profile.label,
    positioning: profile.positioning,
    greeting: profile.greeting,
    resumePdfName: profile.resumePdfName,
    job
  };
}

function normalizeCopilotJob(job) {
  const source = job && typeof job === "object" ? job : {};
  return {
    title: String(source.title || "").slice(0, 240),
    company: String(source.company || "").slice(0, 160),
    text: String(source.text || source.detail || "").slice(0, 50000),
    url: String(source.url || "").slice(0, 1000),
    hostname: String(source.hostname || "").slice(0, 240),
    capturedAt: String(source.capturedAt || "").slice(0, 80)
  };
}

async function recordCopilotApplication(payload = {}) {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.applications]);
  const existing = Array.isArray(stored[STORAGE_KEYS.applications])
    ? stored[STORAGE_KEYS.applications]
    : [];
  const record = {
    id: payload.id || `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: payload.createdAt || new Date().toISOString(),
    status: String(payload.status || "applied").slice(0, 40),
    profileId: String(payload.profileId || "").slice(0, 80),
    profileLabel: String(payload.profileLabel || "").slice(0, 120),
    resumePdfName: String(payload.resumePdfName || "").slice(0, 240),
    title: String(payload.title || "").slice(0, 240),
    company: String(payload.company || "").slice(0, 160),
    url: String(payload.url || "").slice(0, 1000),
    score: Number.isFinite(Number(payload.score)) ? Number(payload.score) : null,
    source: String(payload.source || "browser-extension").slice(0, 80)
  };
  const deduped = existing.filter((item) => !(record.url && item?.url === record.url && item?.status === record.status));
  const applications = [record, ...deduped].slice(0, 500);
  await chrome.storage.local.set({ [STORAGE_KEYS.applications]: applications });
  const central = await syncCopilotApplicationToLedger(record).catch((error) => ({
    ok: false,
    error: error instanceof Error ? error.message : String(error)
  }));
  return { recorded: true, record, total: applications.length, central };
}

async function syncCopilotApplicationToLedger(record = {}) {
  if (!record.company) return { ok: false, skipped: true, reason: "missing_company" };
  const response = await fetch(`${CENTRAL_LEDGER_BASE_URL}/api/ledger/applications`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      company: record.company,
      title: record.title,
      url: record.url,
      source: record.source,
      platform: record.source,
      profileId: record.profileId,
      resumePdfName: record.resumePdfName,
      appliedAt: record.createdAt,
      status: record.status,
      notes: "synced_from_browser_extension"
    })
  });
  if (!response.ok) throw new Error(`central ledger HTTP ${response.status}`);
  return response.json();
}

async function syncExistingApplicationsToLedger() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.applications]);
  const applications = Array.isArray(stored[STORAGE_KEYS.applications])
    ? stored[STORAGE_KEYS.applications].filter((item) => item?.company).slice(0, 500)
    : [];
  if (applications.length === 0) return { ok: true, imported: 0 };
  const response = await fetch(`${CENTRAL_LEDGER_BASE_URL}/api/ledger/applications/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ applications })
  });
  if (!response.ok) throw new Error(`central ledger import HTTP ${response.status}`);
  return response.json();
}

async function getCopilotApplications(payload = {}) {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.applications]);
  const applications = Array.isArray(stored[STORAGE_KEYS.applications])
    ? stored[STORAGE_KEYS.applications]
    : [];
  const limit = Math.max(1, Math.min(100, Number(payload.limit || 20)));
  return {
    total: applications.length,
    applications: applications.slice(0, limit)
  };
}

function normalizeCopilotBundle(value) {
  const source = value && typeof value === "object" ? value : {};
  const profiles = Array.isArray(source.profiles)
    ? source.profiles.map(normalizeCopilotProfile).filter((item) => item.id)
    : [];
  const activeProfileId = String(source.activeProfileId || profiles[0]?.id || "");
  return {
    format: "JobApplicationCopilotProfileBundle",
    version: Number(source.version || 1),
    exportedAt: String(source.exportedAt || ""),
    source: source.source && typeof source.source === "object" ? source.source : {},
    activeProfileId,
    profiles
  };
}

function normalizeCopilotProfile(item) {
  const source = item && typeof item === "object" ? item : {};
  return {
    id: String(source.id || "").trim(),
    label: String(source.label || source.id || "").trim(),
    positioning: String(source.positioning || "").trim(),
    greeting: String(source.greeting || "").trim(),
    resumePdfName: String(source.resumePdfName || "").trim(),
    scoring: source.scoring && typeof source.scoring === "object" ? source.scoring : {},
    profileV2: normalizeProfileV2(source.profileV2 || DEFAULT_PROFILE_V2)
  };
}

function profileSummary(item) {
  return {
    id: item.id,
    label: item.label,
    positioning: item.positioning,
    greeting: item.greeting,
    resumePdfName: item.resumePdfName
  };
}

async function setupUpdateAlarm() {
  if (!chrome.alarms?.create) {
    return;
  }

  const existing = chrome.alarms.get
    ? await chrome.alarms.get(UPDATE_ALARM_NAME)
    : null;
  if (existing) {
    return;
  }

  await chrome.alarms.create(UPDATE_ALARM_NAME, {
    delayInMinutes: 5,
    periodInMinutes: UPDATE_CHECK_INTERVAL_MINUTES
  });
}

function createDefaultUpdateState(patch = {}) {
  return {
    status: "unknown",
    currentVersion: getCurrentVersion(),
    latestVersion: "",
    latestTag: "",
    releaseName: "",
    releaseUrl: UPDATE_RELEASES_URL,
    publishedAt: "",
    checkedAt: 0,
    error: "",
    reason: "",
    ...patch
  };
}

async function getUpdateState() {
  const values = await chrome.storage.local.get([STORAGE_KEYS.updateState]);
  const state = reconcileUpdateState({
    ...createDefaultUpdateState(),
    ...(values[STORAGE_KEYS.updateState] || {}),
    currentVersion: getCurrentVersion()
  });
  await applyUpdateBadge(state);
  return state;
}

async function checkForUpdate(options = {}) {
  const reason = options.reason || "manual";
  const currentVersion = getCurrentVersion();

  try {
    const response = await fetch(UPDATE_LATEST_RELEASE_API, {
      method: "GET",
      headers: {
        accept: "application/vnd.github+json"
      },
      cache: "no-store"
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`GitHub Release 暂时不可用（HTTP ${response.status}）`);
    }

    const release = safeJsonParse(text);
    const latestTag = String(release?.tag_name || "").trim();
    const latestVersion = normalizeVersion(latestTag || release?.name || "");
    if (!latestVersion) {
      throw new Error("GitHub Release 没有返回有效版本号。");
    }

    const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;
    const state = createDefaultUpdateState({
      status: updateAvailable ? "available" : "current",
      currentVersion,
      latestVersion,
      latestTag,
      releaseName: String(release?.name || latestTag || latestVersion),
      releaseUrl: String(release?.html_url || UPDATE_RELEASES_URL),
      publishedAt: String(release?.published_at || ""),
      checkedAt: Date.now(),
      error: "",
      reason
    });
    await saveUpdateState(state);
    return state;
  } catch (error) {
    const previous = await getUpdateState();
    const errorMessage = formatUpdateCheckError(error);
    const state = createDefaultUpdateState({
      ...previous,
      status: previous.status === "available" ? "available" : "error",
      currentVersion,
      checkedAt: Date.now(),
      error: errorMessage,
      reason
    });
    await saveUpdateState(state);
    return state;
  }
}

async function saveUpdateState(state) {
  await chrome.storage.local.set({ [STORAGE_KEYS.updateState]: state });
  await applyUpdateBadge(state);
}

async function refreshUpdateBadge() {
  const state = await getUpdateState();
  await applyUpdateBadge(state);
}

async function applyUpdateBadge(state) {
  if (!chrome.action) {
    return;
  }

  if (state?.status === "available") {
    await chrome.action.setBadgeText({ text: "NEW" });
    await chrome.action.setBadgeBackgroundColor({ color: "#c37a18" });
    return;
  }

  await chrome.action.setBadgeText({ text: "" });
}

async function openUpdatePage(payload = {}) {
  const state = await getUpdateState();
  const url = String(payload.url || state.releaseUrl || UPDATE_RELEASES_URL);
  await chrome.tabs.create({ url });
  return { opened: true, url };
}

function getCurrentVersion() {
  return chrome.runtime.getManifest().version || "0.0.0";
}

function normalizeVersion(value) {
  const match = String(value || "").trim().match(/v?(\d+(?:\.\d+){0,3}(?:[-+][0-9A-Za-z.-]+)?)/);
  return match ? match[1] : "";
}

function compareVersions(left, right) {
  const leftParts = normalizeVersion(left).split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = normalizeVersion(right).split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length, 3);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }
  return 0;
}

function reconcileUpdateState(state) {
  if (!state.latestVersion) {
    return state;
  }

  const comparison = compareVersions(state.latestVersion, state.currentVersion);
  if (comparison > 0) {
    return { ...state, status: "available" };
  }
  if (state.status === "available") {
    return { ...state, status: "current", error: "" };
  }
  return state;
}

function formatUpdateCheckError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "暂时无法连接 GitHub Release，请稍后重试。";
  }
  return message || "检查更新失败，请稍后重试。";
}

async function saveProfilePanelState(payload) {
  const pageKey = normalizeProfilePanelStateKey(payload.pageKey || "");
  if (!pageKey || !chrome.storage.session) {
    return { saved: false };
  }

  const patch = isPlainObject(payload.patch) ? payload.patch : {};
  const result = await chrome.storage.session.get(PROFILE_PANEL_STATE_KEY);
  const allStates = result[PROFILE_PANEL_STATE_KEY] || {};
  allStates[pageKey] = {
    ...(allStates[pageKey] || {}),
    pageKey,
    ...patch,
    updatedAt: Date.now()
  };

  const entries = Object.entries(allStates)
    .sort((left, right) => Number(right[1]?.updatedAt || 0) - Number(left[1]?.updatedAt || 0))
    .slice(0, MAX_PROFILE_PANEL_STATE_ITEMS);
  await chrome.storage.session.set({ [PROFILE_PANEL_STATE_KEY]: Object.fromEntries(entries) });
  return { saved: true };
}

async function getProfilePanelState(payload) {
  const pageKey = normalizeProfilePanelStateKey(payload.pageKey || "");
  if (!pageKey || !chrome.storage.session) {
    return null;
  }

  const result = await chrome.storage.session.get(PROFILE_PANEL_STATE_KEY);
  return result[PROFILE_PANEL_STATE_KEY]?.[pageKey] || null;
}

function normalizeProfilePanelStateKey(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

async function mapFields(payload) {
  const { scan } = payload;
  if (!scan || !Array.isArray(scan.fields)) {
    throw new Error("Missing scan result. Scan the current form first.");
  }

  const settings = await getSettings();
  const apiConfig = { ...settings.apiConfig, ...(payload.apiConfig || {}) };
  const profileCatalog = normalizeProvidedProfileCatalog(payload.profileCatalog);
  if (!profileCatalog) {
    throw new Error("Missing profile field catalog.");
  }

  const compactScan = {
    url: scan.url,
    hostname: scan.hostname,
    title: scan.title,
    fields: scan.fields.map(compactField)
  };

  const messages = buildMessages(profileCatalog, compactScan);
  const rawContent = await callAi(apiConfig, messages, {
    profile: profileCatalog,
    profileCatalog,
    scan: compactScan
  });
  const parsed = parseJsonFromText(rawContent);
  const mappings = annotateMappingsWithCatalog(normalizeAiMappings(parsed, compactScan.fields), profileCatalog);
  return {
    mappings,
    notes: Array.isArray(parsed?.notes) ? parsed.notes : [],
    raw: parsed
  };
}

async function analyzePageStructure(payload) {
  const { scan } = payload;
  if (!scan || !Array.isArray(scan.fields)) {
    throw new Error("Missing scan result. Scan the current form first.");
  }

  const settings = await getSettings();
  const apiConfig = { ...settings.apiConfig, ...(payload.apiConfig || {}) };
  const compactScan = {
    url: scan.url,
    hostname: scan.hostname,
    title: scan.title,
    siteAdapter: scan.siteAdapter || null,
    fields: scan.fields.map(compactField)
  };

  const messages = buildPageStructureMessages(compactScan);
  const rawContent = await callAi(apiConfig, messages, {
    profile: { fields: [] },
    profileCatalog: { fields: [] },
    scan: compactScan
  });
  const parsed = parseJsonFromText(rawContent);
  return normalizePageStructureAnalysis(parsed, compactScan.fields);
}

async function testApi(payload) {
  const settings = await getSettings();
  const apiConfig = { ...settings.apiConfig, ...(payload.apiConfig || {}) };
  const fakeProfile = {
    sections: [
      {
        key: "basic",
        title: "基本信息",
        fields: [
          {
            path: "profileV2.sections.basic.values[0]",
            label: "基本信息 / 姓名",
            aliases: ["姓名", "真实姓名", "基本信息"]
          }
        ]
      }
    ],
    fields: [
      {
        path: "profileV2.sections.basic.values[0]",
        label: "基本信息 / 姓名",
        aliases: ["姓名", "真实姓名", "基本信息"]
      }
    ]
  };
  const fakeScan = {
    url: "https://example.test/job",
    hostname: "example.test",
    title: "Test Form",
    fields: [
      {
        fieldId: "test_name",
        type: "text",
        label: "姓名",
        placeholder: "",
        required: true,
        section: "基本信息",
        nearbyText: "基本信息 姓名",
        options: []
      }
    ]
  };
  const messages = buildMessages(fakeProfile, fakeScan);
  const rawContent = await callAi(apiConfig, messages, {
    profile: fakeProfile,
    profileCatalog: fakeProfile,
    scan: fakeScan
  });
  const parsed = parseJsonFromText(rawContent);
  return {
    parsed,
    contentPreview: typeof rawContent === "string" ? rawContent.slice(0, 800) : String(rawContent).slice(0, 800)
  };
}

async function listModels(payload) {
  const settings = await getSettings();
  const apiConfig = { ...settings.apiConfig, ...(payload.apiConfig || {}) };
  const url = resolveModelListUrl(apiConfig);
  if (!url) {
    throw new Error(apiConfig.mode === "custom" ? "Custom API URL is required." : "API base URL is required.");
  }

  const headers = buildRequestHeaders({
    apiConfig,
    headerJson: apiConfig.mode === "custom" ? apiConfig.customHeadersJson : apiConfig.extraHeadersJson,
    includeContentType: false
  });

  const response = await fetch(url, {
    method: "GET",
    headers
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Model list request failed ${response.status}: ${text.slice(0, 500)}`);
  }

  const data = safeJsonParse(text);
  const source = extractModelListSource(data);
  const models = normalizeModelList(source);

  return {
    url,
    models
  };
}

function compactField(field) {
  return {
    fieldId: field.fieldId,
    type: field.type,
    label: sanitizePromptText(field.label, 220),
    placeholder: sanitizePromptText(field.placeholder, 160),
    name: sanitizeAttributeText(field.name),
    id: sanitizeAttributeText(field.id),
    required: field.required,
    disabled: field.disabled,
    readOnly: field.readOnly,
    canFill: field.canFill,
    section: sanitizePromptText(field.section, 220),
    nearbyText: sanitizePromptText(field.nearbyText, 420),
    groupText: sanitizePromptText(field.groupText, 360),
    cssPath: sanitizeAttributeText(field.cssPath),
    siteAdapterId: sanitizeAttributeText(field.siteAdapterId),
    siteAdapterName: sanitizePromptText(field.siteAdapterName, 120),
    hasCurrentValue: Boolean(field.hasCurrentValue),
    options: Array.isArray(field.options) ? field.options.slice(0, 50).map(compactOption) : []
  };
}

function compactOption(option) {
  return {
    value: sanitizePromptText(option?.value, 120),
    label: sanitizePromptText(option?.label, 120)
  };
}

function normalizeProvidedProfileCatalog(profileCatalog) {
  if (!isPlainObject(profileCatalog) || !Array.isArray(profileCatalog.fields)) {
    return null;
  }

  const fields = profileCatalog.fields
    .map((field) => ({
      path: sanitizeAttributeText(field?.path || ""),
      label: sanitizePromptText(field?.label || "", 180),
      aliases: Array.isArray(field?.aliases)
        ? field.aliases.map((alias) => sanitizePromptText(alias, 120)).filter(Boolean).slice(0, 12)
        : []
    }))
    .filter((field) => field.path && field.label)
    .slice(0, 300);

  const sections = Array.isArray(profileCatalog.sections)
    ? profileCatalog.sections
        .map((section) => {
          const sectionFields = Array.isArray(section?.fields)
            ? section.fields
                .map((field) => fields.find((item) => item.path === sanitizeAttributeText(field?.path || "")))
                .filter(Boolean)
            : [];

          return {
            key: sanitizeAttributeText(section?.key || ""),
            title: sanitizePromptText(section?.title || "", 120),
            fields: sectionFields
          };
        })
        .filter((section) => section.title && section.fields.length > 0)
    : [];

  return {
    sections,
    fields
  };
}

function sanitizeAttributeText(value) {
  return sanitizePromptText(value, 120);
}

function sanitizePromptText(value, maxLength = 220) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
  return redactPersonalValues(text, maxLength);
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function normalizeProfileV2(profileV2) {
  if (!isPlainObject(profileV2)) {
    return DEFAULT_PROFILE_V2;
  }

  const sections = isPlainObject(profileV2.sections) ? profileV2.sections : {};
  const normalizedSections = {};
  for (const [key, section] of Object.entries(sections)) {
    if (!isPlainObject(section)) {
      continue;
    }
    const cleanKey = sanitizeAttributeText(key || section.key || "");
    const title = sanitizePromptText(section.title || cleanKey, 120);
    if (!cleanKey || !title) {
      continue;
    }

    normalizedSections[cleanKey] = section.kind === "repeat"
      ? {
          key: cleanKey,
          title,
          kind: "repeat",
          items: Array.isArray(section.items)
            ? section.items.map(normalizeProfileV2Item).filter((item) => Object.keys(item.values).length > 0 || item.custom.length > 0)
            : []
        }
      : {
          key: cleanKey,
          title,
          kind: "simple",
          values: normalizeProfileV2Values(section.values),
          custom: normalizeProfileV2CustomRows(section.custom)
        };
  }

  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    updatedAt: sanitizePromptText(profileV2.updatedAt || "", 80),
    sections: normalizedSections,
    customSections: Array.isArray(profileV2.customSections)
      ? profileV2.customSections.map(normalizeProfileV2CustomSection).filter((section) => Object.keys(section.values).length > 0 || section.custom.length > 0)
      : []
  };
}

function normalizeProfileV2Item(item = {}) {
  return {
    title: sanitizePromptText(item.title || "", 120),
    values: normalizeProfileV2Values(item.values),
    custom: normalizeProfileV2CustomRows(item.custom)
  };
}

function normalizeProfileV2CustomSection(section = {}) {
  return {
    key: sanitizeAttributeText(section.key || "custom"),
    title: sanitizePromptText(section.title || "自定义资料", 120),
    kind: "simple",
    values: normalizeProfileV2Values(section.values),
    custom: normalizeProfileV2CustomRows(section.custom)
  };
}

function normalizeProfileV2Values(values) {
  const normalized = {};
  if (!isPlainObject(values)) {
    return normalized;
  }

  for (const [label, value] of Object.entries(values)) {
    const cleanLabel = sanitizePromptText(label, 120);
    const cleanValue = String(value == null ? "" : value).trim();
    if (cleanLabel && cleanValue) {
      normalized[cleanLabel] = cleanValue;
    }
  }
  return normalized;
}

function normalizeProfileV2CustomRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => ({
      label: sanitizePromptText(row?.label || "", 80),
      value: String(row?.value == null ? "" : row.value).trim()
    }))
    .filter((row) => row.label && row.value);
}

function redactPersonalValues(text, maxLength = 220) {
  if (!text) {
    return "";
  }

  const labelPatterns = [
    /((?:姓名|手机号码|手机号|联系电话|电话|电子邮箱|邮箱|邮件|证件号码|身份证号|出生日期|出生时间|毕业院校|专业|学历|学位|工作单位|实习\/实践单位|组织名称|职务|岗位|学校|籍贯|户口|居住地|地址|联系人|证书号|学历证书号|奖惩名称|奖惩单位|奖惩原因|自我评价|招聘信息来源|备注|高考所在地|高考分数|身高|体重|期望年收入|分数)(?:[^:：]{0,8})[：:]\s*)([^|；;，,\n]+)/g,
    /((?:是否[^:：\n]{0,40}[：:]\s*))([^\n]+)/g
  ];

  let redacted = text;
  for (const pattern of labelPatterns) {
    redacted = redacted.replace(pattern, (match, prefix) => {
      return `${prefix}【已隐藏】`;
    });
  }

  redacted = redacted.replace(/\b(?:\d{11}|\d{15,18}[Xx]?)\b/g, "【已隐藏】");
  redacted = redacted.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "【已隐藏】");
  redacted = redacted.replace(/\b\d{4,}\b/g, (match) => (match.length >= 6 ? "【已隐藏】" : match));

  return redacted.length > maxLength ? `${redacted.slice(0, maxLength)}...` : redacted;
}

function buildMessages(profileCatalog, scan) {
  const systemPrompt = [
    "You are a form-field mapping engine for job application forms.",
    "Your task is to produce the primary field mappings for the current page.",
    "Local fallback rules will handle any remaining unmatched fields.",
    "Return strict JSON only. Do not include prose or explanations outside JSON.",
    "Privacy rule: you are not given the user's actual resume values, and you must not ask for, infer, copy, or output personal values.",
    "The profile field catalog contains sourcePath names and field labels only. All real values are withheld and will be resolved locally in the browser.",
    "Do not map file upload fields. Do not decide to submit the form.",
    "Prefer sourcePath. Use value only for non-personal constants when no sourcePath applies.",
    "If options are provided for a select/combobox, map to the relevant sourcePath; local code will match the user's value to the page option."
  ].join("\n");

  const userPrompt = [
    "Map fields from the current job application page to the local resume profile field catalog.",
    "",
    "Return JSON with this schema:",
    JSON.stringify(
      {
        mappings: [
          {
            fieldId: "field id from fields list",
            sourcePath: "exact path from local profile field catalog",
            value: "optional non-personal literal only when sourcePath is not enough",
            confidence: 0.95,
            reason: "short reason"
          }
        ],
        notes: ["optional warnings"]
      },
      null,
      2
    ),
    "",
    "Rules:",
    "- Use only fieldId values that exist in fields.",
    "- Set confidence from 0 to 1.",
    "- Precision is more important than coverage. If context is ambiguous, omit the mapping instead of guessing.",
    "- Required fields deserve careful mapping, but uncertainty must lower confidence.",
    "- For repeated sections like family father/mother, performance review rows, or education entries, use section, nearbyText, and groupText to select the right profile path.",
    "- In Chinese job application forms, generic labels such as 姓名、电话、工作单位、职务、地址 must follow their context: family member, emergency contact, reference/prover, performance review, current residence, hukou, native place, source place, or mailing address.",
    "- Do not map family/emergency/reference generic fields to the applicant's own basic information unless the page context is clearly the applicant profile.",
    "- For Chinese recruitment forms, common mappings include 姓名 -> 姓名, 手机号码 -> 手机号码/电话, 电子邮箱 -> 邮箱/电子邮箱, 毕业院校 -> 学校/毕业院校, 证书名称 -> 证书名称（技能名称）.",
    "- For user-defined fields, inspect customFields.* items by label and key. If a custom field matches, use sourcePath like customFields.basic[0].value.",
    "- For declarations asking yes/no questions, use declarations.* only if the question meaning clearly matches.",
    "- Do not output copied page values, existing field values, names, phone numbers, email addresses, ID numbers, schools, employers, addresses, or experience descriptions.",
    "",
    "Local profile field catalog. Values are intentionally omitted:",
    JSON.stringify(profileCatalog, null, 2),
    "",
    "Detected page fields JSON. Existing field values are intentionally omitted/redacted:",
    JSON.stringify(scan, null, 2)
  ].join("\n");

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];
}

function buildPageStructureMessages(scan) {
  const systemPrompt = [
    "You are a page-structure analyzer for job application forms.",
    "Your task is to normalize noisy detected web form metadata into readable form-field hints.",
    "Return strict JSON only. Do not include prose or explanations outside JSON.",
    "Privacy rule: the page may already contain user-entered values in nearby text, so never copy, infer, or output personal values.",
    "Only output structural labels, section names, control kind hints, and short non-sensitive notes.",
    "Do not decide to submit the form and do not map to a resume profile."
  ].join("\n");

  const userPrompt = [
    "Analyze the current job application page fields.",
    "",
    "Return JSON with this schema:",
    JSON.stringify(
      {
        siteType: "generic | zhiye | hotjob | ats | ant-design | element-ui | custom",
        confidence: 0.8,
        fieldHints: [
          {
            fieldId: "field id from fields list",
            label: "normalized visible label, no personal value",
            section: "normalized section name",
            controlKind: "text | textarea | select | search-select | radio | checkbox | date | file | unknown",
            confidence: 0.9,
            note: "short structural note"
          }
        ],
        notes: ["optional warnings"]
      },
      null,
      2
    ),
    "",
    "Rules:",
    "- Use only fieldId values that exist in fields.",
    "- If nearbyText contains a label and value, output only the label.",
    "- Prefer Chinese field labels when the page is Chinese.",
    "- For repeated sections, keep section names such as 基本信息、教育经历、实习经历、工作经历、绩效考核、专业资格、项目经历、家庭信息、附加问题.",
    "- If a field is a custom select/search input, set controlKind to search-select or select.",
    "- Do not output names, phone numbers, email addresses, ID numbers, schools, employers, addresses, dates of birth, or experience descriptions.",
    "",
    "Detected page fields JSON. Existing field values are omitted/redacted:",
    JSON.stringify(scan, null, 2)
  ].join("\n");

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];
}

async function callAi(apiConfig, messages, context) {
  if (apiConfig.mode === "custom") {
    return callCustomApi(apiConfig, messages, context);
  }
  return callOpenAiCompatible(apiConfig, messages);
}

async function callOpenAiCompatible(apiConfig, messages) {
  if (!apiConfig.baseUrl) {
    throw new Error("API base URL is required.");
  }
  if (!apiConfig.model) {
    throw new Error("Model name is required.");
  }

  const url = joinUrl(apiConfig.baseUrl, apiConfig.endpointPath || "/chat/completions");
  const headers = buildRequestHeaders({ apiConfig, headerJson: apiConfig.extraHeadersJson });

  const body = {
    model: apiConfig.model,
    messages,
    temperature: 0
  };

  if (apiConfig.useJsonResponseFormat) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`API request failed ${response.status}: ${text.slice(0, 500)}`);
  }

  const data = safeJsonParse(text);
  if (!data) {
    return text;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    return content.map((item) => item.text || item.content || "").join("");
  }
  if (typeof content === "string") {
    return content;
  }

  return JSON.stringify(data);
}

async function callCustomApi(apiConfig, messages, context) {
  if (!apiConfig.customUrl) {
    throw new Error("Custom API URL is required.");
  }

  const headers = buildRequestHeaders({ apiConfig, headerJson: apiConfig.customHeadersJson });

  const body = renderTemplate(apiConfig.customBodyTemplate || DEFAULT_API_CONFIG.customBodyTemplate, {
    model: apiConfig.model || "",
    messages,
    systemPrompt: messages.find((message) => message.role === "system")?.content || "",
    userPrompt: messages.find((message) => message.role === "user")?.content || "",
    profile: context.profile,
    scan: context.scan
  });

  const response = await fetch(apiConfig.customUrl, {
    method: apiConfig.customMethod || "POST",
    headers,
    body
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Custom API request failed ${response.status}: ${text.slice(0, 500)}`);
  }

  const data = safeJsonParse(text);
  if (!data) {
    return text;
  }

  const content = apiConfig.customResponsePath ? getByPath(data, apiConfig.customResponsePath) : data;
  if (typeof content === "string") {
    return content;
  }
  return JSON.stringify(content);
}

function buildRequestHeaders({ apiConfig, headerJson, includeContentType = true }) {
  const headers = parseJsonObject(headerJson, "request headers");
  if (includeContentType && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    headers["content-type"] = "application/json";
  }
  if (apiConfig.apiKey && !Object.keys(headers).some((key) => key.toLowerCase() === "authorization")) {
    headers.authorization = `Bearer ${apiConfig.apiKey}`;
  }
  return headers;
}

function resolveModelListUrl(apiConfig) {
  if (apiConfig.mode === "openai-compatible") {
    return apiConfig.baseUrl ? joinUrl(apiConfig.baseUrl, "/models") : "";
  }

  const derived = deriveModelListUrl(apiConfig.customUrl || "");
  return derived;
}

function deriveModelListUrl(sourceUrl) {
  if (!sourceUrl) {
    return "";
  }

  try {
    const url = new URL(sourceUrl);
    if (url.pathname.endsWith("/chat/completions")) {
      url.pathname = url.pathname.replace(/\/chat\/completions$/, "/models");
      return url.toString();
    }
    if (url.pathname.endsWith("/completions")) {
      url.pathname = url.pathname.replace(/\/completions$/, "/models");
      return url.toString();
    }
    if (url.pathname.endsWith("/responses")) {
      url.pathname = url.pathname.replace(/\/responses$/, "/models");
      return url.toString();
    }
    if (!url.pathname || url.pathname === "/") {
      url.pathname = "/models";
      return url.toString();
    }
    url.pathname = "/models";
    return url.toString();
  } catch {
    return "";
  }
}

function extractModelListSource(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data?.data)) {
    return data.data;
  }
  if (Array.isArray(data?.models)) {
    return data.models;
  }
  if (Array.isArray(data?.items)) {
    return data.items;
  }
  if (Array.isArray(data?.result)) {
    return data.result;
  }
  if (Array.isArray(data?.choices)) {
    return data.choices;
  }
  if (data && typeof data === "object") {
    for (const key of ["data", "models", "items", "result", "list"]) {
      if (Array.isArray(data[key])) {
        return data[key];
      }
    }
  }

  throw new Error("Could not find a model array in the response.");
}

function normalizeModelList(source) {
  const items = Array.isArray(source) ? source : [];
  return items
    .map((item) => normalizeModelItem(item))
    .filter(Boolean);
}

function normalizeModelItem(item) {
  if (typeof item === "string") {
    const id = item.trim();
    return id ? { id, name: id } : null;
  }

  if (!item || typeof item !== "object") {
    return null;
  }

  const id = String(item.id || item.model || item.name || item.slug || item.value || "").trim();
  if (!id) {
    return null;
  }

  return {
    id,
    name: String(item.display_name || item.name || item.id || id).trim() || id
  };
}

function joinUrl(baseUrl, path) {
  const normalizedBase = String(baseUrl).replace(/\/+$/, "");
  const normalizedPath = String(path || "").replace(/^\/?/, "/");
  return `${normalizedBase}${normalizedPath}`;
}

function parseJsonObject(value, label) {
  if (!value || !String(value).trim()) {
    return {};
  }

  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed;
}

function renderTemplate(template, values) {
  const replacements = {
    model: values.model,
    modelJson: JSON.stringify(values.model),
    messagesJson: JSON.stringify(values.messages),
    systemPrompt: values.systemPrompt,
    systemPromptJson: JSON.stringify(values.systemPrompt),
    userPrompt: values.userPrompt,
    userPromptJson: JSON.stringify(values.userPrompt),
    prompt: values.userPrompt,
    promptJson: JSON.stringify(values.userPrompt),
    profileJson: JSON.stringify(values.profile),
    profileCatalogJson: JSON.stringify(values.profileCatalog || values.profile),
    fieldsJson: JSON.stringify(values.scan.fields),
    scanJson: JSON.stringify(values.scan)
  };

  return String(template).replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    if (!Object.prototype.hasOwnProperty.call(replacements, key)) {
      throw new Error(`Unknown custom API template variable: ${key}`);
    }
    return replacements[key];
  });
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseJsonFromText(text) {
  if (typeof text !== "string") {
    return text;
  }

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const direct = safeJsonParse(cleaned);
  if (direct) {
    return direct;
  }

  const jsonCandidate = extractFirstJson(cleaned);
  const parsed = jsonCandidate ? safeJsonParse(jsonCandidate) : null;
  if (!parsed) {
    throw new Error(`AI response is not valid JSON: ${cleaned.slice(0, 500)}`);
  }

  return parsed;
}

function normalizePageStructureAnalysis(parsed, fields) {
  const validFieldIds = new Set(fields.map((field) => field.fieldId));
  const fieldHintsSource = Array.isArray(parsed?.fieldHints)
    ? parsed.fieldHints
    : Array.isArray(parsed?.fields)
      ? parsed.fields
      : [];

  const fieldHints = fieldHintsSource
    .filter((hint) => hint && validFieldIds.has(String(hint.fieldId || "")))
    .map((hint) => ({
      fieldId: String(hint.fieldId),
      label: sanitizePromptText(hint.label || hint.normalizedLabel || "", 120),
      section: sanitizePromptText(hint.section || hint.group || "", 120),
      controlKind: sanitizeAttributeText(hint.controlKind || hint.type || "unknown"),
      confidence: clampConfidence(hint.confidence),
      note: sanitizePromptText(hint.note || hint.reason || "", 160)
    }))
    .filter((hint) => hint.label || hint.section || hint.controlKind !== "unknown");

  return {
    siteType: sanitizeAttributeText(parsed?.siteType || parsed?.type || "generic"),
    confidence: clampConfidence(parsed?.confidence),
    fieldHints,
    notes: Array.isArray(parsed?.notes)
      ? parsed.notes.map((note) => sanitizePromptText(note, 160)).filter(Boolean).slice(0, 8)
      : [],
    raw: parsed
  };
}

function extractFirstJson(text) {
  const start = text.search(/[\[{]/);
  if (start < 0) {
    return "";
  }

  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === opener) {
      depth += 1;
    } else if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return "";
}

function normalizeAiMappings(parsed, fields) {
  let mappings = [];

  if (Array.isArray(parsed)) {
    mappings = parsed;
  } else if (Array.isArray(parsed?.mappings)) {
    mappings = parsed.mappings;
  } else if (parsed && typeof parsed === "object") {
    mappings = Object.entries(parsed).map(([fieldId, value]) => ({
      fieldId,
      ...(value && typeof value === "object" ? value : { value })
    }));
  }

  const validFieldIds = new Set(fields.map((field) => field.fieldId));
  return mappings
    .filter((mapping) => mapping && validFieldIds.has(mapping.fieldId))
    .map((mapping) => {
      const normalized = {
        fieldId: String(mapping.fieldId),
        sourcePath: mapping.sourcePath || mapping.source || mapping.path || "",
        confidence: clampConfidence(mapping.confidence),
        reason: String(mapping.reason || "")
      };

      if (
        !normalized.sourcePath &&
        Object.prototype.hasOwnProperty.call(mapping, "value") &&
        mapping.value !== undefined
      ) {
        normalized.value = mapping.value;
      }

      return normalized;
    });
}

function annotateMappingsWithCatalog(mappings, profileCatalog) {
  const catalogFields = Array.isArray(profileCatalog?.fields) ? profileCatalog.fields : [];
  const sections = Array.isArray(profileCatalog?.sections) ? profileCatalog.sections : [];
  const fieldByPath = new Map(catalogFields.map((field) => [field.path, field]));
  const sectionByPath = new Map();

  for (const section of sections) {
    const fields = Array.isArray(section.fields) ? section.fields : [];
    for (const field of fields) {
      sectionByPath.set(field.path, section.title || "");
    }
  }

  return mappings.map((mapping) => {
    const catalogField = fieldByPath.get(mapping.sourcePath);
    if (!catalogField) {
      return mapping;
    }

    return {
      ...mapping,
      sourceLabel: catalogField.label || "",
      sourceSection: sectionByPath.get(mapping.sourcePath) || ""
    };
  });
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, number));
}

function getByPath(source, path) {
  const parts = String(path)
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  let current = source;
  for (const part of parts) {
    if (current == null) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}
