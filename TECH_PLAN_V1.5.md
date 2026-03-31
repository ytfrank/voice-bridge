# 技术方案 — voice-bridge V1.5（生产级可用）

> **作者**: Peter (研发主管)
> **日期**: 2026-03-28
> **状态**: 待确认

---

## 一、现状分析

### 当前架构

```
[iOS App (Expo)]
    │ 5s 音频块 HTTP POST
    ▼
[BFF (server.js, Node)]
    │ spawn child process
    ▼
[local_whisper.py (faster-whisper base)]
    │ JSON stdout
    ▼
[BFF 返回文本]
    │
[App 调用 /api/translate]
    │ HTTP POST
    ▼
[BFF → Zhipu GLM-4-flash]
    │
[App 显示翻译]
```

### 关键问题

| 问题 | 根因 | 影响 |
|------|------|------|
| 5分钟后崩溃 | 无进程守护、无全局异常捕获、/tmp 文件堆积 | P0 |
| HTTP 530 崩溃 | Cloudflare Tunnel 偶发错误，无自动恢复 | P0 |
| 来电后录音不恢复 | 无 iOS AudioSession 中断监听 | P0 |
| ASR 准确率 ~80% | 使用 base 模型（74M 参数） | P1 |
| 翻译跳动 | 已有句子缓冲区，但碎片仍有跳动 | P1 |

### 现有优势（不需要重写）

- ✅ `local_whisper.py` 已使用 faster-whisper，切模型只需改环境变量
- ✅ 句子缓冲区已实现（标点检测 + 800ms 静音检测）
- ✅ 有序 chunk 队列（OrderedChunkQueue）已实现
- ✅ 录音状态机（RecordingStateMachine）已实现
- ✅ 结构化日志系统已就绪
- ✅ 流式翻译已实现（translateTextStream）

---

## 二、V1.5 架构设计

### 目标架构

```
[iOS App (Expo)]
    │ 5s 音频块 HTTP POST（保持不变）
    │ + WebSocket 心跳保活（新增）
    ▼
[PM2 守护]
  └─[BFF (server.js)]
       │ spawn child process
       ▼
     [local_whisper.py (faster-whisper medium)]  ← 模型升级
       │
    [句子缓冲区优化] → 整句翻译 → GLM-4-flash
       │
    [前端双区显示]
       英文区：实时逐字追加
       中文区：整句输出，零跳动
```

### 设计决策

**不引入 WebSocket 传输音频**。原因：
- 当前 HTTP POST + multipart 方式可靠、成熟
- Expo Audio 录制的 .m4a 文件适合 HTTP 上传
- WebSocket 只用于心跳保活和状态同步，不承载音频流
- 改动最小化，降低引入新 bug 的风险

---

## 三、改动点详解

### P0-1：连续运行 2 小时（最高优先级）

#### 3.1 PM2 进程守护

**新增文件**：`ecosystem.config.js`

```javascript
module.exports = {
  apps: [
    {
      name: 'voice-bridge-bff',
      script: 'server.js',
      cwd: './backend',
      max_restarts: 10,
      restart_delay: 3000,         // 3s 重启间隔
      max_memory_restart: '2G',    // 内存超 2G 自动重启
      env: {
        NODE_ENV: 'production',
        WHISPER_MODEL: 'medium',
        WHISPER_WORKERS: '2',
      },
      error_file: './logs/bff-error.log',
      out_file: './logs/bff-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
    {
      name: 'voice-bridge-expo',
      script: 'npx',
      args: 'expo start --tunnel',
      cwd: './',
      max_restarts: 5,
      restart_delay: 5000,
      error_file: './logs/expo-error.log',
      out_file: './logs/expo-out.log',
    },
  ],
};
```

**改动文件**：`backend/server.js`

新增全局异常捕获（文件末尾）：

