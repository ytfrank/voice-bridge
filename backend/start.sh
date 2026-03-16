#!/bin/bash
# Start VoiceBridge BFF with local Whisper

cd "$(dirname "$0")"

# Activate virtual environment
source venv/bin/activate

# Start server
python server.py
