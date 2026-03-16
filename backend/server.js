/**
 * VoiceBridge BFF (Backend for Frontend)
 * Proxies requests to Zhipu API, keeping API key secure.
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Load .env from backend dir or parent
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.BFF_PORT || 3001;
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;

if (!ZHIPU_API_KEY) {
  console.error('❌ ZHIPU_API_KEY not set! Set it in .env or environment.');
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Multer for file uploads (audio chunks)
const upload = multer({
  dest: '/tmp/voice-bridge-uploads/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * POST /api/transcribe
 * Local Whisper transcription (no API needed)
 * Accepts: multipart/form-data with 'audio' field
 * Returns: { text: "transcribed english text" }
 */
const { exec: execCallback } = require('child_process');
const { promisify } = require('util');
const exec = promisify(execCallback);

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const audioPath = req.file.path;
    const scriptPath = path.join(__dirname, 'whisper_transcribe.py');
    
    // Call local Whisper Python script
    const { stdout, stderr } = await exec(
      `python3 "${scriptPath}" "${audioPath}" tiny`,
      { timeout: 30000 } // 30s timeout
    );

    // Clean up temp file
    fs.unlink(audioPath, () => {});

    const result = JSON.parse(stdout.trim());
    
    if (!result.success) {
      console.error('Whisper error:', result.error);
      return res.status(500).json({ 
        error: 'Transcription failed', 
        detail: result.error 
      });
    }

    res.json({ text: result.text });
  } catch (err) {
    console.error('Transcribe error:', err);
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

/**
 * POST /api/translate
 * Proxy to Zhipu GLM-4-flash for translation + vocabulary
 * Accepts: { text: "english text to translate" }
 * Returns: { translation: "中文翻译", words: [...] }
 */
app.post('/api/translate', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'No text provided' });
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

    // Parse JSON response from GLM
    let parsed;
    try {
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      // Fallback: treat entire content as translation
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

    // Pipe the SSE stream
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

    // Handle client disconnect
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
  console.log(`📡 API Key: ${ZHIPU_API_KEY.slice(0, 8)}...`);
});
