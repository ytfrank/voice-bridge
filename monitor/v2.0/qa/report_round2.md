# 测试报告 — Voice Bridge V2.0 Round2（Blocking Fix 验证）

**测试人**：Guard（质量负责人）
**测试时间**：2026-06-08 14:57 ~ 15:00
**对应 commit**：`c589692`（代码修复）/ `5880033`（提测提交）
**基线 commit**：`9cb8d49`（Deepgram Nova-3 集成）
**分支**：`hermes/v2.0`
**轮次**：Round2 — 静音5s empty_transcript blocking fix

---

## 测试结论：✅ Pass

**理由**：Round1唯一blocking issue已修复验证通过，回归测试全部通过。

---

## 一、已验证项 ✅

### 1.1 单元测试（58/58 passed）✅

```
✔ 58 tests passed, 0 failed
duration: 70.09ms
```

**Round2新增测试**：
- `V2.0 Deepgram contract: empty transcript is a skipped response, not ASR failure` ✅

### 1.2 静音5s → skipped=true / HTTP 200 ✅

| 检查项 | 预期 | 实际 | 结果 |
|--------|------|------|------|
| HTTP状态码 | 200 | 200 | ✅ |
| `skipped` | true | true | ✅ |
| `text` | 空字符串 | "" | ✅ |
| `reason` | empty_transcript | "empty_transcript" | ✅ |
| `reasons` 包含 | empty_transcript | ["empty_text", "empty_transcript"] | ✅ |
| `qualityDecision` | HARD_BLOCK | "HARD_BLOCK" | ✅ |
| `timings` 存在 | 有完整timings | precheckMs:48, asrMs:9286, totalMs:9334 | ✅ |
| `asr.metadata.emptyReason` | empty_transcript | "empty_transcript" | ✅ |
| `asr.metadata.provider` | deepgram | "deepgram" | ✅ |

**BFF日志确认**：
```
ℹ️ [ASR] Deepgram Nova-3 done (9285ms) {"textLen":0,"text":""}
⚠️ [ASR] Filtered low-quality transcription ... "reason":"empty_transcript"
ℹ️ [HTTP] POST /api/transcribe → 200 (9339ms)
```

### 1.3 极小文件（音频前置门控回归）✅

| 检查项 | 预期 | 实际 | 结果 |
|--------|------|------|------|
| HTTP状态码 | 200 | 200 | ✅ |
| `skipped` | true | true | ✅ |
| `reason` | audio_too_short | "audio_too_short" | ✅ |
| `asrMs` | 0（未调ASR） | 0 | ✅ |

### 1.4 空POST请求（错误分支回归）✅

| 检查项 | 预期 | 实际 | 结果 |
|--------|------|------|------|
| HTTP状态码 | 400 | 400 | ✅ |
| `error` | No audio file provided | "No audio file provided" | ✅ |
| `timings` 存在 | 有 | precheckMs:0, asrMs:0, totalMs:0 | ✅ |

### 1.5 代码修复 Diff 审查 ✅

**修复前**：
```javascript
return {
  success: text.length > 0,  // 空文本 → success:false → 走错误分支 → 500
  text,
  metadata: { provider: 'deepgram', model: 'nova-3', asrMs: elapsed },
};
```

**修复后**：
```javascript
const metadata = { provider: 'deepgram', model: 'nova-3', asrMs: elapsed };
if (!text) metadata.emptyReason = 'empty_transcript';
return { success: true, text, metadata };  // 空文本 → success:true → 走正常路径 → skipped=true
```

**审查结论**：
- ✅ Deepgram HTTP 200 + 空 transcript → `success: true`，走正常 `buildAsrResponse()` 路径
- ✅ 空 transcript 时保留 `emptyReason: 'empty_transcript'` 作为可追溯标记
- ✅ Deepgram HTTP 错误（非200）仍走 catch 分支 → `success: false` → 500（正确行为不变）
- ✅ 修复最小化，未改动音频前置门控或其他逻辑
- ✅ `.env` 已补充 `DEEPGRAM_API_KEY`

