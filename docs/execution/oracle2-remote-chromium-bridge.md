# Oracle2 Remote Chromium → Job Harness Browser Bridge

Implemented and smoke-tested on 2026-10-15 (China time) against Job Harness production. This is an **additional browser backend**, not a replacement for the existing Windows extension, BOSS site runtime, or Steel Apply Worker.

## Architecture and boundaries

- Existing Docker container: `oracle2-remote-browser`, under `/opt/remote-browser/docker-compose.yml`. **Never recreate it solely to update the Browser Bridge**, because it also hosts persistent AnyRouter and Penpot Chromium profiles.
- Dedicated browser profile: `/opt/remote-browser/config/job-harness-bridge/profile` on the host, visible in the container as `/config/job-harness-bridge/profile`. Contains browser secrets and scoped Bridge token; do not commit, print, or copy to the project.
- Dedicated upstream extension copy: `/opt/remote-browser/config/job-harness-bridge/extension`. It uses the unchanged MV3 background/poll/command protocol from `integrations/browser-extension/`. The **deployment-only** manifest narrows host permissions to `http://127.0.0.1/*` and `https://*.{liepin,zhipin,zhaopin}.com/*`. The general source manifest must retain optional-only host permissions and pass `scripts/check-browser-extension-bridge.ts`.
- Managed launcher, shutdown script, local relay, and user Unit templates are versioned in `deploy/oracle2-remote-chromium/`. Run `python3 scripts/oracle2-bridge-runtime-sync.py --check` to detect runtime drift, or stop the dedicated Unit and use `--apply` to install/update them. The installer never touches cookies or API tokens.
- Browser service: user systemd unit `~/.config/systemd/user/job-harness-remote-chromium-bridge.service`, enabled with linger. Its `ExecStart` executes `/config/job-harness-bridge/run.sh` inside the **existing** container with `DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0`, `XDG_RUNTIME_DIR=/config/.XDG`; `ExecStop` executes `stop.sh`.
- Dedicated browser CDP: `127.0.0.1:9236` **inside the container only**. Do not use `9226`: an older container-local IPv4 Python proxy owns that port and forwards it to the AnyRouter session. Original Chromium CDP `9225`, Penpot `9222`, Steel `9223` have separate ownership and must not be modified. CDP is not published in Docker/Tailscale.
- The browser container joins external Docker network `job-harness_default` in addition to its original network `remote-browser_default`; this is codified in `/opt/remote-browser/docker-compose.yml`. The `tcp-relay.py` process listens on **container-loopback only** `127.0.0.1:20901` and proxies to `job-harness-server-1:3000`. This bypasses broken container → host-Tailscale hairpin routing without opening another public API port. No HTTP traffic or token contents are logged.
- Bridge URL in extension storage: `http://127.0.0.1:20901/internal/browser-bridge/v1`.
- Scoped agent ID: `oracle2-remote-chromium`. Resume upload capability enabled; screenshots disabled. Token is issued using the existing five-minute one-time code pairing process (90-day default token lifetime); long-lived global/API bearer stays server-side.
- Server still enforces frozen Resume Revision/PDF Artifact, lease and authorization boundaries. Having `resumeUpload=true` **does not** give permission to submit applications. Recruiting-site login in the **new dedicated** browser profile is an independent prerequisite. Do not transfer original AnyRouter/Penpot cookies or reuse their browser sessions.

## Reproduction and operational checks

Inspect / restart only this agent:

```sh
systemctl --user status job-harness-remote-chromium-bridge.service
systemctl --user restart job-harness-remote-chromium-bridge.service
docker exec oracle2-remote-browser curl -fsS http://127.0.0.1:20901/healthz
docker exec oracle2-remote-browser curl -fsS http://127.0.0.1:9236/json/version
docker inspect oracle2-remote-browser --format '{{range $n,$c:=.NetworkSettings.Networks}}{{$n}} {{end}}'
```

Production authenticated agent status (do not print bearer):

```sh
docker exec job-harness-server-1 node -e '
fetch("http://127.0.0.1:3000/internal/browser-bridge/v1/agents",
  {headers:{authorization:"Bearer "+process.env.JOB_HARNESS_AUTH_TOKEN}})
.then(async r => {const x=await r.json();console.log((x.items||[]).map(a=>({
  id:a.agentId,version:a.version,online:a.online,lastSeenAt:a.lastSeenAt,
  resumeUpload:a.capabilities?.resumeUpload,screenshots:a.capabilities?.screenshots
})))})
'
```

