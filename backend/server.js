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
const { assessTextQuality, buildAsrResponse } = require('./quality_gate');

// Load .env from backend dir or parent
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.BFF_PORT || 3001;
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'base';
const WHISPER_WORKERS = parseInt(process.env.WHISPER_WORKERS || '2', 10);
const WHISPER_TIMEOUT_MS = parseInt(process.env.WHISPER_TIMEOUT_MS || '30000', 10);
const WHISPER_QUEUE_TTL_MS = parseInt(process.env.WHISPER_QUEUE_TTL_MS || '20000', 10);
const WHISPER_MAX_QUEUE = parseInt(process.env.WHISPER_MAX_QUEUE || '24', 10);
const MIN_AUDIO_BYTES = parseInt(process.env.MIN_AUDIO_BYTES || '512', 10);
const MIN_AUDIO_DURATION_SEC = parseFloat(process.env.MIN_AUDIO_DURATION_SEC || '0.35');

// Venv python path
const VENV_PYTHON = path.join(__dirname, 'venv', 'bin', 'python');
const WHISPER_SCRIPT = path.join(__dirname, 'local_whisper.py');
const BUILD_COMMIT = process.env.VOICE_BRIDGE_BUILD_COMMIT || 'cc355f4';

// ===== Structured Logger =====
const LOG_FILE = process.env.LOG_FILE || '/tmp/voice-bridge.log';
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] || 1;

// Open log file stream (append mode)
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return undefined;
}

function nextServerRequestId() {
  requestCounter += 1;
  return `req_${Date.now()}_${requestCounter}`;
}

function extractSessionId(req, data = null) {
  return firstNonEmpty(
    data?.sessionId,
    data?.payload?.sessionId,
    req?.headers?.['x-session-id'],
    req?.body?.sessionId,
    Array.isArray(req?.body?.events) ? req.body.events.find((event) => event?.sessionId)?.sessionId : undefined,
    req?.sessionId,
  );
}

function extractRequestId(req, data = null) {
  return firstNonEmpty(
    data?.requestId,
    data?.reqId,
    data?.payload?.requestId,
    req?.headers?.['x-request-id'],
    req?.body?.requestId,
    req?.reqId,
  );
}

function attachTraceContext(req, data = null) {
  if (!req) {
    return {
      requestId: firstNonEmpty(data?.requestId, data?.reqId),
      sessionId: firstNonEmpty(data?.sessionId),
    };
  }

  const requestId = extractRequestId(req, data) || nextServerRequestId();
  const sessionId = extractSessionId(req, data);

  req.reqId = requestId;
  if (sessionId) req.sessionId = sessionId;

  return { requestId, sessionId: sessionId || null };
}

function writeTraceHeaders(res, trace) {
  if (!res?.setHeader || !trace?.requestId) return;
  res.setHeader('X-Request-Id', trace.requestId);
  if (trace.sessionId) {
    res.setHeader('X-Session-Id', trace.sessionId);
  }
}

function normalizeLogData(data = null) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      requestId: firstNonEmpty(data?.requestId, data?.reqId),
      sessionId: firstNonEmpty(data?.sessionId),
      step: undefined,
      duration: undefined,
      payload: data,
    };
  }

  const payload = { ...data };
  const requestId = firstNonEmpty(payload.requestId, payload.reqId);
  const sessionId = firstNonEmpty(payload.sessionId);
  const step = firstNonEmpty(payload.step);
  const duration = payload.duration ?? payload.ms ?? payload.totalMs ?? payload.apiMs ?? payload.whisperMs;

  delete payload.requestId;
  delete payload.reqId;
  delete payload.sessionId;
  delete payload.step;
  delete payload.duration;

  return { requestId, sessionId, step, duration, payload };
}

