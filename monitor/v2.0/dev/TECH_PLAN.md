# TECH_PLAN.md — Voice Bridge V2.0

## 0. 当前判断

V2.0 的主矛盾不是 UI，而是 **音频质量门控 + ASR结果可信度 + 翻译触发时机**。在智谱 GLM-ASR-2512 未确认支持真正流式 ASR 的前提下，首轮采用可落地的生产级折中：

1. **先拦截不该送 ASR 的音频**：客户端缩短 chunk，服务端做文件大小/时长/能量/文本质量多层门禁。
2. **再过滤不可信 ASR 输出**：低音量、短碎片、重复、低价值 filler、文本/音频不匹配一律不进入字幕和翻译。
3. **最后做准实时流水线**：英文 chunk 一返回即显示；句子边界或短暂停顿触发中文翻译，目标英文句子完成后 1s 内出中文。

若后续确认 ASR API 支持 WebSocket/流式，再替换 ASR provider；本轮不赌不可验证能力。

## 1. P0 技术方案

### P0-1 ASR 幻觉治理

改动范围：
- `constants/audio.ts`
- `hooks/useAudioRecording.ts`
- `backend/quality_gate.js`
- `backend/server.js`
- `backend/__tests__/quality_gate.test.js`
- 新增/更新基准脚本与测试数据报告

方案：
- 客户端默认 chunk 从 5s 下调到 2s（允许 env 配置 1500~3000ms）。
- 客户端录音阶段持续采样 metering：低于阈值的 chunk 不上传。
- 服务端增加音频信号门控：
  - 过小文件直接 `skipped=true`；
  - 可解析时长低于阈值直接跳过；
  - 添加可测试的 `assessAudioSignalQuality(metadata)`，对 `durationSec/fileSize/estimatedBytesPerSecond/rmsDb/silentRatio` 做判定。
- ASR文本后处理增强：
  - 低价值 filler、1 token、重复句、短音频长文本、article-led fragment 全部 block；
  - 返回 `qualityDecision/reasons/skipped`，客户端不显示 skipped 文本。

验收：
- 安静/低音量样本：零输出。
- 已知有效英文样本：正常输出。
- 单测覆盖静音、短碎片、正常短句、重复文本、文本音频不匹配。

### P0-2 延迟 < 3 秒

改动范围：
- `constants/audio.ts`
- `hooks/useAudioRecording.ts`
- `services/transcriptionService.ts`
- `services/translationService.ts`
- `utils/orderedChunkQueue.ts`
- `backend/server.js`

方案：
- chunk 默认 2s，网络/ASR/翻译分别打点。
- BFF 响应中返回 `timings`，用于前后对比。
- 客户端收到英文结果后立即进入 UI 和翻译队列，不等后续 chunk。
- 翻译触发条件：句末标点、长度阈值、或 pause flush。
- 翻译请求加超时和去重，避免堆积。

验收：
- 短/中音频 E2E 延迟 < 3s 或明确列出 API 外部耗时瓶颈。
- SUBMISSION 写入前后对比表。

### P0-3 中英文同步输出

改动范围：
- `store/transcriptStore.ts`
- `components/EnglishTranscript.tsx`
- `components/ChineseTranslation.tsx`
- `services/transcriptionService.ts`
- `services/translationService.ts`
- `hooks/useAudioRecording.ts`

方案：
- 英文：ASR chunk 通过后立即 append，句子完成后 commit 到 transcriptLines。
- 中文：句子完成即触发翻译，先创建 pending translation entry，再用完整结果更新。
- 保持上半屏英文、下半屏中文布局。

验收：
- 英文句子完成后 1s 内看到中文 entry 更新（不含外部 API 超时）。
- skipped ASR 不进入翻译。

## 2. P1 顺手项

- Web App import.meta：先定位 Expo SDK 54 下具体报错；若为环境变量访问，替换为 `process.env.EXPO_PUBLIC_*` 或安全 wrapper。
- 并发 3~5人：BFF 增加简单并发队列/超时/429 保护，避免崩溃。

## 3. 开发编排

本次拆分：是。

计划启动 subagent：3 个
1. Test Writer：补 P0 单测和基准脚本。
2. Backend Dev：实现音频/文本质量门控、timings、并发保护。
3. Frontend Dev：实现短 chunk、低音量跳过、翻译触发同步、Web import.meta 检查。

实际已启动：待启动
当前活跃：待启动

## 4. 验证门禁

必跑：
- `npm test`
- `npm run lint`（若历史 lint 存在旧问题，记录并限定新增问题）
- BFF smoke：`/health`、`/api/transcribe` 静音/有效样本、`/api/translate`
- 延迟 benchmark：短/中样本记录 p50/p95 或至少 3 次均值

## 5. 风险与降级

- 真流式 ASR 不确定：首轮用 2s chunk + pipeline 交付。
- 外放广播噪音不可完全靠后处理解决：先用门控降低幻觉，再通过真机样本迭代阈值。
- 仓库已有大量历史未跟踪文件和 v1.7 脏变更：本轮只提交 V2.0 必要文件，避免污染 commit。

## 6. ETA

- 首轮实现 + 单测：2~3小时
- 自测数据 + SUBMISSION：当天内
