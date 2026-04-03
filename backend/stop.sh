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

stop_pid() {
  local pid="$1"
  if [[ -z "$pid" ]]; then
    return
  fi
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    for _ in {1..20}; do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 0.5
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
}

STOPPED_PIDS=()

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"
  if is_running "$PID"; then
    stop_pid "$PID"
    STOPPED_PIDS+=("$PID")
  fi
  rm -f "$PID_FILE"
fi

LISTENER_PID="$(find_listener_pid || true)"
if [[ -n "$LISTENER_PID" ]]; then
  stop_pid "$LISTENER_PID"
  STOPPED_PIDS+=("$LISTENER_PID")
fi

if [[ ${#STOPPED_PIDS[@]} -eq 0 ]]; then
  echo "VoiceBridge BFF not running on port $PORT"
else
  echo "VoiceBridge BFF stopped on port $PORT (pids: ${STOPPED_PIDS[*]})"
fi
