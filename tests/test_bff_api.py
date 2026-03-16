#!/usr/bin/env python3
"""
VoiceBridge BFF API 自动化测试
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests


BFF_BASE_URL = os.environ.get("BFF_URL", "http://localhost:3001")
TEST_AUDIO_FILE = Path(__file__).parent / "fixtures" / "test_voice.wav"
REPORT_FILE = Path(os.environ.get("BFF_TEST_REPORT", Path(__file__).parent / "report.json"))
TIMEOUT = 30


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class TestRunner:
    def __init__(self) -> None:
        self.results: list[dict[str, Any]] = []
        self.performance_samples: dict[str, list[float]] = {
            "transcribe_latency_ms": [],
            "translate_latency_ms": [],
            "stream_first_chunk_latency_ms": [],
            "stream_total_latency_ms": [],
        }

    def record(
        self,
        name: str,
        passed: bool,
        *,
        detail: str = "",
        duration_ms: float | None = None,
        metrics: dict[str, float] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        item = {
            "name": name,
            "passed": passed,
            "detail": detail,
            "duration_ms": round(duration_ms, 2) if duration_ms is not None else None,
            "timestamp": utc_now(),
        }
        if metrics:
            item["metrics"] = {k: round(v, 2) for k, v in metrics.items()}
            for key, value in metrics.items():
                if key in self.performance_samples:
                    self.performance_samples[key].append(value)
        if extra:
            item["extra"] = extra
        self.results.append(item)

        marker = "✅" if passed else "❌"
        print(f"{marker} {name}")
        if detail:
            print(f"   {detail}")

    def run(self, name: str, fn) -> None:
        start = time.perf_counter()
        try:
            fn()
        except Exception as exc:
            duration_ms = (time.perf_counter() - start) * 1000
            self.record(name, False, detail=str(exc), duration_ms=duration_ms)

    def summary(self) -> bool:
        total = len(self.results)
        passed = sum(1 for item in self.results if item["passed"])
        failed = total - passed
        pass_rate = (passed / total * 100) if total else 0.0

        print(f"\n{'=' * 50}")
        print(f"测试结果: {passed}/{total} 通过 ({pass_rate:.2f}%)")
        if failed:
            print("\n失败项:")
            for item in self.results:
                if not item["passed"]:
                    print(f"  - {item['name']}: {item['detail']}")

        self.write_report(total=total, passed=passed, failed=failed, pass_rate=pass_rate)
        print(f"\nJSON 报告: {REPORT_FILE}")
        return failed == 0

    def write_report(self, *, total: int, passed: int, failed: int, pass_rate: float) -> None:
        REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
        report = {
            "generated_at": utc_now(),
            "base_url": BFF_BASE_URL,
            "summary": {
                "total": total,
                "passed": passed,
                "failed": failed,
                "pass_rate": round(pass_rate, 2),
            },
            "performance": {
                name: self._aggregate(values)
                for name, values in self.performance_samples.items()
            },
            "results": self.results,
        }
        REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    @staticmethod
    def _aggregate(values: list[float]) -> dict[str, float | int | None]:
        if not values:
            return {"count": 0, "avg_ms": None, "min_ms": None, "max_ms": None}
        return {
            "count": len(values),
            "avg_ms": round(sum(values) / len(values), 2),
            "min_ms": round(min(values), 2),
            "max_ms": round(max(values), 2),
        }


runner = TestRunner()


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def request_json(method: str, path: str, **kwargs):
    start = time.perf_counter()
    resp = requests.request(method, f"{BFF_BASE_URL}{path}", **kwargs)
    duration_ms = (time.perf_counter() - start) * 1000
    return resp, duration_ms


def ensure_test_audio() -> None:
    if TEST_AUDIO_FILE.exists():
        return
    raise FileNotFoundError(f"测试音频不存在: {TEST_AUDIO_FILE}")


def test_health() -> None:
    resp, duration_ms = request_json("GET", "/health", timeout=5)
    assert_true(resp.status_code == 200, f"状态码异常: {resp.status_code}")
    payload = resp.json()
    assert_true(payload.get("status") == "ok", f"响应异常: {payload}")
    runner.record("BFF 健康检查", True, detail="服务正常运行", duration_ms=duration_ms)


def test_asr_standard() -> None:
    ensure_test_audio()
    with TEST_AUDIO_FILE.open("rb") as audio_file:
        resp, duration_ms = request_json(
            "POST",
            "/api/transcribe",
            files={"audio": ("test.wav", audio_file, "audio/wav")},
            timeout=TIMEOUT,
        )
    assert_true(resp.status_code == 200, f"状态码: {resp.status_code}, {resp.text}")
    payload = resp.json()
    text = payload.get("text", "")
    assert_true(isinstance(text, str) and text.strip(), f"识别结果异常: {payload}")
    runner.record(
        "ASR 转写: 标准 WAV",
        True,
        detail=f"转写结果: {text[:40]}",
        duration_ms=duration_ms,
        metrics={"transcribe_latency_ms": duration_ms},
    )


def test_asr_audio_format_boundaries() -> None:
    ensure_test_audio()
    audio_bytes = TEST_AUDIO_FILE.read_bytes()
    cases = [
        ("wav", "audio/wav"),
        ("m4a", "audio/mp4"),
        ("mp3", "audio/mpeg"),
        ("ogg", "audio/ogg"),
    ]

    for ext, content_type in cases:
        start = time.perf_counter()
        resp = requests.post(
            f"{BFF_BASE_URL}/api/transcribe",
            files={"audio": (f"boundary.{ext}", audio_bytes, content_type)},
            timeout=TIMEOUT,
        )
        duration_ms = (time.perf_counter() - start) * 1000
        assert_true(resp.status_code in {200, 400, 415, 422, 500}, f"{ext} 状态码异常: {resp.status_code}")
        if resp.status_code == 200:
            payload = resp.json()
            assert_true(isinstance(payload.get("text", ""), str), f"{ext} 返回结构异常: {payload}")
            detail = f"{ext} 被服务接受"
        else:
            detail = f"{ext} 被服务拒绝: {resp.status_code}"
        runner.record(
            f"ASR 格式边界: {ext}",
            True,
            detail=detail,
            duration_ms=duration_ms,
            metrics={"transcribe_latency_ms": duration_ms},
            extra={"status_code": resp.status_code, "content_type": content_type},
        )


def test_asr_error_boundaries() -> None:
    resp, duration_ms = request_json("POST", "/api/transcribe", files={}, timeout=5)
    assert_true(resp.status_code == 400, f"缺失文件期望 400, 实际 {resp.status_code}")
    runner.record("ASR 错误边界: 缺失音频", True, detail="返回 400", duration_ms=duration_ms)

    large_payload = b"0" * (5 * 1024 * 1024 + 1)
    start = time.perf_counter()
    resp = requests.post(
        f"{BFF_BASE_URL}/api/transcribe",
        files={"audio": ("oversize.wav", large_payload, "audio/wav")},
        timeout=TIMEOUT,
    )
    duration_ms = (time.perf_counter() - start) * 1000
    assert_true(resp.status_code >= 400, f"超大文件应失败, 实际 {resp.status_code}")
    runner.record(
        "ASR 错误边界: 超大音频",
        True,
        detail=f"返回 {resp.status_code}",
        duration_ms=duration_ms,
        extra={"status_code": resp.status_code},
    )


def test_translate_basic() -> None:
    cases = [
        "Hello, how are you?",
        "The weather is nice today.",
    ]
    for text in cases:
        resp, duration_ms = request_json(
            "POST",
            "/api/translate",
            json={"text": text},
            timeout=TIMEOUT,
        )
        assert_true(resp.status_code == 200, f"状态码: {resp.status_code}, {resp.text}")
        payload = resp.json()
        assert_true(payload.get("translation"), f"翻译结果为空: {payload}")
        assert_true(isinstance(payload.get("words", []), list), f"words 类型错误: {payload}")
        runner.record(
            f"翻译接口: {text[:20]}",
            True,
            detail=f"翻译: {str(payload['translation'])[:30]}",
            duration_ms=duration_ms,
            metrics={"translate_latency_ms": duration_ms},
        )


def test_translate_long_text() -> None:
    sentence = (
        "Despite the unprecedented challenges we face, human resilience remains "
        "an enduring testament to our collective strength and adaptability. "
    )
    long_text = sentence * 120
    resp, duration_ms = request_json(
        "POST",
        "/api/translate",
        json={"text": long_text},
        timeout=TIMEOUT,
    )
    assert_true(resp.status_code == 200, f"超长文本状态码: {resp.status_code}")
    payload = resp.json()
    translation = payload.get("translation", "")
    assert_true(isinstance(translation, str) and translation.strip(), "超长文本翻译为空")
    runner.record(
        "翻译接口: 超长文本",
        True,
        detail=f"输入长度: {len(long_text)}, 输出长度: {len(translation)}",
        duration_ms=duration_ms,
        metrics={"translate_latency_ms": duration_ms},
        extra={"input_chars": len(long_text), "output_chars": len(translation)},
    )


def test_translate_stream() -> None:
    start = time.perf_counter()
    resp = requests.post(
        f"{BFF_BASE_URL}/api/translate/stream",
        json={"text": "The weather is nice today."},
        stream=True,
        timeout=TIMEOUT,
    )
    assert_true(resp.status_code == 200, f"状态码: {resp.status_code}")

    first_chunk_ms = None
    chunks = []
    for raw_line in resp.iter_lines():
        if not raw_line:
            continue
        line = raw_line.decode("utf-8")
        if not line.startswith("data: ") or line == "data: [DONE]":
            continue
        if first_chunk_ms is None:
            first_chunk_ms = (time.perf_counter() - start) * 1000
        try:
            payload = json.loads(line[6:])
        except json.JSONDecodeError:
            continue
        content = payload.get("choices", [{}])[0].get("delta", {}).get("content", "")
        if content:
            chunks.append(content)

    total_ms = (time.perf_counter() - start) * 1000
    assert_true(first_chunk_ms is not None, "流式接口没有返回首包")
    runner.record(
        "流式翻译接口",
        True,
        detail=f"首包 {first_chunk_ms:.2f}ms, 总耗时 {total_ms:.2f}ms",
        duration_ms=total_ms,
        metrics={
            "stream_first_chunk_latency_ms": first_chunk_ms,
            "stream_total_latency_ms": total_ms,
        },
        extra={"output_chars": len("".join(chunks))},
    )


def test_translate_error_boundaries() -> None:
    invalid_cases = [
        ("空字符串", {"text": ""}),
        ("空白字符串", {"text": "   "}),
        ("缺失字段", {}),
        ("null 文本", {"text": None}),
    ]
    for case_name, body in invalid_cases:
        resp, duration_ms = request_json(
            "POST",
            "/api/translate",
            json=body,
            timeout=5,
        )
        assert_true(resp.status_code == 400, f"{case_name} 期望 400, 实际 {resp.status_code}")
        runner.record(
            f"翻译错误边界: {case_name}",
            True,
            detail="返回 400",
            duration_ms=duration_ms,
        )


def test_full_pipeline() -> None:
    ensure_test_audio()
    pipeline_start = time.perf_counter()

    with TEST_AUDIO_FILE.open("rb") as audio_file:
        asr_resp = requests.post(
            f"{BFF_BASE_URL}/api/transcribe",
            files={"audio": ("test.wav", audio_file, "audio/wav")},
            timeout=TIMEOUT,
        )
    assert_true(asr_resp.status_code == 200, f"ASR 失败: {asr_resp.status_code}")
    text = asr_resp.json().get("text", "")
    assert_true(text.strip(), "ASR 结果为空")

    trans_resp = requests.post(
        f"{BFF_BASE_URL}/api/translate/stream",
        json={"text": text},
        stream=True,
        timeout=TIMEOUT,
    )
    assert_true(trans_resp.status_code == 200, f"翻译失败: {trans_resp.status_code}")

    total_ms = (time.perf_counter() - pipeline_start) * 1000
    runner.record(
        "完整链路 (ASR -> 翻译)",
        True,
        detail=f"输入文本: {text[:40]}",
        duration_ms=total_ms,
    )


def main() -> int:
    print("=" * 50)
    print("VoiceBridge BFF API 测试")
    print("=" * 50)
    print()

    tests = [
        ("BFF 健康检查", test_health),
        ("ASR 转写: 标准 WAV", test_asr_standard),
        ("ASR 格式边界", test_asr_audio_format_boundaries),
        ("ASR 错误边界", test_asr_error_boundaries),
        ("翻译接口: 基础用例", test_translate_basic),
        ("翻译接口: 超长文本", test_translate_long_text),
        ("流式翻译接口", test_translate_stream),
        ("翻译错误边界", test_translate_error_boundaries),
        ("完整链路", test_full_pipeline),
    ]

    for name, fn in tests:
        runner.run(name, fn)

    return 0 if runner.summary() else 1


if __name__ == "__main__":
    sys.exit(main())
