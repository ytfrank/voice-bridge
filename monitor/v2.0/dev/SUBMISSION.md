# SUBMISSION.md — Voice Bridge V2.0 首轮提测

## 基本信息

- 项目：voice-bridge V2.0
- 分支：hermes/v2.0
- Commit：8b69637（V2.0代码实现提交；本SUBMISSION后续如有文档提交，以远端最新提交为准）
- 基线：837d3a0（V1.7 QA conditional pass）
- 提测时间：2026-05-19

## 本次是否拆分

- 本次是否拆分：是
- 计划启动 subagent：3
- 实际已启动 subagent：3
- 当前活跃 subagent：0
- 执行说明：Test Writer / Backend Dev / Frontend Dev 均已产出到工作区；原后台 session 已结束，OpenClaw process 列表当前无 recent sessions。

## 改动摘要

### P0-1 ASR 幻觉治理

- 新增 `assessAudioSignalQuality(metadata)`：按文件大小、音频时长、RMS、静音比例、估算 bytes/sec 做前置音频信号门控。
- `/api/transcribe` 在调用 ASR 前增加低信号/静音/过短音频拦截，返回 `skipped=true`、`reason/reasons`、`qualityDecision`，且 `asrMs=0`。
- 强化文本质量门控测试：filler、重复幻觉、短音频长文本 mismatch、article-led fragment 等均阻断。
- 客户端识别 `skipped/qualityDecision`，被门控内容不进入英文字幕，也不触发中文翻译。

### P0-2 延迟 <3s 路线

- 默认录音 chunk 从 5s 下调到 2s，env 可配范围收敛到 1500~3000ms。
- BFF transcribe 响应增加 `timings`：`precheckMs/asrMs/qualityMs/totalMs`。
- 翻译 entry 增加 `transcribeTime/translateTime/totalLatency`，用于后续真实音频延迟对比。
- 音频/文本门控纯 JS benchmark p95 < 0.003ms，不构成延迟瓶颈。

### P0-3 中英文同步输出

- 英文 ASR chunk 通过后立即 append。
- 句末或 pause flush 后触发中文翻译，并把 ASR耗时传入 translation entry。
- skipped/低质量 ASR 直接 return，不进入 append/translation 分支。

### P1顺手项

- Web import.meta：调整 `metro.config.js`，未显式配置时移除 `unstable_transformProfile`，避免 Hermes stable transform profile 导致 Web import.meta 不兼容。
- 并发保护：BFF 增加 `MAX_ACTIVE_ASR`（默认5）和 `ASR_CALL_TIMEOUT_MS`（默认45s），超限返回 429，超时返回 504，避免 3~5 人并发时服务崩溃。

## 修改文件

- `backend/quality_gate.js`
- `backend/server.js`
- `backend/package.json`
- `backend/__tests__/quality_gate.test.js`
- `backend/__tests__/audio_quality_gate.test.js`
- `backend/__tests__/v20_pipeline_contract.test.js`
- `constants/audio.ts`
- `hooks/useAudioRecording.ts`
- `services/transcriptionService.ts`
- `store/transcriptStore.ts`
- `metro.config.js`
- `tests/scripts/benchmark_quality_gate.js`
- `tests/scripts/benchmark_v20_quality_gate.js`
- `monitor/v2.0/dev/TECH_PLAN.md`
- `monitor/v2.0/dev/SUBMISSION.md`

## 自测数据

### 单元测试

```bash
npm test
```

结果：通过

- tests：57
- pass：57
- fail：0
- duration：约 66ms

覆盖点：
- 静音/低信号音频拦截
- 过短音频拦截
- filler/重复幻觉文本拦截
- 短音频长文本 mismatch 拦截
- 正常英文广播句保留
- skipped ASR 不进入 UI/翻译契约

### Lint

```bash
npm run lint
```

结果：通过（0 errors，6 warnings）

说明：warnings 包含历史文件与非阻塞 hook dependency/array-type 警告，无 ESLint error。

### TypeScript

```bash
npx tsc --noEmit
```

结果：未通过；失败点为历史测试文件：

- `tests/e2e_v17_web_evidence.spec.ts(8,32): Parameter 'page' implicitly has an 'any' type.`

该文件不在本次 V2.0 改动范围内；本次新增 P0 后端/门控测试均已通过。

### 离线门控 benchmark

```bash
node tests/scripts/benchmark_v20_quality_gate.js
```

结果：通过

- 总耗时：约 0.492ms
- cases：8/8 passed
- 静音 tiny file：HARD_BLOCK
- low_signal_audio：blocked
- normal_speech_audio：PASS
- repeated_hallucination_text：blocked
- normal_english_broadcast_text：PASS

```bash
node tests/scripts/benchmark_quality_gate.js
```

结果：通过

- 所有质量门控 case p95 < 0.003ms
- Overall: PASS — all p95 < 1ms

## 准确率 / 幻觉率 / 延迟前后对比

| 指标 | V1.7基线 | V2.0首轮离线门控结果 | 说明 |
|---|---:|---:|---|
| 静音/低信号输出 | 存在幻觉风险 | 0输出（8个门控case全部符合预期） | 前置门控阻止进入ASR或UI |
| 幻觉文本拦截 | 部分覆盖 | filler/重复/mismatch均拦截 | 以单测和离线benchmark验证 |
| 有效英文保留 | 已可用 | normal broadcast句 PASS | 未调用真实ASR API |
| 门控处理延迟 | 无统计 | p95 < 0.003ms | 不构成延迟瓶颈 |
| 端到端真实音频延迟 | 短2.8s / 中3.5s / 长8.7s | 待Guard真机/API样本验证 | 本次已加 timings 采集能力 |

## Guard测试重点

1. 静音、低音量、只有环境噪音时：应无英文字幕、无中文翻译，只出现 skip/门控状态。
2. 正常英文广播外放：英文应逐 chunk 出现，中文应在句子完成后跟随出现。
3. 短/中音频端到端延迟：重点记录 `timings.totalMs`、UI英文出现时间、中文出现时间。
4. 3~5个客户端并发上传：服务不应崩溃；超过并发阈值时应返回 429 而不是挂死。
5. Web入口：验证 import.meta 报错是否消失。

## 已知风险 / 未完成

- 本轮没有调用真实智谱 ASR 样本做准确率统计，真实准确率/幻觉率仍需 Guard 用音频样本验证。
- `npx tsc --noEmit` 被历史 V1.7 Web evidence 测试文件阻断，不是本次改动引入。
- 真流式 ASR 未实现；当前是 2s chunk + pipeline + 门控的可交付版本。
