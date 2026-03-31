#!/bin/bash
# VoiceBridge Dev Startup - BFF + Cloudflare Tunnel
# Usage: bash scripts/start-dev.sh
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "🔄 Stopping existing processes..."
pkill -f "node.*server.js" 2>/dev/null || true
pkill -f cloudflared 2>/dev/null || true
sleep 1

# Source .env
set -a
source .env 2>/dev/null || true
set +a

BFF_PORT="${BFF_PORT:-3001}"

echo "🚀 Starting BFF on port $BFF_PORT..."
cd backend
/opt/homebrew/opt/node@24/bin/node server.js &
BFF_PID=$!
cd "$PROJECT_DIR"
sleep 2

# Verify BFF is running
if ! kill -0 $BFF_PID 2>/dev/null; then
  echo "❌ BFF failed to start"
  exit 1
fi
echo "✅ BFF started (PID: $BFF_PID, port: $BFF_PORT)"

echo "🌐 Starting Cloudflare Tunnel..."
cloudflared tunnel --url "http://localhost:$BFF_PORT" --no-tls-verify 2>&1 | tee /tmp/cloudflared.log &
TUNNEL_PID=$!
sleep 5

# Extract tunnel URL
TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cloudflared.log | head -1)
if [ -n "$TUNNEL_URL" ]; then
  # Update .env with new tunnel URL
  if grep -q "EXPO_PUBLIC_BFF_URL=" .env; then
    sed -i '' "s|EXPO_PUBLIC_BFF_URL=.*|EXPO_PUBLIC_BFF_URL=$TUNNEL_URL|" .env
  else
    echo "EXPO_PUBLIC_BFF_URL=$TUNNEL_URL" >> .env
  fi
  echo "✅ Tunnel: $TUNNEL_URL"
  echo "✅ .env updated with new tunnel URL"
else
  echo "❌ Failed to get tunnel URL, check /tmp/cloudflared.log"
  echo "   You may need to manually update EXPO_PUBLIC_BFF_URL in .env"
fi

EXPO_GO_URL=""
for EXPO_PORT in 8081 8082 19000 19006; do
  HOST_URI=$(curl -s --max-time 1 "http://127.0.0.1:${EXPO_PORT}/?platform=ios" | python3 -c 'import sys, json; 
try:
 data=json.load(sys.stdin)
 print((data.get("extra",{}).get("expoClient",{}).get("hostUri") or data.get("expoGo",{}).get("debuggerHost") or "").strip())
except Exception:
 print("")' 2>/dev/null)
  if [ -n "$HOST_URI" ]; then
    EXPO_GO_URL="exp://$HOST_URI"
    break
  fi
done

if [ -n "$EXPO_GO_URL" ]; then
  echo "✅ Expo Go URL: $EXPO_GO_URL"
else
  echo "⚠️ Expo Go URL not detected (Expo may not be running yet)"
fi

echo ""
echo "📋 Summary:"
echo "   BFF PID: $BFF_PID (port $BFF_PORT)"
echo "   Tunnel PID: $TUNNEL_PID"
echo "   Tunnel URL: ${TUNNEL_URL:-UNKNOWN}"
echo "   Expo Go URL: ${EXPO_GO_URL:-UNKNOWN}"
echo ""
echo "To stop: kill $BFF_PID $TUNNEL_PID"
