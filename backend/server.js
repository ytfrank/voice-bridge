/**
 * VoiceBridge BFF (Backend for Frontend)
 * Uses local Whisper for ASR, Zhipu GLM-4-flash for translation.
 * Multi-worker Whisper processing for parallel ASR.
 * V1.4: Enhanced logging + error reporting
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fetch = require('node-fetch');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load .env from backend dir or parent
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.BFF_PORT || 3001;
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'base';
const WHISPER_WORKERS = parseInt(process.env.WHISPER_WORKERS || '2', 10);

// Venv python path
const VENV_PYTHON = path.join(__dirname, 'venv', 'bin', 'python');
const WHISPER_SCRIPT = path.join(__dirname, 'local_whisper.py');

// ===== Structured Logger =====
const LOG_FILE = process.env.LOG_FILE || '/tmp/voice-bridge.log';
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] || 1;

// Open log file stream (append mode)
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function log(level, component, message, data = null) {
  if (LOG_LEVELS[level] < LOG_LEVEL) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    component,
    msg: message,
    ...(data && { data }),
  };

  const line = JSON.stringify(entry);

  // Console output with emoji
  const emoji = { debug: '🔍', info: 'ℹ️', warn: '⚠️', error: '❌' }[level] || '📋';
  console.log(`${emoji} [${component}] ${message}`, data ? JSON.stringify(data).substring(0, 150) : '');

  // File output (structured JSON, one line per entry)
  logStream.write(line + '\n');
}

// Request ID counter for tracing
let requestCounter = 0;

// ===== Client Error Store (recent 100) =====
const clientErrors = [];
const MAX_CLIENT_ERRORS = 100;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const reqId = ++requestCounter;
  req.reqId = reqId;
  const t0 = Date.now();

  res.on('finish', () => {
    const ms = Date.now() - t0;
    if (req.path !== '/health' && req.path !== '/favicon.ico') {
      log('info', 'HTTP', `${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`, {
        reqId,
        size: req.file?.size,
        ms,
      });
    }
  });

  next();
});

// Serve static test tools
app.use('/static', express.static(path.join(__dirname, 'public')));

// Multer for file uploads (audio chunks)
const upload = multer({
  dest: '/tmp/voice-bridge-uploads/',
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max (supports long audio/video)
});

// Whisper worker pool
class WhisperWorkerPool {
  constructor(maxWorkers) {
    this.maxWorkers = maxWorkers;
    this.activeWorkers = 0;
    this.queue = [];
  }

  async process(audioPath) {
    return new Promise((resolve, reject) => {
      const task = { audioPath, resolve, reject };
      
      if (this.activeWorkers < this.maxWorkers) {
        this._runTask(task);
      } else {
        this.queue.push(task);
      }
    });
  }

  _runTask(task) {
    this.activeWorkers++;
    const t0 = Date.now();
    log('info', 'Whisper', `Worker start (${this.activeWorkers}/${this.maxWorkers})`, {
      model: WHISPER_MODEL,
      file: path.basename(task.audioPath),
      queueLen: this.queue.length,
    });

    const python = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';
    const proc = spawn(python, [WHISPER_SCRIPT, task.audioPath], {
      env: { ...process.env, WHISPER_MODEL }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });

    const timeout = setTimeout(() => {
      proc.kill();
      log('error', 'Whisper', 'Timeout (30s)', { file: path.basename(task.audioPath) });
      this._complete(task, new Error('Whisper timeout'), null, t0);
    }, 30000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        log('error', 'Whisper', `Failed (code ${code})`, { stderr: stderr.substring(0, 200) });
        this._complete(task, new Error(`Whisper failed: ${stderr || stdout}`), null, t0);
      } else {
        try {
          const result = JSON.parse(stdout);
          log('info', 'Whisper', `Done (${Date.now() - t0}ms)`, {
            text: (result.text || '').substring(0, 80),
            textLen: (result.text || '').length,
          });
          this._complete(task, null, result, t0);
        } catch (e) {
          log('error', 'Whisper', 'Invalid JSON output', { stdout: stdout.substring(0, 200) });
          this._complete(task, new Error(`Invalid JSON from Whisper: ${stdout}`), null, t0);
        }
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      log('error', 'Whisper', 'Process error', { error: err.message, stack: err.stack?.substring(0, 300) });
      this._complete(task, err, null, t0);
    });
  }

  _complete(task, error, result, t0) {
    this.activeWorkers--;
    const ms = t0 ? Date.now() - t0 : 0;
    log('debug', 'Whisper', `Worker done (${this.activeWorkers}/${this.maxWorkers}, ${ms}ms)`);
    
    if (error) {
      task.reject(error);
    } else {
      task.resolve(result);
    }

    // Process next task in queue
    if (this.queue.length > 0 && this.activeWorkers < this.maxWorkers) {
      const nextTask = this.queue.shift();
      this._runTask(nextTask);
    }
  }
}

const whisperPool = new WhisperWorkerPool(WHISPER_WORKERS);

const EXPO_PORT_CANDIDATES = (process.env.EXPO_PORTS || '8081,8082,19000,19006')
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isInteger(n) && n > 0);
const EXPO_RESOLVE_CACHE_MS = 10000;
let expoUrlCache = { value: null, source: null, checkedAt: 0 };

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeExpoGoUrl(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('exp://') || trimmed.startsWith('exps://')) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `exp://${trimmed.replace(/^\/+/, '')}`;
}

async function fetchExpoUrlFromPort(port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/?platform=ios`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const hostUri = data?.extra?.expoClient?.hostUri || data?.expoGo?.debuggerHost;
    const expoUrl = normalizeExpoGoUrl(hostUri);

    if (!expoUrl) return null;

    return {
      url: expoUrl,
      source: `manifest:${port}`,
      hostUri,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveExpoGoUrl(forceRefresh = false) {
  const envExpoUrl = normalizeExpoGoUrl(process.env.EXPO_GO_URL);
  if (envExpoUrl) {
    expoUrlCache = { value: envExpoUrl, source: 'env:EXPO_GO_URL', checkedAt: Date.now() };
    return expoUrlCache;
  }

  const now = Date.now();
  if (!forceRefresh && expoUrlCache.value && now - expoUrlCache.checkedAt < EXPO_RESOLVE_CACHE_MS) {
    return expoUrlCache;
  }

  for (const port of EXPO_PORT_CANDIDATES) {
    const resolved = await fetchExpoUrlFromPort(port);
    if (resolved?.url) {
      expoUrlCache = { value: resolved.url, source: resolved.source, checkedAt: now };
      return expoUrlCache;
    }
  }

  expoUrlCache = { value: null, source: null, checkedAt: now };
  return expoUrlCache;
}

function renderExpoRedirectPage(expoUrl, source, requestInfo = {}) {
  const safeExpoUrl = escapeHtml(expoUrl || '');
  const safeSource = escapeHtml(source || 'unavailable');
  const safeUserAgent = String(requestInfo.userAgent || '');
  const isFeishu = /Lark|Feishu/i.test(safeUserAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(safeUserAgent);
  const statusText = expoUrl ? '正在尝试打开 Expo Go… [V1.5.2]' : '暂时未解析到 Expo Go 地址';
  const hintText = expoUrl
    ? '如果自动跳转失败，请使用下方兜底方式'
    : '请联系 Peter 检查 Expo 开发服务或重新部署';
  const action = expoUrl
    ? `<a href="${safeExpoUrl}" class="btn">打开 Expo Go</a>`
    : '<div class="btn disabled">暂不可跳转</div>';
  const copyAction = expoUrl
    ? `<button class="btn secondary" onclick="copyExpoUrl()">复制 Expo 地址</button>`
    : '';
  const envNotice = isFeishu
    ? '<p>⚠️ 当前看起来是飞书内浏览器，可能会拦截 exp:// 跳转。</p><p>建议点右上角 → 在 Safari 中打开，再试自动跳转；若仍失败，打开 Expo Go 手动粘贴下方地址。</p>'
    : isIOS
      ? '<p>ℹ️ 如果 iPhone 没有自动跳转，请点击按钮，或复制下方地址到 Expo Go → Enter URL manually。</p>'
      : '<p>ℹ️ 若当前浏览器不支持 exp://，请复制下方地址到已安装 Expo Go 的设备中打开。</p>';
  const detail = expoUrl
    ? `<p>🔗 Expo 地址：${safeExpoUrl}</p><p>🧭 来源：${safeSource}</p><p>🌐 当前公网页：${escapeHtml(requestInfo.publicUrl || '')}</p>`
    : `<p>⚠️ 当前未找到可用 Expo Go 地址</p><p>🧭 来源：${safeSource}</p>`;
  const script = expoUrl
    ? `
      function openExpo() {
        window.location.href = ${JSON.stringify(expoUrl)};
      }
      function copyExpoUrl() {
        const value = ${JSON.stringify(expoUrl)};
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(value).then(function(){ alert('Expo 地址已复制，请到 Expo Go 粘贴打开'); });
          return;
        }
        const input = document.createElement('input');
        input.value = value;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        alert('Expo 地址已复制，请到 Expo Go 粘贴打开');
      }
      setTimeout(openExpo, 800);
    `
    : 'function copyExpoUrl() {} console.warn("Expo Go URL unavailable");';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VoiceBridge - 打开 Expo Go</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      box-sizing: border-box;
    }
    .container {
      width: 100%;
      max-width: 700px;
      text-align: center;
      padding: 36px 28px;
      background: rgba(255,255,255,0.12);
      border-radius: 20px;
      backdrop-filter: blur(10px);
      box-shadow: 0 10px 40px rgba(0,0,0,0.15);
    }
    h1 { margin: 0 0 18px; font-size: 32px; }
    p { margin: 10px 0; font-size: 17px; line-height: 1.5; }
    .btn {
      display: inline-block;
      margin: 12px 8px 0;
      padding: 14px 28px;
      background: white;
      color: #5b5bd6;
      text-decoration: none;
      border-radius: 999px;
      border: none;
      font-weight: 700;
      font-size: 18px;
      cursor: pointer;
    }
    .btn.secondary {
      background: rgba(255,255,255,0.18);
      color: white;
      border: 1px solid rgba(255,255,255,0.35);
    }
    .btn.disabled {
      background: rgba(255,255,255,0.4);
      color: rgba(255,255,255,0.9);
      cursor: not-allowed;
    }
    .note {
      margin-top: 24px;
      padding: 16px;
      background: rgba(255,255,255,0.1);
      border-radius: 12px;
      text-align: left;
      word-break: break-all;
    }
    .steps {
      margin-top: 20px;
      padding: 16px;
      background: rgba(255,255,255,0.08);
      border-radius: 12px;
      text-align: left;
    }
    ol { margin: 8px 0 0 20px; }
    li { margin: 8px 0; }
    code {
      background: rgba(0,0,0,0.18);
      padding: 2px 6px;
      border-radius: 6px;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎙️ VoiceBridge</h1>
    <p>${statusText}</p>
    <p>${hintText}</p>
    ${action}
    ${copyAction}
    <div class="steps">
      ${envNotice}
      <ol>
        <li>确保手机已安装 <strong>Expo Go</strong></li>
        <li>若自动跳转失败，点击“复制 Expo 地址”</li>
        <li>打开 Expo Go → <strong>Enter URL manually</strong></li>
        <li>粘贴地址并连接</li>
      </ol>
    </div>
    <div class="note">
      ${detail}
    </div>
  </div>
  <script>${script}</script>
</body>
</html>`;
}

app.get('/', async (req, res) => {
  const resolved = await resolveExpoGoUrl();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderExpoRedirectPage(resolved.value, resolved.source, {
    userAgent: req.get('user-agent') || '',
    publicUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
  }));
});

app.get('/api/meta/expo-link', async (req, res) => {
  const resolved = await resolveExpoGoUrl(Boolean(req.query.refresh));
  res.json({
    ok: Boolean(resolved.value),
    expoGoUrl: resolved.value,
    source: resolved.source,
    checkedAt: new Date(resolved.checkedAt).toISOString(),
  });
});

// Health check
app.get('/health', async (req, res) => {
  const resolved = await resolveExpoGoUrl();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    whisper: WHISPER_MODEL,
    whisperWorkers: WHISPER_WORKERS,
    python: fs.existsSync(VENV_PYTHON) ? 'venv' : 'system',
    expoGoUrl: resolved.value,
    expoSource: resolved.source,
  });
});

/**
 * POST /api/transcribe
 * Local Whisper transcription (parallel via worker pool)
 */
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  const t0 = Date.now();
  try {
    if (!req.file) {
      log('warn', 'ASR', 'No audio file in request', { reqId: req.reqId });
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const audioPath = req.file.path;
    log('info', 'ASR', 'Received audio', {
      reqId: req.reqId,
      size: req.file.size,
      mime: req.file.mimetype,
      originalName: req.file.originalname,
    });

    // Skip empty/tiny audio files that cause Whisper "cannot reshape tensor" errors
    if (req.file.size < 1024) {
      log('warn', 'ASR', `Skipping tiny audio: ${req.file.size} bytes`, { reqId: req.reqId });
      fs.unlink(audioPath, () => {});
      return res.json({ text: '', skipped: true, reason: 'audio_too_short' });
    }

    // Normalize audio: convert to mono 16kHz WAV (Whisper's native format)
    const normalizedPath = audioPath + '_normalized.wav';
    let processPath = audioPath;
    const normT0 = Date.now();
    try {
      await new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-y', '-i', audioPath,
          '-vn',           // strip video
          '-ac', '1',      // mono
          '-ar', '16000',  // 16kHz (Whisper native)
          '-acodec', 'pcm_s16le',  // 16-bit PCM
          '-loglevel', 'error',
          normalizedPath,
        ]);
        let stderr = '';
        ffmpeg.stderr.on('data', (d) => { stderr += d.toString(); });
        ffmpeg.on('close', (code) => {
          if (code === 0 && fs.existsSync(normalizedPath)) {
            resolve();
          } else {
            reject(new Error(`ffmpeg failed (code ${code}): ${stderr.substring(0, 200)}`));
          }
        });
        ffmpeg.on('error', reject);
        setTimeout(() => { try { ffmpeg.kill(); } catch {} reject(new Error('ffmpeg timeout')); }, 15000);
      });
      processPath = normalizedPath;
      const normSize = fs.statSync(normalizedPath).size;
      log('info', 'ASR', `Normalized (${Date.now() - normT0}ms)`, {
        reqId: req.reqId,
        from: req.file.size,
        to: normSize,
      });
    } catch (normErr) {
      log('warn', 'ASR', `Normalization failed, using original`, {
        reqId: req.reqId,
        error: normErr.message,
      });
    }

    const processSize = fs.statSync(processPath).size;
    log('info', 'ASR', `Queuing for Whisper`, { reqId: req.reqId, size: processSize, model: WHISPER_MODEL });

    const whisperT0 = Date.now();
    const result = await whisperPool.process(processPath);
    const whisperMs = Date.now() - whisperT0;

    // Clean up files
    if (processPath !== audioPath) fs.unlink(normalizedPath, () => {});
    fs.unlink(audioPath, () => {});

    if (!result.success) {
      log('error', 'ASR', 'Whisper returned error', {
        reqId: req.reqId,
        error: result.error,
        ms: whisperMs,
      });
      return res.status(500).json({ error: result.error || 'Transcription failed' });
    }

    const totalMs = Date.now() - t0;
    log('info', 'ASR', `Complete (${totalMs}ms)`, {
      reqId: req.reqId,
      text: (result.text || '').substring(0, 80),
      textLen: (result.text || '').length,
      whisperMs,
      totalMs,
    });

    res.json({ text: result.text || '' });
  } catch (err) {
    log('error', 'ASR', 'Unhandled error', {
      reqId: req.reqId,
      error: err.message,
      stack: err.stack?.substring(0, 500),
      ms: Date.now() - t0,
    });
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

/**
 * POST /api/translate
 * Proxy to Zhipu GLM-4-flash for translation + vocabulary
 */
app.post('/api/translate', async (req, res) => {
  const t0 = Date.now();
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'No text provided' });
    }

    if (!ZHIPU_API_KEY) {
      log('error', 'Translate', 'ZHIPU_API_KEY not configured');
      return res.status(500).json({ error: 'ZHIPU_API_KEY not configured' });
    }

    log('info', 'Translate', 'Start', {
      reqId: req.reqId,
      inputLen: text.length,
      text: text.substring(0, 80),
    });

    const systemPrompt = '将以下英文翻译为中文。只返回中文翻译文本，不要JSON，不要其他内容。';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const apiT0 = Date.now();
    const response = await fetch(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${ZHIPU_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
          ],
          temperature: 0.1,
          max_tokens: 256,
        }),
      }
    );

    clearTimeout(timeout);
    const apiMs = Date.now() - apiT0;

    if (!response.ok) {
      const errText = await response.text();
      log('error', 'Translate', `GLM API error (${apiMs}ms)`, {
        reqId: req.reqId,
        status: response.status,
        body: errText.substring(0, 200),
      });
      return res.status(response.status).json({
        error: 'Translation API error',
        detail: errText,
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    const totalMs = Date.now() - t0;
    log('info', 'Translate', `Complete (${totalMs}ms)`, {
      reqId: req.reqId,
      translation: content.substring(0, 60),
      apiMs,
      totalMs,
    });

    res.json({ translation: content.trim(), words: [] });
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    log('error', 'Translate', isTimeout ? 'Timeout (10s)' : 'Unhandled error', {
      reqId: req.reqId,
      error: err.message,
      stack: isTimeout ? undefined : err.stack?.substring(0, 500),
      ms: Date.now() - t0,
    });
    res.status(500).json({ error: isTimeout ? 'Translation timeout' : 'Internal server error' });
  }
});

