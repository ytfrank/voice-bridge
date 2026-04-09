# QA Report — voice-bridge V1.7

**测试人**：Guard  
**日期**：2026-04-09  
**对应 commit**：d007ad7（分支 dev_v1.6）  
**测试阶段进入时间**：2026-04-09 08:00

---

## 测试结论：⚠️ Conditional Pass

**通过项**：测试页(3001/static/test.html)文件上传流程，短/中/长音频全部通过  
**阻塞项**：Web模式App(3002)页面级错误，需Peter修复

---

## 一、测试范围

### 本次变更（V1.7）
1. ASR引擎切换：本地Whisper → 智谱GLM-ASR-2512
2. 长音频切片支持（>25s自动切片，ffmpeg segment）
3. 短音频性能修复（Node fetch→curl子进程，消除20x退化）
4. 测试可测性提升：浏览器测试页、Web模式App、Debug API端点
5. 去掉Expo Go开发者模式弹窗（Web方式替代）

### 测试矩阵
| 维度 | 覆盖情况 |
|------|---------|
| API自动化测试 | ✅ 10/10 |
| Web文件上传E2E | ✅ 3/3 |
| Web App加载 | ❌ 1/1 失败 |
| 健康检查 | ✅ 1/1 |
| 截图证据 | ✅ 11张 |
| 录屏证据 | ✅ 1个MP4 |

---

## 二、已验证

### 1. API自动化（10项全部通过）

| # | 测试场景 | 结果 | 耗时 |
|---|---------|------|------|
| 1 | 短音频 3s weather | ✅ | 354ms |
| 2 | 短音频 5s ai | ✅ | 474ms |
| 3 | 短音频 8s pangram | ✅ | 630ms |
| 4 | 短音频 21s musk | ✅ | 965ms |
| 5 | 噪音 10s | ✅ | 622ms |
| 6 | 长音频 3min | ✅ | 2744ms |
| 7 | 超长音频 12min | ✅ | 21824ms，12753字 |
| 8 | 空文件 | ✅ 正确拒绝 |
| 9 | 非音频文件 | ✅ 正确拒绝 |
| 10 | 静音文件 | ✅ 无崩溃 |

### 2. Web文件上传E2E（3项全部通过）

| # | 场景 | 文件 | 耗时 | 识别质量 |
|---|------|------|------|---------|
| 1 | 短音频 | en_short_21s_musk.wav | 2819ms | ✅ 完整+翻译 |
| 2 | 中音频 | en_medium_30s_climate.wav | 3529ms | ✅ 完整+翻译 |
| 3 | 长音频 | en_medium_3min_ai.wav | 8684ms | ✅ 完整+翻译 |

### 3. 服务健康

| 检查项 | 结果 |
|--------|------|
| BFF /health | ✅ status:ok |
| 测试页 /static/test.html | ✅ HTTP 200 |
| Web模式App :3002 | ❌ 页面错误（见下） |

---

## 三、未通过

### BUG-1：Web模式App页面错误

- **严重程度**：高（阻塞Web端用户流程验证）
- **地址**：`http://localhost:3002`
- **错误**：`Cannot use 'import.meta' outside a module`
- **影响**：Web模式App无法加载，不能作为接近真实用户流程的测试入口
- **证据**：
  - 截图：`tests/artifacts/v17/webapp_01_loaded.png`
  - 录屏：`tests/artifacts/v17/video/v1.7_web_evidence.mp4`
- **修复建议**：检查 expo-router entry.bundle 的 module type 配置

---

## 四、未验证

- ⏳ Web模式App UI完整流程（等BUG-1修复）
- ⏳ 中文语音ASR准确率
- ⏳ 极端并发场景
- ⏳ 真机iOS流程

---

## 五、风险

| 风险 | 等级 | 说明 |
|------|------|------|
| Web App(3002)不可用 | 高 | 需Peter修复后补测 |
| 云端API依赖 | 中 | 智谱GLM-ASR-2512服务稳定性 |
| 中文ASR未覆盖 | 低 | 测试集均为英文 |
| 尾音幻听 | 低 | "小红书"为音频原文，非bug |

---

## 六、证据索引

### 报告
- `monitor/v1.7/qa/report.md`（本文件）
- `tests/reports/v1.7_web_evidence_report_20260409.md`
- `tests/reports/v1.7_test_report_20260409.md`

### 截图（11张）
- `tests/artifacts/v17/webapp_01_loaded.png` — Web App加载异常
- `tests/artifacts/v17/short_01_page.png` — 短音频测试页
- `tests/artifacts/v17/short_02_selected.png` — 短音频文件选择
- `tests/artifacts/v17/short_03_result.png` — 短音频识别结果
- `tests/artifacts/v17/medium_01_page.png` — 中音频测试页
- `tests/artifacts/v17/medium_02_selected.png` — 中音频文件选择
- `tests/artifacts/v17/medium_03_result.png` — 中音频识别结果
- `tests/artifacts/v17/long_01_page.png` — 长音频测试页
- `tests/artifacts/v17/long_02_selected.png` — 长音频文件选择
- `tests/artifacts/v17/long_03_result.png` — 长音频识别结果
- `tests/artifacts/v17/health_01_result.png` — 健康检查

### 录屏
- `tests/artifacts/v17/video/v1.7_web_evidence.mp4` — 完整Web证据录屏（26s）

### 测试脚本
- `tests/e2e_v17_web_evidence.spec.ts` — Playwright E2E证据测试

---

## 七、下一步

1. **Peter修复** Web模式App(3002)页面错误
2. **Guard补测** Web App主流程截图+MP4
3. 修复通过后更新本报告结论为 Pass

---

*最后更新：2026-04-09 08:40 GMT+8*
