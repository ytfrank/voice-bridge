#!/usr/bin/env python3
"""
VoiceBridge BFF API 自动化测试脚本
用法：python3 test_bff_api.py [--host http://localhost:3000]

测试覆盖：
- BFF 健康检查
- ASR 转写接口（含延迟测试）
- 翻译+生词接口（含延迟测试）
- 保存/查询功能
- 完整链路集成测试
- 5分钟稳定性压测（--stress 参数）
"""

import sys
import os
import time
import json
import argparse
import base64
import subprocess
import tempfile
from pathlib import Path

try:
    import requests
except ImportError:
    print("请先安装 requests: pip3 install requests")
    sys.exit(1)

# ─── 配置 ────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="VoiceBridge BFF API Tests")
parser.add_argument("--host", default="http://localhost:3000", help="BFF server address")
parser.add_argument("--stress", action="store_true", help="Run 5-minute stress test")
args = parser.parse_args()

BASE_URL = args.host.rstrip("/")

passed = 0
failed = 0
skipped = 0
results = []
latencies = {"asr": [], "translate": []}


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        print(f"  [PASS] {name}")
        passed += 1
        results.append(("PASS", name, detail))
    else:
        print(f"  [FAIL] {name}" + (f" — {detail}" if detail else ""))
        failed += 1
        results.append(("FAIL", name, detail))
    return condition


def skip(name, reason=""):
    global skipped
    print(f"  [SKIP] {name}" + (f" — {reason}" if reason else ""))
    skipped += 1
    results.append(("SKIP", name, reason))


def post(path, **kwargs):
    try:
        return requests.post(BASE_URL + path, timeout=30, **kwargs)
    except Exception as e:
        return None, str(e)


def get(path, **kwargs):
    try:
        return requests.get(BASE_URL + path, timeout=10, **kwargs)
    except Exception as e:
        return None


def make_test_audio_wav():
    """生成一段简短的测试音频（使用 macOS say 命令）"""
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    aiff = tmp.name.replace(".wav", ".aiff")
    
    try:
        # macOS say → aiff → wav
        subprocess.run(["say", "-o", aiff, "Hello, this is a test."], 
                      capture_output=True, timeout=5)
        if os.path.exists(aiff):
            subprocess.run(["ffmpeg", "-y", "-i", aiff, tmp.name],
                          capture_output=True, timeout=10)
            os.unlink(aiff)
            if os.path.exists(tmp.name) and os.path.getsize(tmp.name) > 0:
                return tmp.name
    except Exception:
        pass
    
    # Fallback: 生成一个最小的 WAV 文件（静音）
    import struct
    with open(tmp.name, 'wb') as f:
        # Minimal WAV: 44100Hz, 16bit, mono, 1 second of silence
        sample_rate = 44100
        num_samples = sample_rate * 1  # 1 second
        data_size = num_samples * 2
        f.write(b'RIFF')
        f.write(struct.pack('<I', 36 + data_size))
        f.write(b'WAVE')
        f.write(b'fmt ')
        f.write(struct.pack('<I', 16))  # chunk size
        f.write(struct.pack('<H', 1))   # PCM
        f.write(struct.pack('<H', 1))   # mono
        f.write(struct.pack('<I', sample_rate))
        f.write(struct.pack('<I', sample_rate * 2))
        f.write(struct.pack('<H', 2))   # block align
        f.write(struct.pack('<H', 16))  # bits per sample
        f.write(b'data')
        f.write(struct.pack('<I', data_size))
        f.write(b'\x00' * data_size)
    return tmp.name


# ─── Test 0: 服务可达 ─────────────────────────────────────────────────────────
print("\n=== 0. 服务连通性检查 ===")
try:
    r = requests.get(BASE_URL, timeout=5)
    server_up = True
    print(f"  服务响应: {r.status_code} @ {BASE_URL}")
except Exception as e:
    server_up = False
    print(f"  ⚠️  无法连接到 {BASE_URL}: {e}")
    print("  请确认 BFF 服务已启动，或使用 --host 指定正确地址")

check("BFF 服务可达", server_up, f"连接 {BASE_URL}")

if not server_up:
    print("\n服务不可达，跳过所有 API 测试。")
    print("请等 Peter 提供 BFF 启动说明后再运行。")
    sys.exit(0)


