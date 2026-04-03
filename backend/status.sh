#!/bin/bash
set -euo pipefail

PID_FILE="${VOICE_BRIDGE_BFF_PID_FILE:-/tmp/voice-bridge-bff.pid}"
PORT="${BFF_PORT:-3001}"
LSOF_BIN="${LSOF_BIN:-/usr/sbin/lsof}"

is_running() {
  local pid="$1"
  ps -p "$pid" -o command= 2>/dev/null | grep -q "node .*server.js"
}

find_listener_pid() {
  if [ -x "$LSOF_BIN" ]; then
    "$LSOF_BIN" -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1
  fi
}

PID_FILE_PID=""
if [[ -f "$PID_FILE" ]]; then
  PID_FILE_PID="$(cat "$PID_FILE")"
fi
LISTENER_PID="$(find_listener_pid || true)"

if [[ -n "$LISTENER_PID" ]]; then
  if [[ -n "$PID_FILE_PID" && "$PID_FILE_PID" == "$LISTENER_PID" && $(is_running "$LISTENER_PID"; echo $?) -eq 0 ]]; then
    echo "VoiceBridge BFF status: running (pid=$LISTENER_PID, port=$PORT, pid-file=ok)"
  else
    echo "VoiceBridge BFF status: running (pid=$LISTENER_PID, port=$PORT, pid-file=mismatch)"
  fi
  exit 0
fi

if [[ -n "$PID_FILE_PID" ]]; then
  echo "VoiceBridge BFF status: stopped (stale pid file: $PID_FILE_PID)"
  exit 1
fi

echo "VoiceBridge BFF status: stopped"
