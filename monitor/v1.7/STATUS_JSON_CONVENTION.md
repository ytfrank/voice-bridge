# status.json 最小规范

**生效日期**: 2026-04-07
**适用范围**: 所有 monitor/<project>/status.json

---

## 1. 职责边界

| 角色 | 可写字段 | 禁写字段 |
|------|---------|---------|
| Peter / Guard / Atlas | `runtime.*` | `workflow.*`, `gate.*`, `official.*` |
| 小叮当 (Doraemon) | `workflow.*`, `gate.*`, `official.*` | — |

**原则**: 各管各的层，不越权修改。

## 2. 更新方式

- **必须用 `update-status.sh` 脚本**，禁止用 edit 工具直接改 JSON
- 脚本自动做：备份 → 读取 → merge → 写入 → 校验
- 用法：`update-status.sh <status.json路径> '<json patch>'`

```bash
# 示例：更新 commit 和时间戳
update-status.sh monitor/v1.7/status.json '{
  "runtime": {
    "latest_commit": "abc1234",
    "last_runtime_update_at": "2026-04-07T20:00:00+08:00"
  }
}'
```

## 3. 改后必验

- 脚本内置校验，输出 `✅ valid` 或 `❌ invalid`
- 如果看到 `❌ invalid`，**立即停止**，从 `.bak` 恢复
- 手动检查时：`python3 -c "import json; c=json.load(open('status.json')); print(c['runtime']['latest_commit'])"`

## 4. 改前必读

- 更新前先确认当前值，不允许基于记忆中的旧内容修改
- 可以先 `cat status.json | python3 -m json.tool` 查看当前状态

## 5. edit 失败处理

- 如果 edit 工具修改 status.json 失败（匹配不到、文件被清空等）：
  1. **立即检查文件内容**：`wc -c status.json`
  2. 如果文件为空或损坏：`cp status.json.bak status.json` 恢复
  3. 如果无备份：从 git 历史或重建（最后手段）
  4. **不得假设 edit 成功**

## 6. 备份策略

- 每次更新前自动备份到 `status.json.bak`
- `.bak` 保留最近一次，被覆盖也无所谓
- 建议把 status.json 加入 git 跟踪（`git add -f`），增加一层恢复能力

---

## 违规示例

❌ 用 edit 工具连续 4 次小改动 status.json → 容易匹配失败、文件被清空
❌ 改完不检查 → 可能已经损坏
❌ Peter 改 workflow.current_stage → 越权
❌ 基于昨天记忆的值直接覆盖 → 可能覆盖别人的更新

## 合规示例

✅ `update-status.sh monitor/v1.7/status.json '{"runtime":{"latest_commit":"17aae9d"}}'`
✅ 改后看到 `✅ valid` 才算完成
✅ Peter 只改 runtime，小叮当只改 workflow/gate/official
