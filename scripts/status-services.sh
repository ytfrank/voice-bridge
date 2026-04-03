#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$PROJECT_DIR/.pids"
BFF_PID_FILE="$PID_DIR/bff.pid"
TUNNEL_PID_FILE="$PID_DIR/cloudflared.pid"

print_status() {
  local file="$1"
  local name="$2"
  if [ ! -f "$file" ]; then
    echo "⚪ $name: stopped"
    return
  fi

  local pid
  pid="$(cat "$file")"
  if kill -0 "$pid" 2>/dev/null; then
    echo "🟢 $name: running (PID: $pid)"
  else
    echo "🔴 $name: stale pid file ($pid)"
  fi
}

print_status "$BFF_PID_FILE" "BFF"
print_status "$TUNNEL_PID_FILE" "Cloudflare tunnel"
