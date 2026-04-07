# AGENT_RUNBOOK.md — voice-bridge v1.7

## 启动原则

1. 先有任务卡，再生成 prompt，再启动 agent
2. 启动时必须记录 command / cwd / prompt_path / output_path
3. 检查完成情况优先看 artifact，不优先看聊天
4. Verify / Review 必须走正式产物，不接受口头“看过了”

---

## 启动记录模板

```md
# run record — <agent_name>
- agent_name:
- tool/runtime:
- model:
- command:
- cwd:
- prompt_path:
- output_path:
- started_at:
- session_id:
- status: planned / started / active / done / failed
- notes:
```

---

## 本轮推荐 agent 列表

### 1. test-writer
- 类型：AI Agent
- 目标：补本轮行为测试、回归样本验证脚本或测试说明
- 输出：`results/test-writer.md`

### 2. backend-dev
- 类型：AI Agent
- 目标：质量门、ASR/BFF、实验脚本、服务管理相关开发收口
- 输出：`results/backend-dev.md`

### 3. frontend-dev
- 类型：AI Agent
- 目标：录音链路、结构化结果消费、交互与状态表现收口
- 输出：`results/frontend-dev.md`

### 4. verify-runner
- 类型：Script Runner / AI辅助
- 目标：执行 lint / tsc / test / 冒烟 / 必要脚本
- 输出：`verify/verify-report.md`

### 5. code-reviewer-codex
- 类型：AI Agent
- 输出：`review/review-codex.md`

### 6. code-reviewer-claude
- 类型：AI Agent
- 输出：`review/review-claude.md`

### 7. submission-packager
- 类型：AI Agent / Peter主导
- 输出：`SUBMISSION.md` + `handoffs/001-dev-to-test.md`

---

## Run Record 强制字段升级

后续所有 `runs/*.md` 至少补齐以下字段：
- preferred_runner
- actual_runner
- preferred_model/provider
- actual_model/provider
- fallback_used
- fallback_reason
- started_at
- completed_at
- exit_code
- result_path

如果本轮未发生 fallback，也必须显式写 `fallback_used: false`。

## 完成判定

### 开发已启动
同时满足：
- 至少 1 个 run record 为 `started` 或 `active`
- 至少 1 个 `results/*.md` 已建立或 prompt 已落盘
- 群里能引用具体 artifact

### 可进入 Verify
同时满足：
- test-writer / backend-dev / frontend-dev 首轮结果已出
- 当前 diff 已稳定
- 没有已知阻塞未写入 artifact

### 可提测
同时满足：
- verify 报告通过
- review 报告无 blocking issue
- `SUBMISSION.md` 与最新 commit 一致
- handoff 文档已生成