function log(level, component, message, data = null) {
  if (LOG_LEVELS[level] < LOG_LEVEL) return;

  const normalized = normalizeLogData(data);
  const now = new Date().toISOString();
  const entry = {
    timestamp: now,
    level,
    component,
    step: normalized.step || component,
    msg: message,
    requestId: normalized.requestId || null,
    sessionId: normalized.sessionId || null,
    ...(normalized.duration !== undefined ? { duration: normalized.duration } : {}),
    ...(normalized.payload !== undefined ? { payload: normalized.payload } : {}),
    // Backward-compatible fields for existing tooling
    ts: now,
    ...(data && { data }),
  };

  const line = JSON.stringify(entry);

  // Console output with emoji
  const emoji = { debug: '🔍', info: 'ℹ️', warn: '⚠️', error: '❌' }[level] || '📋';
  console.log(`${emoji} [${component}] ${message}`, normalized.payload ? JSON.stringify(normalized.payload).substring(0, 180) : '');

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
  const trace = attachTraceContext(req);
  const t0 = Date.now();

  writeTraceHeaders(res, trace);

  res.on('finish', () => {
    const ms = Date.now() - t0;
    if (req.path !== '/health' && req.path !== '/favicon.ico') {
      log('info', 'HTTP', `${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`, {
        requestId: req.reqId || trace.requestId,
        sessionId: req.sessionId || trace.sessionId,
        step: 'http_request',
        duration: ms,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        size: req.file?.size,
        ip: req.ip,
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
  constructor(maxWorkers, options = {}) {
    this.maxWorkers = maxWorkers;
    this.maxQueue = options.maxQueue || WHISPER_MAX_QUEUE;
    this.queueTtlMs = options.queueTtlMs || WHISPER_QUEUE_TTL_MS;
    this.activeWorkers = 0;
    this.activeSessions = new Set();
    this.queue = [];
  }

  async process(audioPath, trace = {}, options = {}) {
    return new Promise((resolve, reject) => {
      this._cleanupExpiredQueue();

      if (this.queue.length >= this.maxQueue) {
        const error = new Error('Whisper queue full');
        error.code = 'queue_full';
        return reject(error);
      }

      this.queue.push({
        audioPath,
        resolve,
        reject,
        trace,
        sessionId: trace?.sessionId || null,
        fileSize: options.fileSize || 0,
        enqueueAt: Date.now(),
        expiresAt: Date.now() + this.queueTtlMs,
      });

      this._drainQueue();
    });
  }

  getStats() {
    return {
      activeWorkers: this.activeWorkers,
      maxWorkers: this.maxWorkers,
      queued: this.queue.length,
      activeSessions: this.activeSessions.size,
      maxQueue: this.maxQueue,
      queueTtlMs: this.queueTtlMs,
    };
  }

  _cleanupExpiredQueue() {
    const now = Date.now();
    const keep = [];

    for (const task of this.queue) {
      if (task.expiresAt <= now) {
        const error = new Error('Whisper queue wait expired');
        error.code = 'queue_timeout';
        task.reject(error);
        log('warn', 'Whisper', 'Dropped stale queued task', {
          requestId: task.trace?.requestId,
          sessionId: task.trace?.sessionId,
          step: 'whisper_queue_drop_stale',
          queueWaitMs: now - task.enqueueAt,
          file: path.basename(task.audioPath),
        });
      } else {
        keep.push(task);
      }
    }

    this.queue = keep;
  }

  _findNextRunnableTaskIndex() {
    let bestIndex = -1;

    for (let idx = 0; idx < this.queue.length; idx += 1) {
      const task = this.queue[idx];
      if (task.sessionId && this.activeSessions.has(task.sessionId)) continue;

      if (bestIndex === -1) {
        bestIndex = idx;
        continue;
      }

      const best = this.queue[bestIndex];
      const taskRank = task.fileSize || Number.MAX_SAFE_INTEGER;
      const bestRank = best.fileSize || Number.MAX_SAFE_INTEGER;
      if (taskRank < bestRank || (taskRank === bestRank && task.enqueueAt < best.enqueueAt)) {
        bestIndex = idx;
      }
    }

    return bestIndex;
  }

  _drainQueue() {
    this._cleanupExpiredQueue();

    while (this.activeWorkers < this.maxWorkers) {
      const nextIndex = this._findNextRunnableTaskIndex();
      if (nextIndex === -1) break;
      const [task] = this.queue.splice(nextIndex, 1);
      this._runTask(task);
    }
  }

  _runTask(task) {
    this.activeWorkers += 1;
    if (task.sessionId) this.activeSessions.add(task.sessionId);

    const t0 = Date.now();
    const queueWaitMs = t0 - task.enqueueAt;

    log('info', 'Whisper', `Worker start (${this.activeWorkers}/${this.maxWorkers})`, {
      requestId: task.trace?.requestId,
      sessionId: task.trace?.sessionId,
      step: 'whisper_worker_start',
      model: WHISPER_MODEL,
      file: path.basename(task.audioPath),
      queueLen: this.queue.length,
      queueWaitMs,
      activeSessions: this.activeSessions.size,
    });

    const python = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';
    const proc = spawn(python, [WHISPER_SCRIPT, task.audioPath], {
      env: { ...process.env, WHISPER_MODEL }
    });

    let stdout = '';
    let stderr = '';
    let finished = false;

    const finalize = (error, result = null) => {
      if (finished) return;
      finished = true;
      this._complete(task, error, result, t0, queueWaitMs);
    };

    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });

    const timeout = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      const error = new Error('Whisper timeout');
      error.code = 'timeout';
      log('error', 'Whisper', `Timeout (${WHISPER_TIMEOUT_MS}ms)`, {
        requestId: task.trace?.requestId,
        sessionId: task.trace?.sessionId,
        step: 'whisper_worker_timeout',
        file: path.basename(task.audioPath),
        queueWaitMs,
      });
      finalize(error);
    }, WHISPER_TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (finished) return;

      if (code !== 0) {
        const error = new Error(`Whisper failed: ${stderr || stdout}`);
        error.code = 'process_failed';
        log('error', 'Whisper', `Failed (code ${code})`, {
          requestId: task.trace?.requestId,
          sessionId: task.trace?.sessionId,
          step: 'whisper_worker_failed',
          stderr: stderr.substring(0, 200),
          queueWaitMs,
        });
        finalize(error);
        return;
      }

      try {
        const result = JSON.parse(stdout);
        log('info', 'Whisper', `Done (${Date.now() - t0}ms)`, {
          requestId: task.trace?.requestId,
          sessionId: task.trace?.sessionId,
          step: 'whisper_worker_done',
          duration: Date.now() - t0,
          text: (result.text || '').substring(0, 80),
          textLen: (result.text || '').length,
          queueWaitMs,
          emptyReason: result.metadata?.emptyReason,
          qualityFlags: result.metadata?.qualityFlags,
        });
        finalize(null, result);
      } catch (e) {
        const error = new Error(`Invalid JSON from Whisper: ${stdout}`);
        error.code = 'invalid_json';
        log('error', 'Whisper', 'Invalid JSON output', {
          requestId: task.trace?.requestId,
          sessionId: task.trace?.sessionId,
          step: 'whisper_worker_invalid_json',
          stdout: stdout.substring(0, 200),
          queueWaitMs,
        });
        finalize(error);
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      if (finished) return;
      err.code = err.code || 'process_error';
      log('error', 'Whisper', 'Process error', {
        requestId: task.trace?.requestId,
        sessionId: task.trace?.sessionId,
        step: 'whisper_worker_process_error',
        error: err.message,
        stack: err.stack?.substring(0, 300),
        queueWaitMs,
      });
      finalize(err);
    });
  }

  _complete(task, error, result, t0, queueWaitMs = 0) {
    this.activeWorkers = Math.max(0, this.activeWorkers - 1);
    if (task.sessionId) this.activeSessions.delete(task.sessionId);
    const ms = t0 ? Date.now() - t0 : 0;

    log(error ? 'warn' : 'debug', 'Whisper', `Worker done (${this.activeWorkers}/${this.maxWorkers}, ${ms}ms)`, {
      requestId: task.trace?.requestId,
      sessionId: task.trace?.sessionId,
      step: 'whisper_worker_release',
      duration: ms,
      queueWaitMs,
      error: error?.message,
    });

    if (error) {
      task.reject(error);
    } else {
      task.resolve(result);
    }

    setImmediate(() => this._drainQueue());
  }
}

const whisperPool = new WhisperWorkerPool(WHISPER_WORKERS, {
  maxQueue: WHISPER_MAX_QUEUE,
  queueTtlMs: WHISPER_QUEUE_TTL_MS,
});


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

function safeUnlink(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, () => {});
}

