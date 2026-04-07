# Agent Card — submission-packager

- `agent_name`: submission-packager
- `role_type`: AI Agent / Peter主导
- `owner`: Peter
- `project`: voice-bridge v1.7

## Goal
将本轮有效开发结果整理为与最新 commit 一致的提测材料，保证 Guard 能直接按 artifact 接手。

## Inputs
- `results/*.md`
- `verify/verify-report.md`
- `review/*.md`
- 当前最新 commit / branch / changed files

## Deliverables
- 更新后的 `monitor/v1.7/dev/SUBMISSION.md`
- `handoffs/001-dev-to-test.md`
- 提测摘要

## Done Definition
- `SUBMISSION.md` 与最新 commit 一致
- 包含：commit、已验证项、未验证项、风险、测试重点
- Guard 无需追问即可开始测试
