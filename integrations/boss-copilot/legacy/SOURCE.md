# Vendored Job Application Copilot source snapshot

Source repository: `/home/ubuntu/projects/job-application-copilot`
Source commit: `005eda98841b3671ead615ebfde5922f0dfd7c36`
Snapshot date in Job Harness: 2026-09-19

This directory is a compatibility/reference snapshot, not a second source of truth.

Copied:
- browser/extension source under `src/`;
- browser providers, BOSS adapter, launchers and helper scripts under `scripts/`;
- original manifest, README and license/notice files.

Intentionally not copied:
- `.git/`;
- `node_modules/`;
- `.local/` generated runtime state;
- `data/profile-bundle.json` and other applicant/profile values.

Production BOSS behavior is generated from Job Harness-owned `integrations/boss/legacy-copilot.user.js` and uses the Job Harness BOSS Outreach Bridge for current applicant/resume/scoring data.
