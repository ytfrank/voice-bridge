/**
 * VoiceBridge BFF (Backend for Frontend)
 * Uses local Whisper for ASR, Zhipu GLM-4-flash for translation.
 * Multi-worker Whisper processing for parallel ASR.
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

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

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
    console.log(`[WhisperPool] Starting worker (${this.activeWorkers}/${this.maxWorkers})`);

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
      this._complete(task, new Error('Whisper timeout'));
    }, 30000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        this._complete(task, new Error(`Whisper failed: ${stderr || stdout}`));
      } else {
        try {
          const result = JSON.parse(stdout);
          this._complete(task, null, result);
        } catch (e) {
          this._complete(task, new Error(`Invalid JSON from Whisper: ${stdout}`));
        }
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      this._complete(task, err);
    });
  }

  _complete(task, error, result) {
    this.activeWorkers--;
    console.log(`[WhisperPool] Worker done (${this.activeWorkers}/${this.maxWorkers})`);
    
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
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const audioPath = req.file.path;

    // Skip empty/tiny audio files that cause Whisper "cannot reshape tensor" errors
    if (req.file.size < 1024) {
      console.warn(`[Transcribe] Skipping tiny audio: ${req.file.size} bytes`);
      fs.unlink(audioPath, () => {});
      return res.json({ text: '', skipped: true, reason: 'audio_too_short' });
    }

    // Normalize audio: convert to mono 16kHz WAV (Whisper's native format)
    // This handles: video files (.mov/.mp4), stereo audio, non-standard sample rates,
    // and ensures consistent input regardless of client format
    const normalizedPath = audioPath + '_normalized.wav';
    let processPath = audioPath;
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
            reject(new Error(`ffmpeg normalization failed (code ${code}): ${stderr.substring(0, 200)}`));
          }
        });
        ffmpeg.on('error', reject);
        // Timeout: 15s for normalization
        setTimeout(() => { try { ffmpeg.kill(); } catch {} reject(new Error('ffmpeg timeout')); }, 15000);
      });
      processPath = normalizedPath;
      const normSize = fs.statSync(normalizedPath).size;
      console.log(`[Transcribe] Normalized: ${req.file.size} → ${normSize} bytes (mono 16kHz WAV)`);
    } catch (normErr) {
      console.warn(`[Transcribe] Normalization failed, using original: ${normErr.message}`);
      // Fall back to original file - Whisper might still handle it
    }

    console.log(`[Transcribe] Queuing: ${processPath} (${fs.statSync(processPath).size} bytes)`);

    const result = await whisperPool.process(processPath);
    // Clean up normalized file
    if (processPath !== audioPath) fs.unlink(normalizedPath, () => {});

    // Clean up temp file
    fs.unlink(audioPath, () => {});

    if (!result.success) {
      console.error('[Transcribe] Error:', result.error);
      return res.status(500).json({ error: result.error || 'Transcription failed' });
    }

    console.log(`[Transcribe] Result: "${result.text}"`);
    res.json({ text: result.text || '' });
  } catch (err) {
    console.error('[Transcribe] Error:', err);
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

/**
 * POST /api/translate
 * Proxy to Zhipu GLM-4-flash for translation + vocabulary
 */
app.post('/api/translate', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'No text provided' });
    }

    if (!ZHIPU_API_KEY) {
      return res.status(500).json({ error: 'ZHIPU_API_KEY not configured' });
    }

    const systemPrompt = `翻译英文为中文，标注2-3个难词。JSON格式：{"translation":"中文","words":[{"word":"词","meaning":"义"}]}。短句words可为空。只返回JSON。`;

    // AbortController for 10s timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

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

    if (!response.ok) {
      const errText = await response.text();
      console.error('GLM API error:', response.status, errText);
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
      parsed = {
        translation: content,
        words: [],
      };
    }

    res.json({
      translation: parsed.translation || content,
      words: parsed.words || [],
    });
  } catch (err) {
    console.error('Translate error:', err);
    res.status(500).json({ error: 'Internal server error' });
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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 VoiceBridge BFF running on http://0.0.0.0:${PORT}`);
  console.log(`🎤 Local Whisper: model=${WHISPER_MODEL}, workers=${WHISPER_WORKERS}`);
  console.log(`🐍 Python: ${fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'system python3'}`);
  if (ZHIPU_API_KEY) {
    console.log(`📡 GLM API Key: ${ZHIPU_API_KEY.slice(0, 8)}...`);
  } else {
    console.log(`⚠️ GLM API Key: not configured (translation disabled)`);
  }
});
