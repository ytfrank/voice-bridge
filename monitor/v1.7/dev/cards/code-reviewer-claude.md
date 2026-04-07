# Agent Card — code-reviewer-claude

- `agent_name`: code-reviewer-claude
- `role_type`: AI Agent
- `owner`: Peter
- `project`: voice-bridge v1.7

## Goal
从前端交互、协作边界、可维护性和用户可见行为角度做第二视角审查。

## Inputs
- repo path: `/Users/bibo/projects/voice-bridge`
- branch: `dev_v1.6`
- upstream outputs:
  - `verify/verify-report.md`
  - `results/backend-dev.md`
  - `results/frontend-dev.md`

## Deliverables
- `review/review-claude.md`
- blocking issues
- maintainability notes
- UX / interaction notes
- release recommendation

## Done Definition
- 审查意见可直接被 Peter 用于收口和提测决策
