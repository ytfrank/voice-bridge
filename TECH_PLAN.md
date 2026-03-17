# 技术方案 — voice-bridge v2.0

**编写人：** Peter（Tech Lead）  
**日期：** 2026-03-17  
**状态：** 待确认（小叮当 + Guard）

---

## 需求1：UI 三区布局重构【P0】

### 现状分析
当前 `index.tsx` 是上下两分屏：
- 上半：`EnglishTranscript`（英文字幕）
- 下半：`ChineseTranslation`（中文翻译 + 内嵌生词 chips）

问题：生词 chips 嵌入翻译区，干扰阅读；无独立生词区域。

### 实现方案
将布局改为三区 + 底部控制栏：

```
┌─────────────────────┐
│  区域A：英文字幕      │ flex: 3
│  （逐句追加，自动滚动） │
├─────────────────────┤
│  区域B：中文翻译      │ flex: 3
│  （与英文对应，逐句）   │
├─────────────────────┤
│  区域C：生词/语法      │ flex: 2（可折叠）
│  （折叠状态显示摘要）   │
├─────────────────────┤
│  控制按钮栏           │ 固定高度
└─────────────────────┘
```

### 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `app/index.tsx` | 修改 | 三区布局，增加区域C |
| `components/ChineseTranslation.tsx` | 修改 | 移除生词 chips，只保留纯翻译文本 |
| `components/VocabularySection.tsx` | **新建** | 折叠式生词区，展开显示所有累积生词 |
| `components/VocabularyCard.tsx` | 保留 | 点击单个生词弹出详情卡片（复用） |
| `store/transcriptStore.ts` | 修改 | 增加 `allWords: VocabularyWord[]` 累积列表 + `isVocabExpanded` 状态 |

### 关键设计
- 区域C 默认折叠，显示生词数量摘要（如"📖 5个生词"），点击展开
- 展开后显示所有生词列表，点击单个生词弹出 `VocabularyCard` 详情
- 每次翻译返回新生词时，自动追加到 `allWords`
- 英文和中文按句对应：`transcriptLines[i]` 对应 `translations[i]`

### 风险点
- 三区在小屏 iPhone 上空间紧张 → 折叠态只占 ~40px，可控
- 英中对应可能因异步翻译导致错位 → 翻译完成前显示占位符

---

## 需求2：延迟优化【P1】

### 现状分析
当前延迟链路：
```
录音 chunk（2.5s）→ 上传 BFF → local Whisper 转写（~2-3s）→ 返回文本
→ 积累到句子结束 → 调 GLM-4-Flash 翻译（~3-5s）→ 返回翻译
```
总延迟 = 2.5（chunk）+ 2-3（ASR）+ 等句子 + 3-5（翻译）≈ 9-12s

### 优化方案

#### A. ASR 端优化
**方案：缩短 chunk 时间 + 并行处理**
- 将 `CHUNK_DURATION_MS` 从 2500ms 降到 1500ms
- chunk 上传和处理异步并行，不等上一个完成
- BFF 端增加请求队列，避免 Whisper 并发冲突

**备选方案（如果延迟仍不够）：** 接入智谱实时 ASR API（WebSocket 流式），完全替代 local Whisper。但这增加 API 成本和依赖，暂不作为首选。

#### B. 翻译端优化
**方案：流式翻译 + 不等完整句子**
- 前端使用 `EventSource`/SSE 连接 `/api/translate/stream`（已有端点）
- 部分句子也触发翻译（不等句号），降低等待时间
- 翻译结果流式显示，逐字/逐词渲染

#### C. 并行流水线
- ASR 返回文本后立即触发翻译，不等句子边界
- 用 debounce（800ms 无新文本）作为句子分割依据
- 翻译和 ASR 并行：前一句翻译的同时，下一段 ASR 在处理

