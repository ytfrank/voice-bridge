# Test Audio Fixtures

Standard audio files for end-to-end testing.

## Naming Convention

```
{lang}_{duration}_{description}.{ext}
```

- `lang`: en (English), zh (Chinese), mix (mixed)
- `duration`: 3s, 8s, 15s, 3min, 30min, 1h
- `description`: short label (e.g., musk, news, speech, interview)

## Categories

### Short (3-15s) — Test hallucination & basic recognition
- `en_short_3s_hello.mp3` — Single sentence
- `en_short_8s_sentence.mp3` — Short paragraph
- `en_short_15s_musk.mp3` — Musk clip (benchmark)

### Medium (1-5min) — Test sustained recognition quality
- `en_medium_3min_news.mp3` — News segment
- `zh_medium_3min_news.wav` — Chinese news
- `en_zh_mix_2min_interview.mp3` — Mixed language

### Long (30min+) — Test stability & memory
- `en_long_30min_speech.mp3` — Full speech/lecture
- `en_long_1h_podcast.mp3` — Podcast episode

### Edge Cases
- `silent_5s.wav` — Silence (should produce empty/skipped)
- `noise_10s.wav` — White noise only
- `en_noisy_30s_street.mp3` — Speech with background noise

## Usage

In Debug mode (triple-tap bottom-right dot), click 📁 to select any audio file.
Results appear in the app's transcript + translation zones.

## Quality Targets

| Category | WER Target | Latency Target |
|----------|-----------|----------------|
| Short (≥5s) | ≤5% | <3s |
| Medium | ≤5% | <5s |
| Long | ≤8% | <10s |
