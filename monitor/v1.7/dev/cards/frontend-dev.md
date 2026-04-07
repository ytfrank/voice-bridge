# Agent Card — frontend-dev

- `agent_name`: frontend-dev
- `role_type`: AI Agent
- `owner`: Peter
- `project`: voice-bridge v1.7

## Goal
收口前端录音链路、结构化结果消费、交互状态与用户可见表现，确保前端能正确承接 v1.7 质量门与后端结构化返回。

## Scope
### In Scope
- `app/`, `components/`, `hooks/`, `services/`, `constants/` 中与录音/转写/交互有关的内容
- 结构化返回的前端消费和表现

### Out of Scope
- 不负责后端 ASR 质量门核心实现
- 不修改官方 `status.json`

## Inputs
- repo path: `/Users/bibo/projects/voice-bridge`
- branch: `dev_v1.6`
- related files:
  - `hooks/useAudioRecording.ts`
  - `services/transcriptionService.ts`
  - `services/websocketService.ts`
  - `components/`
  - `monitor/v1.7/dev/TECH_PLAN.md`
  - `monitor/v1.7/qa/report.md`
- dependency artifacts:
  - `monitor/v1.7/dev/ORCHESTRATION_PLAN.md`
  - `monitor/v1.7/dev/results/test-writer.md`（若已产出）

## Working Rules
- cwd: `/Users/bibo/projects/voice-bridge`
- can edit: frontend related files + monitor docs as needed
- cannot edit: official `status.json`
- can commit: no

## Startup Method
- tool/runtime: Claude Code / Codex style prompt
- model: openai-codex/gpt-5.4 or Claude Code（由 Peter 指派）
- prompt path: `monitor/v1.7/dev/prompts/frontend-dev.md`
- expected output path: `monitor/v1.7/dev/results/frontend-dev.md`

## Deliverables
必须交付：
- 一份 `results/frontend-dev.md`
- 修改文件列表
- 交互层自测结果
- 未完成项与风险

## Done Definition
- 前端对结构化返回的消费明确
- 录音/启停/异常态/提示态逻辑有清晰结果
- 可以被 verify-runner 冒烟验证

## Failure Protocol
失败时必须输出：
- 失败点
- 已确认输入/接口现状
- 当前阻塞点
- 需要谁拍板

## Dependency Graph
- depends_on: ORCHESTRATION_PLAN
- blocks: verify-runner, submission-packager
- handoff_to: verify-runner, code-reviewer-*