### 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `constants/audio.ts` | 修改 | `CHUNK_DURATION_MS` 2500→1500，调整 `PAUSE_THRESHOLD_MS` |
| `hooks/useAudioRecording.ts` | 修改 | 并行 chunk 处理，debounce 句子分割替代正则 |
| `services/translationService.ts` | 修改 | 新增 `translateTextStream()` 方法，使用 SSE |
| `components/ChineseTranslation.tsx` | 修改 | 支持流式文本渲染（逐字出现） |
| `store/transcriptStore.ts` | 修改 | 增加 `streamingTranslation` 状态 |
| `backend/server.js` | 修改 | 增加 Whisper 请求队列，防并发冲突 |

### 预期效果
- ASR 延迟：2.5s → 1.5s（chunk）+ 2s（Whisper）= 3.5s
- 翻译延迟：不等句子完成 + 流式输出 → 首字 ~1s
- 总体感知延迟：≤ 3s（从说话到看到翻译首字）

### 风险点
- chunk 太短 Whisper 准确率下降 → 需实测 1.5s 效果，不行就回退 2s
- 部分句子翻译质量可能不如完整句子 → 后续翻译会"修正"
- Whisper 并发队列需要防止内存溢出

---

## 需求3：历史记录功能【P1】

### 现状分析
`saveService.ts` 已有保存/列表功能，但前端无历史页面。

### 实现方案

新增两个页面（使用 expo-router）：

```
app/
  index.tsx          # 主录音页
  _layout.tsx        # 布局（已有）
  history/
    index.tsx        # 历史列表页（新建）
    [id].tsx         # 历史详情页（新建）
```

#### 历史列表页
- 显示所有保存的 session 文件
- 每行：日期时间 + 句子数量预览
- 点击进入详情
- 空状态提示

#### 历史详情页
- 上下分屏显示英文 + 中文
- 生词列表
- 返回按钮

### 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `app/history/index.tsx` | **新建** | 历史列表页 |
| `app/history/[id].tsx` | **新建** | 历史详情页 |
| `app/index.tsx` | 修改 | 底部控制栏增加"历史"按钮 |
| `components/ControlButtons.tsx` | 修改 | 增加"📋 历史"按钮 |
| `services/saveService.ts` | 修改 | 增加 `loadSession(filename)` 和 `deleteSession(filename)` 方法 |

### 风险点
- expo-router 页面跳转需确认 Expo Go 兼容性
- 大量历史文件时列表性能 → 分页加载（后续优化）

---

## 需求4：Bug 修复【P0】

### 现状
需求文档提到波哥截图中有 Bug，需要获取截图确认具体问题。

### 行动项
- [ ] 向波哥获取 Bug 截图
- [ ] 分析 Bug 根因
- [ ] 补充修复方案到本文档

---

## 开发分工与排期

| 优先级 | 需求 | 预估工作量 | 开发方式 |
|--------|------|-----------|---------|
| P0 | 需求4：Bug修复 | 视截图而定 | Peter 直接修 |
| P0 | 需求1：UI三区布局 | 中 | Sub-Agent（Claude Code） |
| P1 | 需求2：延迟优化 | 大 | Sub-Agent（Codex - backend, Claude Code - frontend） |
| P1 | 需求3：历史记录 | 中 | Sub-Agent（Claude Code） |

### 开发顺序
1. 先修 Bug（需求4）— 等截图
2. UI 三区布局（需求1）— 不依赖其他需求
3. 延迟优化（需求2）— 改动最大，放中间
4. 历史记录（需求3）— 相对独立，最后做

### 总预估
- 需求1 + 3：可并行，约 1-2 小时
- 需求2：约 2-3 小时（含 BFF 改造 + 前端适配 + 调优）
- 需求4：视 Bug 复杂度

---

## 待确认事项

1. **需求2**：如果 1.5s chunk 的 Whisper 准确率不够，是否接受切换到智谱云端 ASR API？（会增加 API 成本）
2. **需求3**：历史详情页是否需要"继续录音"功能？还是只读查看？
3. **需求4**：等波哥截图

---

*请小叮当和 Guard 确认后，我开始开发。*
