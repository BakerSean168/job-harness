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

Neither REST/MCP nor the Resume renderer publishes a host port. The Web container is the only default host entry point and binds to `127.0.0.1:3001` unless explicitly changed. Server waits for renderer health; Web waits for Server health.

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

Put the generated API token into `JOB_HARNESS_AUTH_TOKEN`. If the data directory is not writable from the container, make it writable by uid 1000 (the non-root `node` runtime user). For host-operated backup, use a shared operator group and setgid on the durable data directory; Resume artifact directories use setgid/group-readable permissions so backup tooling can traverse them without making files world-readable.

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

## Network/security defaults

- `renderer:3002` and `server:3000` are only exposed to the Compose network; do not add host `ports:` mappings for normal operation.
- Renderer receives only self-contained Resume HTML, disables page JavaScript, blocks network requests, runs read-only except `/tmp`, and requires an internal bearer for `/render/pdf`.
- Web defaults to `127.0.0.1`, suitable for local access or for a host-level Tailscale Serve/reverse proxy.
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
