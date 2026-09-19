# BOSS Copilot compatibility runtime

This integration intentionally preserves the mature BOSS-specific automation from the retired `job-application-copilot` project while Job Harness owns applicant data, Resume Profiles, scoring, deduplication and records.

## Production shape

```text
Dedicated Edge/Chrome profile
  -> unpacked Job Harness BOSS Copilot compatibility extension
     -> proven legacy BOSS search/detail/chat/resume DOM workflow
        -> Job Harness BOSS Outreach Bridge
           -> ApplicantProfile / ResumeProfile ranking / DiscoveryRun / logs
```

The dedicated browser is isolated from the user's normal browser profile and exposes localhost CDP for debugging only. The compatibility extension is built from `../boss/legacy-copilot.user.js`; it does not require Tampermonkey. A tiny MV3 background transport exposes the old `GM.xmlHttpRequest` / `GM_xmlhttpRequest` contract to the copied script and permits requests only to `https://oracle.taile92a8e.ts.net:10444`. This avoids public-page -> Tailnet Private Network Access/CORS restrictions without restoring a general-purpose network proxy. The legacy script also retains a normal CORS `fetch` fallback for non-extension embedding.

## Start on Windows

Run:

```powershell
.\windows\start-boss-copilot.ps1
```

The launcher prefers Edge, falls back to Chrome, stores the persistent profile at:

```text
%LOCALAPPDATA%\JobHarness\BossCopilot\Profile
```

and loads the unpacked extension from `extension/`.

The page overlay starts paused. Clicking **开始** enables the proven Copilot loop. The Job Harness bridge supplies current target roles, scores every job across active Resume Profiles, returns the selected BOSS resume index and policy-gates resume follow-up.

## Compatibility boundary

The following legacy browser behavior is intentionally retained rather than rewritten:

- keyword rotation and search-page traversal;
- BOSS job card/detail extraction;
- first-greeting chat creation;
- cross-tab search/detail/chat coordination;
- unread recruiter-message scanning;
- BOSS resume chooser handling;
- resume-sent detection and retry behavior.

The following old ownership is not restored:

- stale `profile-bundle.json` or copied applicant values;
- the old standalone companion server / ledger as source of truth;
- LLM multi-turn recruiter chat;
- automatic portfolio sending;
- automatic rejection messages.

The original browser-provider sources are preserved under `legacy/` for behavioral reference and fallback, but production scoring/configuration comes from Job Harness.

## Build

```bash
pnpm build:boss-copilot-compat
pnpm check:boss-copilot-compat
```

Do not edit `extension/boss-copilot.js` by hand; it is generated from the canonical vendored userscript.