### 1.6 前端 skipped 逻辑审查 ✅

**`shouldSkipAsrResult()` 三层守卫**：

| 层 | 条件 | 结果 |
|----|------|------|
| 1 | `result.skipped === true` | skip=true，不进入append/翻译 |
| 2 | `qualityDecision !== 'PASS'` | skip=true，不进入append/翻译 |
| 3 | `!text`（空文本） | skip=true，不进入append/翻译 |

**关键代码**（line 413-434）：
```typescript
if (asrGuard.skip) {
  // Skipped/blocked backend results must not enter subtitle or translation UI.
  analytics.track('asr_result', { skipped: true, reason: asrGuard.reason, ... });
  if (sm.isRecording()) setPipelineStatus('listening');
  return;  // ← 直接return，不append也不翻译
}
```

**审查结论**：
- ✅ 后端返回 `skipped: true` → 前端 `shouldSkipAsrResult()` 捕获 → 直接 return
- ✅ 不进入英文字幕 append
- ✅ 不触发中文翻译
- ✅ 仅记录 analytics 事件（有trace）

---

## 二、回归验证 ✅

| Round1 测试项 | Round2 结果 |
|--------------|-------------|
| 57个单元测试 → 58个（+1新增）| ✅ 全通过 |
| 音频前置门控（tiny/too_short/low_signal）| ✅ 3a验证通过 |
| 空 POST 400 | ✅ 3b验证通过 |
| 离线 benchmark（8/8）| 覆盖在58个单测中 ✅ |
| 前端 skipped 逻辑 | 代码审查确认无变化 ✅ |

---

## 三、未验证项 ⏳

| 项 | 原因 | 风险等级 |
|----|------|---------|
| 真实英文音频 ASR 准确率 | 需真机+真实语音 | P0 阻塞验收（既有） |
| 真机E2E全链路 | 需 iOS/Android 真机 | P0 阻塞验收（既有） |
| Deepgram 错误分支（真实429/5xx） | Deepgram余额充足，无法触发 | P2 低风险 |

---

## 四、风险评估

| 风险项 | 等级 | 说明 |
|--------|------|------|
| 真实ASR准确率/延迟 | 🔴 阻塞 | 既有未解决项 |
| 真机E2E | 🔴 阻塞 | 既有未解决项 |
| Round2 修复引入回归 | 🟢 已排除 | 58/58通过+API实测 |

**Round2 新增风险**：无

---

## 五、证据索引

| 证据 | 内容 |
|------|------|
| 单测输出 | 58/58 pass，duration 70ms |
| API测试：静音5s | HTTP 200, skipped=true, reason=empty_transcript, timings完整 |
| API测试：极小文件 | HTTP 200, skipped=true, reason=audio_too_short, asrMs=0 |
| API测试：空POST | HTTP 400, error=No audio file provided |
| BFF日志 | Deepgram done → Filtered low-quality → HTTP 200 |
| 代码Diff | c589692: success:true + emptyReason |
| 前端代码审查 | shouldSkipAsrResult 三层守卫，skip时直接return |

---

## 六、放行建议

### ✅ Pass — Round2 blocking issue 已修复验证

**理由**：
1. ✅ 静音5s Deepgram空transcript不再返回500，正确返回 skipped=true
2. ✅ 58/58 单测全部通过（含新增 Deepgram empty transcript 契约测试）
3. ✅ 音频前置门控回归无退化
4. ✅ 前端 skipped 逻辑确认：不展示不翻译
5. ✅ 修复最小化，代码质量良好

**遗留阻塞项**（与Round1相同，非Round2引入）：
- 真实ASR准确率验证（需真机）
- 真机E2E全链路（需设备）

---

*测试报告生成时间：2026-06-08 15:00*
