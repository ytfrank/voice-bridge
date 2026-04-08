#!/bin/bash
# batch_transcribe_test.sh — Automated audio file testing via BFF debug API
# Usage: ./batch_transcribe_test.sh [audio_dir] [bff_url]
# Example: ./batch_transcribe_test.sh tests/fixtures/audio http://localhost:3001

set -euo pipefail

AUDIO_DIR="${1:-tests/fixtures/audio}"
BFF_URL="${2:-http://localhost:3001}"
REPORT_FILE="tests/reports/batch_transcribe_$(date +%Y%m%d_%H%M%S).json"

mkdir -p "$(dirname "$REPORT_FILE")"

echo "=== Batch Transcribe Test ==="
echo "Audio dir: $AUDIO_DIR"
echo "BFF URL:   $BFF_URL"
echo "Report:    $REPORT_FILE"
echo ""

# Check BFF health
if ! curl -sf "${BFF_URL}/health" > /dev/null 2>&1; then
  echo "❌ BFF not reachable at ${BFF_URL}/health"
  exit 1
fi
echo "✅ BFF healthy"
echo ""

# Supported extensions
SUPPORTED="mp3 wav m4a m4b ogg flac wma"

results=()
total=0
passed=0
failed=0

for ext in $SUPPORTED; do
  for file in "$AUDIO_DIR"/*."${ext}" 2>/dev/null; do
    [ -f "$file" ] || continue
    total=$((total + 1))
    
    filename=$(basename "$file")
    filesize=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "?")
    
    echo "🔄 Processing: $filename ($(numfmt --to=iec $filesize 2>/dev/null || echo ${filesize}B))"
    
    start_time=$(date +%s%3N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000))")
    
    response=$(curl -sf -X POST "${BFF_URL}/api/debug/transcribe-file" \
      -F "audio=@${file}" \
      -H "Accept: application/json" \
      --max-time 300 \
      2>&1) || {
      echo "  ❌ Request failed"
      results+=("{\"file\":\"${filename}\",\"error\":\"request_failed\"}")
      failed=$((failed + 1))
      echo ""
      continue
    }
    
    end_time=$(date +%s%3N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000))")
    wall_ms=$((end_time - start_time))
    
    # Parse response
    success=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success', False))" 2>/dev/null || echo "False")
    total_ms=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('totalMs', 0))" 2>/dev/null || echo "$wall_ms")
    whisper_ms=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('whisperMs', 0))" 2>/dev/null || echo "0")
    translate_ms=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('translateMs', 0))" 2>/dev/null || echo "0")
    text=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); t=d.get('transcribedText',''); print(t[:80])" 2>/dev/null || echo "")
    translation=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); t=d.get('translation',''); print(t[:60])" 2>/dev/null || echo "")
    
    if [ "$success" = "True" ]; then
      passed=$((passed + 1))
      echo "  ✅ total: ${total_ms}ms | whisper: ${whisper_ms}ms | translate: ${translate_ms}ms"
      echo "     EN: ${text}"
      echo "     ZH: ${translation}"
    else
      failed=$((failed + 1))
      reason=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('reason','unknown'))" 2>/dev/null || echo "unknown")
      echo "  ⚠️ Skipped/Failed: ${reason} (${total_ms}ms)"
    fi
    
    # Save raw result
    results+=("$response")
    echo ""
  done
done

# Generate report
echo "[" > "$REPORT_FILE"
for i in "${!results[@]}"; do
  echo "${results[$i]}" >> "$REPORT_FILE"
  if [ "$i" -lt "$((${#results[@]} - 1))" ]; then
    echo "," >> "$REPORT_FILE"
  fi
done
echo "]" >> "$REPORT_FILE"

echo "=== Summary ==="
echo "Total:  $total"
echo "Passed: $passed"
echo "Failed: $failed"
echo "Report: $REPORT_FILE"