/**
 * POST /api/translate/stream
 * Streaming translation via SSE
 */
app.post('/api/translate/stream', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'No text provided' });
    }

    if (!ZHIPU_API_KEY) {
      return res.status(500).json({ error: 'ZHIPU_API_KEY not configured' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const streamController = new AbortController();
    const streamTimeout = setTimeout(() => streamController.abort(), 15000);

    const response = await fetch(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      {
        method: 'POST',
        signal: streamController.signal,
        headers: {
          Authorization: `Bearer ${ZHIPU_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4-flash',
          messages: [
            {
              role: 'system',
              content: '将英文翻译成自然流畅的中文。只输出中文，不要其他内容。',
            },
            { role: 'user', content: text },
          ],
          temperature: 0.1,
          max_tokens: 256,
          stream: true,
        }),
      }
    );

    clearTimeout(streamTimeout);

    if (!response.ok) {
      res.write(`data: ${JSON.stringify({ error: 'API error' })}\n\n`);
      res.end();
      return;
    }

    response.body.on('data', (chunk) => {
      res.write(chunk);
    });

    response.body.on('end', () => {
      res.end();
    });

    response.body.on('error', (err) => {
      console.error('Stream error:', err);
      res.end();
    });

    req.on('close', () => {
      response.body.destroy();
    });
  } catch (err) {
    console.error('Stream translate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/error
 * Frontend error reporting endpoint
 */
app.post('/api/error', (req, res) => {
  const { error, stack, context, userAgent, timestamp } = req.body;

  const entry = {
    ts: timestamp || new Date().toISOString(),
    source: 'client',
    error: error || 'unknown',
    stack: stack?.substring(0, 1000),
    context,
    userAgent: userAgent?.substring(0, 200),
    ip: req.ip,
  };

  log('error', 'Client', error || 'Frontend error', entry);

  // Store in memory for /api/logs
  clientErrors.push(entry);
  if (clientErrors.length > MAX_CLIENT_ERRORS) {
    clientErrors.splice(0, clientErrors.length - MAX_CLIENT_ERRORS);
  }

  res.json({ received: true });
});

/**
 * GET /api/logs
 * View recent server logs (last N lines from log file)
 */
app.get('/api/logs', (req, res) => {
  const lines = parseInt(req.query.lines) || 50;
  const component = req.query.component;

  try {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    let entries = content.trim().split('\n').filter(Boolean);

    // Parse and filter
    let parsed = entries.map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);

    if (component) {
      parsed = parsed.filter(e => e.component === component);
    }

    // Return last N entries
    res.json({
      total: parsed.length,
      entries: parsed.slice(-lines),
      clientErrors: clientErrors.slice(-20),
    });
  } catch (err) {
    res.json({ total: 0, entries: [], error: 'Log file not found' });
  }
});

// ===== Express global error middleware =====
app.use((err, req, res, next) => {
  log('error', 'EXPRESS', 'Unhandled route error', { error: err.message, path: req.path, reqId: req.reqId });
  res.status(500).json({ error: 'Internal server error' });
});

// ===== Debug crash endpoint (dev only) =====
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/debug/crash', (req, res) => {
    log('warn', 'DEBUG', 'Crash endpoint triggered');
    res.json({ msg: 'crashing...' });
    setTimeout(() => process.exit(1), 100);
  });
}

// ===== Global exception handlers =====
process.on('uncaughtException', (err) => {
  log('error', 'FATAL', 'Uncaught exception', { error: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
  log('error', 'FATAL', 'Unhandled rejection', { reason: String(reason) });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  log('info', 'Server', `VoiceBridge BFF started on :${PORT}`, {
    whisper: WHISPER_MODEL,
    workers: WHISPER_WORKERS,
    python: fs.existsSync(VENV_PYTHON) ? 'venv' : 'system',
    glmKey: ZHIPU_API_KEY ? `${ZHIPU_API_KEY.slice(0, 8)}...` : 'not_set',
    logFile: LOG_FILE,
  });
  console.log(`🚀 VoiceBridge BFF running on http://0.0.0.0:${PORT}`);
  console.log(`📋 Logs: tail -f ${LOG_FILE}`);
});

// ===== WebSocket heartbeat =====
const { WebSocketServer } = require('ws');
const wss = new WebSocketServer({ server });
const HEARTBEAT_INTERVAL = 30000;

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

// ===== /tmp cleanup (hourly) =====
setInterval(() => {
  const tmpDir = '/tmp';
  const oneHourAgo = Date.now() - 3600000;
  try {
    fs.readdirSync(tmpDir).forEach((file) => {
      if (!file.startsWith('voice-bridge')) return;
      if (!file.endsWith('.m4a') && !file.endsWith('.wav')) return;
      const filePath = path.join(tmpDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < oneHourAgo) {
          fs.unlink(filePath, () => {});
          log('debug', 'Cleanup', `Removed stale tmp file: ${file}`);
        }
      } catch {}
    });
  } catch (e) {
    log('warn', 'Cleanup', 'tmp cleanup error', { error: e.message });
  }
}, 3600000);
