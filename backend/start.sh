#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

PID_FILE="${VOICE_BRIDGE_BFF_PID_FILE:-/tmp/voice-bridge-bff.pid}"
OUT_FILE="${VOICE_BRIDGE_BFF_OUT_FILE:-/tmp/voice-bridge-bff.out}"
PORT="${BFF_PORT:-3001}"
PYTHON_BIN="$( [ -x "venv/bin/python" ] && echo "venv/bin/python" || command -v python3 )"
NODE_BIN="$(command -v node)"
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

ensure_port_free() {
  local listener_pid
  listener_pid="$(find_listener_pid || true)"
  if [[ -n "$listener_pid" ]]; then
    echo "⚠️ Port $PORT already occupied by pid=$listener_pid, stopping old listener..."
    kill "$listener_pid" 2>/dev/null || true
    sleep 2
    if kill -0 "$listener_pid" 2>/dev/null; then
      kill -9 "$listener_pid" 2>/dev/null || true
      sleep 1
    fi
  fi

  listener_pid="$(find_listener_pid || true)"
  if [[ -n "$listener_pid" ]]; then
    echo "VoiceBridge BFF failed to free port $PORT (pid=$listener_pid)"
    exit 1
  fi
}

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"
  if is_running "$PID"; then
    if [[ "$(find_listener_pid || true)" == "$PID" ]]; then
      echo "VoiceBridge BFF already running (pid=$PID, port=$PORT)"
      exit 0
    fi
  fi
  rm -f "$PID_FILE"
fi

ensure_port_free
mkdir -p "$(dirname "$OUT_FILE")"
nohup env PATH="$(dirname "$NODE_BIN"):$PATH" VIRTUAL_ENV="$(pwd)/venv" PYTHON_BIN="$PYTHON_BIN" VOICE_BRIDGE_BUILD_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)" node server.js >>"$OUT_FILE" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"
sleep 2

if ! is_running "$PID"; then
  echo "VoiceBridge BFF failed to start. Check: $OUT_FILE"
  rm -f "$PID_FILE"
  exit 1
fi

LISTENER_PID="$(find_listener_pid || true)"
if [[ "$LISTENER_PID" != "$PID" ]]; then
  echo "VoiceBridge BFF start mismatch: pid=$PID but port $PORT listener is ${LISTENER_PID:-none}. Check: $OUT_FILE"
  rm -f "$PID_FILE"
  exit 1
fi

echo "VoiceBridge BFF started (pid=$PID, port=$PORT)"
echo "PID file: $PID_FILE"
echo "Log file: $OUT_FILE"
