#!/usr/bin/env python3
"""
Local Whisper transcription using faster-whisper.
Usage: python local_whisper.py <audio_file_path>
Output: JSON with transcribed text
"""

import sys
import json
import os
from faster_whisper import WhisperModel

# Model size: tiny, base, small, medium, large
# tiny is fastest (~32x realtime), base is good balance
MODEL_SIZE = os.environ.get("WHISPER_MODEL", "tiny")

# Initialize model (downloads on first use, cached afterwards)
_model = None

def get_model():
    global _model
    if _model is None:
        # Use CPU with int8 for M-series Mac efficiency
        _model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
    return _model

def transcribe(audio_path):
    """Transcribe audio file and return text."""
    try:
        model = get_model()
        segments, info = model.transcribe(
            audio_path,
            language="en",
            beam_size=5,
            vad_filter=True,  # Voice activity detection
        )

        # Combine all segments
        text = " ".join(segment.text.strip() for segment in segments)
        return {"text": text, "language": info.language, "success": True}
    except Exception as e:
        return {"text": "", "error": str(e), "success": False}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No audio file provided", "success": False}))
        sys.exit(1)

    audio_path = sys.argv[1]
    if not os.path.exists(audio_path):
        print(json.dumps({"error": f"File not found: {audio_path}", "success": False}))
        sys.exit(1)

    result = transcribe(audio_path)
    print(json.dumps(result, ensure_ascii=False))
