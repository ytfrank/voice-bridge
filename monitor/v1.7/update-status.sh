#!/bin/bash
# update-status.sh — 安全更新 status.json
# 用法: update-status.sh <status.json路径> '<json patch>'
# 示例: update-status.sh monitor/v1.7/status.json '{"runtime":{"latest_commit":"abc1234"}}'

set -euo pipefail

FILE="${1:?用法: update-status.sh <status.json路径> '<json patch>'}"
PATCH="${2:?需要提供 json patch 参数}"

# 检查文件存在
if [ ! -f "$FILE" ]; then
    echo "❌ 文件不存在: $FILE"
    exit 1
fi

# 检查文件非空
if [ ! -s "$FILE" ]; then
    echo "❌ 文件为空: $FILE（可能已损坏，请检查）"
    exit 1
fi

# 验证 patch 是合法 JSON
if ! echo "$PATCH" | python3 -c "import json,sys; json.loads(sys.stdin.read())" 2>/dev/null; then
    echo "❌ patch 不是合法 JSON: $PATCH"
    exit 1
fi

# 备份
cp "$FILE" "${FILE}.bak"
echo "📦 已备份到 ${FILE}.bak"

# 读取 + deep merge + 写入 + 校验
python3 << PYEOF
import json, sys

file_path = "$FILE"
patch_str = '''$PATCH'''

try:
    patch = json.loads(patch_str)
except json.JSONDecodeError as e:
    print(f"❌ patch JSON 解析失败: {e}")
    sys.exit(1)

try:
    with open(file_path) as f:
        content = f.read()
        if not content.strip():
            print(f"❌ 文件为空: {file_path}")
            sys.exit(1)
        data = json.loads(content)
except json.JSONDecodeError as e:
    print(f"❌ 原文件 JSON 解析失败: {e}")
    sys.exit(1)
except Exception as e:
    print(f"❌ 读取失败: {e}")
    sys.exit(1)

def deep_merge(base, override):
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            deep_merge(base[k], v)
        else:
            base[k] = v

deep_merge(data, patch)

with open(file_path, 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write('\n')

# 写入后重新读取校验
with open(file_path) as f:
    verified = json.load(f)

# 打印关键确认
print(f"✅ valid — 写入成功")
# 打印 patch 涉及的顶层 key 的值
for k in patch:
    if k in verified:
        val = verified[k]
        if isinstance(val, dict):
            # 打印 patch 中修改的子 key
            for sk in patch[k]:
                if sk in val:
                    print(f"   {k}.{sk} = {json.dumps(val[sk], ensure_ascii=False)[:100]}")
        else:
            print(f"   {k} = {json.dumps(val, ensure_ascii=False)[:100]}")

PYEOF

if [ $? -ne 0 ]; then
    echo "⚠️  写入失败，正在从备份恢复..."
    cp "${FILE}.bak" "$FILE"
    echo "已恢复备份"
    exit 1
fi
