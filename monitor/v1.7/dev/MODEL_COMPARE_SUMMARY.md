# MODEL_COMPARE_SUMMARY.md — V1.7 幻觉治理第一轮模型对比

日期：2026-04-04
分支：dev_v1.6
样本集：
- tests/fixtures/audio/musk_21s_correct.wav
- monitor/v1.7/qa/samples/face_short.aiff
- monitor/v1.7/qa/samples/face_medium.aiff

模型：
- Whisper medium
- Whisper large-v3
- Whisper turbo

结果文件：`monitor/v1.7/dev/model_compare_results.json`

---

## 结论摘要

### 1. 当前环境下，不建议直接切到 large-v3
在这台 M4 mini + 当前 faster-whisper 配置下：
- `large-v3` 在 musk 样本上的准确率 **低于** `medium`
- `large-v3` 延迟显著更高
- `large-v3` 内存显著更高
- `face_medium` 问题并未因切换到 `large-v3` 被解决

### 2. turbo 比 large-v3 更值得继续评估，但不能直接解决 face_medium
- `turbo` 在 `face_medium` 上略优于 `medium` / `large-v3`
- 但仍然输出截断短句（`the quick brown.`）
- 广播样本仍不如 `medium` 稳定

### 3. face_medium 不是简单“换大模型即可解决”的问题
三组模型都出现了截断：
- medium → `a quick brown.`
- large-v3 → `a quick brown.`
- turbo → `the quick brown.`

这说明：
- `face_medium` 的核心问题不是单纯模型尺寸不够
- 必须配合 **质量门重构** 解决“看似正常、实为截断”的短句问题

---

## 详细数据（均值）

| 模型 | 样本 | 准确率 | 平均耗时 | 峰值内存 |
|---|---|---:|---:|---:|
| medium | broadcast_musk | 95.56% | 8.23s | 2.15GB |
| medium | face_short | 100.00% | 6.97s | 2.09GB |
| medium | face_medium | 22.22% | 5.06s | 2.08GB |
| large-v3 | broadcast_musk | 77.78% | 245.66s | 3.53GB |
| large-v3 | face_short | 100.00% | 9.47s | 3.38GB |
| large-v3 | face_medium | 22.22% | 9.05s | 3.31GB |
| turbo | broadcast_musk | 86.67% | 203.38s | 2.37GB |
| turbo | face_short | 100.00% | 6.98s | 2.31GB |
| turbo | face_medium | 33.33% | 7.01s | 2.32GB |

---

## 技术判断

### medium
优点：
- 广播样本最稳
- 内存与耗时相对最可控

缺点：
- `face_medium` 这类短句完整度问题明显

### large-v3
优点：
- 理论上更强

缺点：
- 在当前环境和配置下，**实测不优**
- 成本过高，不适合作为当前默认切换方案

### turbo
优点：
- 是当前最值得继续做参数实验的备选
- 内存比 large-v3 好

缺点：
- 仍未解决短句截断
- 广播样本质量不如 medium

---

## 决策建议

### 当前不建议
- 直接切换到 `large-v3`

### 当前建议
1. 先保留 `medium` 作为默认基线
2. 继续做 `turbo` 的参数级实验（beam_size / vad / 其他推理参数）
3. 立即推进 `quality_gate` 三态重构
4. 用固定回归集（musk / filler / silence / face_short / face_medium）做自动化回归

---

## 下一步

1. 抽离独立 `quality_gate`
2. 定义 PASS / SOFT_BLOCK / HARD_BLOCK
3. 把 `face_medium` 这类“短句截断”纳入统一规则体系
4. 第二轮参数级模型实验
