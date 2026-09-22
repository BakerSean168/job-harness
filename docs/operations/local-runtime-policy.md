# Local runtime execution policy

Status: active operational policy.

Job Harness components that execute on the user's Windows/WSL machine are **manual-start by default**.

This includes:

- Recruitment Browser / dedicated Edge or Chrome profile;
- BOSS compatibility runtime carried by that browser;
- WSL get_jobs runtime / Camoufox collection runtime.

## Rules

1. Installing or synchronizing local runtime files must not implicitly start a long-running local process.
2. Installing or synchronizing local runtime files must not implicitly register Windows sign-in auto-start; manual/default installation should remove the known legacy launcher for that runtime when present.
3. Windows Startup integration is allowed only as an explicit opt-in action.
4. Scheduled Tasks are not part of the supported Job Harness local-runtime boot path.
5. Server-side recurring collection/orchestration may exist, but it must not be able to create a local browser process when the local runtime has not been manually started.
6. Existing legacy auto-start entries should be removed when migrating to this policy.

## Manual commands

Recruitment Browser:

```powershell
.\integrations\recruitment-browser\windows\install-recruitment-browser.ps1
.\integrations\recruitment-browser\windows\start-recruitment-browser.ps1
```

The installer only copies the bootstrap by default. It neither launches the browser nor installs Startup integration.

Explicit opt-in variants:

```powershell
# Start immediately as part of installation
.\integrations\recruitment-browser\windows\install-recruitment-browser.ps1 -LaunchNow

# Deliberately restore sign-in auto-start
.\integrations\recruitment-browser\windows\install-recruitment-browser.ps1 -EnableAutoStart
```

WSL get_jobs runtime:

```bash
~/.local/share/job-harness/get-jobs-runtime/start.sh start
```

Its Windows Startup helper also requires an explicit `-EnableAutoStart`.

## Remove legacy local auto-start

Run:

```powershell
.\integrations\recruitment-browser\windows\disable-job-harness-local-autostart.ps1
```

It removes the two known per-user Startup launchers:

- `JobHarnessRecruitmentBrowser.cmd`;
- `JobHarnessGetJobsRuntime.cmd`.

It does not silently delete Scheduled Tasks. If matching scheduled tasks are found, it prints them for manual review because supported Job Harness installers do not create those tasks.
