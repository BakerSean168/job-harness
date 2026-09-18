#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"

export COMPOSE_PROJECT_NAME=${JOB_HARNESS_SMOKE_PROJECT:-job-harness-deployment-smoke}
export JOB_HARNESS_IMAGE=${JOB_HARNESS_SMOKE_IMAGE:-job-harness:local}
export JOB_HARNESS_RENDERER_IMAGE=${JOB_HARNESS_SMOKE_RENDERER_IMAGE:-job-harness-renderer:local}
export JOB_HARNESS_AUTH_TOKEN=${JOB_HARNESS_SMOKE_TOKEN:-deployment-smoke-token}
export JOB_HARNESS_DATA_DIR=${JOB_HARNESS_SMOKE_DATA_DIR:-$(mktemp -d /tmp/job-harness-deployment-smoke.XXXXXX)}
export JOB_HARNESS_WEB_BIND=127.0.0.1
export JOB_HARNESS_WEB_PORT=${JOB_HARNESS_SMOKE_PORT:-3198}
export JOB_HARNESS_WEB_PASSWORD=
export JOB_HARNESS_WEB_SESSION_SECRET=
export JOB_HARNESS_WEB_COOKIE_SECURE=false

cleanup() {
  # Artifact directories are intentionally private to the container uid/group. Remove them from inside
  # the server before tearing Compose down so CI host users do not need membership in that group.
  docker compose exec -T server node -e "require('node:fs').rmSync('/data/resume-artifacts',{recursive:true,force:true})" >/dev/null 2>&1 || true
  docker compose down --remove-orphans >/dev/null 2>&1 || true
  if [[ "$JOB_HARNESS_DATA_DIR" == /tmp/job-harness-deployment-smoke.* ]]; then
    rm -rf "$JOB_HARNESS_DATA_DIR"
  fi
}
trap cleanup EXIT

mkdir -p "$JOB_HARNESS_DATA_DIR"
chmod 0777 "$JOB_HARNESS_DATA_DIR"

# A promoted image must be self-contained. Runtime package-manager startup may
# never depend on npm/network availability after the image has been built.
docker run --rm --network none "$JOB_HARNESS_IMAGE" pnpm --version >/dev/null
docker run --rm --network none "$JOB_HARNESS_RENDERER_IMAGE" pnpm --version >/dev/null

docker compose down --remove-orphans >/dev/null 2>&1 || true
docker compose up -d --no-build

wait_healthy() {
  local service=$1
  local i id status
  for i in $(seq 1 40); do
    id=$(docker compose ps -q "$service")
    status=$(docker inspect "$id" --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' 2>/dev/null || true)
    [[ "$status" == healthy ]] && return 0
    sleep 2
  done
  docker compose ps -a
  docker compose logs --no-color --tail=200 "$service"
  return 1
}

wait_healthy renderer
wait_healthy server
wait_healthy web

renderer_id=$(docker compose ps -q renderer)
server_id=$(docker compose ps -q server)
web_id=$(docker compose ps -q web)
[[ $(docker inspect "$renderer_id" --format '{{len .HostConfig.PortBindings}}') == 0 ]]
[[ $(docker inspect "$server_id" --format '{{len .HostConfig.PortBindings}}') == 0 ]]
[[ $(docker inspect "$web_id" --format '{{range $p, $bindings := .HostConfig.PortBindings}}{{range $bindings}}{{.HostIp}}:{{.HostPort}}{{end}}{{end}}') == "127.0.0.1:${JOB_HARNESS_WEB_PORT}" ]]

curl -fsS "http://127.0.0.1:${JOB_HARNESS_WEB_PORT}/" >/dev/null

docker compose exec -T server node - <<'NODE'
const base = 'http://127.0.0.1:3000';
const unauthenticated = await fetch(`${base}/api/v1/dashboard`);
const authenticated = await fetch(`${base}/api/v1/dashboard`, {
  headers: { authorization: `Bearer ${process.env.JOB_HARNESS_AUTH_TOKEN}` },
});
if (unauthenticated.status !== 401 || authenticated.status !== 200) process.exit(1);

const headers = {
  authorization: `Bearer ${process.env.JOB_HARNESS_AUTH_TOKEN}`,
  'content-type': 'application/json',
};
const saved = await fetch(`${base}/api/v1/saved-views`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    id: 'deployment-smoke-view',
    workspace: 'jobs',
    name: 'Deployment Smoke',
    definition: { state: 'shortlisted' },
  }),
});
if (!saved.ok) process.exit(1);
NODE

