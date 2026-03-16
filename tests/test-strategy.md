# VoiceBridge 测试策略

**制定时间**：2026-03-16  
**测试负责人**：Guard  
**项目**：VoiceBridge（React Native + Expo 英文语音实时翻译 App）

---

## 一、测试分层

| 层级 | 测试类型 | 自动化程度 | 重点 |
|------|----------|-----------|------|
| L1 | BFF API 测试 | ✅ 全自动 | 接口逻辑、AI链路、延迟 |
| L2 | 集成测试 | ✅ 全自动 | ASR→翻译完整链路 |
| L3 | 保存功能测试 | ✅ 全自动 | 本地文件读写 |
| L4 | UI/UX 测试 | 🔶 手动 | Expo Go 扫码、交互验证 |
| L5 | 稳定性测试 | 🔶 半自动 | 5分钟连续使用压测 |

---

## 二、验收项 vs 测试方法

| 验收项（来自PRD） | 测试方法 | 自动化 |
|------------------|---------|--------|
| 语音采集（开始/结束） | BFF健康检查 + Expo Go 手动验证 | 部分 |
| 英文字幕 ≤500ms | BFF ASR 接口计时测试 | ✅ |
| 中文翻译 ≤1500ms | BFF 翻译接口计时测试 | ✅ |
| 点词释义（卡片含释义+音标+例句） | BFF 翻译接口返回结构验证 | ✅ |
| 保存功能（本地可查询） | BFF 保存接口测试 | ✅ |
| Expo Go 扫码运行 | 手动：波哥 iPhone 实测 | ❌ 手动 |
| 无崩溃（5分钟） | 5分钟 API 连续压测 | ✅ |

---

## 三、L1 BFF API 测试用例设计

### 3.1 健康检查
- `GET /health` → 200，服务在线

### 3.2 ASR 转写接口
- 端点：`POST /api/transcribe`（预期 BFF 封装智谱 ASR）
- 测试点：
  - 用标准英文音频文件（test.wav/m4a）→ 返回识别文本
  - 延迟计时：**目标 ≤ 800ms**（网络好情况下）
  - 空文件/无效格式 → 适当错误响应
  - 识别结果非空时 text 字段存在且为字符串

### 3.3 翻译+生词接口
- 端点：`POST /api/translate`（预期 BFF 封装 GLM-4-Flash）
- 测试点：
  - 输入标准英文句子 → 返回 `translation` 字段（中文）
  - 返回 `words` 数组，每项含 `word/meaning/phonetic/example`
  - 延迟计时：**目标 ≤ 1000ms**（含AI推理）
  - 空输入 → 适当错误处理
  - JSON 格式解析正确（GLM 有时返回 markdown 包裹的 JSON）

### 3.4 保存接口
- 端点：`POST /api/save`（或本地文件保存逻辑）
- 测试点：
  - 提交英文原文 + 中文翻译 → 返回成功
  - 保存后通过 `GET /api/records` 或读取本地文件可查到记录

### 3.5 完整链路测试
- 模拟用一段预录好的英文音频：
  1. POST /api/transcribe → 得到英文文本
  2. POST /api/translate → 得到中文翻译 + 生词
  3. POST /api/save → 保存记录
  4. GET /api/records → 验证记录存在

---

## 四、延迟测试标准

| 步骤 | PRD要求 | 测试标准（宽松10%余量） |
|------|---------|----------------------|
| ASR 转写 | 500ms 内上屏 | 单次 API ≤ 800ms（网络+AI）|
| 翻译显示 | 1500ms 内 | 单次 API ≤ 1500ms |
| 完整链路（ASR+翻译） | - | ≤ 2000ms |

> 注：500ms 要求包含前端渲染，纯 API 层允许≤800ms

---

## 五、测试数据准备

需要准备以下测试素材（等 Peter 交付后准备）：

1. **标准测试音频**：一段 2-3 秒的清晰英文语音（wav/m4a 格式）
   - 内容建议："The quick brown fox jumps over the lazy dog."
   - 可使用 macOS `say` 命令生成：`say -o test.aiff "The quick brown fox" && ffmpeg -i test.aiff test.wav`

2. **测试英文句子集**（用于翻译接口）：
   - 简单句：`"Hello, how are you?"`
   - 含生词：`"The phenomenon of photosynthesis is ubiquitous in nature."`
   - 长句：`"Despite the unprecedented challenges we face, human resilience remains an enduring testament to our collective strength."`

---

## 六、手动测试检查清单（Expo Go）

Peter 完成开发后，需手动验证：

```
□ Expo 服务器正常启动，生成扫码链接
□ iPhone 扫码后 App 正常加载
□ 点击"开始"按钮 → 权限弹窗出现
□ 授权麦克风后开始录音（状态显示"监听中..."）
□ 说英文 → 上半屏出现英文字幕（目测 < 1s）
□ 停顿后 → 下半屏出现中文翻译
□ 有生词高亮显示（可识别颜色区分）
□ 点击生词 → 卡片弹出，含释义+音标+例句
□ 点击卡片外区域 → 卡片关闭
□ 点击"结束" → 停止录音
□ 点击"保存" → 提示保存成功
□ 连续使用 5 分钟 → 无崩溃、无卡顿
```

---

## 七、需要从 Peter 确认的接口信息

在 Peter 完成开发后，需确认：
1. **BFF 服务地址和端口**
2. **API 接口路径**（/api/transcribe, /api/translate 等确切路径）
3. **音频格式**（wav/m4a/base64还是multipart）
4. **保存接口设计**（是 BFF 接口还是纯 App 本地存储）
5. **Expo 开发服务器启动方式**

---

## 八、测试报告输出

报告路径：`~/projects/voice-bridge/tests/report.md`

格式：
```markdown
## 测试报告 - voice-bridge项目
- 测试时间：
- 覆盖功能：
- 通过项：
- 失败项：（含描述）
- 性能数据：ASR延迟 / 翻译延迟
- 手动验证：Expo Go 测试结论
- 总结：通过 / 需要修复
```

---

*策略版本：1.0 | Guard | 2026-03-16*