async function probeAudio(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;

  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      filePath,
    ]);

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    ffprobe.stdout.on('data', (data) => { stdout += data.toString(); });
    ffprobe.stderr.on('data', (data) => { stderr += data.toString(); });

    ffprobe.on('close', (code) => {
      if (code !== 0) return finish(null);
      try {
        const parsed = JSON.parse(stdout || '{}');
        const audioStream = (parsed.streams || []).find((stream) => stream.codec_type === 'audio') || {};
        const duration = Number(parsed.format?.duration || audioStream.duration || 0);
        finish({
          durationSec: Number.isFinite(duration) ? duration : null,
          sampleRate: audioStream.sample_rate ? Number(audioStream.sample_rate) : null,
          channels: audioStream.channels || null,
          codec: audioStream.codec_name || null,
          bitRate: parsed.format?.bit_rate ? Number(parsed.format.bit_rate) : null,
        });
      } catch {
        finish(null);
      }
    });

    ffprobe.on('error', () => finish(null));

    setTimeout(() => {
      try { ffprobe.kill('SIGKILL'); } catch {}
      finish(null);
    }, 3000);
  });
}

async function normalizeAudio(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y', '-i', inputPath,
      '-vn',
      '-ac', '1',
      '-ar', '16000',
      '-acodec', 'pcm_s16le',
      '-loglevel', 'error',
      outputPath,
    ]);

    let stderr = '';
    let settled = false;

    const finish = (err = null) => {
      if (settled) return;
      settled = true;
      if (err) reject(err); else resolve();
    };

    ffmpeg.stderr.on('data', (d) => { stderr += d.toString(); });
    ffmpeg.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        finish();
      } else {
        finish(new Error(`ffmpeg failed (code ${code}): ${stderr.substring(0, 200)}`));
      }
    });
    ffmpeg.on('error', (err) => finish(err));
    setTimeout(() => {
      try { ffmpeg.kill('SIGKILL'); } catch {}
      finish(new Error('ffmpeg timeout'));
    }, 15000);
  });
}

