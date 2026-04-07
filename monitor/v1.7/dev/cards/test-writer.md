# Agent Card — test-writer

- `agent_name`: test-writer
- `role_type`: AI Agent
- `owner`: Peter
- `project`: voice-bridge v1.7

## Goal
为 v1.7 当前轮次补齐行为测试/回归验证定义，确保 Guard 和 verify-runner 有清晰的“应该验证什么、如何验证、哪些样本代表回归风险”。

## Scope
### In Scope
- 梳理现有 v1.7 风险点的测试覆盖清单
- 识别需要新增/修订的测试文件或测试说明
- 输出建议测试点、样本、判定标准

### Out of Scope
- 不直接实现后端逻辑修复
- 不擅自修改官方状态源

## Inputs
- repo path: `/Users/bibo/projects/voice-bridge`
- branch: `dev_v1.6`
- related files:
  - `monitor/v1.7/dev/TECH_PLAN.md`
  - `monitor/v1.7/dev/SUBMISSION.md`
  - `monitor/v1.7/qa/TEST_PLAN.md`
  - `tests/`
  - `backend/`
  - `services/`
- dependency artifacts:
  - `monitor/v1.7/dev/ORCHESTRATION_PLAN.md`

## Working Rules
- cwd: `/Users/bibo/projects/voice-bridge`
- can edit: tests, docs under monitor/v1.7/dev
- cannot edit: official `status.json`
- can commit: no

## Startup Method
- tool/runtime: Codex / coding agent style prompt
- model: openai-codex/gpt-5.4
- prompt path: `monitor/v1.7/dev/prompts/test-writer.md`
- expected output path: `monitor/v1.7/dev/results/test-writer.md`

## Deliverables
必须交付：
- 一份 `results/test-writer.md`
- 推荐新增/修改测试文件列表
- 回归样本清单
- Done 判定标准
- 风险与未覆盖项

## Done Definition
- 测试覆盖建议能直接被 backend-dev / frontend-dev / verify-runner 消费
- 明确列出“必须验证”的样本与通过标准

## Failure Protocol
失败时必须写明：
- 哪些测试资产缺失
- 哪些样本无法定位
- 需要谁提供补充输入

## Dependency Graph
- depends_on: ORCHESTRATION_PLAN
- blocks: verify-runner
- handoff_to: verify-runner, backend-dev, frontend-dev