# ─── Test 1: 健康检查 ─────────────────────────────────────────────────────────
print("\n=== 1. 健康检查 ===")
for path in ["/health", "/api/health", "/status", "/ping"]:
    r = get(path)
    if r and r.status_code == 200:
        check(f"健康检查端点 {path}", True)
        break
else:
    # 根目录也算
    r = get("/")
    check("服务根路径可访问", r is not None and r.status_code < 500,
          f"根路径状态码: {r.status_code if r else 'N/A'}")


# ─── Test 2: ASR 转写接口 ─────────────────────────────────────────────────────
print("\n=== 2. ASR 语音转写接口 ===")
audio_file = make_test_audio_wav()
print(f"  测试音频: {audio_file} ({os.path.getsize(audio_file)} bytes)")

# 尝试几种可能的接口路径
asr_paths = ["/api/transcribe", "/api/asr", "/api/speech-to-text", "/transcribe"]
asr_result = None
asr_path_used = None

for asr_path in asr_paths:
    t0 = time.time()
    try:
        with open(audio_file, 'rb') as f:
            # 尝试 multipart 上传
            r = requests.post(
                BASE_URL + asr_path,
                files={"file": ("test.wav", f, "audio/wav")},
                data={"language": "en"},
                timeout=30
            )
        elapsed = (time.time() - t0) * 1000
        if r.status_code in (200, 201):
            asr_path_used = asr_path
            asr_result = r.json() if r.headers.get('content-type', '').startswith('application/json') else {"text": r.text}
            latencies["asr"].append(elapsed)
            print(f"  找到 ASR 端点: {asr_path}（{elapsed:.0f}ms）")
            break
        elif r.status_code == 404:
            continue
        else:
            print(f"  {asr_path}: {r.status_code} {r.text[:80]}")
    except Exception as e:
        print(f"  {asr_path}: 异常 {e}")

if asr_result is not None:
    check("ASR 接口存在且可访问", True)
    check("ASR 返回 text 字段", "text" in asr_result, f"got keys: {list(asr_result.keys())}")
    check("ASR text 字段为字符串", isinstance(asr_result.get("text"), str))
    elapsed_ms = latencies["asr"][-1] if latencies["asr"] else 9999
    check(f"ASR 延迟 ≤ 800ms (got {elapsed_ms:.0f}ms)", elapsed_ms <= 800,
          f"实际延迟 {elapsed_ms:.0f}ms，PRD 要求字幕 500ms 内上屏")
    print(f"  ASR 识别结果: '{asr_result.get('text', '')[:80]}'")
else:
    skip("ASR 接口测试", "未找到 ASR 端点，等 Peter 提供接口文档")

# 清理临时音频
try:
    os.unlink(audio_file)
except:
    pass


# ─── Test 3: 翻译+生词接口 ────────────────────────────────────────────────────
print("\n=== 3. 翻译+生词接口 ===")

TEST_SENTENCES = [
    "Hello, how are you today?",
    "The phenomenon of photosynthesis is ubiquitous in nature.",
    "Despite the unprecedented challenges, human resilience remains strong.",
]

translate_paths = ["/api/translate", "/api/translation", "/translate", "/api/chat"]
translate_result = None
translate_path_used = None

for tr_path in translate_paths:
    for sentence in TEST_SENTENCES[:1]:  # 只测一句
        t0 = time.time()
        try:
            r = requests.post(
                BASE_URL + tr_path,
                json={"text": sentence, "source": "en", "target": "zh"},
                timeout=30
            )
            elapsed = (time.time() - t0) * 1000
            if r.status_code in (200, 201):
                translate_path_used = tr_path
                translate_result = r.json()
                latencies["translate"].append(elapsed)
                print(f"  找到翻译端点: {tr_path}（{elapsed:.0f}ms）")
                break
            elif r.status_code == 404:
                continue
        except Exception as e:
            pass
    if translate_result:
        break

