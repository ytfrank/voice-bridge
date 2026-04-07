# frontend-dev result

**产出时间**: 2026-04-07
**角色**: frontend-dev agent
**输入**: ORCHESTRATION_PLAN / TECH_PLAN / frontend-dev card / QA report / 仓库代码

---

## 1. 前端完成了哪些改动

> 当前阶段为**分析与任务收敛**，尚未 commit 代码。以下为基于代码现状和 v1.7 文档的分析结论和待办清单。

### 1.1 已确认：前端对 v1.7 后端结构化返回的消费已就绪

以下能力**已存在且可用**，无需额外改动即可承接 v1.7 后端质量门输出：

| 能力 | 实现位置 | 状态 |
|------|----------|------|
| 解析后端 `skipped` / `reason` 字段 | `services/transcriptionService.ts:81-101` | ✅ 已实现 |
| 空文本/被跳过结果不进入翻译 | `hooks/useAudioRecording.ts:317-343` | ✅ 已实现 |
| 前端二次质量守卫（翻译前拦截） | `hooks/useAudioRecording.ts:65-87` (`shouldSkipTranslation`) | ✅ 已实现 |
| 6-state pipeline 状态机 | `store/transcriptStore.ts:27`, `components/StatusIndicator.tsx` | ✅ 已实现 |
| 录音错误恢复 + 看门狗 + 后台/前台恢复 | `hooks/useAudioRecording.ts:391-426, 569-619` | ✅ 已实现 |
| 全链路 analytics (ASR/翻译延迟/跳过原因) | `services/analyticsService.ts`, hook 中多处 `analytics.track` | ✅ 已实现 |
| DebugPanel 实时日志 | `components/DebugPanel.tsx` | ✅ 已实现 |
| 前端填词集 `LOW_SIGNAL_FILLERS` | `constants/audio.ts:54-67` | ✅ 已实现 |

### 1.2 后端结构化返回的消费路径确认

```text
Backend /api/transcribe 返回:
  { text: "", skipped: true, reason: "high_no_speech_prob", reasons: [...], qualityDecision: "HARD_BLOCK" }

Frontend 消费路径:
  transcriptionService.ts → 解析 skipped/reason/text → 返回 TranscriptionResult
  useAudioRecording.ts:processChunk() → result.text 为空 → 记录 analytics → 不 appendTranscript → 继续 listening
  useAudioRecording.ts:processSentence() → shouldSkipTranslation() 二次守卫 → skip 时记 analytics → 不调用翻译
```

**结论**：v1.7 后端新增的 `skipped`/`reason`/`reasons[]`/`qualityDecision` 中，前端已正确消费 `skipped` 和 `reason`。`reasons[]` 和 `qualityDecision` 目前未解析，但不影响功能正确性。

### 1.3 需要做的改动（按优先级）

#### P0 — 确保前端与后端 v1.7 结构化返回对齐

1. **`reasons[]` 字段透传到 analytics 和 pipeline log**
   - 当前：`transcriptionService.ts` 只解析 `reason`（string），忽略 `reasons`（array）
   - 改动：`TranscriptionResult` 接口增加 `reasons?: string[]`，analytics 记录完整 reasons
   - 文件：`services/transcriptionService.ts`、`hooks/useAudioRecording.ts`
   - 理由：QA 报告 §7.1 指出 `reason` 与 `reasons[]` 是质量门核心输出，前端应完整记录

2. **DebugPanel 展示 skipped 原因**
   - 当前：pipeline log 记录了 `asr_empty`/`skipped`/`reason`，但 DebugPanel 未做高亮
   - 改动：在 pipeline log 展示时，对 `skipped=true` 的条目加特殊标记（如 `[SKIP]` 前缀 + 灰色）
   - 文件：`components/DebugPanel.tsx`
   - 理由：QA 复测时需确认前端是否收到并正确处理了 skip 结果

#### P1 — 前端质量守卫与后端质量门对齐

3. **扩展 `LOW_SIGNAL_FILLERS` 集合**
   - 当前：12 个 filler（oh/ah/uh/um/huh/mm/hmm/erm/uhh/oh./ah./hmm.）
   - 缺失：`you`（musk_21s.wav 的已知幻觉）、`so`、`well` 等常见低价值单 token
   - 改动：在 `constants/audio.ts` 中补充
   - 注意：即使前端不补，后端质量门已能拦截（`low_value_text`），前端只是增加一层冗余防护
   - 文件：`constants/audio.ts`

4. **翻译接口消费后端翻译质量门结果**
   - 当前：`translationService.ts` 只处理 `response.ok` / `!response.ok`
   - 后端已对低质量输入返回 `skipped`：`backend/server.js` `/api/translate` 有输入质量门
   - 改动：`TranslationResult` 增加 `skipped?`/`reason?`，翻译被跳过时 UI 显示提示
   - 文件：`services/translationService.ts`、`hooks/useAudioRecording.ts`

