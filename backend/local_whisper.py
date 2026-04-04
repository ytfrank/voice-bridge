#!/usr/bin/env python3
"""
Local Whisper transcription using faster-whisper.
Usage: python local_whisper.py <audio_file_path>
Output: JSON with transcription text + quality metadata
"""

import json
import os
import re
import sys
from typing import Any, Dict, List

from faster_whisper import WhisperModel

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "tiny")
BEAM_SIZE = int(os.environ.get("WHISPER_BEAM_SIZE", "5"))
MIN_RETRY_NO_VAD_DURATION_SEC = float(os.environ.get("WHISPER_MIN_RETRY_NO_VAD_DURATION_SEC", "0.8"))
DEFAULT_VAD_FILTER = os.environ.get("WHISPER_VAD_FILTER", "true").lower() not in {"0", "false", "no"}
CONDITION_ON_PREVIOUS_TEXT = os.environ.get("WHISPER_CONDITION_ON_PREVIOUS_TEXT", "false").lower() in {"1", "true", "yes"}

_model = None


def get_model():
    global _model
    if _model is None:
        _model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
    return _model


def safe_float(value: Any):
    try:
        if value is None:
            return None
        return float(value)
    except Exception:
        return None


def tokenize(text: str) -> List[str]:
    return [token for token in re.split(r"[^a-zA-Z']+", (text or "").lower()) if token]


def build_repetition_metrics(text: str) -> Dict[str, Any]:
    tokens = tokenize(text)
    if not tokens:
        return {
            "tokenCount": 0,
            "uniqueTokenRatio": 0.0,
            "maxRepeatedRun": 0,
            "repeatedBigramRatio": 0.0,
        }

    max_run = 1
    current_run = 1
    for idx in range(1, len(tokens)):
        if tokens[idx] == tokens[idx - 1]:
            current_run += 1
            max_run = max(max_run, current_run)
        else:
            current_run = 1

    bigrams = [" ".join(tokens[idx : idx + 2]) for idx in range(len(tokens) - 1)]
    repeated_bigrams = len(bigrams) - len(set(bigrams)) if bigrams else 0

    return {
        "tokenCount": len(tokens),
        "uniqueTokenRatio": round(len(set(tokens)) / len(tokens), 4),
        "maxRepeatedRun": max_run,
        "repeatedBigramRatio": round(repeated_bigrams / max(len(bigrams), 1), 4) if bigrams else 0.0,
    }


def segment_to_dict(segment) -> Dict[str, Any]:
    text = (segment.text or "").strip()
    tokens = tokenize(text)
    return {
        "id": getattr(segment, "id", None),
        "start": safe_float(getattr(segment, "start", None)),
        "end": safe_float(getattr(segment, "end", None)),
        "text": text,
        "textLength": len(text),
        "tokenCount": len(tokens),
        "avgLogprob": safe_float(getattr(segment, "avg_logprob", None)),
        "noSpeechProb": safe_float(getattr(segment, "no_speech_prob", None)),
        "compressionRatio": safe_float(getattr(segment, "compression_ratio", None)),
        "temperature": safe_float(getattr(segment, "temperature", None)),
    }


