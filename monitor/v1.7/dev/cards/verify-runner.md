# Agent Card — verify-runner

- `agent_name`: verify-runner
- `role_type`: Script Runner / AI辅助
- `owner`: Peter
- `project`: voice-bridge v1.7

## Goal
对当前轮次代码和产物执行统一验证，输出可审计的验证报告，作为进入 code review / 提测的门槛。

## Scope
### In Scope
- lint
- tsc
- jest / 测试脚本
- backend 语法检查
- 必要冒烟验证

### Out of Scope
- 不代替开发 agent 做大规模逻辑改动
- 不修改官方 `status.json`

## Inputs
- repo path: `/Users/bibo/projects/voice-bridge`
- branch: `dev_v1.6`
- upstream outputs:
  - `results/test-writer.md`
  - `results/backend-dev.md`
  - `results/frontend-dev.md`

## Working Rules
- cwd: `/Users/bibo/projects/voice-bridge`
- can edit: `monitor/v1.7/dev/verify/*`
- cannot edit: official `status.json`
- can commit: no

## Startup Method
- tool/runtime: shell/scripts + AI汇总
- prompt path: `monitor/v1.7/dev/prompts/verify-runner.md`
- expected output path: `monitor/v1.7/dev/verify/verify-report.md`

## Deliverables
- `verify/verify-report.md`
- 执行命令
- 结果汇总
- 失败项
- 阻塞项

## Done Definition
- 有可复查的命令和结果
- 明确是否允许进入 code review

## Dependency Graph
- depends_on: test-writer, backend-dev, frontend-dev
- blocks: code-reviewer-*, submission-packager
- handoff_to: code-reviewer-*
