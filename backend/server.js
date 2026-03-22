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

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    whisper: WHISPER_MODEL,
    whisperWorkers: WHISPER_WORKERS,
    python: fs.existsSync(VENV_PYTHON) ? 'venv' : 'system'
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

    const systemPrompt = `翻译英文为中文，标注2-3个难词。JSON格式：{"translation":"中文","words":[{"word":"词","meaning":"义"}]}。短句words可为空。只返回JSON。`;

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
          response_format: { type: 'json_object' },
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
    const content = data.choices?.[0]?.message?.content || '{}';

    let parsed;
    try {
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      log('warn', 'Translate', 'JSON parse failed, using raw content', { content: content.substring(0, 100) });
      parsed = { translation: content, words: [] };
    }

    const totalMs = Date.now() - t0;
    log('info', 'Translate', `Complete (${totalMs}ms)`, {
      reqId: req.reqId,
      translation: (parsed.translation || '').substring(0, 60),
      wordsCount: (parsed.words || []).length,
      apiMs,
      totalMs,
    });

    res.json({
      translation: parsed.translation || content,
      words: parsed.words || [],
    });
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

// Start server
app.listen(PORT, '0.0.0.0', () => {
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
