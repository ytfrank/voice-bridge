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
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'tiny';
const WHISPER_WORKERS = parseInt(process.env.WHISPER_WORKERS || '3', 10);

// Venv python path
const VENV_PYTHON = path.join(__dirname, 'venv', 'bin', 'python');
const WHISPER_SCRIPT = path.join(__dirname, 'local_whisper.py');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Multer for file uploads (audio chunks)
const upload = multer({
  dest: '/tmp/voice-bridge-uploads/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
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
    console.log(`[Transcribe] Queuing: ${audioPath}`);

    const result = await whisperPool.process(audioPath);

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

    const systemPrompt = `你是一位专业的英语翻译和教学助手。请对以下英文进行：
1. 翻译成自然流畅的中文
2. 标记出3-5个对中文母语学习者可能较难的生词

请严格以 JSON 格式返回：
{
  "translation": "中文翻译",
  "words": [
    {
      "word": "英文单词",
      "phonetic": "/音标/",
      "homophone": "中文谐音",
      "meaning": "中文释义",
      "example": "英文例句"
    }
  ]
}

注意：
- 如果文本很短或很简单，words 数组可以为空
- phonetic 必须使用国际音标格式
- homophone 是中文谐音读法（帮助记忆发音）
- 只返回 JSON，不要其他文字`;

    const response = await fetch(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      {
        method: 'POST',
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
          temperature: 0.3,
          response_format: { type: 'json_object' },
        }),
      }
    );

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

    const response = await fetch(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ZHIPU_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4-flash',
          messages: [
            {
              role: 'system',
              content: '你是翻译助手。请将以下英文翻译成自然流畅的中文。只输出中文翻译，不要其他内容。',
            },
            { role: 'user', content: text },
          ],
          temperature: 0.3,
          stream: true,
        }),
      }
    );

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
