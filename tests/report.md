# VoiceBridge 测试报告 - iOS录音修复验证

- **测试时间**：2026-03-17 10:30 GMT+8
- **提测 Commit**：`9c5c4f7` fix(ios): use correct expo-audio enum values for recording options
- **测试工程师**：Guard（质量主管）
- **测试环境**：BFF @ http://localhost:3001（whisper-local）+ Expo Web

---

## 一、改动点分析

| 改动文件 | 改动内容 |
|---------|---------|
| `hooks/useAudioRecording.ts` | expo-av → expo-audio 迁移 |
| 录音格式 | `IOSOutputFormat.MPEG4AAC` enum（修复字符串 'aac' 缺空格问题）|
| 音频质量 | `AudioQuality.MAX` enum（修复字符串 'max' 需要数值 127）|
| API 调用 | `prepareToRecordAsync()` + `recorder.uri`（修复不存在的 `prepare()` 和 `getURI()`）|

**修复目标**：解决 iOS `NSOSStatusErrorDomain Code=1718449215` (fmt? / format unknown) 录音失败

---

## 二、BFF API 回归测试

| 测试项 | 结果 | 说明 |
|--------|------|------|
| BFF 健康检查 | ✅ | status=ok, asr=whisper-local |
| ASR 转写 (WAV) | ✅ | "Hello, how are you today?" |
| ASR 格式边界 (m4a/mp3/ogg) | ✅ | 所有格式被接受 |
| ASR 错误边界 | ✅ | 空音频/超大音频正确返回 4xx/5xx |
| 翻译接口 (基础) | ✅ | "你好，你怎么样？" |
| 翻译接口 (长文本) | ✅ | 正确翻译 |
| 翻译错误边界 | ⚠️ | null 文本返回 500（期望 400，预存问题）|
| 流式翻译接口 | ❌ | 404（预存问题，非本次改动范围）|
| 完整链路 | ❌ | 因调用 stream 接口而 404（预存问题）|

**BFF 总结**：14/17 通过。3 个失败项均为预存问题，非本次 iOS 修复引入。

---

## 三、Playwright Web E2E 测试

**测试环境**：Expo Web @ http://localhost:19006 (Chromium)

| 测试项 | 结果 | 说明 |
|--------|------|------|
| 主界面加载 - 无 expo-audio 模块错误 | ✅ | 无模块加载错误 |
| 无 TypeError/ReferenceError 崩溃 | ✅ | 无致命 JS 错误 |
| 完整页面结构验证 | ✅ | React Native Web 渲染正常 |
| 录音控件正常渲染 | ⚠️ | Web 端控件未渲染（expo-audio Web 兼容性）|

**Web E2E 总结**：3/4 通过。Web 端录音控件未渲染，原因是 `expo-audio` 在 Web 环境下存在 `import.meta` 模块兼容问题（该库主要为移动端设计）。**此问题不影响 iOS 真机功能。**

**截图留证**：
- `tests/screenshots/01_home.png` - 主界面
- `tests/screenshots/03_stable.png` - 稳定性验证
- `tests/screenshots/04_full_page.png` - 完整页面

---

## 四、iOS 真机测试（人工门控）

> ⚠️ **以下测试必须在 iPhone 真机 + Expo Go 环境下执行，Guard 无法自动化完成。**

| 测试项 | 状态 | 验证方法 |
|--------|------|---------|
| Expo Go 加载 App | ⏳ 待验证 | 波哥 iPhone 扫码 |
| 麦克风权限弹窗 | ⏳ 待验证 | 点击"开始录音"触发 |
| 录音 → ASR → 翻译 链路 | ⏳ 待验证 | 说出英文，观察字幕和翻译 |
| 录音格式错误消失 | ⏳ 待验证 | 确认无 NSOSStatusErrorDomain 错误 |
| 截图留证 | ⏳ 待提供 | 保存到 tests/screenshots/ios_*.png |

---

## 五、测试结论

### ✅ 自动化部分：通过

- BFF 核心功能（ASR + 翻译）全部正常
- Web 端无 expo-audio 模块加载错误（迁移成功）
- 无致命 JS 崩溃

### ⏳ iOS 真机：待人工验证（硬门控）

**Guard 无法放行，需波哥在 iPhone 上验证以下流程：**

1. Expo Go 扫码加载 App
2. 点击开始录音 → 麦克风权限弹窗
3. 说话 → 英文字幕显示
4. 停顿 → 中文翻译显示
5. 确认无 `NSOSStatusErrorDomain Code=1718449215` 错误

**验证通过后，截图发群，Guard 即可放行 Atlas 部署。**

---

## 六、已知问题（非阻塞）

| 问题 | 严重度 | 说明 |
|------|--------|------|
| 流式翻译 404 | P2 | 已记录，后续优化 |
| null 文本返回 500 | P3 | 错误处理可优化 |
| Web 端录音控件不显示 | P3 | expo-audio Web 兼容性，不影响移动端 |

---

*报告版本：4.0（iOS 录音修复验证）| Guard | 2026-03-17*
