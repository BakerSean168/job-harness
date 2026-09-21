#!/usr/bin/env bash
set -euo pipefail

COMMAND="${1:-status}"
RUNTIME_BASE_URL="${JOB_HARNESS_RECRUITMENT_RUNTIME_BASE_URL:-https://oracle.taile92a8e.ts.net:20901/runtime/recruitment-browser/v1}"
ROOT="${JOB_HARNESS_GET_JOBS_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/job-harness/get-jobs-runtime}"
PORT="${JOB_HARNESS_GET_JOBS_PORT:-18851}"
RUNTIME_ID="vvvsrx-get-jobs"
MANIFEST_URL="${RUNTIME_BASE_URL%/}/manifest.json"
PID_FILE="$ROOT/runtime.pid"
LOG_FILE="$ROOT/runtime.log"
DATA_ROOT="$ROOT/data"
MANIFEST_CACHE="$ROOT/runtime-channel-manifest.json"

mkdir -p "$ROOT" "$DATA_ROOT" "$ROOT/runtimes" "$ROOT/venvs" "$ROOT/patches"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing required command: $1" >&2; exit 1; }
}

need curl
need git
need python3
need sha256sum

refresh_manifest() {
  local temp="$MANIFEST_CACHE.tmp"
  curl -fsSL --connect-timeout 10 --max-time 45 "$MANIFEST_URL" -o "$temp"
  python3 - "$temp" "$RUNTIME_ID" <<'PY'
import json, sys
p, runtime_id = sys.argv[1:]
with open(p, encoding='utf-8') as f:
    data=json.load(f)
runtimes=data.get('externalRuntimes') or []
match=next((r for r in runtimes if r.get('id') == runtime_id), None)
if not match:
    raise SystemExit(f'external runtime {runtime_id!r} missing from channel manifest')
if match.get('mode') != 'collect-only':
    raise SystemExit('external runtime channel is not collect-only')
PY
  mv -f "$temp" "$MANIFEST_CACHE"
}

manifest_value() {
  local key="$1"
  python3 - "$MANIFEST_CACHE" "$RUNTIME_ID" "$key" <<'PY'
import json, sys
p, runtime_id, key = sys.argv[1:]
with open(p, encoding='utf-8') as f:
    data=json.load(f)
r=next(x for x in data['externalRuntimes'] if x['id']==runtime_id)
value=r[key]
if isinstance(value, (dict,list)):
    print(json.dumps(value, separators=(',', ':')))
else:
    print(value)
PY
}

overlay_rows() {
  python3 - "$MANIFEST_CACHE" "$RUNTIME_ID" <<'PY'
import json, sys
p, runtime_id = sys.argv[1:]
with open(p, encoding='utf-8') as f:
    data=json.load(f)
r=next(x for x in data['externalRuntimes'] if x['id']==runtime_id)
for item in r.get('overlays', []):
    print(f"{item['id']}\t{item['sha256']}")
PY
}

runtime_dir() {
  local version
  version="$(manifest_value version)"
  printf '%s\n' "$ROOT/runtimes/$version"
}

venv_dir() {
  local version
  version="$(manifest_value version)"
  printf '%s\n' "$ROOT/venvs/$version"
}

sync_source() {
  refresh_manifest
  local version repository commit target stage
  version="$(manifest_value version)"
  repository="$(manifest_value repository)"
  commit="$(manifest_value commit)"
  target="$ROOT/runtimes/$version"
  if [[ -f "$target/.job-harness-ready" ]]; then
    ln -sfn "$target" "$ROOT/current"
    return 0
  fi

  stage="$target.staging"
  rm -rf "$stage"
  git clone -q --filter=blob:none --no-checkout "$repository" "$stage"
  git -C "$stage" fetch -q --depth=1 origin "$commit"
  git -C "$stage" checkout -q --detach "$commit"

  while IFS=$'\t' read -r asset_id expected_hash; do
    [[ -n "$asset_id" ]] || continue
    local patch_name patch_file actual_hash
    patch_name="$(basename "$asset_id")"
    patch_file="$ROOT/patches/$version-$patch_name"
    curl -fsSL --connect-timeout 10 --max-time 45 "${RUNTIME_BASE_URL%/}/files/$asset_id" -o "$patch_file.tmp"
    actual_hash="$(sha256sum "$patch_file.tmp" | awk '{print $1}')"
    if [[ "$actual_hash" != "$expected_hash" ]]; then
      rm -f "$patch_file.tmp"
      echo "overlay hash mismatch for $asset_id" >&2
      exit 1
    fi
    mv -f "$patch_file.tmp" "$patch_file"
    git -C "$stage" apply --check "$patch_file"
    git -C "$stage" apply "$patch_file"
  done < <(overlay_rows)

  grep -q 'JOB_HARNESS_GET_JOBS_COLLECT_ONLY' "$stage/app/main.py"
  grep -q '_login_tasks: dict\[str, asyncio.Task\]' "$stage/app/routers/jobs.py"
  grep -q 'JOB_HARNESS_GET_JOBS_COLLECT_ONLY' "$stage/app/worker/zhilian_bot.py"
  grep -q 'div.job-card' "$stage/app/worker/zhilian_locators.py"
  grep -q 'JOB_LINK' "$stage/app/worker/zhilian_locators.py"
  grep -q 'card.locator(JOB_LINK).first' "$stage/app/worker/zhilian_bot.py"
  if grep -q 'job-company-info__view-all' "$stage/app/worker/zhilian_bot.py"; then
    echo 'zhilian identity extraction still depends on the global detail panel' >&2
    exit 1
  fi
  grep -q 'JOB_HARNESS_GET_JOBS_COLLECT_ONLY' "$stage/app/worker/liepin_bot.py"
  grep -q 'JOB_HARNESS_GET_JOBS_COLLECT_ONLY' "$stage/app/worker/job51_bot.py"
  python3 -m py_compile "$stage/app/main.py" "$stage/app/routers/jobs.py" "$stage/app/schemas.py" "$stage/app/worker/zhilian_bot.py" "$stage/app/worker/zhilian_locators.py" "$stage/app/worker/liepin_bot.py" "$stage/app/worker/job51_bot.py"

  printf '%s\n' "$commit" > "$stage/.job-harness-ready"
  mv "$stage" "$target"
  ln -sfn "$target" "$ROOT/current"
}

