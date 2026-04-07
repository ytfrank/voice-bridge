# SUBMISSION.md — voice-bridge v1.7

**commit**: 438f905
**branch**: dev_v1.6
**提交时间**: 2026-04-07 16:40
**提交者**: Peter

---

## 改动摘要

本轮为 v1.7 开发阶段的首轮分析收敛轮次，核心产出是编排基础设施、agent 任务卡、prompt、首轮 agent 结果和fallback 机制，而非功能代码改动。

### 编排基础设施
- `ORCHESTRATION_PLAN.md` — 总编排方案
- `AGENT_CARD_TEMPLATE.md` — 任务卡模板
- `AGENT_RUNBOOK.md` — 调度记录
- `LLM_FALLBACK_IMPLEMENTATION_PLAN.md` — CLI fallback 方案
- `cards/*.md` — 7 个 agent 任务卡
- `prompts/*.md` — 7 个 agent prompt

### 首轮 agent 结果
- `results/test-writer.md` — 8 个核心测试场景 + 通过标准
- `results/backend-dev.md` — 后端质量门三态确认 + 风险清单
- `results/frontend-dev.md` — 前端 skipped/reason 消费确认 + P0 待改项

### CLI Fallback 机制
- `~/bin/claude-auto` — Claude Code → GLM-5.1 fallback（已验证成功）
- `~/bin/codex-auto` — Codex → claude-auto fallback（已配置）
- `~/bin/llm-auto-common.sh` — 共享错误检测 + 日志
- `~/.llm-auto/logs/` — fallback 日志

### 验证报告
- `verify/verify-report.md` — tsc/lint/test 结果

---

## 已验证项

1. ✅ 后端质量门三态（PASS/SOFT_BLOCK/HARD_BLOCK）已实现
2. ✅ `/api/transcribe` 结构化返回已实现
3. ✅ `/api/translate` 输入质量门已实现
4. ✅ 前端 `skipped`/`reason` 消费已实现
5. ✅ 6-state pipeline 状态机已实现
6. ✅ 录音错误恢复 + 看门狗已实现
7. ✅ analytics 全链路跟踪已实现
8. ✅ 业务代码 Node.js 语法检查通过
9. ✅ Claude→GLM-5.1 fallback 实战验证成功

## 未验证项

1. ⏳ BFF 端到端回归（BFF 未运行，2. ⏳ 真机 iOS 稳定性
3. ⏳ `face_medium.aiff` 截断短句是否根治
4. ⏳ `musk_21s.wav` → "You" 幻觉是否根治
5. ⏳ Jest 测试套件配置修复
6. ⏳ 端到端回归测试执行

## 风险

1. Codex CLI 额度耗尽（resets Apr 8），可能影响后续改码 agent
2. Claude Code 额度耗尽（resets Apr 10），fallback 到 GLM-5.1 可用但偶发超时
3. 测试框架配置问题需修复后才能跑完整测试
4. BFF 需要启动后才能做端到端验证

## 测试重点

<at user_id="ou_be1c18ae61787ea527f47f0dc7616ad1">Guard</at> 请重点关注：

1. **BFF 端到端回归**：启动 BFF 后，   - `silence_1s.wav` → 结构化空结果
   - `musk_21s.wav` → 不透传 "You"
   - `face_medium.aiff` → 截断短句处理
2. **前端 skipped 消费**：确认 `skipped=true` 时 UI 行为正确
3. **前端 `reasons[]` 未透传到 analytics**：这是 P0 问题
4. **DebugPanel skipped 高亮**：建议加上
5. **真机 iOS 稳定性**：QA report §9.2 明确要求

## 注意事项

- 本轮是分析收敛轮次，不是功能改动轮次
- 核心价值是：建立了编排基础设施、验证了 fallback 机制、确认了前后端现有能力
- 下一步需要：修复测试配置 → 启动 BFF → 端到端回归 → code review → 正式提测
