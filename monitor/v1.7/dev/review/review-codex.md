# Code Review — voice-bridge v1.7 (Codex 视角)

**Reviewer**: code-reviewer-codex
**Date**: 2026-04-07
**Branch**: dev_v1.6
**HEAD**: b1a9c66
**Diff range**: main...HEAD (~69 files, +8383 / -298 lines)
**Verify report**: 21/24 PASS, 2 FAIL (pre-existing), 1 SKIP

---

## 1. 审查范围

### 核心代码变更（重点审查）
| 文件 | 变更量 | 类型 |
|------|--------|------|
| `backend/quality_gate.js` | +206 (new) | 质量门引擎 |
| `backend/server.js` | +848/-298 | BFF 主服务（质量门接入 + worker pool + 结构化返回 + trace） |
| `backend/local_whisper.py` | +237/-53 | ASR 元数据输出 + VAD fallback |
| `backend/__tests__/quality_gate.test.js` | +40 (new) | 质量门单元测试 |
| `services/transcriptionService.ts` | +84/-30 | 前端 ASR 消费（已解析 skipped/reason） |
| `hooks/useAudioRecording.ts` | +413/-80 | 前端质量守卫 + 状态恢复 |
| `constants/audio.ts` | +32/-10 | 填词集 + 录音参数 |

### 辅助/文档变更（快速过）
- `backend/start.sh`, `status.sh`, `stop.sh`, `restart.sh` — 服务治理脚本
- `scripts/start-services.sh`, `stop-services.sh`, `status-services.sh` — 统一启停
- `services/analyticsService.ts`, `services/errorReporter.ts`, `services/websocketService.ts` — 前端基础设施增强
- `monitor/v1.7/dev/` — 编排文档、实验结果、agent 运行记录
- `.env`, `.gitignore`, `package.json` — 配置变更

---

## 2. Blocking Issues

### B1: `assessTextQuality` 直接修改传入的 `metadata` 对象（副作用）

**文件**: `backend/quality_gate.js:130-134`
**严重度**: HIGH

```js
if (!normalizedText && !metadata?.emptyReason) {
  metadata.emptyReason = maxNoSpeechProb !== null && maxNoSpeechProb > 0.7
    ? 'no_speech'
    : 'empty_transcript';
}
```

`assessTextQuality` 直接对传入的 `metadata` 参数做写操作。在 `/api/transcribe` 中，这个 `metadata` 对象后续还被 `buildAsrResponse` 消费。虽然当前调用顺序碰巧不会出问题，但这是一个隐式依赖——如果调用方不预期 metadata 被修改，会产生难以追踪的 bug。

**修复建议**: 在函数开头做 `metadata = { ...metadata }` 或使用 `Object.freeze` 防护。

### B2: `quality_gate.js` 与 `local_whisper.py` 重复实现质量规则，阈值不同步

**文件**: `backend/quality_gate.js` vs `backend/local_whisper.py:110-127`
**严重度**: MEDIUM-HIGH

两处各自独立实现了质量判断逻辑：
- `quality_gate.js:140-147` — JS 侧 assessTextQuality 的 reasons 规则
- `local_whisper.py:110-127` — Python 侧 summarize_segments 的 quality_flags 规则

关键阈值差异：
| 规则 | JS (`quality_gate.js`) | Python (`local_whisper.py`) |
|------|----------------------|---------------------------|
| `too_little_text` 触发条件 | `durationSec >= 0.8 && tokenCount <= 1` | `durationSec >= 2.0 && tokenCount <= 1` |
| `chars_per_second` 阈值 | `> 22` | `> 22` |
| `no_speech_prob` 阈值 | `> 0.7` | `> 0.7` |
| `low_logprob` 阈值 | `< -1.1` | `< -1.1` |

`too_little_text` 的 durationSec 阈值差了 2.5 倍（0.8 vs 2.0）。Python 侧更宽松（只在 >=2s 时才触发），JS 侧更激进。这意味着同样一个 1 秒音频只有 1 个 token 的结果，Python 不会标记 `too_little_text_for_duration`，但 JS 侧会标记 `too_little_text_for_audio`。

当前实际行为是 JS 侧（BFF 层）作为最终拦截决策层，Python 侧的 metadata 只是参考。但两套不一致的规则会增加维护成本和排查难度。

**修复建议**: 明确 Python 侧仅负责 metadata 采集（删除 flag 判断），或抽取共享的阈值配置文件。

### B3: `BUILD_COMMIT` 硬编码回退值 `cc355f4` 可能导致版本误判

