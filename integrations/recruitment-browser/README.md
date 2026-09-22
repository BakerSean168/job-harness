# Job Harness Recruitment Browser

This integration is the Windows-side execution-plane bootstrap for the upstream-first Recruitment Browser Runtime.

## What it owns

The Recruitment Browser Supervisor owns only:

- a dedicated persistent Edge/Chrome profile under `%LOCALAPPDATA%\JobHarness\RecruitmentBrowser\Profile`;
- the Job Harness-owned unpacked runtime extensions;
- runtime bundle download/hash verification;
- browser process lifecycle and crash recovery;
- localhost CDP exposure for debugging;
- local runtime/supervisor status;
- bounded self-healing when the BOSS page is alive but the server-side Site Runtime heartbeat stays stale across multiple supervisor polls.

It does **not** own Campaign, Job, Resume, SubmissionIntent, Application or final-submit policy.

## Runtime channel

The Job Harness server publishes public, secret-free runtime assets at:

```text
/runtime/recruitment-browser/v1/manifest.json
/runtime/recruitment-browser/v1/files/<asset-id>
```

The manifest is content-addressed. Every file carries SHA-256 and byte length. The Windows supervisor downloads into a versioned local cache, validates every hash, then promotes the validated bundle to a stable `Runtime\current` directory. The stable path keeps unpacked-extension identity/storage stable between runtime upgrades.

The channel currently distributes:

- the mature BOSS Copilot compatibility extension;
- the generic Job Harness Browser Bridge extension;
- the Browser Supervisor script;
- bootstrap/install scripts.

The runtime channel carries no Job Harness bearer, candidate data, Resume data, login cookies or server credentials.

## Dedicated browser

The supervisor prefers Edge, falls back to Chrome, and launches only the dedicated profile. During migration it automatically reuses the existing `%LOCALAPPDATA%\JobHarness\BossCopilot\Profile` when that profile exists, preserving the already-proven BOSS login/session; otherwise it creates `%LOCALAPPDATA%\JobHarness\RecruitmentBrowser\Profile`. A custom `-ProfilePath` can override both. Runtime updates stop/restart only browser processes whose command line contains the selected dedicated profile path; the user's normal browser processes are not targeted.

Current default CDP endpoint:

```text
http://127.0.0.1:9222
```

Runtime updates may restart the dedicated browser. Login state remains in the persistent profile.

## Install

One-time installation can be performed with:

```powershell
.\windows\install-recruitment-browser.ps1
```

The installer is manual-first:

1. copies the small bootstrap launcher into LocalAppData;
2. does **not** install Windows Startup integration by default, and removes the legacy `JobHarnessRecruitmentBrowser.cmd` Startup launcher if one is still present;
3. does **not** start the browser/runtime by default.

Start it when needed with `start-recruitment-browser.ps1`, or use `-LaunchNow` on the installer for an explicit immediate launch. Windows sign-in auto-start exists only as an explicit `-EnableAutoStart` opt-in.

To remove legacy Startup launchers from older installs, run:

```powershell
.\windows\disable-job-harness-local-autostart.ps1
```

At each manual bootstrap, the latest supervisor file is downloaded from the runtime channel and SHA-256 verified before execution. The long-running supervisor then polls the runtime manifest and promotes extension bundles automatically while it is running.

## One-shot validation

To synchronize the current bundle without launching Edge:

```powershell
.\windows\start-recruitment-browser.ps1 -Once -NoLaunch
```

For normal long-running operation:

```powershell
.\windows\start-recruitment-browser.ps1
```

## Current migration note

Loading the generic Browser Bridge into the dedicated profile does not grant it Career/Resume authority. Its existing scoped pairing/worker protocol remains in force. BOSS is already exposed as the coarse `boss-czc-good-job` Site Runtime; the low-level Browser Bridge remains a generic/fallback driver rather than the primary orchestration surface for proven site runtimes.

The BOSS content script polls its server-side coarse control state. Background Chromium timers can be throttled, so the bridge tolerates a bounded heartbeat gap. Separately, the Windows Supervisor compares local CDP page health with the server-side BOSS Runtime health. Self-healing is armed only while a BOSS Runtime task actually exists with `desiredState=running`; idle/paused BOSS browsing never restarts Edge merely because a heartbeat is stale. During an active task, if the page remains healthy while the Site Runtime heartbeat reports `offline` for three consecutive supervisor iterations, only the dedicated Job Harness browser is restarted so the extension/runtime is reloaded without touching the user's normal browser.
