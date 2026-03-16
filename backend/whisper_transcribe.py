#!/usr/bin/env python3
"""
Local Whisper transcription script for VoiceBridge BFF
Usage: python3 whisper_transcribe.py <audio_file_path> [model_size]
"""

import sys
import json
import whisper

def transcribe(audio_path, model_size='tiny'):
    """Transcribe audio file using local Whisper model"""
    try:
        # Load model (cached after first load)
        model = whisper.load_model(model_size)
        
        # Transcribe
        result = model.transcribe(audio_path, language='en')
        
        return {
            'success': True,
            'text': result['text'].strip()
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'No audio file provided'}))
        sys.exit(1)
    
    audio_path = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else 'tiny'
    
    result = transcribe(audio_path, model_size)
    print(json.dumps(result))
