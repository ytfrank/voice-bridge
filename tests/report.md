# VoiceBridge 测试报告 — v2.0 完整迭代

- **测试时间**：2026-03-17 19:42 GMT+8
- **提测 Commit**：`b29d788` feat(v2): three-zone UI, history, and latency optimizations
- **测试工程师**：Guard（质量主管）
- **BFF 环境**：http://localhost:3001（whisper-local / tiny）

---

## 一、冒烟检查

| 需求 | 功能点 | 文件检查 | 状态 |
|------|--------|---------|------|
| P0 UI三区布局 | VocabularySection.tsx | ✅ 存在 | 通过 |
| P0 Bug修复 | useAudioRecording.ts interruptionMode | ✅ 已修复 | 通过 |
| P1 延迟优化 | translationService.ts 流式方法 | ✅ 存在 | 通过 |
| P1 历史记录 | app/history/ 页面 | ✅ 存在 | 通过 |

**冒烟结论：✅ 功能点齐全，可进入详细测试**

---

## 二、BFF API 回归测试

| 测试项 | 结果 | 说明 |
|--------|------|------|
| BFF 健康检查 | ✅ | status=ok, whisper=tiny |
| ASR 转写 (WAV) | ✅ | "Hello, how are you today?" |
| ASR 格式边界 | ✅ | m4a/wav/mp3/ogg 全部接受 |
| ASR 错误边界 | ✅ | 正确返回 400/500 |
| 翻译接口 | ✅ | 中文翻译 + 生词数组 |
| 流式翻译接口 | ✅ | 首包 ~300ms |
| 翻译错误边界 | ✅ | 全部正确返回 400 |
| 完整链路 | ✅ | ASR → 翻译 全通 |

**BFF 总结：17/17 通过（100%）** ✅

---

## 三、测试结论

### ✅ 自动化测试：完全通过

- BFF API 全部正常
- ASR + 翻译链路完整
- 流式接口正常工作

### ⏳ 人工验收门控（需 iOS 真机）

| 验收项 | 验证方法 |
|--------|---------|
| 录音启动无报错 | iPhone Expo Go 点击"开始" |
| UI 三区布局 | 英文区/中文区/生词折叠区 分离显示 |
| 生词折叠展开 | 点击生词区展开，点击词条弹卡片 |
| 延迟体验 | 翻译显示 ≤3s |
| 历史记录 | 保存后列表可见，点击进入详情 |

---

## 四、遗留问题

无 P0/P1 阻塞项。

---

*报告版本：7.0（v2.0 完整迭代）| Guard | 2026-03-17*
