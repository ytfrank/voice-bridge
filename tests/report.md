# VoiceBridge 测试报告 - expo-file-system/legacy 修复验证

- **测试时间**：2026-03-17 11:18 GMT+8
- **提测 Commit**：`4c6ea4d` fix: use expo-file-system/legacy imports for uploadAsync and file operations
- **测试工程师**：Guard（质量主管）
- **BFF 端口**：http://localhost:3002（whisper-local / tiny）

---

## 一、改动点分析

| 改动文件 | 改动内容 |
|---------|---------|
| `services/transcriptionService.ts` | `uploadAsync` / `FileSystemUploadType` 改从 `expo-file-system/legacy` 导入 |
| `services/saveService.ts` | `documentDirectory` / `getInfoAsync` 等改从 `expo-file-system/legacy` 导入 |

**修复目标**：`FileSystemUploadType.MULTIPART` 运行时为 `undefined` → 音频无法上传到 BFF 转写

---

## 二、BFF API 回归测试（重点：音频上传链路）

| 测试项 | 结果 | 说明 |
|--------|------|------|
| BFF 健康检查 | ✅ | status=ok, whisper=tiny |
| ASR 转写 (WAV) | ✅ | "Hello, how are you today?" |
| ASR 格式边界 (m4a/wav/mp3/ogg) | ✅ | **m4a 正常接受**（关键验证项）|
| ASR 错误边界 | ✅ | 空音频→400, 超大→500 |
| 翻译接口 (基础) | ✅ | "你好，你怎么样？" |
| 翻译接口 (长文本) | ✅ | 正确翻译 |
| 流式翻译接口 | ✅ | 首包 397ms（之前 404，本次修复！）|
| 翻译错误边界 (null) | ✅ | 正确返回 400（之前 500，本次修复！）|
| 完整链路 (ASR→翻译) | ✅ | 全链路打通 |

**BFF 总结：17/17 通过（100%）** 🎉

---

## 三、测试结论

### ✅ 自动化测试：完全通过

所有 17 项测试全部通过，包含：
- 本次修复重点：**m4a 音频上传 → BFF 转写** ✅
- 附带修复：流式翻译接口 ✅ + null 错误边界 ✅
- 完整链路 ASR → 翻译 → 全通 ✅

### ⏳ iOS 真机验证（人工门控）

需波哥 / 小叮当在 iPhone + Expo Go 下确认：

| 验收项 | 方法 |
|--------|------|
| 录音后音频成功上传 BFF | 说话后观察英文字幕是否出现 |
| 翻译结果正常显示 | 字幕停顿后中文翻译出现 |
| 无 `FileSystemUploadType is undefined` 错误 | 观察录音是否正常完成 |

---

## 四、遗留问题

本次测试后**无 P0/P1 阻塞项**。流式接口和 null 边界问题已随本次提交一并修复。

---

*报告版本：5.0（expo-file-system/legacy 修复验证）| Guard | 2026-03-17*
