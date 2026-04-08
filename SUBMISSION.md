# 提测报告 - V1.7 智谱ASR + Debug模式

## 基本信息
- **commit**: 127edaf
- **分支**: dev_v1.6
- **日期**: 2026-04-08

## 本次改动

### 1. ASR引擎切换：本地Whisper → 智谱GLM-ASR-2512
| 指标 | 旧（本地medium） | 新（智谱ASR） |
|------|-----------------|--------------|
| ASR延迟 | 8,000-22,000ms | **1,177ms** |
| 总延迟 | 10-28s | **3.3s** |
| 长音频支持 | ❌ 30s超时 | ✅ API处理 |
| CPU占用 | 持续高负载 | 零本地CPU |

修改文件：
- `backend/server.js` — 新增 `zhipuAsr()` + `dispatchAsr()` 统一分发
- `backend/.env` — 新增 `ASR_PROVIDER=zhipu`

回退方式：设置 `ASR_PROVIDER=local` 即可回退本地whisper

### 2. Debug模式：音频文件输入（上次已提测）
- `hooks/useAudioFileInput.ts` — 文件选择+转录+翻译
- `components/DebugPanel.tsx` — 📁按钮+进度条
- `POST /api/debug/transcribe-file` — 批量测试API端点

### 3. 标准测试数据
- 视频：`tests/fixtures/video/musk_21s_original.mp4`
- 音频：3s/5s/8s/21s/30s/3min/5min/12min 各档位
- Ground Truth：`tests/fixtures/ground_truth/en_short_21s_musk.txt`

## 自测结果
```
马斯克音频（21s英文）：
- ASR: 1,177ms ✅
- 翻译: 2,068ms ✅  
- 总计: 3,278ms ✅（目标3-5s内）
- 识别准确率: ~95%（小错误：DeepSeek vs SpaceX）
```

## 测试重点
1. 各种长度音频（3s/8s/21s/3min/30min）的识别准确率和延迟
2. 异常场景：静音/噪音/空文件
3. 端到端UI测试：Debug模式文件选择流程
4. 中英文混合识别

## 风险
- 智谱ASR依赖网络，断网不可用（可回退local）
- 马斯克音频识别有少量错误（DeepSeek/小红书），可能是模型幻觉