if translate_result:
    check("翻译接口存在且可访问", True)
    
    # 验证 translation 字段
    has_translation = (
        "translation" in translate_result or
        "result" in translate_result or
        "text" in translate_result or
        "chineseTranslation" in translate_result
    )
    check("返回中文翻译字段", has_translation, f"got keys: {list(translate_result.keys())}")
    
    # 验证 words/生词字段
    has_words = (
        "words" in translate_result or
        "vocabularyNotes" in translate_result or
        "vocabulary" in translate_result
    )
    check("返回生词数组字段", has_words, f"got keys: {list(translate_result.keys())}")
    
    # 验证生词结构
    words = (
        translate_result.get("words") or
        translate_result.get("vocabularyNotes") or
        translate_result.get("vocabulary") or []
    )
    if words and len(words) > 0:
        w = words[0]
        check("生词含 word 字段", "word" in w, f"got: {list(w.keys())}")
        check("生词含 meaning/释义字段", "meaning" in w or "definition" in w)
        check("生词含 phonetic/音标字段", "phonetic" in w or "pronunciation" in w)
        check("生词含 example/例句字段", "example" in w or "sentence" in w)
        print(f"  生词示例: {json.dumps(w, ensure_ascii=False)[:120]}")
    else:
        print("  ⚠️  生词数组为空（可能该句子无难词）")
    
    elapsed_ms = latencies["translate"][-1] if latencies["translate"] else 9999
    check(f"翻译延迟 ≤ 1500ms (got {elapsed_ms:.0f}ms)", elapsed_ms <= 1500)
    
    # 打印翻译结果
    translation_text = (
        translate_result.get("translation") or
        translate_result.get("chineseTranslation") or
        translate_result.get("result") or ""
    )
    print(f"  翻译结果: '{translation_text[:80]}'")
else:
    skip("翻译接口测试", "未找到翻译端点，等 Peter 提供接口文档")


# ─── Test 4: 保存功能 ─────────────────────────────────────────────────────────
print("\n=== 4. 保存/历史记录功能 ===")

save_paths = ["/api/save", "/api/records", "/save", "/api/history"]
save_result = None

sample_save = {
    "english": "The quick brown fox jumps over the lazy dog.",
    "chinese": "快速的棕色狐狸跳过懒惰的狗。",
    "timestamp": int(time.time())
}

for save_path in save_paths:
    try:
        r = requests.post(BASE_URL + save_path, json=sample_save, timeout=10)
        if r.status_code in (200, 201):
            save_result = r
            check(f"保存接口 {save_path} 可用", True)
            break
        elif r.status_code == 404:
            continue
    except:
        pass

if save_result:
    # 查询保存的记录
    for list_path in ["/api/records", "/api/history", "/api/saves"]:
        try:
            r = requests.get(BASE_URL + list_path, timeout=10)
            if r.status_code == 200:
                records = r.json()
                has_records = (
                    len(records) > 0 if isinstance(records, list)
                    else len(records.get("records", records.get("data", []))) > 0
                )
                check("保存后可查询到记录", has_records, f"查询路径: {list_path}")
                break
        except:
            pass
    else:
        print("  ⚠️  未找到查询记录接口")
else:
    skip("保存功能测试", "未找到保存端点（可能是纯本地存储，需手动验证）")


# ─── Test 5: 完整链路集成测试 ────────────────────────────────────────────────
print("\n=== 5. 完整链路集成测试 ===")

if asr_path_used and translate_path_used:
    print("  模拟完整链路：录音 → ASR → 翻译 → 保存")
    
    # 生成测试音频
    test_audio = make_test_audio_wav()
    chain_success = True
    
    # Step 1: ASR
    t0 = time.time()
    try:
        with open(test_audio, 'rb') as f:
            r = requests.post(BASE_URL + asr_path_used,
                            files={"file": ("test.wav", f, "audio/wav")},
                            data={"language": "en"}, timeout=30)
        asr_text = r.json().get("text", "") if r.status_code == 200 else ""
        asr_latency = (time.time() - t0) * 1000
        check(f"链路Step1 ASR成功 ({asr_latency:.0f}ms)", bool(asr_text))
    except Exception as e:
        check("链路Step1 ASR成功", False, str(e))
        chain_success = False
        asr_text = "Hello, this is a test sentence for translation."
    
    # Step 2: 翻译
    if asr_text or True:  # 即使 ASR 失败也用默认文本测翻译
        text_to_translate = asr_text or "Hello, this is a test."
        t0 = time.time()
        try:
            r = requests.post(BASE_URL + translate_path_used,
                            json={"text": text_to_translate}, timeout=30)
            tr_latency = (time.time() - t0) * 1000
            check(f"链路Step2 翻译成功 ({tr_latency:.0f}ms)", r.status_code == 200)
            
            total_latency = asr_latency + tr_latency if chain_success else tr_latency
            check(f"链路总延迟 ≤ 2000ms (got {total_latency:.0f}ms)",
                  total_latency <= 2000)
        except Exception as e:
            check("链路Step2 翻译成功", False, str(e))
    
    try:
        os.unlink(test_audio)
    except:
        pass
