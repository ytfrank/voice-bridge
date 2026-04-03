#!/bin/bash
set -euo pipefail

PID_FILE="${VOICE_BRIDGE_BFF_PID_FILE:-/tmp/voice-bridge-bff.pid}"

is_running() {
  local pid="$1"
  ps -p "$pid" -o command= 2>/dev/null | grep -q "node server.js"
}

if [[ ! -f "$PID_FILE" ]]; then
  echo "VoiceBridge BFF not running (no pid file)"
  exit 0
fi

PID="$(cat "$PID_FILE")"
if is_running "$PID"; then
  kill "$PID"
  for _ in {1..20}; do
    if ! is_running "$PID"; then
      break
    fi
    sleep 0.5
  done
  if is_running "$PID"; then
    kill -9 "$PID" 2>/dev/null || true
  fi
  echo "VoiceBridge BFF stopped (pid=$PID)"
else
  echo "VoiceBridge BFF pid file was stale (pid=$PID)"
fi

rm -f "$PID_FILE"