```javascript
// 全局异常捕获 — 防止未处理异常导致进程退出
process.on('uncaughtException', (err) => {
  log('error', 'FATAL', 'Uncaught exception', { error: err.message, stack: err.stack });
  // 不退出，让 PM2 决定是否重启
});

process.on('unhandledRejection', (reason) => {
  log('error', 'FATAL', 'Unhandled rejection', { reason: String(reason) });
});
```

新增 /tmp 清理定时器：

```javascript
// 每小时清理 /tmp 中的残留音频文件
setInterval(() => {
  const tmpDir = '/tmp';
  const now = Date.now();
  fs.readdir(tmpDir, (err, files) => {
    if (err) return;
    files.filter(f => f.startsWith('voice-bridge-') || f.endsWith('.m4a') || f.endsWith('.wav'))
      .forEach(f => {
        const fp = path.join(tmpDir, f);
        fs.stat(fp, (err, stats) => {
          if (!err && now - stats.mtimeMs > 3600000) { // > 1 hour old
            fs.unlink(fp, () => {});
          }
        });
      });
  });
}, 3600000);
```

#### 3.2 WebSocket 心跳保活

**改动文件**：`backend/server.js`

新增 WebSocket 服务端（在 Express 之上）：

```javascript
const { WebSocketServer } = require('ws');
// ... 在 app.listen 后
const wss = new WebSocketServer({ server });

// 心跳检测
const HEARTBEAT_INTERVAL = 30000; // 30s
const HEARTBEAT_TIMEOUT = 10000;  // 10s 无响应判定断连

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (msg) => {
    if (msg.toString() === 'ping') ws.send('pong');
  });
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);
```

**新增文件**：`services/websocketService.ts`

前端 WebSocket 客户端：

```typescript
// WebSocket 心跳保活 + 自动重连
class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectDelay = 3000; // 3s
  private maxReconnectDelay = 30000;

  connect(url: string) { /* ... */ }
  disconnect() { /* ... */ }
  
  private scheduleReconnect() {
    this.reconnectTimer = setTimeout(() => {
      this.connect(this.url);
    }, this.reconnectDelay);
    // 指数退避，最长 30s
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }
}
```

#### 3.3 音频流看门狗

**改动文件**：`hooks/useAudioRecording.ts`

在 `startRecording` 中新增看门狗逻辑：

```typescript
// 30s 无新 chunk 到达 → 自动恢复录音
const WATCHDOG_INTERVAL = 30000;
const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);

// 在 startRecording 中：
watchdogRef.current = setInterval(() => {
  const timeSinceLastChunk = Date.now() - lastChunkTimeRef.current;
  if (timeSinceLastChunk > WATCHDOG_INTERVAL && sm.isRecording()) {
    console.warn('[Watchdog] No chunk for 30s, attempting recovery');
    attemptRecovery(sm);
  }
}, WATCHDOG_INTERVAL);
```

---

### P0-2：修复 HTTP 530 崩溃

**改动文件**：`backend/server.js`

已通过 P0-1 的 PM2 + 全局异常捕获覆盖。额外增加：

```javascript
// Express 全局错误中间件（放在所有路由之后）
app.use((err, req, res, next) => {
  log('error', 'EXPRESS', 'Unhandled route error', {
    error: err.message,
    path: req.path,
    reqId: req.reqId,
  });
  res.status(500).json({ error: 'Internal server error' });
});
```

**改动文件**：`services/transcriptionService.ts`

增强 HTTP 错误恢复（530 专项处理）：

```typescript
// 530 错误特殊处理 — 等待 3s 后重试
if (response.status === 530) {
  await new Promise(resolve => setTimeout(resolve, 3000));
  continue; // 重试
}
```

---

### P0-3：来电中断后恢复

**改动文件**：`hooks/useAudioRecording.ts`

新增 iOS AudioSession 中断监听：

