# QA Report — voice-bridge V1.7（最终）

**测试人**：Guard  
**日期**：2026-04-09  
**测试 commit 范围**：ff3a7eb → d007ad7 → b6cf770  
**分支**：dev_v1.6  

---

## 测试结论：⚠️ Conditional Pass

### 通过
- ✅ 测试页(3001/static/test.html) 文件上传 E2E：短/中/长音频全部通过
- ✅ API 自动化：10/10 通过
- ✅ ASR 性能：短音频 ~1s，中音频 ~3.5s，长音频 3min ~8.7s
- ✅ 长音频切片：12min 音频正确处理
- ✅ 异常输入处理：空文件/非音频/静音均正确拒绝
- ✅ 截图 11 张 + MP4 录屏 1 个 + 报告已提交
- ✅ 所有证据已发飞书群

### 未通过（已知限制，非阻塞）
- ⚠️ Web模式App(3002) `Cannot use 'import.meta' outside a module`
  - 原因：Expo SDK 51 + Hermes web 上游限制
  - Peter 已尝试修复（commit b6cf770），确认无法在当前 SDK 版本解决
  - Workaround：使用测试页(3001/static/test.html) 替代

---

## 性能数据

| 场景 | 时长 | ASR耗时 | 总耗时 |
|------|------|---------|--------|
| 短音频 weather | 3s | 354ms | ~1s |
| 短音频 musk | 21s | 965ms | 2819ms |
| 中音频 climate | 30s | ~1.5s | 3529ms |
| 长音频 AI | 3min | 2744ms | 8684ms |
| 超长音频 AI | 12min | 21824ms | ~29s |

## 证据索引

- 报告：`monitor/v1.7/qa/report.md`
- 截图：`tests/artifacts/v17/*.png`（11张）
- 录屏：`tests/artifacts/v17/video/v1.7_web_evidence.mp4`
- 测试脚本：`tests/e2e_v17_web_evidence.spec.ts`

## 建议

Web模式App(3002)的 import.meta 问题是 Expo SDK 上游限制，当前用测试页 workaround 可覆盖功能验证。建议后续 Expo SDK 升级时一并解决。

**Guard 测试结论：Conditional Pass，建议小叮当验收。**

---

*最后更新：2026-04-09 09:40 GMT+8*