function classifyAsrError(error) {
  switch (error?.code) {
    case 'timeout':
      return { status: 504, reason: 'timeout', message: 'Whisper timeout' };
    case 'queue_timeout':
      return { status: 504, reason: 'queue_timeout', message: 'Whisper queue wait expired' };
    case 'queue_full':
      return { status: 503, reason: 'queue_full', message: 'Whisper queue full' };
    default:
      return { status: 500, reason: 'transcription_failure', message: error?.message || 'Transcription failed' };
  }
}



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
    whisperQueue: whisperPool.getStats(),
    buildCommit: BUILD_COMMIT,
  });
});

/**
 * POST /api/transcribe
 * Local Whisper transcription (parallel via worker pool)
 */
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  const t0 = Date.now();
  const trace = attachTraceContext(req, req.body);
  let audioPath = null;
  let normalizedPath = null;

  try {
    if (!req.file) {
      log('warn', 'ASR', 'No audio file in request', {
        requestId: trace.requestId,
        sessionId: trace.sessionId,
        step: 'asr_missing_audio',
      });
      return res.status(400).json({ error: 'No audio file provided' });
    }

    audioPath = req.file.path;
    normalizedPath = `${audioPath}_normalized.wav`;
    let processPath = audioPath;

    log('info', 'ASR', 'Received audio', {
      requestId: trace.requestId,
      sessionId: trace.sessionId,
      step: 'asr_receive_audio',
      size: req.file.size,
      mime: req.file.mimetype,
      originalName: req.file.originalname,
    });

    if (req.file.size < MIN_AUDIO_BYTES) {
      log('warn', 'ASR', `Skipping tiny audio: ${req.file.size} bytes`, {
        requestId: trace.requestId,
        sessionId: trace.sessionId,
        step: 'asr_skip_tiny_audio',
        size: req.file.size,
      });
      return res.json(buildAsrResponse({
        text: '',
        trace,
        skipped: true,
        metadata: { emptyReason: 'audio_too_short', sourceBytes: req.file.size },
        quality: assessTextQuality('', { emptyReason: 'audio_too_short' }),
      }));
    }

    const inputProbe = await probeAudio(audioPath);
    const normT0 = Date.now();
    try {
      await normalizeAudio(audioPath, normalizedPath);
      processPath = normalizedPath;
      const normSize = fs.statSync(normalizedPath).size;
      log('info', 'ASR', `Normalized (${Date.now() - normT0}ms)`, {
        requestId: trace.requestId,
        sessionId: trace.sessionId,
        step: 'asr_audio_normalized',
        duration: Date.now() - normT0,
        from: req.file.size,
        to: normSize,
      });
    } catch (normErr) {
      log('warn', 'ASR', 'Normalization failed, using original', {
        requestId: trace.requestId,
        sessionId: trace.sessionId,
        step: 'asr_normalization_failed',
        error: normErr.message,
      });
    }

    const processStats = fs.statSync(processPath);
    const effectiveDurationSec = inputProbe?.durationSec ?? null;

    if (effectiveDurationSec !== null && effectiveDurationSec < MIN_AUDIO_DURATION_SEC) {
      log('warn', 'ASR', 'Audio too short after probe', {
        requestId: trace.requestId,
        sessionId: trace.sessionId,
        step: 'asr_skip_short_duration',
        durationSec: effectiveDurationSec,
        size: processStats.size,
      });
      return res.json(buildAsrResponse({
        text: '',
        trace,
        skipped: true,
        metadata: {
          emptyReason: 'audio_too_short',
          durationSec: effectiveDurationSec,
          sourceBytes: processStats.size,
        },
        quality: assessTextQuality('', { emptyReason: 'audio_too_short', durationSec: effectiveDurationSec }),
      }));
    }

    log('info', 'ASR', 'Queuing for Whisper', {
      requestId: trace.requestId,
      sessionId: trace.sessionId,
      step: 'asr_queue_whisper',
      size: processStats.size,
      model: WHISPER_MODEL,
      durationSec: effectiveDurationSec,
      queue: whisperPool.getStats(),
    });

    const whisperT0 = Date.now();
    let result;
    try {
      result = await whisperPool.process(processPath, trace, { fileSize: processStats.size });
    } catch (workerErr) {
      const classified = classifyAsrError(workerErr);
      log(classified.status >= 500 ? 'error' : 'warn', 'ASR', classified.message, {
        requestId: trace.requestId,
        sessionId: trace.sessionId,
        step: 'asr_worker_error',
        duration: Date.now() - whisperT0,
        reason: classified.reason,
        error: workerErr.message,
      });
      return res.status(classified.status).json({
        error: classified.message,
        reason: classified.reason,
        requestId: trace.requestId,
        sessionId: trace.sessionId || undefined,
      });
    }
    const whisperMs = Date.now() - whisperT0;

    const metadata = {
      ...(result.metadata || {}),
      inputProbe,
      sourceBytes: req.file.size,
      processedBytes: processStats.size,
      whisperMs,
    };

    if (!result.success) {
      const reason = metadata.emptyReason || 'transcription_failure';
      log('error', 'ASR', 'Whisper returned error', {
        requestId: trace.requestId,
        sessionId: trace.sessionId,
        step: 'asr_whisper_error',
        duration: whisperMs,
        error: result.error,
        reason,
      });
      return res.status(500).json({
        error: result.error || 'Transcription failed',
        reason,
        requestId: trace.requestId,
        sessionId: trace.sessionId || undefined,
      });
    }

    const quality = assessTextQuality(result.text || '', metadata);
    if (!quality.allowed) {
      const totalMs = Date.now() - t0;
      log('warn', 'ASR', 'Filtered low-quality transcription', {
        requestId: trace.requestId,
        sessionId: trace.sessionId,
        step: 'asr_filtered_low_quality',
        duration: totalMs,
        whisperMs,
        text: (result.text || '').substring(0, 120),
        reason: quality.primaryReason,
        reasons: quality.reasons,
        metadata,
      });
      return res.json(buildAsrResponse({
        text: '',
        trace,
        skipped: true,
        metadata,
        quality,
      }));
    }

    const totalMs = Date.now() - t0;
    log('info', 'ASR', `Complete (${totalMs}ms)`, {
      requestId: trace.requestId,
      sessionId: trace.sessionId,
      step: 'asr_complete',
      duration: totalMs,
      text: (result.text || '').substring(0, 80),
      textLen: (result.text || '').length,
      whisperMs,
      totalMs,
      metadata,
    });

    return res.json(buildAsrResponse({
      text: quality.normalizedText,
      trace,
      metadata,
      quality,
      skipped: false,
    }));
  } catch (err) {
    log('error', 'ASR', 'Unhandled error', {
      requestId: trace.requestId,
      sessionId: trace.sessionId,
      step: 'asr_unhandled_error',
      duration: Date.now() - t0,
      error: err.message,
      stack: err.stack?.substring(0, 500),
    });
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  } finally {
    if (normalizedPath && normalizedPath !== audioPath) safeUnlink(normalizedPath);
    safeUnlink(audioPath);
  }
});


