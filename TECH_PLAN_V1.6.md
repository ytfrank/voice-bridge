# 技术方案 — voice-bridge V1.6

**编写人**: Peter（Tech Lead）
**日期**: 2026-04-01
**状态**: 待确认

---

## 一、需求范围确认

基于 `REQUIREMENTS_V1.6_FINAL.md`，本版覆盖：

| 优先级 | 需求 | 技术方向 |
|--------|------|---------|
| P0 | 可观测性体系 | 前端埋点 + 后端结构化日志 + traceId 串联 |
| P1 | ASR 质量优化 | 分段策略 + 断句 + 去重 + 拼接 |
| P2 | 延迟优化 | 英文首屏优先 + 流式处理 + 串行拆解 |
| P3 | 错误修复 | 猪正 N1.5.x 管线遗留问题 |

---

## 二、当前架构分析

### 2.1 廍音链路全景

```
用户操作 → 前端录音 → chunk (5s) → BFF → Whisper ASR → GLM-4-Flash 独立翻译 → 前端展示
```

### 2.2 网延迟瓶颈分析

当前延迟链路：

| 箵道 | 耗时 | 说明 |
|-------|------|------|
| 录音 chunk | 5000ms | `CHUNK_DURATION_MS = 5000`（固定） |
| 上传 BFF | ~200ms | 硬件资源有限 |
| Whisper ASR | 2000-3000ms | 本地模型，`base`） |
| 等句子结束 | ~不定 | 静音检测 / 标点检测 |
| GLM-4-Flash 翻译 | 3000-5000ms | 远程 API |
| **总延迟** | **~9-12s** | **波哥实测 6-8s** |

### 2.3 瑞有日志能力

项目已有一个 `PipelineLogger`（`utils/pipelineLogger.ts`），它优点是**有事件模型、 支持按 segment 追踪**，缺点是**仅前端本地、 不持久化、 不关联后端**。

---

## 三、P0 可观测性体系设计

### 3.1 设计原则

1. **结构化**：所有日志 JSON 格式，2. **可关联**：前后端统一 `sessionId` + `requestId`
3. **可开关**：日志级别可配， 不影响性能
4. **可持久**：前端本地缓存 + 批量上传； 后端写文件

### 3.2 前端埋点方案

#### 新建文件：`services/analyticsService.ts`

统一埋点服务，负责：
- 事件采集
- 本地缓存（最多 100 条）
- 批量上传到 BFF `/api/logs`
- 会话生命周期管理

#### 埋点事件清单

| 事件名 | 触发时机 | 记录字段 |
|--------|---------|---------|
| `app_enter` | 进入首页 | timestamp, sessionId, deviceInfo、 appVersion |
| `recording_start` | 点击开始录音 | timestamp, sessionId, audioConfig |
| `chunk_generated` | 录音 chunk 生成 | timestamp, sessionId, segmentId, chunkSize |
| `chunk_uploaded` | chunk 上传完成 | timestamp, sessionId, segmentId, httpStatus, uploadMs |
| `asr_result` | 收到 ASR 结果 | timestamp, sessionId, segmentId, text, asrMs |
| `asr_error` | ASR 报错 | timestamp, sessionId, segmentId, error |
| `translate_result` | 收到翻译结果 | timestamp, sessionId, segmentId, text, translateMs |
| `translate_error` | 翻译报错 | timestamp, sessionId, segmentId, error |
| `transcript_display` | 前端展示文本更新 | timestamp, sessionId, lineId |
| `export` | 用户导出 | timestamp, sessionId, format, contentLength |
| `error` | 任何错误 | timestamp, sessionId, errorType, errorMessage, context |
| `session_end` | 用户退出/停止 | timestamp, sessionId, sessionDuration |

#### 数据格式

```json
{
  "timestamp": 1712000000000,
  "sessionId": "sess_abc123",
  "requestId": "req_seg1_001",
  "event": "chunk_uploaded",
  "payload": {
    "segmentId": 3,
    "httpStatus": 200,
    "uploadMs": 180
  }
}
```

