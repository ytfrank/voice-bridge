# QA Report — voice-bridge V1.7 Phase 1

**测试时间**: 2026-04-07 17:37 ~ 19:05 (CST)
**对应commit**: b1a9c66 (branch: dev_v1.6)
**测试人**: Guard
**风险等级**: normal

---

## 测试结论: Conditional Pass

后端质量门核心功能验证通过，幻觉拦截生效。但前端 skipped 消费未实现，存在 P0 缺口。

---

## 一、已验证 (8/10)

### 1.1 BFF 启动 + Health ✅
- BFF 正常启动 (pid=13593, port=3001)
- `/health` 返回 buildCommit=b1a9c66, whisper=medium, workers=2
- whisperQueue 结构正常

### 1.2 静态检查 ✅
| 项目 | 结果 |
|------|------|
| tsc --noEmit | PASS (零错误) |
| quality_gate.test.js | 4/4 PASS (56ms) |
| Python 语法检查 | PASS |

### 1.3 后端质量门三态 ✅
| 状态 | 触发条件 | 验证结果 |
|------|---------|---------|
| HARD_BLOCK | silence_1s.wav (空音频) | ✅ skipped=true, reasons=[empty_text, empty_transcript, too_little_text_for_audio] |
| HARD_BLOCK | musk_21s.wav (幻觉音频) | ✅ "You" 被拦截, reasons=[high_no_speech_prob, too_little_text_for_audio, low_value_text] |
| SOFT_BLOCK | medium_sentence.wav (0.85s短句) | ✅ reason=truncated_short_phrase |
| PASS | 正常音频 (预期) | 待真机验证完整句子 |

**核心发现**: musk_21s.wav 幻觉问题已修复！Whisper 输出 "You" 但被质量门正确拦截为 HARD_BLOCK。
- noSpeechProb=0.8628 (>0.5)
- 1 token / 20.6s = 0.145 chars/sec (极低)
- "You" 属于 LOW_VALUE_TOKENS

### 1.4 /api/transcribe 结构化返回 ✅
返回结构完整包含：
- `text`, `skipped`, `reason`, `reasons`, `qualityDecision`
- `requestId`
- `asr.metadata` (durationSec, languageProbability, avgLogprob, segments, inputProbe, qualityFlags, qualityScore)
- `asr.quality` (allowed, decision, primaryReason, reasons, stats, normalizedText)

### 1.5 /api/translate 输入质量门 ✅
| 输入 | 结果 |
|------|------|
| "You" | ✅ skipped=true, reason=low_value_text |
| "Hello, how are you today?" | ✅ 翻译正常: "你好，今天怎么样？" |

### 1.6 VAD fallback 机制 ✅
musk_21s.wav 日志显示:
- VAD 首轮无结果 → 自动 fallback_without_vad=true
- fallback 后 Whisper 输出 "You" 但被质量门拦截
- 完整链路: VAD → fallback → ASR → quality_gate → HARD_BLOCK

---

## 二、未验证 / 问题 (2/10)

### 🔴 P0: 前端未消费 skipped/reason/reasons 字段
**现象**: grep 全部前端代码 (`app/*.tsx`, `components/*.tsx`, `utils/*.ts`)：
- **无任何代码** 读取 `skipped`, `reason`, `reasons`, `qualityDecision` 字段
- 仅 `pipelineLogger.ts` 有 `chunk_skipped` 日志类型
- `app/index.tsx` 无 transcribe 结果的后处理逻辑

**影响**: 后端正确拦截了幻觉/低质量内容，但前端不知道，用户可能看到空白或无提示。

**建议**: 前端需要在 transcribe 响应中消费 `skipped` 字段，当 `skipped=true` 时：
1. 不展示空白文本
2. 显示 reason 提示（如 "音频过短" "未检测到语音"）
3. 记录到 analytics

### 🟡 P1: reasons[] 未透传到 analytics
**现象**: SUBMISSION.md 已标注为 P0，但前端代码中无 analytics 事件发送逻辑
**影响**: 无法在 analytics 中统计质量门拦截情况

### 🟡 P2: DebugPanel skipped 高亮
**建议**: DebugPanel 中对 skipped=true 的记录做视觉区分

---

## 三、未覆盖项

| 项目 | 原因 | 风险 |
|------|------|------|
| 真机 iOS E2E | 无真机 | 中 |
| 前端 skipped UI 验证 | 前端未实现 | 高 (P0) |
| face_medium.aiff 截断测试 | 无此文件 | 低 |
| 完整 E2E 录音→识别→翻译 | 需真机 | 中 |
| Jest 测试套件 | 配置问题 (pre-existing) | 低 |
| 6-state pipeline 状态机完整验证 | 需真机或完整前端 | 中 |

---

## 四、证据索引

| # | 测试项 | 证据 |
|---|--------|------|
| 1 | BFF health | JSON response: status=ok, buildCommit=b1a9c66 |
| 2 | silence_1s → HARD_BLOCK | skipped=true, reasons=[empty_text, empty_transcript, too_little_text_for_audio] |
| 3 | musk_21s → HARD_BLOCK | "You" 被拦截, noSpeechProb=0.8628, decision=HARD_BLOCK |
| 4 | translate "You" 拦截 | skipped=true, reason=low_value_text |
| 5 | translate 正常 | "你好，今天怎么样？" |
| 6 | quality_gate test | 4/4 PASS |
| 7 | tsc --noEmit | PASS |
| 8 | 前端 grep 结果 | skipped/reason/reasons 未被消费 |

---

## 五、放行建议

**Conditional Pass** — 后端质量门核心功能完成度高，幻觉拦截生效。

**前置条件**:
1. 🔴 前端必须实现 skipped 消费后才能正式提测
2. 🟡 reasons 透传 analytics 需跟进
3. 真机验证可在前端补齐后进行

**建议**: 后端可放行，前端补齐 skipped 消费后进入 Phase 2 提测。

---

*报告时间: 2026-04-07 19:05 CST*
*测试人: Guard*
