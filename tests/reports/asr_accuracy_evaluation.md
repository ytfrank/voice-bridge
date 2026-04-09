# voice-bridge V1.5 ASR 准确率评估报告

- 测试时间：2026-03-29
- 测试负责人：Guard
- 模型：faster-whisper medium
- 目标准确率：≥97%

---

## 一、测试素材

### 1. musk_21s_correct.wav
- **文件路径**：`tests/fixtures/audio/musk_21s_correct.wav`
- **时长**：21s
- **口音**：美式
- **内容类型**：演讲

#### ASR 识别结果（V1.5）
```
and for most of actually human history that China has been the most powerful nation on earth and so you can expect that they will do many great things Steve Seek being one of them that is simply a result of the immense amount of talent
```

#### Ground Truth（待人工填写）
```
[请填写正确文本]
```

#### 错误分析（待人工填写）
| 错误类型 | 数量 | 具体错误 |
|---------|------|---------|
| Substitute（替换） | ? | [示例：actually → actually] |
| Delete（删除） | ? | [示例：遗漏的词] |
| Insert（插入） | ? | [示例：多余的词] |

#### WER 计算
- 总词数：[待填写]
- 错误数：[待填写]
- WER = 错误数 / 总词数 = [待计算]
- 准确率 = 1 - WER = [待计算]%

---

## 二、评估方法

### WER（Word Error Rate）计算公式
```
WER = (S + D + I) / N
其中：
- S = Substitute（替换错误数）
- D = Delete（删除错误数）
- I = Insert（插入错误数）
- N = 总词数（ground truth）
```

### 人工评估步骤
1. 播放音频文件，逐句记录正确文本（ground truth）
2. 对比 ASR 识别结果，标记错误类型
3. 统计 S/D/I 数量
4. 计算 WER 和准确率

### 验收标准
- ✅ 综合准确率 ≥97%
- ✅ 无灾难性误识别（如关键实体名称错误）

---

## 三、待补齐项

- [ ] Ground truth 文本录入
- [ ] 错误分析统计
- [ ] WER 计算
- [ ] 截图证据（ASR 接口响应）
- [ ] 最终准确率结论

---

## 四、备注

- 本次使用 faster-whisper medium 模型
- 测试环境：本地 BFF (http://localhost:3001)
- 音频格式：WAV
- 识别语言：英文 (language=en)

---

*报告版本：1.0 | Guard | 2026-03-29*
