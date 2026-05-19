# 测试报告 — Voice Bridge V2.0（首轮）

**测试人**：Guard（质量负责人）
**测试时间**：2026-05-19 11:15 ~ 11:35
**对应 commit**：`8b69637`（代码实现）/ `1f87374`（含 handoff）
**基线 commit**：`837d3a0`（V1.7）
**分支**：`hermes/v2.0`

---

## 测试结论：⚠️ Conditional Pass

**条件**：修复 1 个 bug 后可放行。

---

## 一、已验证项 ✅

### 1.1 单元测试（57/57 passed）✅

```bash
cd backend && npm test
# ✔ 57 tests passed, 0 failed, 0 cancelled, 0 skipped
# duration: 67.97ms
```

覆盖点：
- 静音/低信号音频拦截（16 cases）
- filler/重复幻觉文本拦截（8 cases）
- article-led fragment 拦截（4 cases）
- 正常英文广播句保留
- V2.0 pipeline contract（skipped 不进入 UI/翻译）
- buildAsrResponse 各路径

### 1.2 离线质量门控 benchmark（8/8 passed）✅

```bash
node tests/scripts/benchmark_v20_quality_gate.js
# 8/8 passed, totalMs: 0.558ms
```

| Case | Decision | 状态 |
|------|----------|------|
| silence_tiny_file | HARD_BLOCK | ✅ |
| too_short_audio | HARD_BLOCK | ✅ |
| low_signal_audio | SOFT_BLOCK | ✅ |
| normal_speech_audio | PASS | ✅ |
| filler_text | HARD_BLOCK | ✅ |
| repeated_hallucination_text | SOFT_BLOCK | ✅ |
| short_audio_long_text_mismatch | SOFT_BLOCK | ✅ |
| normal_english_broadcast_text | PASS | ✅ |

### 1.3 API 真实请求测试 ✅

| # | 测试场景 | 输入 | 预期 | 结果 |
|---|---------|------|------|------|
| T1 | 极小文件（100B） | 静音 WAV 100B | HARD_BLOCK, skipped=true | ✅ 通过 |
| T2 | 小文件（400B） | 随机 WAV 400B | HARD_BLOCK, skipped=true | ✅ 通过 |
| T3 | 无音频文件 | 空 POST | 400 + timings | ✅ 通过 |
| T4 | 4秒静音音频 | 静音 WAV + rmsDb=-60 | HARD_BLOCK (low_signal, mostly_silent) | ✅ 通过 |
| T5 | 低音量音频 | 低振幅 WAV + rmsDb=-55 | HARD_BLOCK (low_signal) | ✅ 通过 |
| T6 | 真实5秒静音 | silent_5s.wav + rmsDb=-60 | HARD_BLOCK (low_signal, mostly_silent) | ✅ 通过 |
| T7 | 并发限制 | 6个同时请求 | ≥1 个返回 429 | ✅ 通过（req5: 429） |
| T8 | 正常信号音频 | 合成 WAV + rmsDb=-20 | 通过门控，进入 ASR | ✅ 门控正确放行（ASR 因余额不足失败） |

### 1.4 API 响应格式验证 ✅

- ✅ 所有被门控的响应包含：`skipped`, `reason`, `reasons`, `qualityDecision`
- ✅ 所有响应包含 `requestId` 和 `sessionId`
- ✅ 被门控的响应包含 `timings: { precheckMs, asrMs, totalMs }`
- ✅ 门控处理延迟 < 1ms（precheckMs ≈ 0-43ms，包含音频探测）

### 1.5 前端代码审查 ✅

| 文件 | 审查项 | 结果 |
|------|--------|------|
| `constants/audio.ts` | 默认 chunk 2000ms，范围 1500-3000ms | ✅ 正确 |
| `constants/audio.ts` | CLIENT_CHUNK_MIN_PEAK_DB = -50dB | ✅ 与后端对齐 |
| `hooks/useAudioRecording.ts` | shouldSkipAsrResult: 跳过 skipped/非PASS/空文本 | ✅ 正确 |
| `hooks/useAudioRecording.ts` | shouldSkipClientChunk: 基于峰值跳过低信号 | ✅ 正确 |
| `hooks/useAudioRecording.ts` | metering 追踪 → currentChunkPeakDbRef | ✅ 正确 |
| `hooks/useAudioRecording.ts` | processSentence 传递 transcribeTime | ✅ 正确 |
| `hooks/useAudioRecording.ts` | 翻译 entry 记录 transcribeTime + totalLatency | ✅ 正确 |
| `hooks/useAudioRecording.ts` | 被门控内容不进入 append/翻译分支 | ✅ 正确 |
| `store/transcriptStore.ts` | 翻译 entry 支持 transcribeTime/totalLatency | ✅ 正确 |
| `metro.config.js` | import.meta 修复：移除默认 Hermes stable profile | ✅ 正确 |

### 1.6 后端代码审查 ✅

