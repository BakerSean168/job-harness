# Self-hosted deployment

The supported deployment uses Docker Compose with the Web/API runtime plus a private Chromium Resume renderer sidecar:

```text
Browser / Tailscale Serve / reverse proxy
                |
                v
        Web :3001 (host-published)
                |
       Compose private network
                |
                v
       REST/MCP Server :3000  -------->  Resume Renderer :3002
                |                         (Chromium, private only)
                v
       /data/job-harness.db
       /data/resume-artifacts/
```

REST/MCP and the Resume renderer stay private to the Compose network. Web is the normal host entry point and binds to `127.0.0.1:3001` unless explicitly changed. The optional BOSS Compatibility Bridge also publishes only on host loopback (default `127.0.0.1:18788`) so a private Tailnet/reverse-proxy route can reach it without exposing the bridge on LAN/public interfaces. Server waits for renderer health; the BOSS bridge waits for Server health; Web waits for Server health.

## Prerequisites

- Docker Engine with Docker Compose v2;
- a writable persistent data directory;
- a strong API bearer token;
- enough image/disk budget for the Chromium renderer image and generated Resume artifacts.

Create configuration:

```bash
cp deploy/self-host.env.example deploy/self-host.env
openssl rand -hex 32
openssl rand -base64 48
mkdir -p data
```

Put the generated API token into `JOB_HARNESS_AUTH_TOKEN`. If the data directory is not writable from the container, make it writable by uid 1000 (the non-root `node` runtime user). For host-operated backup, use a shared operator group and setgid on the durable data directory, and set `JOB_HARNESS_DATA_GID` to that host group ID. Compose adds that GID as a supplementary group to Server, allowing newly created Resume artifact directories to preserve the operator group and setgid bit without making files world-readable. The default GID is `1000`.

## Start

```bash
docker compose --env-file deploy/self-host.env up -d --build
```

Then open:

```text
http://127.0.0.1:3001
```

Status and logs:

```bash
docker compose --env-file deploy/self-host.env ps
docker compose --env-file deploy/self-host.env logs -f renderer server web
```

Renderer and Server health checks call `/healthz`; the Web health check follows the root route. Renderer is a private rendering capability, Server waits for it, and Web waits for Server.

## SubmissionIntent reconciliation

Server runs a bounded local reconciliation sweep for durable external-submission intents. It never performs recruiting-site/browser actions. The sweep only retries persistence for intents that already contain durable external-success evidence and flags stale `external_in_progress` work for manual review. Defaults are:

```text
JOB_HARNESS_SUBMISSION_RECONCILE_INTERVAL_MS=300000
JOB_HARNESS_SUBMISSION_STALE_AFTER_MS=7200000
JOB_HARNESS_SUBMISSION_MAX_AUTOMATIC_RETRIES=8
JOB_HARNESS_SUBMISSION_RECONCILE_BATCH_SIZE=100
```

Set the interval to `0` to disable the background sweep. A startup sweep runs when reconciliation is enabled, so `persistence_pending` items survive process/container restarts and are retried without repeating the external application side effect.


## BOSS Compatibility Bridge

The Compose stack includes a `boss-bridge` service for the mature BOSS Copilot compatibility runtime. The bridge talks to `server:3000` through the private Compose network, while the Server's ChatGPT MCP adapter reaches pending/resolution endpoints at `http://boss-bridge:18788`. This avoids routing the ChatGPT control loop back out through a public/Tailnet URL.