def summarize_segments(
    segments_data: List[Dict[str, Any]],
    info,
    fallback_without_vad: bool,
    transcribe_config: Dict[str, Any],
) -> Dict[str, Any]:
    text = " ".join(item["text"] for item in segments_data if item.get("text")).strip()
    duration_sec = safe_float(getattr(info, "duration", None))
    duration_after_vad_sec = safe_float(getattr(info, "duration_after_vad", None))
    language_probability = safe_float(getattr(info, "language_probability", None))

    avg_logprobs = [item["avgLogprob"] for item in segments_data if item.get("avgLogprob") is not None]
    no_speech_probs = [item["noSpeechProb"] for item in segments_data if item.get("noSpeechProb") is not None]
    compression_ratios = [item["compressionRatio"] for item in segments_data if item.get("compressionRatio") is not None]

    repetition = build_repetition_metrics(text)
    non_space_chars = len(re.sub(r"\s+", "", text))
    chars_per_second = round(non_space_chars / duration_sec, 4) if duration_sec and duration_sec > 0 else None
    quality_flags: List[str] = []

    if not text:
        quality_flags.append("empty_text")
    if language_probability is not None and language_probability < 0.45:
        quality_flags.append("language_uncertain")
    if avg_logprobs and sum(avg_logprobs) / len(avg_logprobs) < -1.1:
        quality_flags.append("low_logprob")
    if no_speech_probs and max(no_speech_probs) > 0.7:
        quality_flags.append("high_no_speech_prob")
    if repetition["maxRepeatedRun"] >= 4 or repetition["repeatedBigramRatio"] >= 0.35:
        quality_flags.append("repetitive_text")
    if chars_per_second is not None and chars_per_second > 22:
        quality_flags.append("text_too_dense_for_audio")
    if duration_sec is not None and duration_sec >= 2.0 and repetition["tokenCount"] <= 1:
        quality_flags.append("too_little_text_for_duration")
    if fallback_without_vad:
        quality_flags.append("fallback_without_vad")

    empty_reason = None
    if not text:
        if duration_sec is not None and duration_sec < 0.35:
            empty_reason = "audio_too_short"
        elif no_speech_probs and max(no_speech_probs) > 0.7:
            empty_reason = "no_speech"
        else:
            empty_reason = "empty_transcript"

    quality_score = 1.0
    penalties = {
        "language_uncertain": 0.15,
        "low_logprob": 0.25,
        "high_no_speech_prob": 0.15,
        "repetitive_text": 0.25,
        "text_too_dense_for_audio": 0.15,
        "too_little_text_for_duration": 0.15,
        "empty_text": 0.4,
    }
    for flag in quality_flags:
        quality_score -= penalties.get(flag, 0.0)
    quality_score = round(max(0.0, min(1.0, quality_score)), 4)

    return {
        "text": text,
        "language": getattr(info, "language", None),
        "metadata": {
            "segmentCount": len(segments_data),
            "durationSec": duration_sec,
            "durationAfterVadSec": duration_after_vad_sec,
            "languageProbability": language_probability,
            "avgLogprob": round(sum(avg_logprobs) / len(avg_logprobs), 4) if avg_logprobs else None,
            "minAvgLogprob": round(min(avg_logprobs), 4) if avg_logprobs else None,
            "avgNoSpeechProb": round(sum(no_speech_probs) / len(no_speech_probs), 4) if no_speech_probs else None,
            "maxNoSpeechProb": round(max(no_speech_probs), 4) if no_speech_probs else None,
            "avgCompressionRatio": round(sum(compression_ratios) / len(compression_ratios), 4) if compression_ratios else None,
            "textLength": len(text),
            "charsPerSecond": chars_per_second,
            "tokenCount": repetition["tokenCount"],
            "uniqueTokenRatio": repetition["uniqueTokenRatio"],
            "maxRepeatedRun": repetition["maxRepeatedRun"],
            "repeatedBigramRatio": repetition["repeatedBigramRatio"],
            "fallbackWithoutVad": fallback_without_vad,
            "transcribeConfig": transcribe_config,
            "qualityFlags": quality_flags,
            "qualityScore": quality_score,
            "emptyReason": empty_reason,
            "segments": segments_data,
        },
    }


def run_transcribe(model, audio_path: str, vad_filter: bool):
    segments, info = model.transcribe(
        audio_path,
        language="en",
        beam_size=BEAM_SIZE,
        vad_filter=vad_filter,
        condition_on_previous_text=CONDITION_ON_PREVIOUS_TEXT,
        temperature=0,
    )
    segments_data = [segment_to_dict(segment) for segment in segments]
    return segments_data, info


def transcribe(audio_path: str) -> Dict[str, Any]:
    try:
        model = get_model()
        initial_vad_filter = DEFAULT_VAD_FILTER
        segments_data, info = run_transcribe(model, audio_path, vad_filter=initial_vad_filter)
        fallback_without_vad = False

        duration_sec = safe_float(getattr(info, "duration", None))
        if (
            initial_vad_filter
            and not any(item.get("text") for item in segments_data)
            and (duration_sec or 0) >= MIN_RETRY_NO_VAD_DURATION_SEC
        ):
            retry_segments_data, retry_info = run_transcribe(model, audio_path, vad_filter=False)
            if any(item.get("text") for item in retry_segments_data):
                segments_data, info = retry_segments_data, retry_info
                fallback_without_vad = True

        summary = summarize_segments(
            segments_data,
            info,
            fallback_without_vad,
            {
                "model": MODEL_SIZE,
                "beamSize": BEAM_SIZE,
                "vadFilter": initial_vad_filter and not fallback_without_vad,
                "conditionOnPreviousText": CONDITION_ON_PREVIOUS_TEXT,
            },
        )
        return {
            "success": True,
            "text": summary["text"],
            "language": summary["language"],
            "metadata": summary["metadata"],
        }
    except Exception as exc:
        return {
            "success": False,
            "text": "",
            "error": str(exc),
            "metadata": {
                "emptyReason": "transcription_failure",
                "qualityFlags": ["transcription_failure"],
            },
        }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No audio file provided", "success": False}, ensure_ascii=False))
        sys.exit(1)

    audio_path = sys.argv[1]
    if not os.path.exists(audio_path):
        print(json.dumps({"error": f"File not found: {audio_path}", "success": False}, ensure_ascii=False))
        sys.exit(1)

    result = transcribe(audio_path)
    print(json.dumps(result, ensure_ascii=False))
