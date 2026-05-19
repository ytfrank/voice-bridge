# Handoff 001 — Dev to Test — Voice Bridge V2.0

## 基本信息

- 项目：voice-bridge V2.0
- 分支：hermes/v2.0
- 代码实现 Commit：8b69637
- 提测文档 Commit：8c4dfd5
- 开发负责人：Peter
- 移交对象：Guard
- 移交时间：2026-05-19

## 开发完成范围

1. ASR 幻觉治理
   - 后端音频质量门控：文件大小、时长、RMS、静音比例、估算 bytes/sec。
   - 文本质量门控：filler、重复幻觉、短音频长文本 mismatch、article-led fragment。
   - 客户端识别 `skipped/qualityDecision`，被拦截内容不展示、不翻译。

2. 延迟治理基础
   - 默认 chunk 2s，支持 `EXPO_PUBLIC_CHUNK_DURATION_MS=1500~3000`。
   - BFF 返回 `timings`：`precheckMs/asrMs/qualityMs/totalMs`。
   - 翻译 entry 记录 `transcribeTime/translateTime/totalLatency`。

3. 中英文同步输出
   - 英文 chunk 通过后立即 append。
   - 句末或 pause flush 触发中文翻译。
   - 中文 entry 先 pending，再更新最终翻译结果。

4. P1 保护项
   - BFF ASR 并发保护 `MAX_ACTIVE_ASR`，超限 429。
   - ASR 超时保护 `ASR_CALL_TIMEOUT_MS`，超时 504。
   - Web import.meta 最小修复：移除默认 Hermes stable transform profile。

## 验证结果

- `cd backend && npm test`：✅ 57/57 passed
- `node tests/scripts/benchmark_v20_quality_gate.js`：✅ 8/8 passed
- targeted eslint：✅ 0 errors，2 warnings
- `git diff --check`：✅ passed
- `npx tsc --noEmit`：❌ 被历史 V1.7 测试文件阻断：`tests/e2e_v17_web_evidence.spec.ts(8,32)` implicit any；非本轮改动引入。

## Guard 测试重点

1. 静音/低音量/环境噪音：不应展示英文字幕、不应触发中文翻译。
2. 正常英文广播外放：英文逐 chunk 展示，中文在句子完成后跟随出现。
3. 记录端到端延迟：后端 `timings.totalMs`、UI 英文出现时间、中文出现时间。
4. 3~5 客户端并发：服务不崩溃；超限应返回 429。
5. Web 入口：确认 import.meta 报错是否消失。

## 已知风险

- 未跑真实智谱 ASR smoke；准确率/幻觉率需 Guard 用真实音频样本验证。
- Web/真机 recorder metering 能力需实机确认；不可用时前端降级依赖后端门控。
- 当前仍是 2s chunk + pipeline，不是真流式 ASR。

## 成果物

- `monitor/v2.0/dev/SUBMISSION.md`
- `monitor/v2.0/handoffs/001-dev-to-test.md`
- `monitor/v2.0/dev/TECH_PLAN.md`