/**
 * POST /api/translate
 * Proxy to Zhipu GLM-4-flash for translation + vocabulary
 */
app.post('/api/translate', async (req, res) => {
  const t0 = Date.now();
  const trace = attachTraceContext(req, req.body);
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'No text provided' });
    }

    const inputQuality = assessTextQuality(text, req.body?.asr?.metadata || req.body?.asrMeta || {});
    if (!inputQuality.allowed) {
      log('warn', 'Translate', 'Skipped low-quality translation input', {
        requestId: trace.requestId,
        sessionId: trace.sessionId,
        step: 'translate_skip_low_quality',
        reason: inputQuality.primaryReason,
        reasons: inputQuality.reasons,
        text: String(text).substring(0, 120),
      });
      return res.json({
        translation: '',
        words: [],
        skipped: true,
        reason: inputQuality.primaryReason,
        requestId: trace.requestId,
        sessionId: trace.sessionId || undefined,
      });
    }

    if (!ZHIPU_API_KEY) {
      log('error', 'Translate', 'ZHIPU_API_KEY not configured');
      return res.status(500).json({ error: 'ZHIPU_API_KEY not configured' });
    }

    const safeText = inputQuality.normalizedText;
    log('info', 'Translate', 'Start', {
      requestId: trace.requestId,
      sessionId: trace.sessionId,
      step: 'translate_start',
      inputLen: safeText.length,
      text: safeText.substring(0, 80),
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
            { role: 'user', content: safeText },
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
        requestId: trace.requestId,
        sessionId: trace.sessionId,
        step: 'translate_api_error',
        duration: apiMs,
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
      requestId: trace.requestId,
      sessionId: trace.sessionId,
      step: 'translate_complete',
      duration: totalMs,
      sourceText: safeText.substring(0, 120),
      translation: content.substring(0, 120),
      apiMs,
      totalMs,
    });

    return res.json({ translation: content.trim(), words: [], requestId: trace.requestId, sessionId: trace.sessionId || undefined });
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    log('error', 'Translate', isTimeout ? 'Timeout (10s)' : 'Unhandled error', {
      requestId: trace.requestId,
      sessionId: trace.sessionId,
      step: isTimeout ? 'translate_timeout' : 'translate_unhandled_error',
      duration: Date.now() - t0,
      error: err.message,
      stack: isTimeout ? undefined : err.stack?.substring(0, 500),
    });
    return res.status(500).json({ error: isTimeout ? 'Translation timeout' : 'Internal server error' });
  }
});