To update the remote extension **and** managed runtime templates after updating the canonical repo:

```sh
systemctl --user stop job-harness-remote-chromium-bridge.service
python3 scripts/oracle2-bridge-extension-sync.py --apply
python3 scripts/oracle2-bridge-runtime-sync.py --apply
python3 scripts/oracle2-bridge-extension-sync.py --check
python3 scripts/oracle2-bridge-runtime-sync.py --check
systemctl --user daemon-reload
systemctl --user enable --now job-harness-remote-chromium-bridge.service
```

These scripts update only the eleven extension files and the four nonsecret runtime templates; they never read or write the browser profile, agent token, or applicant data. `--check` fails on drift, including mode changes. A custom `--target` or `--root` + `--unit-dir` supports an isolated dry-run installation. If changing a running service, first stop **only** this user Unit, not the remote browser container.

Fresh setup requires the existing `oracle2-remote-browser` Compose service, its `./config:/config` volume, and an external `job-harness_default` network connection. In `/opt/remote-browser/docker-compose.yml` add `job-harness-backend` as an external network with `name: job-harness_default` and attach the `chromium` service to both `default` and `job-harness-backend` (preserve the existing environment variables and other services). To attach the currently running container without recreation, use:

```sh
docker network inspect job-harness_default
docker network connect job-harness_default oracle2-remote-browser
```

The second command is needed only if this network is missing. Do not expose the dedicated CDP port `9236` or the localhost proxy port `20901` on the Docker host. The proxy is intended to be reachable only from inside the existing browser container.

The original Compose file is intentionally **not** copied into the Job Harness repository: it contains deployment-private configuration. The server retains a pre-network Compose backup for rollback. If a manual `docker run` recreates the container outside Compose, reattach `job-harness_default` before restarting the user service. The MV3 pairing token is stored in the dedicated persistent browser profile and must be obtained through the standard one-time pairing flow on a fresh profile.

For a subsequent recruiting-site trial: open the Oracle2 remote desktop through Tailscale, select the **dedicated** Chromium window, log into the relevant recruiting website once, then initiate a controlled Resume Sync in Job Harness. Verify the remote PDF label and hash evidence; create a SiteResumeBinding only from permitted read-only evidence. Do not treat merely observing an uploaded file as an application submission, and do not assume old site attachments have been renamed.

## Verified on 2026-10-15

1. Docker cross-network health reached Job Harness API over the relay (HTTP 200).
2. Dedicated CDP exposed exactly the new Chromium (unique browser websocket ID), and MV3 service worker loaded from `hoblapndkgpjfhlcbbfoplglbahcncpj/background.js`.
3. The normal one-time pairing UI saved the scoped token with no global API credential and no screenshot permission.
4. Authenticated live Bridge API returned **one online** `oracle2-remote-chromium` Agent (MV3 0.2.5, 26 commands, resumeUpload=true).
5. Restart of only the dedicated user systemd unit automatically restored the service worker and online registration; original browser container was not restarted.
6. A real `site-readonly` Browser Bridge invocation acquired a public Liepin job-detail tab and round-tripped `current_url` through the remote extension; **writeCount=0**.
7. No actual site attachment upload, account login, BOSS outreach, final submit, or email send was performed.

Known operational distinction: the production synthetic canary origin `https://oracle.taile92a8e.ts.net:20900` may be inaccessible from the remote browser Docker namespace due to the host-Tailscale hairpin issue. The read-only recruiting-site canary above tested the full real Bridge path without changing the public origin or weakening target validation. The production BOSS/Steel services are outside this connection setup.

## Rollback

```sh
systemctl --user disable --now job-harness-remote-chromium-bridge.service
docker network disconnect job-harness_default oracle2-remote-browser
```

Keep the original browser Compose backup at `/opt/remote-browser/config/job-harness-bridge/docker-compose.before-bridge.yml`. Revert only the extra `networks` section in `/opt/remote-browser/docker-compose.yml` if fully retiring this backend. Do **not** delete the dedicated profile without explicitly deciding to discard its login/token state. The current Agent's token expires in January 2027 unless re-paired. Extension or launcher updates do not rotate the token.