#### 修改文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `services/analyticsService.ts` | 新建 | 统一埋点服务 |
| `hooks/useAudioRecording.ts` | 修改 | 在关键节点调用 analytics |
| `app/index.tsx` | 修改 | 页面进入/退出埋点 |
| `components/EnglishTranscript.tsx` | 修改 | 文本展示埋点 |
| `components/ChineseTranslation.tsx` | 修改 | 翻译展示埋点 |

### 3.3 后端日志方案

#### 改造：结构化日志中间件

基于现有 `backend/server.js` 里的 `log()` 函数，扩展为结构化日志：

```javascript
function structLog(level, step, data) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,                              // 'info' | 'warn' | 'error'
    sessionId: data.sessionId || '-',
    requestId: data.reqId || '-',
    step,                               // 'asr_start' | 'asr_done' | 'translate_start' | ...
    payload: data,
    duration: data.duration || undefined
  };
  // 写文件
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  // 控制台也输出（开发用）
  console.log(`[${level}] [${step}]`, JSON.stringify(data));
}
```

#### 日志接收接口

新增 `POST /api/logs`：接收前端埋点批量上传。

```javascript
app.post('/api/logs', (req, res) => {
  const { sessionId, events } = req.body;
  events.forEach(e => structLog('info', `fe_${e.event}`, { ...e, sessionId }));
  res.json({ ok: true, count: events.length });
});
```

### 3.4 traceId 串联方案

#### 生成规则
- **sessionId**：用户进入 App 时生成，格式 `sess_{timestamp}_{random}`
- **requestId**：每个 API 请求生成，格式 `req_{timestamp}_{seq}`

#### 传递方式
- 前端：所有 API 请求 Header 带 `X-Session-Id`
- 后端：从 `req.headers['x-session-id']` 或 `req.body.sessionId` 读取
- 日志关联：grep `sessionId` 即可串出完整用户链路

### 3.5 日志存储

- **开发环境**：本地文件 `logs/app-YYYY-MM-DD.log`
- **生产环境**：同上（后续可迁移到远程日志服务）
- **日志轮转**：按天轮转， 保留最近 7 天

---

## 四、P1 ASR 质量优化

### 4.1 当前问题分析

| 问题 | 根因 | 修复方案 |
|------|------|---------|
| 句子中间截断 | chunk 固定 5s，ASR 在 chunk 边界截断 | 优化分段策略 |
| 重复翻译 | chunk 重叠区域被 ASR 两次识别 | 去重 |
| 翻译生硬 | 无上下文、单句翻译 | 加上下文翻译 |

### 4.2 分段策略优化

#### 当前问题
`CHUNK_DURATION_MS = 5000`（固定 5 秒），ASR 按固定边界切，导致句子在中间被截断。

#### 优化方案

1. **缩短 chunk 到 3 秒**（`CHUNK_DURATION_MS: 5000 → 3000`）
2. **加 chunk 重叠**：每个 chunk 与前一个 chunk 重叠 0.5 秒，避免单词被截断
3. **ASR 后处理**：合并重叠区域，去重
4. **静音检测优化**：当前 `PAUSE_THRESHOLD_MS = 800`，调整为动态阈值

#### 修改文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `constants/audio.ts` | 修改 | `CHUNK_DURATION_MS` 改为 3000 |
| `hooks/useAudioRecording.ts` | 修改 | cycleRecording 增加重叠逻辑 |
| `services/transcriptionService.ts` | 修改 | ASR 结果后处理：合并、去重 |
| `backend/server.js` | 修改 | 后端去重逻辑 |

### 4.3 去重方案

#### 前端去重
在 `processSentence` 中：
- 维护最近 N 条 ASR 文本的 hash
- 新文本与已有文本做相似度比较
- 相似度 > 80% 时判定为重复，跳过