#### P2 — UX 优化（非阻塞）

5. **用户可见的"无语音"提示**
   - 当前：后端返回 skipped 时，用户看不到任何反馈，录音区继续显示"正在聆听..."
   - 可选方案：在 EnglishTranscript 中短暂显示灰色提示如 "[无语音输入]"，2s 后自动消失
   - 文件：`components/EnglishTranscript.tsx`、`store/transcriptStore.ts`

6. **`MIN_TRANSLATABLE_TEXT_LENGTH` 考虑提升**
   - 当前：3 字符（"You" = 3 字符，不会被 `too_short` 拦截）
   - 后端已通过 `low_value_text` 拦截，前端二次守卫此值保持 3 也可接受
   - 文件：`constants/audio.ts`

---

## 2. 涉及哪些文件

### 核心改动文件（P0/P1）

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `services/transcriptionService.ts` | 修改 | 增加 `reasons` 字段解析 |
| `hooks/useAudioRecording.ts` | 修改 | 透传 `reasons` 到 analytics/pipeline log |
| `constants/audio.ts` | 修改 | 扩展 `LOW_SIGNAL_FILLERS` 集合 |
| `components/DebugPanel.tsx` | 修改 | skipped 条目高亮 |

### 关联文件（可能涉及）

| 文件 | 关联原因 |
|------|----------|
| `store/transcriptStore.ts` | 如增加 skipped 提示，需扩展 store |
| `services/translationService.ts` | 翻译质量门消费 |
| `components/EnglishTranscript.tsx` | 可选：无语音提示 |
| `components/StatusIndicator.tsx` | 无改动，6-state 已覆盖 |

### 不需改动的文件

| 文件 | 原因 |
|------|------|
| `constants/api.ts` | API 端点未变 |
| `services/websocketService.ts` | 心跳逻辑未变 |
| `services/analyticsService.ts` | 已支持任意 payload，无需改 |
| `services/errorReporter.ts` | 已支持任意 context |
| `components/ChineseTranslation.tsx` | 翻译展示逻辑未变 |
| `components/VocabularySection.tsx` | 词汇展示逻辑未变 |
| `components/VocabularyCard.tsx` | 卡片展示逻辑未变 |
| `components/ControlButtons.tsx` | 启停逻辑未变 |
| `app/index.tsx` | 布局未变 |
| `app/history/*.tsx` | 历史页未变 |

---

## 3. 如何自测 / 冒烟验证

### 3.1 结构化返回消费验证（P0）

**前置**：确保 BFF 运行在最新 commit 上（`npm run bff:start`，`/health` 返回正确 `buildCommit`）

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 启动 app，打开 DebugPanel（三击右下角圆点） | DebugPanel 可见 |
| 2 | 点击"开始"录音 | 状态显示"正在聆听..." |
| 3 | 静默不说话 5s（等待一个 chunk 周期） | DebugPanel 出现 `asr_empty` 日志，带 `skipped=true` 和 `reason` |
| 4 | 说 "Hello, how are you today?" | 状态依次：聆听 → 识别中 → 翻译中 → 聆听；中文翻译出现 |
| 5 | 停止录音 | 状态回到"准备就绪" |

### 3.2 后端质量门消费验证

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 用 curl 发送 `musk_21s.wav` 到 `/api/transcribe` | 返回 `{ text: "", skipped: true, reason: "..." }` |
| 2 | 确认前端录音流程中，类似音频 chunk 不再出现幻觉文本 | DebugPanel 显示 `asr_empty`/`skipped` 而非幻觉文本 |
| 3 | 用 curl 发送 `oh.aiff` | 返回 `skipped=true`，前端无翻译输出 |

### 3.3 录音链路稳定性验证

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 连续 start/stop 10 次 | 无崩溃，每次状态正确恢复 |
| 2 | 录音中切到后台再切回 | 状态恢复"正在聆听..."，无卡死 |
| 3 | 录音超过 60s | chunk 正常循环，无 watchdog 触发 |

### 3.4 TypeScript 编译检查

```bash
npx tsc --noEmit
```

### 3.5 Lint 检查

```bash
npx eslint hooks/ services/ components/ constants/ store/ app/
```

---

## 4. 当前风险和未完成项

### 风险