[[ -s "$JOB_HARNESS_DATA_DIR/job-harness.db" ]]

revision_id=$(docker compose exec -T server pnpm exec tsx scripts/seed-deployment-resume.ts /data/job-harness.db | tail -n 1 | tr -d '\r')
[[ "$revision_id" == resume-rev-* ]]
export JOB_HARNESS_SMOKE_REVISION_ID="$revision_id"

docker compose exec -T -e JOB_HARNESS_SMOKE_REVISION_ID="$revision_id" server node - <<'NODE'
const base = 'http://127.0.0.1:3000/api/v1';
const headers = {
  authorization: `Bearer ${process.env.JOB_HARNESS_AUTH_TOKEN}`,
  'content-type': 'application/json',
};
const materialized = await fetch(`${base}/resume/revisions/${encodeURIComponent(process.env.JOB_HARNESS_SMOKE_REVISION_ID)}/artifacts`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ kind: 'pdf' }),
});
const body = await materialized.json();
if (!materialized.ok || body.artifact?.kind !== 'pdf' || body.artifact?.byteSize < 5000) process.exit(1);
const downloaded = await fetch(`${base}/resume/artifacts/${encodeURIComponent(body.artifact.id)}/content`, {
  headers: { authorization: `Bearer ${process.env.JOB_HARNESS_AUTH_TOKEN}` },
});
const bytes = new Uint8Array(await downloaded.arrayBuffer());
if (!downloaded.ok || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') process.exit(1);
console.log(JSON.stringify({ revisionId: process.env.JOB_HARNESS_SMOKE_REVISION_ID, artifactId: body.artifact.id, byteSize: bytes.byteLength }));
NODE

# Do not traverse private Artifact directories from the host. The authenticated download above already
# proves the durable file can be read through the owning server runtime.

docker compose restart server >/dev/null
wait_healthy server

expected_schema_version=$(docker compose exec -T server pnpm exec tsx -e "import { SQLITE_SCHEMA_VERSION } from '@job-harness/persistence-sqlite'; console.log(SQLITE_SCHEMA_VERSION)" | tail -n 1 | tr -d '\r')
[[ "$expected_schema_version" =~ ^[0-9]+$ ]]

docker compose exec -T -e JOB_HARNESS_SMOKE_SCHEMA_VERSION="$expected_schema_version" server node - <<'NODE'
const base = 'http://127.0.0.1:3000';
const response = await fetch(`${base}/api/v1/saved-views?workspace=jobs`, {
  headers: { authorization: `Bearer ${process.env.JOB_HARNESS_AUTH_TOKEN}` },
});
const body = await response.json();
if (!response.ok || !body.items?.some((item) => item.id === 'deployment-smoke-view')) process.exit(1);

const { DatabaseSync } = await import('node:sqlite');
const db = new DatabaseSync('/data/job-harness.db');
const integrity = db.prepare('PRAGMA integrity_check').get();
const version = db.prepare('PRAGMA user_version').get();
const artifact = db.prepare("SELECT id FROM resume_artifacts WHERE kind='pdf' ORDER BY created_at DESC LIMIT 1").get();
db.close();
const expectedSchemaVersion = Number(process.env.JOB_HARNESS_SMOKE_SCHEMA_VERSION);
if (!Number.isInteger(expectedSchemaVersion) || integrity.integrity_check !== 'ok' || Number(version.user_version) !== expectedSchemaVersion) process.exit(1);
if (!artifact?.id) process.exit(1);
const downloaded = await fetch(`${base}/api/v1/resume/artifacts/${encodeURIComponent(artifact.id)}/content`, {
  headers: { authorization: `Bearer ${process.env.JOB_HARNESS_AUTH_TOKEN}` },
});
const bytes = new Uint8Array(await downloaded.arrayBuffer());
if (!downloaded.ok || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') process.exit(1);
NODE

echo 'deployment runtime smoke ok: private renderer/API, auth, persistence, restart'
