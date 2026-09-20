#!/usr/bin/env bash
set -euo pipefail

RUNTIME_BASE_URL="${JOB_HARNESS_RECRUITMENT_RUNTIME_BASE_URL:-https://oracle.taile92a8e.ts.net:20901/runtime/recruitment-browser/v1}"
ROOT="${JOB_HARNESS_GET_JOBS_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/job-harness/get-jobs-runtime}"
RUNTIME_ID="vvvsrx-get-jobs"
MANIFEST_URL="${RUNTIME_BASE_URL%/}/manifest.json"
mkdir -p "$ROOT/managers"

temp_manifest="$ROOT/bootstrap-manifest.json.tmp"
curl -fsSL --connect-timeout 10 --max-time 45 "$MANIFEST_URL" -o "$temp_manifest"
readarray -t manager_meta < <(python3 - "$temp_manifest" "$RUNTIME_ID" <<'PY'
import json, sys
path, runtime_id = sys.argv[1:]
with open(path, encoding='utf-8') as f:
    data=json.load(f)
r=next((x for x in data.get('externalRuntimes', []) if x.get('id') == runtime_id), None)
if not r:
    raise SystemExit(f'missing external runtime {runtime_id}')
m=r['manager']
print(m['id'])
print(m['sha256'])
PY
)
mv -f "$temp_manifest" "$ROOT/bootstrap-manifest.json"
manager_id="${manager_meta[0]}"
manager_sha="${manager_meta[1]}"
manager="$ROOT/managers/$manager_sha.sh"
if [[ ! -f "$manager" ]]; then
  curl -fsSL --connect-timeout 10 --max-time 45 "${RUNTIME_BASE_URL%/}/files/$manager_id" -o "$manager.tmp"
  actual="$(sha256sum "$manager.tmp" | awk '{print $1}')"
  if [[ "$actual" != "$manager_sha" ]]; then
    rm -f "$manager.tmp"
    echo "manager hash mismatch: $actual != $manager_sha" >&2
    exit 1
  fi
  mv -f "$manager.tmp" "$manager"
  chmod +x "$manager"
fi
exec "$manager" "$@"
