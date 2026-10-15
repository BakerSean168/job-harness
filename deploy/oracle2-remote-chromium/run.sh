#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT=/config/job-harness-bridge
PROFILE="$ROOT/profile"
EXTENSION="$ROOT/extension"
mkdir -p "$PROFILE"
cd "$ROOT"

exec 9>"$ROOT/agent.lock"
if ! flock -n 9; then
  echo "Job Harness remote Chromium agent already started" >&2
  exit 1
fi
if ! test -f "$EXTENSION/manifest.json"; then
  echo "Browser Bridge extension missing" >&2
  exit 1
fi
relay_pid=''
browser_pid=''
clean_up() {
  trap - TERM INT EXIT
  if test -n "$browser_pid"; then kill -TERM "$browser_pid" 2>/dev/null || true; fi
  if test -n "$relay_pid"; then kill -TERM "$relay_pid" 2>/dev/null || true; fi
  if test -n "$browser_pid"; then wait "$browser_pid" 2>/dev/null || true; fi
  if test -n "$relay_pid"; then wait "$relay_pid" 2>/dev/null || true; fi
  rm -f "$ROOT/agent.pid"
}
trap clean_up TERM INT EXIT
echo "$$" > "$ROOT/agent.pid"

/usr/bin/python3 -u "$ROOT/tcp-relay.py" &
relay_pid=$!
for i in $(seq 1 25); do
  if curl -fsS --max-time 2 http://127.0.0.1:20901/healthz > /dev/null; then break; fi
  if ! kill -0 "$relay_pid" 2>/dev/null; then echo "Local TCP relay stopped" >&2; exit 1; fi
  sleep 1
done
curl -fsS --max-time 2 http://127.0.0.1:20901/healthz > /dev/null || {
  echo "Job Harness bridge upstream unavailable" >&2
  exit 1
}

/usr/lib/chromium/chromium \
  --disable-extensions-except="$EXTENSION" \
  --user-data-dir="$PROFILE" \
  --load-extension="$EXTENSION" \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9236 \
  --no-sandbox \
  --password-store=basic \
  --no-first-run \
  --no-default-browser-check \
  --disable-background-timer-throttling \
  --disable-backgrounding-occluded-windows \
  --disable-renderer-backgrounding \
  --enable-features=UseOzonePlatform \
  --ozone-platform=wayland \
  about:blank &
browser_pid=$!
wait "$browser_pid"
