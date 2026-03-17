# VoiceBridge 测试报告 — v2.0 Bug 修复验证

- **测试时间**：2026-03-17 15:18 GMT+8
- **提测 Commit**：`7034482` fix(ios): add interruptionMode to setAudioModeAsync
- **测试工程师**：Guard（质量主管）
- **BFF 环境**：http://localhost:3001（whisper-local / tiny）

---

## 一、本次改动点

| 文件 | 改动内容 |
|------|---------|
| `hooks/useAudioRecording.ts` | 补充 `interruptionMode: 'duckOthers'` + `shouldPlayInBackground: false` |

**修复目标**：解决 iOS "Session activation failed" 录音启动失败

---

## 二、BFF API 回归测试

| 测试项 | 结果 | 说明 |
|--------|------|------|
| BFF 健康检查 | ✅ | status=ok, whisper=tiny |
| ASR 转写 (WAV) | ✅ | "Hello, how are you today?" |
| ASR 格式边界 (m4a/wav/mp3/ogg) | ✅ | 所有格式被接受 |
| ASR 错误边界 | ✅ | 空音频→400, 超大→500 |
| 翻译接口 (基础) | ✅ | "你好，你怎么样？" |
| 翻译接口 (长文本) | ✅ | 正确翻译 |
| 流式翻译接口 | ✅ | 首包 332ms |
| 翻译错误边界 | ✅ | 全部正确返回 400 |
| 完整链路 (ASR→翻译) | ✅ | 全链路打通 |

**BFF 总结：17/17 通过（100%）** ✅

---

## 三、测试结论

### ✅ 自动化测试：完全通过

- BFF API 全部正常
- ASR + 翻译链路完整
- 流式接口正常工作

### ⏳ iOS 真机验证（人工门控）

需小叮当/波哥在 iPhone + Expo Go 下确认：

| 验收项 | 方法 |
|--------|------|
| 录音启动无报错 | 点击"开始"，确认无 "Session activation failed" |
| 录音 → ASR → 翻译链路 | 说英文，确认字幕和翻译正常显示 |
| 背景音频共存 | 播放音乐时录音，音乐音量降低但不中断 |

---

## 四、遗留问题

无 P0/P1 阻塞项。

---

*报告版本：6.0（v2.0 Bug 修复验证）| Guard | 2026-03-17*
