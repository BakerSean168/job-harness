#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=/config/job-harness-bridge
if test -f "$ROOT/agent.pid"; then
  pid="$(cat "$ROOT/agent.pid")"
  case "$pid" in ''|*[!0-9]*) echo "Invalid agent PID" >&2; exit 1;; esac
  if test -r "/proc/$pid/cmdline" && tr '\0' ' ' < "/proc/$pid/cmdline" | grep -Fq "$ROOT/run.sh"; then
    kill -TERM "$pid"
  fi
fi
