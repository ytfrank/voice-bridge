#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$PROJECT_DIR/.pids"
BFF_PID_FILE="$PID_DIR/bff.pid"
TUNNEL_PID_FILE="$PID_DIR/cloudflared.pid"

stop_pid_file() {
  local file="$1"
  local name="$2"
  if [ ! -f "$file" ]; then
    echo "ℹ️ $name not running (no pid file)"
    return
  fi

  local pid
  pid="$(cat "$file")"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
    echo "🛑 Stopped $name (PID: $pid)"
  else
    echo "ℹ️ $name already stopped (stale pid: $pid)"
  fi
  rm -f "$file"
}

stop_pid_file "$TUNNEL_PID_FILE" "Cloudflare tunnel"
stop_pid_file "$BFF_PID_FILE" "BFF"