```typescript
import { addAudioEventListener } from 'expo-audio';

// 在 startRecording 中注册中断监听
const interruptSub = addAudioEventListener('audioInterruption', (event) => {
  if (event.type === 'began') {
    // 来电/其他音频中断开始
    setPipelineStatus('idle'); // 显示"录音已暂停"
    pipelineLogger.log(-1, 'audio_interrupted', { reason: 'phone_call' });
  } else if (event.type === 'ended') {
    // 中断结束，5s 内恢复
    setTimeout(async () => {
      if (sm.getState() !== RecordingState.IDLE) {
        const recovered = await attemptRecovery(sm);
        if (recovered) {
          setPipelineStatus('listening');
          pipelineLogger.log(-1, 'audio_resumed', { recoveryMs: 5000 });
        }
      }
    }, 5000);
  }
});
```

**改动文件**：`components/StatusIndicator.tsx`

新增中断状态 UI 提示（与现有 PipelineStatus 集成）。

---

### P1-1：升级 ASR 到 faster-whisper medium

**改动文件**：`backend/.env`

```
WHISPER_MODEL=medium
WHISPER_WORKERS=2
```

**改动文件**：`backend/local_whisper.py`

无需改代码，`MODEL_SIZE` 已从环境变量读取。只需确认：

```python
MODEL_SIZE = os.environ.get("WHISPER_MODEL", "tiny")  # 已有
```

**内存评估**：

| 模型 | 参数量 | 内存占用（CPU int8） | 准确率 | 延迟 |
|------|--------|-------------------|--------|------|
| tiny | 39M | ~75MB | ~70% | <1s |
| base | 74M | ~140MB | ~80% | ~1s |
| small | 244M | ~460MB | ~92% | ~2s |
| **medium** | **769M** | **~1.5GB** | **~97%** | **~2-3s** |
| large | 1550M | ~3GB | ~98% | ~5s |

faster-whisper 用 CTranslate2 + int8 量化，比 openai-whisper 内存少约 50%、速度快 4x。

**medium 模型在 M 系列 Mac 上的表现**：
- 内存：~1.5GB（2 个 worker = ~3GB，但 worker 复用同一模型实例，实际 ~1.8GB）
- Apple Silicon 有足够内存（Mac Mini M2 16GB / MacBook 同级别）
- 首次加载需下载 ~1.5GB 模型文件（cached 到 `~/.cache/huggingface/`）
- 启动时模型加载约 10-15s

**Worker 策略调整**：
- medium 模型下 worker 数量从 2 降为 1-2（视内存而定）
- 如果总 RAM ≥ 16GB → 2 workers
- 如果总 RAM < 16GB → 1 worker
- 在 server.js 中加入运行时内存检测，自动决定 worker 数

**安装命令**：

```bash
cd ~/projects/voice-bridge/backend
source venv/bin/activate
pip install faster-whisper  # 已安装，确认版本 >= 0.10.0
python -c "from faster_whisper import WhisperModel; m = WhisperModel('medium', device='cpu', compute_type='int8'); print('OK')"
```

---

### P1-2：句子缓冲区优化

当前已有基础实现。需要优化的点：

**改动文件**：`hooks/useAudioRecording.ts`

1. **英文区实时追加优化**：当前 `appendTranscript` 已实现逐 chunk 追加，但 5s 一次有感知延迟。改为：
   - 保持 5s chunk 不变（更短的 chunk 识别质量太差）
   - 在 ASR 返回后立刻追加到英文区（当前已实现）
   - 优化：ASR 返回的文本与前一个 chunk 有重叠时，做去重拼接

2. **中文区整句输出**：当前句子缓冲区用标点 + 800ms 静音检测。优化：
   - 将翻译 prompt 精简：去掉 words 字段（需求已去掉生词列表 → P2 删除）
   - 翻译 prompt 改为纯翻译，不返回 JSON，直接返回中文文本
   - 减少 token 消耗 + 降低延迟

**改动文件**：`backend/server.js`（翻译接口）