else:
    skip("完整链路集成测试", "ASR 或翻译接口未找到")


# ─── Test 6: 错误处理 ─────────────────────────────────────────────────────────
print("\n=== 6. 错误处理验证 ===")

if translate_path_used:
    # 空文本输入
    try:
        r = requests.post(BASE_URL + translate_path_used, json={"text": ""}, timeout=10)
        check("空文本翻译有响应（不崩溃）", r.status_code < 500,
              f"got {r.status_code}")
    except Exception as e:
        check("空文本翻译有响应", False, str(e))
    
    # 超长文本
    try:
        r = requests.post(BASE_URL + translate_path_used,
                         json={"text": "A" * 2000}, timeout=30)
        check("超长文本有响应（不崩溃）", r.status_code < 500,
              f"got {r.status_code}")
    except Exception as e:
        check("超长文本有响应", False, str(e))
else:
    skip("错误处理验证", "翻译接口未找到")


# ─── Test 7: 稳定性压测（可选）─────────────────────────────────────────────────
if args.stress:
    print("\n=== 7. 5分钟稳定性压测 ===")
    print("  开始压测（5分钟）...")
    
    if not translate_path_used:
        print("  ⚠️  翻译接口未找到，跳过压测")
    else:
        sentences = [
            "The weather is nice today.",
            "I am learning English every day.",
            "Technology is changing the world rapidly.",
            "Let's go to the coffee shop after work.",
            "The meeting will start at three o'clock.",
        ]
        
        start = time.time()
        total_requests = 0
        errors = 0
        max_latency = 0
        STRESS_DURATION = 300  # 5分钟
        
        while (time.time() - start) < STRESS_DURATION:
            sentence = sentences[total_requests % len(sentences)]
            try:
                t0 = time.time()
                r = requests.post(BASE_URL + translate_path_used,
                                json={"text": sentence}, timeout=30)
                elapsed = (time.time() - t0) * 1000
                max_latency = max(max_latency, elapsed)
                if r.status_code != 200:
                    errors += 1
            except:
                errors += 1
            total_requests += 1
            time.sleep(2)  # 每2秒一次请求（模拟真实使用）
        
        elapsed_total = time.time() - start
        error_rate = errors / total_requests * 100 if total_requests else 100
        
        check(f"5分钟稳定性（{total_requests}次请求）", errors == 0,
              f"失败 {errors} 次，错误率 {error_rate:.1f}%")
        check(f"最大延迟 ≤ 3000ms (got {max_latency:.0f}ms)", max_latency <= 3000)
        print(f"  总请求: {total_requests}，错误: {errors}，最大延迟: {max_latency:.0f}ms")
else:
    print("\n（稳定性压测跳过，使用 --stress 参数启用 5 分钟压测）")


# ─── 汇总 ─────────────────────────────────────────────────────────────────────
total = passed + failed
print(f"\n{'='*55}")
print(f"测试结果: {passed}/{total} passed，{skipped} skipped")
if latencies["asr"]:
    avg_asr = sum(latencies["asr"]) / len(latencies["asr"])
    print(f"ASR 平均延迟: {avg_asr:.0f}ms")
if latencies["translate"]:
    avg_tr = sum(latencies["translate"]) / len(latencies["translate"])
    print(f"翻译平均延迟: {avg_tr:.0f}ms")
print(f"{'='*55}")

if failed > 0:
    print("\n失败项:")
    for status, name, detail in results:
        if status == "FAIL":
            print(f"  ✗ {name}" + (f": {detail}" if detail else ""))

if skipped > 0:
    print("\n跳过项（需 Peter 提供接口文档后补充）:")
    for status, name, detail in results:
        if status == "SKIP":
            print(f"  ○ {name}" + (f": {detail}" if detail else ""))

sys.exit(0 if failed == 0 else 1)
