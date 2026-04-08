# Ground Truth 录入模板 - 马斯克音频

- **音频文件**：musk_21s_correct.wav
- **时长**：21 秒
- **口音**：美式
- **用途**：ASR 准确率基准测试

---

## 一、音频信息

- **文件路径**：`tests/fixtures/audio/musk_21s_correct.wav`
- **格式**：WAV
- **采样率**：（待确认）
- **声道**：（待确认）

---

## 二、Ground Truth（待填写）

**请听音频，逐句填写正确文本**：

### 第 1 句（0-5秒）
```
[请填写正确文本]
```

### 第 2 句（5-10秒）
```
[请填写正确文本]
```

### 第 3 句（10-15秒）
```
[请填写正确文本]
```

### 第 4 句（15-21秒）
```
[请填写正确文本]
```

### 完整文本
```
[请填写完整正确文本，包含标点]
```

---

## 三、ASR 识别结果（已获取）

```
and for most of actually human history that China has been the most powerful nation on earth
and so you can expect that they will do many great things Steve Seek being one of them
that is simply a result of the immense amount of talent
```

**注意**：
- ASR 结果中 "Steve Seek" 可能是 "SpaceX" 的误识别
- 需要确认是否还有其他错误

---

## 四、评估方法

**填写完成后，运行**：
```bash
# 方式1：使用测试脚本
bash tests/scripts/test_asr_accuracy.sh \
  tests/fixtures/audio/musk_21s_correct.wav \
  tests/fixtures/ground_truth/musk_21s_correct.txt

# 方式2：直接计算 WER
python3 tests/scripts/calculate_wer.py \
  "tests/fixtures/ground_truth/musk_21s_correct.txt" \
  "ASR识别结果.txt"
```

**验收标准**：
- ✅ 准确率 ≥ 97%（WER ≤ 3%）- 通过
- ❌ 准确率 < 97%（WER > 3%）- 未通过

---

## 五、填写说明

### 填写要求

1. **逐句听写**：播放音频，逐句记录正确文本
2. **保留标点**：如果有明显的停顿，添加标点
3. **专有名词**：特别注意专有名词（如 SpaceX, China 等）
4. **数字**：如果是数字，写出英文单词（如 "one" 而非 "1"）

### 填写流程

1. 使用音频播放器打开 `tests/fixtures/audio/musk_21s_correct.wav`
2. 逐句播放，记录听到的内容
3. 对比 ASR 识别结果，标注差异
4. 填写完整文本
5. 保存文件为 `tests/fixtures/ground_truth/musk_21s_correct.txt`

---

## 六、常见问题

### Q1: 听不清楚怎么办？
- 使用耳机听
- 调整音量
- 使用音频软件（如 Audacity）调整速度

### Q2: 专有名词不确定？
- 查阅相关资料（马斯克演讲背景）
- 上下文推断
- 标记为"待确认"

### Q3: ASR 结果和听到的不一样？
- 以你听到的为准
- 标注差异部分
- 后续可以多人复核

---

## 七、提交方式

**填写完成后**：
1. 保存为 `tests/fixtures/ground_truth/musk_21s_correct.txt`
2. 通知 Guard（在群里 @Guard）
3. Guard 会运行 WER 评估脚本

**预计时间**：30 分钟

---

*模板版本：1.0 | Guard | 2026-03-29*