/**
 * POST /api/translate/stream
 * Streaming translation via SSE
 */
app.post('/api/translate/stream', async (req, res) => {
  const trace = attachTraceContext(req, req.body);
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'No text provided' });
    }

    const inputQuality = assessTextQuality(text, req.body?.asr?.metadata || req.body?.asrMeta || {});
    if (!inputQuality.allowed) {
      log('warn', 'Translate', 'Skipped low-quality stream input', {
        requestId: trace.requestId,
        sessionId: trace.sessionId,
        step: 'translate_stream_skip_low_quality',
        reason: inputQuality.primaryReason,
        reasons: inputQuality.reasons,
      });
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`data: ${JSON.stringify({ skipped: true, reason: inputQuality.primaryReason, requestId: trace.requestId })}

`);
      res.end();
      return;
    }

    if (!ZHIPU_API_KEY) {
      return res.status(500).json({ error: 'ZHIPU_API_KEY not configured' });
    }

    const safeText = inputQuality.normalizedText;
    log('info', 'Translate', 'Stream start', {
      requestId: trace.requestId,
      sessionId: trace.sessionId,
      step: 'translate_stream_start',
      inputLen: safeText.length,
      text: safeText.substring(0, 80),
    });

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
            { role: 'user', content: safeText },
          ],
          temperature: 0.1,
          max_tokens: 256,
          stream: true,
        }),
      }
    );

    clearTimeout(streamTimeout);

    if (!response.ok) {
      log('error', 'Translate', 'Stream API error', {
        requestId: trace.requestId,
        sessionId: trace.sessionId,
        step: 'translate_stream_api_error',
        status: response.status,
      });
      res.write(`data: ${JSON.stringify({ error: 'API error', requestId: trace.requestId })}

`);
      res.end();
      return;
    }

    response.body.on('data', (chunk) => {
      res.write(chunk);
    });

    response.body.on('end', () => {
      log('info', 'Translate', 'Stream complete', {
        requestId: trace.requestId,
        sessionId: trace.sessionId,
        step: 'translate_stream_complete',
      });
      res.end();
    });

    response.body.on('error', (err) => {
      log('error', 'Translate', 'Stream error', {
        requestId: trace.requestId,
        sessionId: trace.sessionId,
        step: 'translate_stream_error',
        error: err.message,
      });
      console.error('Stream error:', err);
      res.end();
    });

    req.on('close', () => {
      response.body.destroy();
    });
  } catch (err) {
    log('error', 'Translate', 'Stream unhandled error', {
      requestId: trace.requestId,
      sessionId: trace.sessionId,
      step: 'translate_stream_unhandled_error',
      error: err.message,
      stack: err.stack?.substring(0, 500),
    });
    console.error('Stream translate error:', err);
    res.status(500).json({ error: 'Internal server error', requestId: trace.requestId });
  }
});


