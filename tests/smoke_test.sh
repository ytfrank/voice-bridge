#!/bin/bash
# Voice Bridge 冒烟测试脚本
# 执行时间：约2分钟
# 用途：快速验证核心功能可用，不通过禁止上线

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
FIXTURES_DIR="$SCRIPT_DIR/fixtures"
SCREENSHOTS_DIR="$SCRIPT_DIR/screenshots/smoke_$(date +%Y%m%d_%H%M%S)"

# 配置
BFF_URL="${BFF_URL:-http://localhost:3002}"
TIMEOUT=30

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 创建截图目录
mkdir -p "$SCREENSHOTS_DIR"

echo "=========================================="
echo "  Voice Bridge 冒烟测试"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "  BFF: $BFF_URL"
echo "=========================================="
echo ""

# 记录测试结果
PASS_COUNT=0
FAIL_COUNT=0

pass() {
    echo -e "${GREEN}✅ $1${NC}"
    ((PASS_COUNT++))
}

fail() {
    echo -e "${RED}❌ $1${NC}"
    echo -e "${RED}原因: $2${NC}"
    ((FAIL_COUNT++))
}

# ============================================
# 测试1: BFF健康检查
# ============================================
echo "[1/4] BFF健康检查..."
HEALTH_RESPONSE=$(curl -s --max-time $TIMEOUT "$BFF_URL/health" 2>&1)
echo "$HEALTH_RESPONSE" | jq . > "$SCREENSHOTS_DIR/01_health.json" 2>/dev/null || echo "$HEALTH_RESPONSE" > "$SCREENSHOTS_DIR/01_health.txt"

if echo "$HEALTH_RESPONSE" | jq -e '.status == "ok"' > /dev/null 2>&1; then
    pass "BFF健康检查通过"
    echo "  Whisper: $(echo $HEALTH_RESPONSE | jq -r '.whisper // "unknown"')"
    echo "  Workers: $(echo $HEALTH_RESPONSE | jq -r '.whisperWorkers // "unknown"')"
else
    fail "BFF健康检查失败" "服务未响应或状态异常"
    echo "  响应: $HEALTH_RESPONSE"
fi
echo ""

# ============================================
# 测试2: ASR转写测试（短音频）
# ============================================
echo "[2/4] ASR转写测试..."

# 检查测试音频是否存在
TEST_AUDIO="$FIXTURES_DIR/test_short.wav"
if [ ! -f "$TEST_AUDIO" ]; then
    # 生成测试音频
    echo "  生成测试音频..."
    mkdir -p "$FIXTURES_DIR"
    say -o "$TEST_AUDIO" "Hello, how are you today?" 2>/dev/null || {
        # 如果say命令失败，使用备用方案
        echo -e "${YELLOW}  警告: 无法生成测试音频，跳过ASR测试${NC}"
        echo ""
        continue
    }
fi

ASR_RESPONSE=$(curl -s --max-time 60 -X POST "$BFF_URL/api/transcribe" \
    -F "audio=@$TEST_AUDIO" 2>&1)
echo "$ASR_RESPONSE" | jq . > "$SCREENSHOTS_DIR/02_asr.json" 2>/dev/null || echo "$ASR_RESPONSE" > "$SCREENSHOTS_DIR/02_asr.txt"

ASR_TEXT=$(echo "$ASR_RESPONSE" | jq -r '.text // .transcript // empty' 2>/dev/null)

if [ -n "$ASR_TEXT" ] && [ "$ASR_TEXT" != "null" ] && [ ${#ASR_TEXT} -gt 0 ]; then
    pass "ASR转写通过"
    echo "  识别结果: $ASR_TEXT"
    echo "  字数: ${#ASR_TEXT}"
else
    fail "ASR转写失败" "未返回识别文本"
    echo "  响应: $ASR_RESPONSE"
fi
echo ""

# ============================================
# 测试3: 翻译测试
# ============================================
echo "[3/4] 翻译测试..."

TRANSLATE_RESPONSE=$(curl -s --max-time $TIMEOUT -X POST "$BFF_URL/api/translate" \
    -H "Content-Type: application/json" \
    -d '{"text": "Hello, how are you today?"}' 2>&1)
echo "$TRANSLATE_RESPONSE" | jq . > "$SCREENSHOTS_DIR/03_translate.json" 2>/dev/null || echo "$TRANSLATE_RESPONSE" > "$SCREENSHOTS_DIR/03_translate.txt"

TRANSLATION=$(echo "$TRANSLATE_RESPONSE" | jq -r '.translation // .result // empty' 2>/dev/null)

if [ -n "$TRANSLATION" ] && [ "$TRANSLATION" != "null" ] && [ ${#TRANSLATION} -gt 0 ]; then
    pass "翻译通过"
    echo "  翻译结果: $TRANSLATION"
else
    fail "翻译失败" "未返回翻译结果"
    echo "  响应: $TRANSLATE_RESPONSE"
fi
echo ""

# ============================================
# 测试4: 错误检查（无500）
# ============================================
echo "[4/4] 错误检查..."

ERROR_COUNT=0
for file in "$SCREENSHOTS_DIR"/*.json "$SCREENSHOTS_DIR"/*.txt; do
    if [ -f "$file" ]; then
        if grep -q "500\|error\|Error\|ERROR" "$file" 2>/dev/null; then
            ((ERROR_COUNT++))
            echo -e "${YELLOW}  警告: $file 包含错误信息${NC}"
        fi
    fi
done

if [ $ERROR_COUNT -eq 0 ]; then
    pass "无HTTP 500错误"
else
    fail "存在错误" "发现 $ERROR_COUNT 个错误"
fi
echo ""

# ============================================
# 汇总
# ============================================
echo "=========================================="
echo "  冒烟测试结果"
echo "=========================================="
echo -e "  通过: ${GREEN}$PASS_COUNT${NC}"
echo -e "  失败: ${RED}$FAIL_COUNT${NC}"
echo "  截图: $SCREENSHOTS_DIR"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✅ 冒烟测试全部通过，可以继续测试${NC}"
    exit 0
else
    echo -e "${RED}❌ 冒烟测试失败，禁止上线${NC}"
    exit 1
fi
