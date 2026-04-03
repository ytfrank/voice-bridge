#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

PID_FILE="${VOICE_BRIDGE_BFF_PID_FILE:-/tmp/voice-bridge-bff.pid}"
OUT_FILE="${VOICE_BRIDGE_BFF_OUT_FILE:-/tmp/voice-bridge-bff.out}"
PYTHON_BIN="$( [ -x "venv/bin/python" ] && echo "venv/bin/python" || command -v python3 )"
NODE_BIN="$(command -v node)"

is_running() {
  local pid="$1"
  ps -p "$pid" -o command= 2>/dev/null | grep -q "node server.js"
}

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"
  if is_running "$PID"; then
    echo "VoiceBridge BFF already running (pid=$PID)"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

mkdir -p "$(dirname "$OUT_FILE")"
nohup env PATH="$(dirname "$NODE_BIN"):$PATH" VIRTUAL_ENV="$(pwd)/venv" PYTHON_BIN="$PYTHON_BIN" node server.js >>"$OUT_FILE" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"
sleep 1

if ! is_running "$PID"; then
  echo "VoiceBridge BFF failed to start. Check: $OUT_FILE"
  rm -f "$PID_FILE"
  exit 1
fi

echo "VoiceBridge BFF started (pid=$PID)"
echo "PID file: $PID_FILE"
echo "Log file: $OUT_FILE"
