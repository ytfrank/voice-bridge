# SUBMISSION.md — VoiceBridge V1.7

**提交者**: Peter  
**日期**: 2026-04-09 07:15  
**commit**: d007ad7  
**分支**: dev_v1.6  

## 改动概要

### 1. ASR引擎切换：本地Whisper → 智谱GLM-ASR-2512
- 新增 `zhipuAsr()` + `dispatchAsr()` 统一分发
- ASR延迟：8-9s → 1-2s（7x提升）
- 回退方式：改 `ASR_PROVIDER=local` 即可

### 2. 长音频切片支持
- 智谱API限制单文件≤30s，后端自动切片（>25s触发）
- ffmpeg segment 分片 → 并发2个调API → 拼接结果
- 已验证：90s音频成功处理

### 3. 短音频性能修复
- Node fetch/form-data 调智谱API有20x性能退化
- 改用curl子进程调用，恢复正常（1-2s）

### 4. 测试可测性提升
- 浏览器测试页面：`http://localhost:3001/static/test.html`
- Web模式真实App：`http://localhost:3002`（无Expo Go弹窗）
- Debug API端点：`POST /api/debug/transcribe-file`

## 改动文件

| 文件 | 改动 |
|------|------|
| backend/server.js | zhipuAsr() + 分片逻辑 + curl调用 |
| backend/.env | ASR_PROVIDER=zhipu |
| backend/public/test.html | 浏览器测试页面（新增） |
| hooks/useAudioFileInput.ts | Debug模式文件输入 |
| components/DebugPanel.tsx | 📁文件按钮 |

## 自测结果

| 测试项 | 结果 | 详情 |
|--------|------|------|
| 短音频(21s) | ✅ | ASR:1089ms, Total:3272ms |
| 长音频(90s) | ✅ | ASR:2564ms, Total:7001ms |
| 测试页面 | ✅ | HTTP 200 |
| Web模式App | ✅ | HTTP 200 |
| BFF健康检查 | ✅ | status:ok |

## 测试入口

1. **浏览器测试页**：http://localhost:3001/static/test.html
2. **Web模式App**：http://localhost:3002
3. **API直接测试**：`curl -X POST http://localhost:3001/api/debug/transcribe-file -F "audio=@文件路径"`

## 测试重点

1. 短音频(5-30s) ASR准确率 + 延迟
2. 长音频(>30s) 切片处理是否正确
3. 极长音频(5min+) 是否稳定
4. 浏览器测试页面文件上传流程
5. Web模式App UI流程

## 风险

- 智谱ASR偶尔出现"小红书"幻觉（尾音幻听）
- "DeepSeek"和"SpaceX"可能混淆（原文歧义）
- Web模式下React Native录音API兼容性未验证