**文件**: `backend/server.js:35`
**严重度**: MEDIUM

```js
const BUILD_COMMIT = process.env.VOICE_BRIDGE_BUILD_COMMIT || 'cc355f4';
```

如果有人绕过 `start.sh` 直接运行 `node backend/server.js`，`/health` 会返回 `buildCommit: "cc355f4"` 而非实际版本。verify 报告和 CI 都依赖 `/health.buildCommit` 判断部署版本，回退到旧 commit 可能导致误判。

**修复建议**: 回退值改为 `"unknown"` 或在 `/health` 中标注 `buildCommitSource: "env" | "fallback"`。

---

## 3. Non-blocking Issues

### N1: `buildAsrResponse` 对 `reasons` 的拼接逻辑不完整

**文件**: `backend/quality_gate.js:185`

```js
reasons: finalSkipped ? (quality?.reasons || (finalReason ? [finalReason] : [])) : [],
```

当 `finalSkipped=true` 但 `quality` 为 `undefined`/`null` 时（例如 MIN_AUDIO_BYTES 预检阶段），`reasons` 会退化为 `[finalReason]` 或 `[]`，而不会包含 `quality.reasons`。这是当前行为正确的场景（预检阶段还没跑 quality gate），但逻辑分支不太清晰。

### N2: 单测覆盖率不足

**文件**: `backend/__tests__/quality_gate.test.js`

当前只有 4 个测试，覆盖了：
- article-led fragment 拦截 (x2)
- 正常短句放行
- 有动词的 article-led 句子放行

缺少覆盖：
- `LOW_VALUE_TOKENS` 拦截（`"You"` / `"oh"` 等）
- `repetitive_text` 规则
- `high_no_speech_prob` / `low_logprob` 硬拦截
- `empty_text` 硬拦截
- `buildAsrResponse` 的边界条件

### N3: 前端未消费 `reasons[]` 和 `qualityDecision`

**文件**: `services/transcriptionService.ts:83-84`

前端只解析了 `skipped` 和 `reason`，忽略了 `reasons`（数组）和 `qualityDecision`。不影响功能正确性，但 analytics 信息不完整，线上排查时无法区分多原因跳过。

frontend-dev 已识别为 P0 改动项。

### N4: 前端 `LOW_SIGNAL_FILLERS` 缺少 `"you"`

**文件**: `constants/audio.ts:54-67`

前端填词集不包含 `"you"`，而 `"You"` 是 `musk_21s.wav` 的已知幻觉。后端 `quality_gate.js` 的 `LOW_VALUE_TOKENS` 已包含 `"you"`，但前端二次守卫会漏过。

当前实际被后端拦截，不阻塞，但前端防线有缺口。

### N5: `local_whisper.py` 全局 `_model` 单例无卸载机制

**文件**: `backend/local_whisper.py:23-29`

`_model` 作为模块级全局变量持有 WhisperModel，但：
- 每次 spawn Python 进程都会重新加载模型（worker pool 每次任务 spawn 一个 Python 进程）
- 模型加载在进程启动时，不存在跨请求复用
- 全局变量在 CLI 模式下无害（单次执行后退出），但在其他调用方式下可能有意外

当前行为无问题（worker pool 每次 spawn 新进程），只是代码意图与实际使用模式不完全匹配。

### N6: `server.js` 中 `log()` 函数同时写入 `data` 原始对象和 `payload`

**文件**: `backend/server.js:148-149`

```js
...(normalized.payload !== undefined ? { payload: normalized.payload } : {}),
// Backward-compatible fields for existing tooling
...(data && { data }),
```

日志条目同时包含 `payload`（规范化后的）和 `data`（原始对象），导致重复信息。这是为了向后兼容，但日志量几乎翻倍。建议后续迁移工具后移除 `data` 字段。

### N7: `__pycache__` 被提交到仓库

**文件**: `monitor/v1.7/dev/__pycache__/turbo_param_experiment.cpython-314.pyc`

不应提交编译缓存到版本控制。

### N8: Jest / node:test 格式不兼容

`npm test` 指向 jest，但测试文件使用 `node:test` 格式。`npm test` 实际会报错。这不影响 `node --test` 执行，但 `npm test` 的开发者体验不佳。

---

## 4. Risk Summary

### 高风险

| # | 风险 | 影响 | 缓解 |
|---|------|------|------|
| R1 | `assessTextQuality` 副作用（B1） | 调用方不预期 metadata 被修改，后续重构可能引入 bug | 修复为不可变 |
| R2 | JS/Python 双重质量规则不同步（B2） | 维护成本高，规则修改需要同步两处 | 明确单一职责 |
| R3 | `face_medium` 样本仍未根治 | 质量门能拦截坏结果，但不能修成正确识别 | 已知限制，通过拦截规避 |