The bridge host mapping is loopback-only by default. Set `JOB_HARNESS_BOSS_BRIDGE_PUBLIC_URL` to the private HTTPS/Tailnet address used by the dedicated browser profile when applicable. For the separate 智联/猎聘/51job collect-only upstream runtime, set `JOB_HARNESS_GET_JOBS_RUNTIME_URL` on the Job Harness server to a private HTTP(S) endpoint reachable from the server (the Oracle2 deployment uses a tailnet-only Tailscale Serve endpoint on the user's Windows/WSL host). The MCP layer exposes only coarse status/start/stop/sync operations and verifies the upstream `collectOnly=true` marker before starting collection. BOSS now also exposes a coarse Site Runtime control surface: `boss_runtime_status` is read-only, `boss_runtime_pause` only stops future work, and `boss_runtime_start` can start/reuse a Campaign-policy-bounded task whose greeting/inbox/resume-followup permissions and external-effect budget are derived server-side. Runtime tasks also expire automatically (`JOB_HARNESS_BOSS_RUNTIME_TASK_TTL_MS`, one hour by default), and a signed-in browser polling from a BOSS login/security-challenge page causes the active task to pause rather than continue automation. The ChatGPT MCP surface also exposes `boss_greetings_pending` as read-only, `boss_greeting_resolver_ready` as a non-external bounded presence/priority handshake, `boss_greeting_claim` as a non-external short lease acquisition, and `boss_greeting_resolve` as a bounded greeting release that requires the active lease token. The third bounded MCP effect is `career_email_application_authorize_send`, which authorizes only one exact immutable email package for the separate Email Delivery Worker and is independently gated by Campaign `email.sendEnabled`. None of these paths bypasses ATS SubmissionIntent/final-submit controls.

Oracle2 defines an optional Compose profile named `greeting-resolver`. The preferred configuration is the built-in OpenAI-compatible provider with `JOB_HARNESS_BOSS_GREETING_PROVIDER_KIND=openai-compatible`, a provider base URL, model and optional source label. Oracle2 currently targets Groq at `https://api.groq.com/openai/v1` with `qwen/qwen3.8-27b`. The API key may be supplied directly through the private environment, but production should prefer the read-only secret file mounted from `/home/ubuntu/.config/job-harness/groq-api-key` to `/run/secrets/job-harness-groq-api-key` and referenced by `JOB_HARNESS_BOSS_GREETING_PROVIDER_API_KEY_FILE`. The provider worker claims as `background`, so a request created while `boss_greeting_resolver_ready` is active waits through the configured `JOB_HARNESS_BOSS_CHATGPT_PRIORITY_MS` interactive-priority interval before Groq may claim it. If neither ChatGPT nor Groq resolves the request, the deterministic fallback remains at the original `JOB_HARNESS_BOSS_GREETING_WAIT_MS` deadline. A command provider remains available as an explicit extension mode.

## Network/security defaults

- `renderer:3002` and `server:3000` are only exposed to the Compose network; do not add host `ports:` mappings for normal operation.
- Renderer receives only self-contained Resume HTML, disables page JavaScript, blocks network requests, runs read-only except `/tmp`, and requires an internal bearer for `/render/pdf`.
- Web defaults to `127.0.0.1`, suitable for local access or for a host-level Tailscale Serve/reverse proxy.
- `boss-bridge:18788` is private between Compose services and is host-published only on `127.0.0.1`; expose it externally only through an intentional private HTTPS/Tailnet route.
- `JOB_HARNESS_AUTH_TOKEN` is required by Compose because Server binds to `0.0.0.0` inside the container.
- The same bearer is injected into Web server-side runtime only; it is not a `NEXT_PUBLIC_*` value and is not sent to browser HTML.
- Runtime containers run as non-root users and set `no-new-privileges`; renderer additionally uses a read-only root filesystem with tmpfs for Chromium scratch state.

For a public or shared reverse-proxy endpoint:

1. enable `JOB_HARNESS_WEB_PASSWORD`;
2. set a random `JOB_HARNESS_WEB_SESSION_SECRET` of at least 32 characters;
3. terminate HTTPS at the proxy/Tailscale layer;
4. set `JOB_HARNESS_WEB_COOKIE_SECURE=true`;
5. only set `JOB_HARNESS_WEB_BIND=0.0.0.0` when the host firewall/private network exposure is intentional.

See [Self-hosted Web authentication](../security/self-hosted-web-auth.md).

## Persistence, export and backup

The configured host `JOB_HARNESS_DATA_DIR` is mounted at `/data`; the live database is `/data/job-harness.db`. Immutable Resume artifacts are stored below `/data/resume-artifacts/`; their SQLite metadata records SHA-256 and byte length, and every download re-verifies the stored bytes before serving them.

Use Settings → Data & backup before upgrades or risky changes. A logical JSON export is useful for audit/portability. The SQLite download protects database state, but once first-class Resume artifacts are enabled a disaster-recovery backup must include both the database and `/data/resume-artifacts/`. Oracle2 backup v6 is the planned cutover gate that verifies every DB-referenced artifact against its file SHA-256. See [Export and backup](../data/export-backup.md).

## Upgrade

Recommended flow:

```bash
# 1. Download/verify a backup first.
git pull --ff-only
docker compose --env-file deploy/self-host.env build --pull
docker compose --env-file deploy/self-host.env up -d
docker compose --env-file deploy/self-host.env ps
```

Database migrations run when Server opens the database. They are sequential and covered by migration tests. Keep the pre-upgrade SQLite backup until the new version has passed health and data-count checks.

## Stop

```bash
docker compose --env-file deploy/self-host.env down
```

`down` does not delete the bind-mounted data directory. Do not add `-v` expecting Job Harness data to be disposable; the source of truth is the host directory you configured.
