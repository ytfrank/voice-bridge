# 测试报告 - voice-bridge V1.7 智谱ASR端到端测试

**测试时间**：2026-04-08 11:49 - 12:05
**对应commit**：e6597b4 (V1.7 zhipu ASR + debug mode)
**测试环境**：本地 macOS, BFF localhost:3001, GLM-ASR-2512
**测试负责人**：Guard

---

## 测试结论：⚠️ Conditional Pass

### 核心发现
- ✅ **延迟大幅改善**：短音频 1.3-3.0s（之前 6-9s），达标！
- ✅ **短音频准确率优秀**：大部分 100%
- ✅ **静音不再产生幻觉**：正确返回 empty_transcription
- ❌ **长音频（>30s）完全不可用**：智谱API限制30秒
- ⚠️ **噪音仍有幻觉**：白噪音被识别为引擎声（但合理很多）
- ⚠️ **musk音频识别有差异**：deepseek vs Steve Seek，小红书等额外内容

---

## 一、延迟结果（对比V1.6 vs V1.7）

| 音频 | 时长 | V1.6延迟 | V1.7延迟 | 目标 | 状态 |
|------|------|---------|---------|------|------|
| en_short_3s_weather | 1.4s | 6813ms | 2826ms | ≤5s | ✅ |
| en_short_5s_ai | 5.3s | 7035ms | 1289ms | ≤5s | ✅ |
| en_short_8s_pangram | 7.5s | 7389ms | 3074ms | ≤5s | ✅ |
| short_sentence | 1.4s | 6096ms | 1358ms | ≤5s | ✅ |
| musk_21s_correct | 21.4s | 8937ms | 20150ms | ≤5s | ❌ |
| musk_reference | 21.4s | N/A | 2963ms | ≤5s | ✅ |
| en_medium_30s_climate | 26.3s | 15229ms | 24509ms | ≤5s | ❌ |
| en_medium_3min | 75.6s | 28317ms | ❌超30s | ≤10s | ❌ |
| en_long_5min | 302s | ❌超时 | ❌超30s | ≤15s | ❌ |
| en_long_12min | 756s | ❌超时 | ❌超30s | ≤30s | ❌ |

**延迟改善明显，但部分文件出现不一致（同是21s的musk，一个2s一个20s）**

---

## 二、ASR准确率

| 音频 | Ground Truth | 识别结果 | 准确率 |
|------|-------------|---------|--------|
| en_short_3s_weather | "The weather is nice today." | "The weather is nice today." | 100% ✅ |
| en_short_5s_ai | "I believe that artificial..." | "I believe that artificial..." | 100% ✅ |
| en_short_8s_pangram | "The quick brown fox..." | "The quick brown fox...testing." | 100% ✅ |
| short_sentence | "Hello how are you today?" | "Hello, how are you today?" | ~99% ✅ |
| musk_reference | (视频原文) | 有deepseek/小红书等额外内容 | ⚠️需核对 |
| musk_21s_correct | "Steve Seek being one of them" | "deepseek being one of them" | ⚠️ |

**注意**：智谱ASR将"Steve Seek"识别为"deepseek"，这是AI模型的"纠正"，可能影响准确性。

---

## 三、边界测试

| 场景 | V1.6结果 | V1.7结果 | 状态 |
|------|---------|---------|------|
| 静音5s | "Thank you"（幻觉） | empty_transcription（正确跳过） | ✅ 改善！ |
| 白噪音10s | "Thanks for watching!"（幻觉） | 引擎声描述（仍幻觉但更合理） | ⚠️ 部分改善 |
| >30s音频 | Whisper超时 | API拒绝（明确提示30s限制） | ❌ 需分片 |

---

## 四、问题清单

| # | 问题 | 严重度 | 状态 |
|---|------|--------|------|
| 1 | 智谱ASR 30秒时长限制 | 🔴高 | 需Peter做客户端分片 |
| 2 | musk_21s_correct延迟20s（同类musk_reference才3s） | 🟡中 | 需排查原因 |
| 3 | 噪音仍产生幻觉（引擎声描述） | 🟢低 | 可接受 |
| 4 | "Steve Seek"→"deepseek" 模型纠正 | 🟡中 | ASR模型特性 |

---

## 五、已验证 / 未验证

### ✅ 已验证
- 智谱ASR延迟大幅改善（短音频1-3s）
- 短音频准确率100%
- 静音正确跳过
- Debug API正常工作
- BFF健康检查正常（commit e6597b4）

### ❌ 未验证
- 长音频（>30s需分片后重测）
- 端内UI录屏
- WebSocket实时转写回归
- 翻译质量全面验证
- 延迟不一致问题（musk两个文件差异大）

---

## 六、下一步

**需要Peter处理（阻塞项）**：
1. 🔴 **音频分片上传**：智谱API限制30s，需要在客户端/BFF层做分片
2. 🟡 **延迟不一致排查**：同是21s的musk文件，一个3s一个20s

**Guard继续**：
- 端内UI录屏测试
- 短音频批量回归
- 等分片方案就绪后补测长音频

---

*报告时间：2026-04-08 12:05*
