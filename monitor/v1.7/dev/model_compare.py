#!/usr/bin/env python3
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path('/Users/bibo/projects/voice-bridge')
LOCAL_WHISPER = ROOT / 'backend' / 'local_whisper.py'
PYTHON = ROOT / 'backend' / 'venv' / 'bin' / 'python'
OUT = ROOT / 'monitor' / 'v1.7' / 'dev' / 'model_compare_results.json'

SAMPLES = [
    {
        'id': 'broadcast_musk',
        'audio': str(ROOT / 'tests' / 'fixtures' / 'audio' / 'musk_21s_correct.wav'),
        'ground_truth': 'and for most of actually human history that China has been the most powerful nation on earth and so you can expect that they will do many great things SpaceX being one of them that is simply a result of the immense amount of talent',
    },
    {
        'id': 'face_short',
        'audio': str(ROOT / 'monitor' / 'v1.7' / 'qa' / 'samples' / 'face_short.aiff'),
        'ground_truth': 'Hello, how are you today?',
    },
    {
        'id': 'face_medium',
        'audio': str(ROOT / 'monitor' / 'v1.7' / 'qa' / 'samples' / 'face_medium.aiff'),
        'ground_truth': 'The quick brown fox jumps over the lazy dog.',
    },
]

MODELS = ['medium', 'large-v3', 'turbo']
RUNS = 2


def norm(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", "", text)
    return " ".join(text.split())


def wer(gt: str, hyp: str) -> float:
    a = norm(gt).split()
    b = norm(hyp).split()
    n, m = len(a), len(b)
    dp = [[0]*(m+1) for _ in range(n+1)]
    for i in range(n+1):
        dp[i][0] = i
    for j in range(m+1):
        dp[0][j] = j
    for i in range(1, n+1):
        for j in range(1, m+1):
            if a[i-1] == b[j-1]:
                dp[i][j] = dp[i-1][j-1]
            else:
                dp[i][j] = min(dp[i-1][j-1]+1, dp[i-1][j]+1, dp[i][j-1]+1)
    return dp[n][m] / max(n, 1)


def run_one(model: str, audio: str):
    env = os.environ.copy()
    env['WHISPER_MODEL'] = model
    cmd = ['/usr/bin/time', '-l', str(PYTHON), str(LOCAL_WHISPER), audio]
    t0 = time.time()
    proc = subprocess.run(cmd, capture_output=True, text=True, env=env)
    wall_ms = round((time.time() - t0) * 1000, 2)
    stderr = proc.stderr or ''
    stdout = proc.stdout or ''
    mem_match = re.search(r'([0-9]+)\s+maximum resident set size', stderr)
    peak_rss_bytes = int(mem_match.group(1)) if mem_match else None
    json_text = stdout.strip().splitlines()[-1] if stdout.strip() else '{}'
    data = json.loads(json_text)
    return {
        'returncode': proc.returncode,
        'wall_ms': wall_ms,
        'peak_rss_bytes': peak_rss_bytes,
        'stderr_tail': '\n'.join(stderr.strip().splitlines()[-5:]),
        'data': data,
    }


results = {'models': []}
for model in MODELS:
    model_entry = {'model': model, 'runs': []}
    print(f'=== model {model} ===', flush=True)
    for sample in SAMPLES:
      sample_runs = []
      print(f"  -> {sample['id']}", flush=True)
      for i in range(RUNS):
          r = run_one(model, sample['audio'])
          text = (r['data'].get('text') or '').strip()
          w = wer(sample['ground_truth'], text) if r['returncode'] == 0 else 1.0
          sample_runs.append({
              'run': i + 1,
              'sample_id': sample['id'],
              'audio': sample['audio'],
              'ground_truth': sample['ground_truth'],
              'text': text,
              'success': r['data'].get('success'),
              'metadata': r['data'].get('metadata'),
              'wall_ms': r['wall_ms'],
              'peak_rss_bytes': r['peak_rss_bytes'],
              'wer': round(w, 6),
              'accuracy': round(1 - w, 6),
              'returncode': r['returncode'],
              'stderr_tail': r['stderr_tail'],
          })
      model_entry['runs'].append({'sample': sample['id'], 'results': sample_runs})
    results['models'].append(model_entry)
    OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2))

OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2))
print(f'written: {OUT}')
