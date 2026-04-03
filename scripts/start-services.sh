#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
PID_DIR="$PROJECT_DIR/.pids"
BFF_LOG="$LOG_DIR/bff-dev.log"
TUNNEL_LOG="$LOG_DIR/cloudflared-dev.log"
BFF_PID_FILE="$PID_DIR/bff.pid"
TUNNEL_PID_FILE="$PID_DIR/cloudflared.pid"

mkdir -p "$LOG_DIR" "$PID_DIR"
cd "$PROJECT_DIR"

set -a
source .env 2>/dev/null || true
set +a

BFF_PORT="${BFF_PORT:-3001}"

is_running() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local file="$1"
  [ -f "$file" ] && cat "$file" || true
}

BFF_PID="$(read_pid "$BFF_PID_FILE")"
if is_running "$BFF_PID"; then
  echo "✅ BFF already running (PID: $BFF_PID)"
else
  echo "🚀 Starting BFF on port $BFF_PORT ..."
  nohup /opt/homebrew/opt/node@24/bin/node backend/server.js >> "$BFF_LOG" 2>&1 &
  BFF_PID=$!
  echo "$BFF_PID" > "$BFF_PID_FILE"
  sleep 2
  if ! is_running "$BFF_PID"; then
    echo "❌ BFF failed to start. Check $BFF_LOG"
    exit 1
  fi
  echo "✅ BFF started (PID: $BFF_PID)"
fi

TUNNEL_PID="$(read_pid "$TUNNEL_PID_FILE")"
if is_running "$TUNNEL_PID"; then
  echo "✅ Cloudflare tunnel already running (PID: $TUNNEL_PID)"
else
  echo "🌐 Starting Cloudflare tunnel ..."
  nohup cloudflared tunnel --url "http://localhost:$BFF_PORT" --no-tls-verify >> "$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID=$!
  echo "$TUNNEL_PID" > "$TUNNEL_PID_FILE"
  sleep 5
  if ! is_running "$TUNNEL_PID"; then
    echo "❌ Tunnel failed to start. Check $TUNNEL_LOG"
    exit 1
  fi
  echo "✅ Tunnel started (PID: $TUNNEL_PID)"
fi

TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | tail -1 || true)
if [ -n "$TUNNEL_URL" ]; then
  if grep -q "EXPO_PUBLIC_BFF_URL=" .env; then
    sed -i '' "s|EXPO_PUBLIC_BFF_URL=.*|EXPO_PUBLIC_BFF_URL=$TUNNEL_URL|" .env
  else
    echo "EXPO_PUBLIC_BFF_URL=$TUNNEL_URL" >> .env
  fi
  echo "✅ Tunnel URL: $TUNNEL_URL"
else
  echo "⚠️ Tunnel URL not detected yet. Check $TUNNEL_LOG"
fi

echo "📄 Logs:"
echo "   BFF:    $BFF_LOG"
echo "   Tunnel: $TUNNEL_LOG"
echo "👉 Stop with: npm run services:stop"
