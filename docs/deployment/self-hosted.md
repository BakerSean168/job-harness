# Self-hosted deployment

The supported W406 deployment is Docker Compose with two containers from the same Job Harness image:

```text
Browser / Tailscale Serve / reverse proxy
                |
                v
        Web :3001 (host-published)
                |
       Compose private network
                |
                v
       REST/MCP Server :3000
                |
                v
       /data/job-harness.db
```

The REST/MCP container has **no host-published port**. The Web container is the only default host entry point and binds to `127.0.0.1:3001` unless explicitly changed.

## Prerequisites

- Docker Engine with Docker Compose v2;
- a writable persistent data directory;
- a strong API bearer token.

Create configuration:

```bash
cp deploy/self-host.env.example deploy/self-host.env
openssl rand -hex 32
openssl rand -base64 48
mkdir -p data
```

Put the generated API token into `JOB_HARNESS_AUTH_TOKEN`. If the data directory is not writable from the container, make it writable by uid/gid 1000 (the non-root `node` user used by the runtime image).

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
docker compose --env-file deploy/self-host.env logs -f server web
```

The Server health check calls `/healthz`; the Web health check follows the root route. Web waits for Server health before starting.

## Network/security defaults

- `server:3000` is only exposed to the Compose network; do not add a host `ports:` mapping for normal operation.
- Web defaults to `127.0.0.1`, suitable for local access or for a host-level Tailscale Serve/reverse proxy.
- `JOB_HARNESS_AUTH_TOKEN` is required by Compose because Server binds to `0.0.0.0` inside the container.
- The same bearer is injected into Web server-side runtime only; it is not a `NEXT_PUBLIC_*` value and is not sent to browser HTML.
- Containers run as the non-root `node` user and set `no-new-privileges`.

For a public or shared reverse-proxy endpoint:

1. enable `JOB_HARNESS_WEB_PASSWORD`;
2. set a random `JOB_HARNESS_WEB_SESSION_SECRET` of at least 32 characters;
3. terminate HTTPS at the proxy/Tailscale layer;
4. set `JOB_HARNESS_WEB_COOKIE_SECURE=true`;
5. only set `JOB_HARNESS_WEB_BIND=0.0.0.0` when the host firewall/private network exposure is intentional.

See [Self-hosted Web authentication](../security/self-hosted-web-auth.md).

## Persistence, export and backup

The configured host `JOB_HARNESS_DATA_DIR` is mounted at `/data`; the live database is `/data/job-harness.db`.

Use Settings → Data & backup before upgrades or risky changes. A logical JSON export is useful for audit/portability; the SQLite download is the full disaster-recovery backup including Saved Views. See [Export and backup](../data/export-backup.md).

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
