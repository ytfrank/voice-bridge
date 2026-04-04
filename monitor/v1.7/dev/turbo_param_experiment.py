#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import statistics
import subprocess
import time
from pathlib import Path

ROOT = Path('/Users/bibo/projects/voice-bridge')
PYTHON = ROOT / 'backend' / 'venv' / 'bin' / 'python'
LOCAL_WHISPER = ROOT / 'backend' / 'local_whisper.py'
OUT = ROOT / 'monitor' / 'v1.7' / 'dev' / 'turbo_param_experiment_results.json'

SAMPLES = [
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
    {
        'id': 'musk_21s',
        'audio': str(ROOT / 'tests' / 'fixtures' / 'audio' / 'musk_21s_correct.wav'),
        'ground_truth': 'and for most of actually human history that China has been the most powerful nation on earth and so you can expect that they will do many great things SpaceX being one of them that is simply a result of the immense amount of talent',
    },
]

CONFIGS = [
    {'id': 'b5_vad1_ctx0', 'beam_size': 5, 'vad_filter': True, 'condition_on_previous_text': False},
    {'id': 'b3_vad1_ctx0', 'beam_size': 3, 'vad_filter': True, 'condition_on_previous_text': False},
    {'id': 'b3_vad0_ctx0', 'beam_size': 3, 'vad_filter': False, 'condition_on_previous_text': False},
    {'id': 'b3_vad1_ctx1', 'beam_size': 3, 'vad_filter': True, 'condition_on_previous_text': True},
]


def norm(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", "", text)
    return " ".join(text.split())


def wer(gt: str, hyp: str) -> float:
    a = norm(gt).split()
    b = norm(hyp).split()
    n, m = len(a), len(b)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        dp[i][0] = i
    for j in range(m + 1):
        dp[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = min(dp[i - 1][j - 1] + 1, dp[i - 1][j] + 1, dp[i][j - 1] + 1)
    return dp[n][m] / max(n, 1)


def run_one(config: dict, sample: dict) -> dict:
    env = os.environ.copy()
    env['WHISPER_MODEL'] = 'turbo'
    env['WHISPER_BEAM_SIZE'] = str(config['beam_size'])
    env['WHISPER_VAD_FILTER'] = 'true' if config['vad_filter'] else 'false'
    env['WHISPER_CONDITION_ON_PREVIOUS_TEXT'] = 'true' if config['condition_on_previous_text'] else 'false'

    cmd = ['/usr/bin/time', '-l', str(PYTHON), str(LOCAL_WHISPER), sample['audio']]
    t0 = time.time()
    proc = subprocess.run(cmd, capture_output=True, text=True, env=env)
    wall_ms = round((time.time() - t0) * 1000, 2)
    stdout = proc.stdout or ''
    stderr = proc.stderr or ''
    json_text = stdout.strip().splitlines()[-1] if stdout.strip() else '{}'
    data = json.loads(json_text)
    transcript = (data.get('text') or '').strip()
    success = bool(data.get('success')) and bool(transcript)
    score = wer(sample['ground_truth'], transcript) if success else 1.0
    mem_match = re.search(r'([0-9]+)\s+maximum resident set size', stderr)
    peak_rss_bytes = int(mem_match.group(1)) if mem_match else None

    return {
        'sample_id': sample['id'],
        'audio': sample['audio'],
        'ground_truth': sample['ground_truth'],
        'returncode': proc.returncode,
        'success': data.get('success'),
        'timingExitNonZero': proc.returncode != 0,
        'text': transcript,
        'metadata': data.get('metadata'),
        'wall_ms': wall_ms,
        'peak_rss_bytes': peak_rss_bytes,
        'wer': round(score, 6),
        'accuracy': round(1 - score, 6),
        'stderr_tail': '\n'.join(stderr.strip().splitlines()[-5:]),
    }


def summarize(results: list[dict]) -> dict:
    wall_ms = [item['wall_ms'] for item in results]
    accuracy = [item['accuracy'] for item in results]
    face_medium = next(item for item in results if item['sample_id'] == 'face_medium')
    face_short = next(item for item in results if item['sample_id'] == 'face_short')
    musk = next(item for item in results if item['sample_id'] == 'musk_21s')

    return {
        'avg_wall_ms': round(statistics.mean(wall_ms), 2),
        'avg_accuracy': round(statistics.mean(accuracy), 6),
        'face_medium_accuracy': face_medium['accuracy'],
        'face_medium_text': face_medium['text'],
        'face_short_accuracy': face_short['accuracy'],
        'face_short_text': face_short['text'],
        'musk_accuracy': musk['accuracy'],
        'musk_text': musk['text'],
    }


def main() -> int:
    report = {
        'date': time.strftime('%Y-%m-%d'),
        'model': 'turbo',
        'configs': [],
    }

    for config in CONFIGS:
        print(f"=== {config['id']} ===", flush=True)
        runs = []
        for sample in SAMPLES:
            print(f"  -> {sample['id']}", flush=True)
            runs.append(run_one(config, sample))
        report['configs'].append({
            'config': config,
            'results': runs,
            'summary': summarize(runs),
        })
        OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2))

    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f'written: {OUT}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