#### 后端去重
在 Whisper 结果返回后：
- 与前一段结果做 tail overlap 检测
- 重叠部分只保留一次

### 4.4 翻译质量优化

#### 当前问题
`translateText` 单句翻译，无上下文。

#### 优化方案

1. **翻译时携带前 2 句作为上下文**
2. **优化 prompt**：增加"保持术语一致性"指令
3. **术语表**：高频词（如 Cognitive functions）建立固定翻译映射

---

## 五、P2 延迟优化

### 5.1 目标
从 6-8s → <2s（首屏英文字幕出现时间）

### 5.2 优化策略

#### 策略 A：英文首屏优先
- ASR 结果返回后**立即展示英文**
- 翻译**异步进行**，完成后追加显示
- 当前英文和中文是同步展示的，改为**英文先行**

#### 策略 B：流式翻译
- 后端 `/api/translate/stream` 已存在
- 改为流式返回翻译结果（SSE）
- 前端逐步追加翻译，不等整段完成

#### 策略 C：缩短 chunk
- chunk 从 5s → 3s
- 首个结果更快出现

### 5.3 延迟目标拆解

| 段落 | 当前 | 目标 | 手段 |
|-------|------|------|------|
| chunk 生成 | 5000ms | 3000ms | 缩短 chunk |
| 上传 | ~200ms | ~200ms | 不变 |
| Whisper ASR | 2000-3000ms | 2000-3000ms | 不变（本地模型） |
| 英文首屏 | **~7-8s** | **<3s** | ASR 后立即展示英文 |
| 翻译等待 | 3000-5000ms | 1000-2000ms | 流式翻译 |
| **总延迟（英文）** | **7-8s** | **<3s** | chunk 缩短 + 英文先行 |
| **总延迟（中文）** | **12-13s** | **<5s** | 流式翻译 |

---

## 六、P3 错误修复

### 6.1 已知遗留问题
1. Safari → Expo Go 跳转不稳定（V1.5.x 遗留）
2. 错误页面展示（截图中的错误）
3. `.env` URL 过期风险

### 6.2 修复方式
- 加固 Safari 跳转逻辑
- 统一错误页面组件
- `.env` 配置改为运行时动态获取

---

## 七、修改文件总览

| 文件 | 操作 | 优先级 |
|------|------|--------|
| `services/analyticsService.ts` | 新建 | P0 |
| `hooks/useAudioRecording.ts` | 修改 | P0+P1+P2 |
| `app/index.tsx` | 修改 | P0 |
| `components/EnglishTranscript.tsx` | 修改 | P0+P2 |
| `components/ChineseTranslation.tsx` | 修改 | P0+P2 |
| `constants/audio.ts` | 修改 | P1 |
| `services/transcriptionService.ts` | 修改 | P1 |
| `services/translationService.ts` | 修改 | P1+P2 |
| `backend/server.js` | 修改 | P0+P1+P2 |
| `utils/pipelineLogger.ts` | 修改 | P0 |

---

## 八、风险点

1. **chunk 缩短可能降低 ASR 准确率** — 需 A/B 测试验证
2. **前端埋点批量上传可能影响弱网体验** — 控制频率，最大 30s 一次
3. **流式翻译需要前后端同步改造** — 改动面较大
4. **去重逻辑可能误删** — 需要设置合理的阈值

---

## 九、开发计划

### Phase 1：P0 可观测性（优先交付）
- 新建 `analyticsService.ts`
- 改造 `useAudioRecording.ts` 埋点
- 后端结构化日志 + `/api/logs` 接口
- traceId 串联
- 预计工作量：中等

### Phase 2：P1 ASR 质量
- 分段策略优化
- 去重逻辑
- 翻译 prompt 优化
- 预计工作量：中等

### Phase 3：P2 延迟优化
- 英文首屏优先
- 流式翻译
- chunk 缩短
- 预计工作量：较大

### Phase 4：P3 错误修复
- 遗留 bug 修复
- 预计工作量：小

---

*Peter · 2026-04-01*