```javascript
// 简化翻译 prompt（去掉生词）
const systemPrompt = `将以下英文翻译为中文。只返回中文翻译，不要其他内容。`;
```

**改动文件**：`services/translationService.ts`

```typescript
// 简化返回结构（去掉 words）
export interface TranslationResult {
  translation: string;
  // words 字段移除（P2 生词列表已删除）
}
```

**Token 节省估算**：
- 去掉 JSON 格式约束 → prompt 减少 ~40 token
- 去掉 words 返回 → output 减少 ~30-50 token/次
- 整句翻译 vs 碎片翻译 → 调用次数减少 60-70%
- **综合预估：token 消耗降低 70-80%**

---

### P1-3：导出 Markdown + 历史详情优化

#### 导出按钮（新增需求 2026-03-28 15:00 波哥确认）

**改动文件**：`services/saveService.ts`

新增 `exportSessionMarkdown` 函数：

```typescript
import * as Sharing from 'expo-sharing';
import { cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';

/**
 * 将会话导出为带时间戳的 Markdown，通过 iOS Share Sheet 分享
 */
export async function exportSessionMarkdown(
  translations: TranslationEntry[],
  sessionStartTime: number
): Promise<void> {
  const now = new Date();
  const startDate = new Date(sessionStartTime);
  const durationMs = now.getTime() - sessionStartTime;
  const durationStr = formatDuration(durationMs);

  // 生成 Markdown 内容
  const lines = [
    '# voice-bridge 录音记录',
    `**录音时间**：${formatDate(startDate)}`,
    `**时长**：${durationStr}`,
    '',
    '---',
    '',
  ];

  for (const entry of translations) {
    const ts = formatTimestamp(entry.timestamp - sessionStartTime);
    lines.push(`[${ts}] **EN**: ${entry.englishText}`);
    lines.push(`[${ts}] **CN**: ${entry.chineseTranslation}`);
    lines.push('');
  }

  const content = lines.join('\n');

  // 写入临时文件
  const filename = `voice-bridge-${formatFilenameDate(now)}.md`;
  const filepath = `${cacheDirectory}${filename}`;
  await writeAsStringAsync(filepath, content);

  // 调用 iOS Share Sheet
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(filepath, {
      mimeType: 'text/markdown',
      UTI: 'public.plain-text',
    });
  }
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return hours > 0 ? `${hours}小时 ${minutes}分钟` : `${minutes}分钟`;
}

function formatDate(date: Date): string {
  return date.toLocaleString('zh-CN', { 
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatFilenameDate(date: Date): string {
  return date.toISOString().slice(0, 16).replace('T', '-').replace(':', '-');
}
```

**新增依赖**：`expo-sharing`

```bash
npx expo install expo-sharing
```

**改动文件**：`app/history/[id].tsx`

1. 新增「导出 Markdown」按钮（header 右侧）
2. 去掉生词列表 section（P2 已删除）
3. 改为英中对照展示（每句英文后跟中文）

```typescript
// Header 右侧新增导出按钮
<TouchableOpacity onPress={handleExport} style={styles.exportBtn}>
  <Text style={styles.exportBtnText}>导出</Text>
</TouchableOpacity>

// 去掉整个 Vocabulary section
// 改为英中对照展示
{session.translations.map((t, idx) => (
  <View key={idx} style={styles.entryBlock}>
    <Text style={styles.englishText}>{t.english}</Text>
    <Text style={styles.chineseText}>{t.chinese}</Text>
  </View>
))}
```

---

## 四、文件改动清单

