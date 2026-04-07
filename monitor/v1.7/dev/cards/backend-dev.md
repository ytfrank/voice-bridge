# Agent Card — backend-dev

- `agent_name`: backend-dev
- `role_type`: AI Agent
- `owner`: Peter
- `project`: voice-bridge v1.7

## Goal
在现有 v1.7 技术方向下，收口后端/BFF/ASR 相关代码，使质量门、模型对比实验、服务版本一致性和提测链路进入可验证状态。

## Scope
### In Scope
- `backend/` 下质量门、转写、服务管理相关实现
- 与模型对比/参数实验有关的脚本与文档
- 与 `services/` / 启停 / 健康检查相关的后端可验证改动

### Out of Scope
- 不负责前端 UI 交互收口
- 不修改官方 `status.json`
- 不跳过 verify 直接宣布完成

## Inputs
- repo path: `/Users/bibo/projects/voice-bridge`
- branch: `dev_v1.6`
- related files:
  - `backend/`
  - `monitor/v1.7/dev/TECH_PLAN.md`
  - `monitor/v1.7/dev/MODEL_COMPARE_SUMMARY.md`
  - `monitor/v1.7/dev/TURBO_PARAM_EXPERIMENT_SUMMARY.md`
  - `monitor/v1.7/qa/report.md`
- dependency artifacts:
  - `monitor/v1.7/dev/ORCHESTRATION_PLAN.md`
  - `monitor/v1.7/dev/results/test-writer.md`（若已产出）

## Working Rules
- cwd: `/Users/bibo/projects/voice-bridge`
- can edit: backend, scripts, monitor/v1.7/dev docs as needed
- cannot edit: official `status.json`
- can commit: no（先交 Peter 汇总）

## Startup Method
- tool/runtime: Codex / coding agent style prompt
- model: openai-codex/gpt-5.4
- prompt path: `monitor/v1.7/dev/prompts/backend-dev.md`
- expected output path: `monitor/v1.7/dev/results/backend-dev.md`

## Deliverables
必须交付：
- 一份 `results/backend-dev.md`
- 修改文件列表
- 自测结果
- 未完成项与风险
- 对 verify-runner 的执行建议

## Done Definition
- 后端相关改动有明确文件落点
- 有可执行的自测和验证说明
- 风险与未完成项写清，不口头省略

## Failure Protocol
失败时必须输出：
- 失败点
- 已确认无效的尝试
- 当前阻塞是实现问题、环境问题还是模型问题
- 需要谁决策

## Dependency Graph
- depends_on: ORCHESTRATION_PLAN
- blocks: verify-runner, submission-packager
- handoff_to: verify-runner, code-reviewer-*
