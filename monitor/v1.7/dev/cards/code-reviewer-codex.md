# Agent Card — code-reviewer-codex

- `agent_name`: code-reviewer-codex
- `role_type`: AI Agent
- `owner`: Peter
- `project`: voice-bridge v1.7

## Goal
对当前 diff 和 verify 结果做技术审查，识别 blocking issue、结构风险和提测前必须修的问题。

## Inputs
- repo path: `/Users/bibo/projects/voice-bridge`
- branch: `dev_v1.6`
- upstream outputs:
  - `verify/verify-report.md`
  - `results/backend-dev.md`
  - `results/frontend-dev.md`

## Deliverables
- `review/review-codex.md`
- blocking issues
- non-blocking suggestions
- risk summary
- release recommendation

## Done Definition
- 给出清晰的可提测 / 不可提测判断
- 每个 blocking issue 都能定位到文件或行为