| 文件 | 改动类型 | 优先级 | 说明 |
|------|---------|--------|------|
| `ecosystem.config.js` | 🆕 新增 | P0 | PM2 配置 |
| `backend/server.js` | ✏️ 修改 | P0 | 全局异常捕获 + /tmp 清理 + WebSocket + Express 错误中间件 |
| `backend/package.json` | ✏️ 修改 | P0 | 新增 `ws` 依赖 |
| `backend/.env` | ✏️ 修改 | P1 | WHISPER_MODEL=medium |
| `services/websocketService.ts` | 🆕 新增 | P0 | WebSocket 心跳客户端 |
| `hooks/useAudioRecording.ts` | ✏️ 修改 | P0 | 看门狗 + 来电中断监听 + 缓冲区优化 |
| `services/transcriptionService.ts` | ✏️ 修改 | P0 | 530 专项重试 |
| `services/translationService.ts` | ✏️ 修改 | P1 | 去掉 words，简化接口 |
| `services/saveService.ts` | ✏️ 修改 | P1 | 导出格式带时间戳 |
| `components/StatusIndicator.tsx` | ✏️ 修改 | P0 | 中断状态 UI |
| `store/transcriptStore.ts` | ✏️ 修改 | P1 | VocabularyWord 可选化 / 去除 |
| `constants/api.ts` | ✏️ 修改 | P0 | 新增 WS_URL |
| `app/history/[id].tsx` | ✏️ 修改 | P1 | 去掉生词列表 + 新增导出按钮 + 英中对照 |

**新增依赖**：`expo-sharing`（用于 iOS Share Sheet 导出）

**总计**：2 个新增文件 + 11 个修改文件 + 1 个新增依赖

---

## 五、风险评估

| 风险 | 等级 | 应对 |
|------|------|------|
| medium 模型内存不够 | 中 | 先跑 small（~460MB）验证，不行再降级 |
| WebSocket 引入新 bug | 低 | WS 只做心跳，不承载业务数据 |
| expo-audio 中断 API 兼容性 | 中 | 先查 expo-audio 文档确认 API 存在，备选方案用 AppState 监听 |
| PM2 与 Expo 冲突 | 低 | Expo 单独一个 PM2 进程，独立守护 |
| 翻译 prompt 改动影响质量 | 低 | 去掉 JSON 格式反而让 LLM 更专注翻译 |

---

## 六、开发分工（Sub-Agent 编排）

```
Peter Spec（本文档）
    │
    ├── Backend Dev Agent
    │   ├── P0: server.js 改造（异常捕获、WebSocket、/tmp 清理、错误中间件）
    │   ├── P0: ecosystem.config.js
    │   ├── P1: 翻译 prompt 简化
    │   └── P1: .env 模型升级
    │
    ├── Frontend Dev Agent
    │   ├── P0: websocketService.ts（心跳保活）
    │   ├── P0: useAudioRecording.ts（看门狗 + 来电中断）
    │   ├── P0: StatusIndicator（中断状态 UI）
    │   ├── P1: translationService.ts（去 words）
    │   ├── P1: saveService.ts（导出 Markdown + Share Sheet）
    │   └── P1: history/[id].tsx（去掉生词 + 导出按钮）
    │
    └── Verify Runner
        ├── tsc --noEmit
        ├── eslint
        └── 手动 smoke test（录音 5 分钟验证基本功能）
```

**注**：本次 V1.5 以稳定性为第一目标，改动最小化原则。不引入架构级重构，在现有代码基础上增量改进。

---

## 七、验收 Checklist

### P0 验收
- [ ] `pm2 start ecosystem.config.js` 一键启动 BFF
- [ ] `pm2 monit` 可查看进程状态
- [ ] 手动 kill BFF → 3s 内自动重启
- [ ] 连续录音 2 小时不崩溃
- [ ] 模拟来电 → 挂断后 5s 内录音自动恢复
- [ ] UI 显示中断/恢复状态

### P1 验收
- [ ] WHISPER_MODEL=medium，ASR 准确率 ≥ 97%
- [ ] ASR 延迟 ≤ 3s（P90）
- [ ] 中文区整句输出，无跳动
- [ ] 导出 Markdown 带时间戳
- [ ] 翻译接口不再返回 words 字段

---

*方案时间: 2026-03-28 14:10 CST*
*预估开发时间: 3-4 小时（并行开发）*