/**
 * POST /api/error
 * Frontend error reporting endpoint
 */
app.post('/api/error', (req, res) => {
  const trace = attachTraceContext(req, req.body);
  const { error, stack, context, userAgent, timestamp } = req.body;

  const entry = {
    requestId: trace.requestId,
    sessionId: trace.sessionId,
    step: 'client_error',
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

  res.json({ received: true, requestId: trace.requestId, sessionId: trace.sessionId || undefined });
});

/**
 * POST /api/logs
 * Receive batched frontend analytics events
 */
app.post('/api/logs', (req, res) => {
  const trace = attachTraceContext(req, req.body);
  const events = Array.isArray(req.body?.events) ? req.body.events : [];

  if (events.length === 0) {
    log('warn', 'FrontendEvent', 'Empty analytics batch', {
      requestId: trace.requestId,
      sessionId: trace.sessionId,
      step: 'frontend_logs_empty_batch',
    });
    return res.status(400).json({ error: 'No events provided', requestId: trace.requestId });
  }

  const acceptedEvents = events.slice(0, 200);
  for (const event of acceptedEvents) {
    const eventName = firstNonEmpty(event?.event, 'unknown_event');
    const eventRequestId = firstNonEmpty(event?.requestId, trace.requestId);
    const eventSessionId = firstNonEmpty(event?.sessionId, req.body?.sessionId, trace.sessionId);
    log('info', 'FrontendEvent', `fe_${eventName}`, {
      requestId: eventRequestId,
      sessionId: eventSessionId,
      step: `fe_${eventName}`,
      frontendTimestamp: event?.timestamp || null,
      batchRequestId: trace.requestId,
      payload: {
        event: eventName,
        payload: event?.payload || {},
        userId: event?.userId || null,
      },
    });
  }

  log('info', 'FrontendEvent', 'Analytics batch accepted', {
    requestId: trace.requestId,
    sessionId: trace.sessionId,
    step: 'frontend_logs_batch',
    accepted: acceptedEvents.length,
    dropped: Math.max(events.length - acceptedEvents.length, 0),
  });

  res.json({
    ok: true,
    accepted: acceptedEvents.length,
    dropped: Math.max(events.length - acceptedEvents.length, 0),
    requestId: trace.requestId,
    sessionId: trace.sessionId || undefined,
  });
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