| # | 风险 | 影响 | 缓解措施 |
|---|------|------|----------|
| R1 | 后端质量门未生效时，前端 `LOW_SIGNAL_FILLERS` 无法拦截 "You" 幻觉 | 用户看到错误翻译 | 后端已修复（`284c113` 后生效），前端二次守卫作为补充 |
| R2 | 前端未消费 `reasons[]`，无法在 analytics 中区分多原因跳过 | 线上问题排查信息不全 | P0 改动中已计划，风险可控 |
| R3 | 翻译接口 `/api/translate` 返回 skipped 时，前端仍显示"翻译失败" | 用户困惑 | P1 改动中已计划 |
| R4 | 真机 iOS 录音稳定性未经验证（QA report §9.2） | 生产环境可能异常 | 需真机实测闭环 |

### 未完成项

| # | 项目 | 优先级 | 依赖 |
|---|------|--------|------|
| T1 | `reasons[]` 字段解析 + analytics 透传 | P0 | 无 |
| T2 | DebugPanel skipped 高亮 | P0 | 无 |
| T3 | `LOW_SIGNAL_FILLERS` 扩展 | P1 | 无 |
| T4 | 翻译质量门结果消费 | P1 | backend-dev 确认翻译接口返回格式 |
| T5 | 用户可见"无语音"提示 | P2 | 需产品确认 UX 方案 |
| T6 | 真机冒烟验证 | P1 | 需物理设备 |

---

## 5. verify-runner 应关注什么

### 5.1 编译与静态检查

```bash
# TypeScript 无错误
npx tsc --noEmit

# ESLint 无新增 error
npx eslint hooks/ services/ components/ constants/ store/ app/
```

### 5.2 结构化返回消费冒烟

1. **后端返回 `skipped=true` 时，前端不崩溃、不显示幻觉文本**
   - 用 curl 构造 `{ text: "", skipped: true, reason: "high_no_speech_prob" }` 响应
   - 确认前端 processChunk 正确处理：analytics 记录、pipeline 状态回到 listening

2. **前端 `shouldSkipTranslation` 对 filler 文本正确拦截**
   - 输入 "Oh." → skip=true, reason="filler_only"
   - 输入 "You" → 当前不拦截（依赖后端），需确认后端已拦截
   - 输入 "a" → skip=true, reason="too_short"

3. **6-state pipeline 状态流转无死锁**
   - idle → listening → recognizing → translating → listening → idle
   - 任何状态下 error → retrying → listening 或 error → idle

### 5.3 关键文件行号参考

| 检查点 | 文件 | 行号 |
|--------|------|------|
| 后端响应解析 | `services/transcriptionService.ts` | 81-101 |
| 空结果处理 | `hooks/useAudioRecording.ts` | 317-343 |
| 翻译前质量守卫 | `hooks/useAudioRecording.ts` | 65-87, 162-185 |
| 状态机定义 | `store/transcriptStore.ts` | 27 |
| Filler 集合 | `constants/audio.ts` | 54-67 |
| 状态指示器 | `components/StatusIndicator.tsx` | 全文件 |

### 5.4 不需关注的项

- `constants/api.ts`：未改动
- `app/history/`：未改动
- `saveService.ts`、`errorReporter.ts`：未改动
- WebSocket 心跳逻辑：未改动

---

## 6. 前端对 v1.7 的就绪度判断

| 维度 | 就绪度 | 说明 |
|------|--------|------|
| 消费后端 `skipped/reason` | ✅ 就绪 | transcriptionService 已解析，hook 已消费 |
| 前端二次质量守卫 | ✅ 就绪 | shouldSkipTranslation 4 条规则已生效 |
| 录音启停异常态恢复 | ✅ 就绪 | 状态机 + 看门狗 + 后台恢复 |
| 交互状态用户可见 | ✅ 就绪 | 6-state StatusIndicator |
| `reasons[]` 完整消费 | ⚠️ 待改 | P0 项，不影响主流程 |
| 翻译质量门消费 | ⚠️ 待改 | P1 项，后端翻译接口已有输入质量门 |
| 真机稳定性 | ❌ 未验证 | QA report 明确要求真机实测 |

**总体判断**：前端核心链路已可承接 v1.7 后端质量门的结构化返回。P0 改动（`reasons[]` 解析 + DebugPanel 高亮）为可选增强，不阻塞 verify-runner 冒烟。真机稳定性为唯一未消除风险。

---

## 7. 需要的下游动作

1. **verify-runner**：执行 §3 冒烟验证 + §5 关注点
2. **backend-dev**：确认 `/api/translate` 在翻译输入质量门拦截时的返回格式（是否也返回 `skipped/reason`），以便前端 T4 对齐
3. **code-reviewer-claude**：关注前端消费结构化返回的边界条件（空 text + skipped=true 但 reason=undefined 等极端场景）
4. **Peter**：决策 T5（用户可见"无语音"提示）是否纳入 v1.7 Phase 1
