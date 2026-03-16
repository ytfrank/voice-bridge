#!/usr/bin/env python3
"""
VoiceBridge BFF (Backend for Frontend) - Python version with local Whisper
Proxies requests to Zhipu API for translation, uses local Whisper for ASR.
"""

import os
import sys
import tempfile
import subprocess
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import whisper

# Load .env from backend dir or parent
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

app = Flask(__name__)
CORS(app)

PORT = int(os.environ.get('BFF_PORT', 3001))
ZHIPU_API_KEY = os.environ.get('ZHIPU_API_KEY')

# Load Whisper model (base for balance of speed/accuracy)
print("Loading Whisper model (base)...")
whisper_model = whisper.load_model("base")
print("Whisper model loaded!")

# Cache for loaded models
_models = {"base": whisper_model}


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "timestamp": __import__('datetime').datetime.now().isoformat(),
        "asr": "whisper-local"
    })


@app.route('/api/transcribe', methods=['POST'])
def transcribe():
    """
    Local Whisper transcription
    Accepts: multipart/form-data with 'audio' field (any audio format)
    Returns: { text: "transcribed text" }
    """
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400
    
    audio_file = request.files['audio']
    
    # Save to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp:
        audio_file.save(tmp.name)
        tmp_path = tmp.name
    
    try:
        # Transcribe with Whisper
        result = whisper_model.transcribe(tmp_path, language='en')
        text = result.get('text', '').strip()
        
        return jsonify({"text": text})
    except Exception as e:
        print(f"Transcribe error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        # Cleanup
        try:
            os.unlink(tmp_path)
        except:
            pass


@app.route('/api/translate', methods=['POST'])
def translate():
    """
    Proxy to Zhipu GLM-4-flash for translation + vocabulary
    Accepts: { text: "english text to translate" }
    Returns: { translation: "中文翻译", words: [...] }
    """
    import requests
    
    data = request.get_json()
    if not data or not data.get('text', '').strip():
        return jsonify({"error": "No text provided"}), 400
    
    text = data['text'].strip()
    
    if not ZHIPU_API_KEY:
        return jsonify({"error": "ZHIPU_API_KEY not configured"}), 500
    
    system_prompt = """你是一位专业的英语翻译和教学助手。请对以下英文进行：
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
- 只返回 JSON，不要其他文字"""
    
    try:
        resp = requests.post(
            'https://open.bigmodel.cn/api/paas/v4/chat/completions',
            headers={
                'Authorization': f'Bearer {ZHIPU_API_KEY}',
                'Content-Type': 'application/json',
            },
            json={
                'model': 'glm-4-flash',
                'messages': [
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user', 'content': text},
                ],
                'temperature': 0.3,
                'response_format': {'type': 'json_object'},
            },
            timeout=30,
        )
        
        if not resp.ok:
            return jsonify({"error": "Translation API error", "detail": resp.text}), resp.status_code
        
        result = resp.json()
        content = result.get('choices', [{}])[0].get('message', {}).get('content', '{}')
        
        # Parse JSON response
        try:
            # Remove markdown code blocks if present
            json_str = content.replace('```json\n', '').replace('```\n', '').replace('```', '').strip()
            parsed = json.loads(json_str)
        except:
            parsed = {"translation": content, "words": []}
        
        return jsonify({
            "translation": parsed.get("translation", content),
            "words": parsed.get("words", []),
        })
    except Exception as e:
        print(f"Translate error: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    print(f"🚀 VoiceBridge BFF (Python + Whisper) running on http://0.0.0.0:{PORT}")
    if ZHIPU_API_KEY:
        print(f"📡 Zhipu API Key: {ZHIPU_API_KEY[:8]}...")
    else:
        print("⚠️ ZHIPU_API_KEY not set - translation will fail")
    
    app.run(host='0.0.0.0', port=PORT, debug=False)
