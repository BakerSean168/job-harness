#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"

export COMPOSE_PROJECT_NAME=${JOB_HARNESS_SMOKE_PROJECT:-job-harness-deployment-smoke}
export JOB_HARNESS_IMAGE=${JOB_HARNESS_SMOKE_IMAGE:-job-harness:local}
export JOB_HARNESS_AUTH_TOKEN=${JOB_HARNESS_SMOKE_TOKEN:-deployment-smoke-token}
export JOB_HARNESS_DATA_DIR=${JOB_HARNESS_SMOKE_DATA_DIR:-$(mktemp -d /tmp/job-harness-deployment-smoke.XXXXXX)}
export JOB_HARNESS_WEB_BIND=127.0.0.1
export JOB_HARNESS_WEB_PORT=${JOB_HARNESS_SMOKE_PORT:-3198}
export JOB_HARNESS_WEB_PASSWORD=
export JOB_HARNESS_WEB_SESSION_SECRET=
export JOB_HARNESS_WEB_COOKIE_SECURE=false

cleanup() {
  docker compose down --remove-orphans >/dev/null 2>&1 || true
  if [[ "$JOB_HARNESS_DATA_DIR" == /tmp/job-harness-deployment-smoke.* ]]; then
    rm -rf "$JOB_HARNESS_DATA_DIR"
  fi
}
trap cleanup EXIT

mkdir -p "$JOB_HARNESS_DATA_DIR"
chmod 0777 "$JOB_HARNESS_DATA_DIR"
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

wait_healthy server
wait_healthy web

server_id=$(docker compose ps -q server)
web_id=$(docker compose ps -q web)
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

docker compose restart server >/dev/null
wait_healthy server

docker compose exec -T server node - <<'NODE'
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
db.close();
if (integrity.integrity_check !== 'ok' || Number(version.user_version) !== 4) process.exit(1);
NODE

echo 'deployment runtime smoke ok: compose network, auth, persistence, restart'
