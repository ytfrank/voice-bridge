#!/bin/bash
set -euo pipefail

PID_FILE="${VOICE_BRIDGE_BFF_PID_FILE:-/tmp/voice-bridge-bff.pid}"

is_running() {
  local pid="$1"
  ps -p "$pid" -o command= 2>/dev/null | grep -q "node server.js"
}

if [[ ! -f "$PID_FILE" ]]; then
  echo "VoiceBridge BFF status: stopped"
  exit 0
fi

PID="$(cat "$PID_FILE")"
if is_running "$PID"; then
  echo "VoiceBridge BFF status: running (pid=$PID)"
else
  echo "VoiceBridge BFF status: stale pid file (pid=$PID)"
  exit 1
fi