### 中风险

| # | 风险 | 影响 | 缓解 |
|---|------|------|------|
| R4 | `BUILD_COMMIT` 硬编码（B3） | 绕过 start.sh 时版本失真 | 改回退值为 "unknown" |
| R5 | 前端 `reasons[]` 未消费 | analytics 信息不完整 | P0 改动项 |
| R6 | 前端填词集缺 "you" | 前端二次守卫有缺口 | 后端已覆盖 |
| R7 | 真机 iOS 录音稳定性未验证 | 生产环境可能异常 | 需真机实测 |

### 低风险

| # | 风险 | 影响 | 缓解 |
|---|------|------|------|
| R8 | 单测覆盖率不足 | 回归风险 | 补充测试 |
| R9 | `__pycache__` 提交 | 仓库整洁度 | 清理 + gitignore |
| R10 | 日志双写 payload+data | 磁盘占用 | 后续迁移后移除 |

---

## 5. 架构观察

### 正面

1. **质量门分层设计合理**：Python 层采集元数据 → JS BFF 层做最终决策 → 前端二次守卫。三层防御，单一拦截点失败不意味着坏结果穿透。
2. **结构化返回设计清晰**：`{ text, skipped, reason, reasons, qualityDecision, asr: { metadata, quality } }` 结构完整，前端消费路径明确。
3. **Worker pool 设计成熟**：队列上限、TTL 过期、session 亲和性、小文件优先调度，考虑了生产级并发场景。
4. **Trace context 全链路**：requestId/sessionId 从前端 → HTTP header → BFF → Whisper worker → 日志，端到端可追踪。
5. **VAD fallback 策略**：VAD 首轮失败后退回无 VAD 重试，是一个合理的鲁棒性设计。

### 需要关注

1. **双语言质量规则维护**：JS 和 Python 各有一套质量判断，当前阈值已出现分歧（too_little_text 的 durationSec 0.8 vs 2.0），未来是主要的维护负担。
2. **`quality_gate.js` 承担了过多职责**：既做文本质量评估，又做 ASR 响应构建（`buildAsrResponse`），建议后续拆分。
3. **`server.js` 已近 1500 行**：包含了 HTTP 路由、worker pool、日志、Expo 重定向页、音频处理等多个关注点。当前可工作，但后续迭代时考虑拆分路由模块。

---

## 6. Verify 结果交叉验证

| verify 检查项 | 复审结论 |
|--------------|---------|
| TypeScript 编译 PASS | 确认，代码无类型错误 |
| Python 语法 PASS | 确认 |
| quality_gate 4/4 PASS | 确认，但覆盖面不足（见 N2） |
| `/health` buildCommit 匹配 HEAD | 确认（通过 start.sh 注入），但硬编码回退值有问题（见 B3） |
| musk_21s "You" 幻觉被拦截 | 确认，`LOW_VALUE_TOKENS` 包含 `you`，HARD_BLOCK |
| `face_short.aiff` 正确放行 | 确认 |
| `face_medium.aiff` truncated_short_phrase | 确认拦截 |
| ESLint 无配置 | 确认为预存问题，非 v1.7 引入 |
| Jest 格式不匹配 | 确认为预存问题 |

---

## 7. Release Recommendation

### 判断：**可提测（Conditional GO）**

**前提条件**：

1. **B1（metadata 副作用）**：建议提测前修复，至少做 defensive copy。改动量 < 5 行，风险极低。
2. **B3（BUILD_COMMIT 硬编码）**：建议改为 `"unknown"`。改动 1 行。
3. **B2（JS/Python 规则不同步）**：不阻塞提测，但应在 v1.7 周期内跟进收敛。当前 JS 侧为最终决策层，Python 侧 metadata 仅参考，功能不受影响。

**提测后跟进项**：

- 补充质量门单测（覆盖 LOW_VALUE_TOKENS、empty_text、repetitive_text 等规则）
- 前端 P0：`reasons[]` 解析 + analytics 透传
- 前端 P1：`LOW_SIGNAL_FILLERS` 补充 "you"
- 真机 iOS 冒烟验证
- 清理 `__pycache__` 提交

**不建议发布到生产的理由**：真机稳定性未验证（R7），前端翻译质量门消费未实现（R5），`face_medium` 样本识别质量未改善（R3，已通过拦截规避）。

---

*Review completed by code-reviewer-codex on 2026-04-07*