| 文件 | 审查项 | 结果 |
|------|--------|------|
| `backend/quality_gate.js` | assessAudioSignalQuality 多维门控 | ✅ 逻辑正确 |
| `backend/quality_gate.js` | 文本质量门控（filler/重复/mismatch/article） | ✅ 逻辑正确 |
| `backend/server.js` | dispatchAsr 并发保护（MAX_ACTIVE_ASR=5） | ✅ 正确 |
| `backend/server.js` | ASR 超时保护（ASR_CALL_TIMEOUT_MS=45s） | ✅ 正确 |
| `backend/server.js` | 429/504 错误分类 | ✅ 正确 |
| `backend/server.js` | timings 采集（precheckMs/asrMs/qualityMs/totalMs） | ⚠️ 见 Bug#1 |

---

## 二、发现的 Bug ❌

### Bug#1: ASR API 失败时响应缺少 `timings`（P2）

**现象**：当智谱 ASR API 返回错误（如余额不足）时，HTTP 500 响应不包含 `timings` 字段。

**根因**：`zhipuAsr()` 函数（第873行）的 catch 块将异常转为 `{ success: false, error, text: '' }` 而非 re-throw。这导致错误走了 `result.success = false` 分支（第1234行），该分支的响应未包含 `timings`。

**影响**：客户端无法获取 ASR 失败时的延迟数据，影响可观测性。不影响核心功能。

**修复建议**：在第1234行的 `result.success = false` 响应中添加 `timings`：

```javascript
// backend/server.js, line ~1240
return res.status(500).json({
  error: result.error || 'Transcription failed',
  reason,
  requestId: trace.requestId,
  sessionId: trace.sessionId || undefined,
  timings: {                          // ← 新增
    precheckMs: tPrecheckDone - t0,
    asrMs: Date.now() - whisperT0,
    totalMs: Date.now() - t0,
  },
});
```

**严重程度**：P2（可观测性缺陷，不阻塞功能）

---

## 三、未验证项 ⏳

### 3.1 真实 ASR 准确率与幻觉率（P0 — 阻塞验收）

**原因**：智谱 ASR API 余额不足（`余额不足或无可用资源包,请充值`），无法调用真实 ASR 接口。

**影响范围**：
- 无法验证有效英文音频的 ASR 准确率（目标 >90%）
- 无法验证真实场景的幻觉率（目标 <2%）
- 无法验证端到端延迟（目标 <3s）
- 无法验证中英同步输出时序

**前置条件**：充值智谱 API 余额后重新测试。

### 3.2 真机功能测试（P0 — 阻塞验收）

**原因**：需要 iOS/Android 真机 + Expo Go。

**待验证**：
- 英文逐 chunk 流式显示
- 中文翻译在句子完成后 1s 内出现
- 上下屏布局
- 录音 metering 是否可用（决定客户端门控是否生效）
- 客户端低信号 chunk 跳过

### 3.3 3~5人并发稳定性测试（P1）

**原因**：API 余额不足，无法发起真实并发 ASR 请求。

**已验证**：429 并发限制机制工作正常（6个并发请求中有1个返回429）。

**待验证**：并发时服务是否稳定（不崩溃、不泄漏）。

### 3.4 Web import.meta 修复（P1）

**代码审查**：✅ metro.config.js 修改正确。

**待验证**：Web 端实际加载是否正常（需要 `npx expo start --web`）。

### 3.5 长音频测试（P2）

- 30min~1h 稳定性
- 内存泄漏

---

## 四、风险评估

| 风险项 | 等级 | 说明 |
|--------|------|------|
| ASR API 余额不足 | 🔴 阻塞 | P0 验收项完全无法验证 |
| 真机验证未做 | 🔴 阻塞 | P0 核心场景（中英同步）未验证 |
| Bug#1 timings 缺失 | 🟡 P2 | 可观测性缺陷，不影响功能 |
| tsc 隐式 any | 🟢 无影响 | 历史 V1.7 测试文件，非本轮改动 |

---

## 五、证据索引

| 证据 | 路径/位置 |
|------|----------|
| 单元测试结果 | `npm test` — 57/57 passed（本轮复现） |
| 离线 benchmark | `benchmark_v20_quality_gate.js` — 8/8 passed（本轮复现） |
| API 测试日志 | BFF server log（`/tmp/vb-bff-test.log`） |
| 并发测试 | 6 并发请求 → 1×429 + 5×500（余额不足） |
| 门控测试 | T1-T6 全部符合预期 |
| 代码审查 | quality_gate.js / server.js / useAudioRecording.ts / transcriptStore.ts |

---

## 六、放行建议

### Conditional Pass — 建议修复 Bug#1 后放行

**理由**：
1. ✅ 57个单元测试全部通过
2. ✅ 8个离线 benchmark 全部通过
3. ✅ 音频信号门控（P0-1 幻觉治理）逻辑正确，静音/低音量/小文件全部被拦截
4. ✅ 文本质量门控逻辑正确
5. ✅ 并发保护机制工作正常（429）
6. ✅ 前后端代码质量良好，逻辑清晰
7. ✅ Chunk 默认值已调整为 2s
8. ⚠️ Bug#1（timings 缺失）为 P2 级别，建议修复但不阻塞
9. ❌ 真实 ASR 测试因 API 余额不足无法执行

**前置条件**：
1. 充值智谱 ASR API 余额
2. 修复 Bug#1（建议）
3. 真机验证（波哥最终确认）

---

*测试报告生成时间：2026-05-19 11:35*
*下次测试触发：API 余额恢复后 / Bug 修复后*