provision() {
  sync_source
  local target venv stamp expected_stamp
  target="$(runtime_dir)"
  venv="$(venv_dir)"
  expected_stamp="$(sha256sum "$target/pyproject.toml" | awk '{print $1}')"
  stamp="$venv/.job-harness-deps"
  if [[ -x "$venv/bin/python" && -f "$stamp" && "$(cat "$stamp")" == "$expected_stamp" ]]; then
    return 0
  fi

  rm -rf "$venv"
  if command -v uv >/dev/null 2>&1; then
    uv venv "$venv" --python python3
    uv pip install --python "$venv/bin/python" -e "$target"
  else
    python3 -m venv "$venv"
    "$venv/bin/python" -m pip install --upgrade pip
    "$venv/bin/python" -m pip install -e "$target"
  fi
  "$venv/bin/python" -m playwright install chromium
  printf '%s\n' "$expected_stamp" > "$stamp"
}

is_running() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

start_runtime() {
  provision
  if is_running; then
    echo "get_jobs runtime already running: pid=$(cat "$PID_FILE")"
    return 0
  fi
  rm -f "$PID_FILE"
  local target venv db_url
  target="$(runtime_dir)"
  venv="$(venv_dir)"
  db_url="sqlite+aiosqlite:///$DATA_ROOT/getjobs.db"
  (
    cd "$target"
    export JOB_HARNESS_GET_JOBS_COLLECT_ONLY=1
    export DATABASE_URL="$db_url"
    export APP_HOST=127.0.0.1
    export APP_PORT="$PORT"
    nohup "$venv/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port "$PORT" >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
  )

  for _ in $(seq 1 60); do
    if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/api/job-harness-runtime" | python3 -c 'import json,sys; d=json.load(sys.stdin); raise SystemExit(0 if d.get("collectOnly") is True else 1)' 2>/dev/null; then
      echo "get_jobs collect-only runtime ready: http://127.0.0.1:$PORT"
      return 0
    fi
    sleep 1
  done
  echo "get_jobs runtime failed health check; see $LOG_FILE" >&2
  return 1
}

stop_runtime() {
  if ! is_running; then
    rm -f "$PID_FILE"
    echo 'get_jobs runtime is not running'
    return 0
  fi
  local pid
  pid="$(cat "$PID_FILE")"
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.25
  done
  kill -9 "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo 'get_jobs runtime stopped'
}

status_runtime() {
  refresh_manifest
  local version state='stopped' marker='unreachable'
  version="$(manifest_value version)"
  if is_running; then state="running"; fi
  if response="$(curl -fsS --max-time 3 "http://127.0.0.1:$PORT/api/job-harness-runtime" 2>/dev/null)"; then marker="$response"; fi
  printf 'runtime=%s\nversion=%s\nstate=%s\nport=%s\nmarker=%s\n' "$RUNTIME_ID" "$version" "$state" "$PORT" "$marker"
}

case "$COMMAND" in
  sync) sync_source ;;
  provision) provision ;;
  start) start_runtime ;;
  stop) stop_runtime ;;
  restart) stop_runtime; start_runtime ;;
  status) status_runtime ;;
  *) echo "usage: $0 {sync|provision|start|stop|restart|status}" >&2; exit 2 ;;
esac
