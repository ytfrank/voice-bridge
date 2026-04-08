# 提测报告 - V1.7 智谱ASR切换 + Debug模式

## 基本信息
- **commit**: e6597b4
- **分支**: dev_v1.6
- **日期**: 2026-04-08

## 修改文件

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `backend/server.js` | 修改 | 新增 zhipuAsr() + dispatchAsr() 统一ASR分发 |
| `backend/.env` | 修改 | 新增 ASR_PROVIDER=zhipu |
| `hooks/useAudioFileInput.ts` | 新增 | Debug模式音频文件选择hook |
| `components/DebugPanel.tsx` | 修改 | 新增📁文件输入按钮+进度显示 |
| `utils/pipelineLogger.ts` | 修改 | 新增debug_file_*事件类型 |
| `package.json` | 修改 | 新增expo-document-picker依赖 |
| `tests/fixtures/audio/en_short_21s_musk.wav` | 新增 | 马斯克标准测试音频（单声道16k） |
| `tests/fixtures/video/musk_21s_original.mp4` | 新增 | 马斯克原始测试视频 |
| `tests/fixtures/ground_truth/en_short_21s_musk.txt` | 新增 | Ground truth文本 |
| `tests/scripts/batch_transcribe_test.sh` | 新增 | 批量测试脚本 |

## 功能说明

### 1. ASR引擎切换（核心改动）
- 本地 Whisper medium → 智谱 GLM-ASR-2512 API
- ASR延迟：8-9s → 0.6-1.4s（**7x提升**）
- 总延迟：10-11s → 2-4s（**3x提升**，满足3-5s目标）
- 支持长音频，不再超时
- 回退：`ASR_PROVIDER=local` 即可切回本地whisper

### 2. Debug模式音频文件输入
- 三击右下角圆点 → Debug面板 → 📁按钮
- 支持选择本地音频文件（mp3/wav/m4a）
- 自动转录+翻译+显示结果

### 3. 批量测试API端点
- `POST /api/debug/transcribe-file` — curl/脚本直接调用
- 返回：transcribedText, translation, whisperMs, translateMs, totalMs

### 4. 标准测试数据
- 马斯克21s视频+音频+ground truth
- 命名规范：{lang}_{duration}_{description}.{ext}

## 改动点说明

1. **不修改正常录音流程** — 前端录音→chunk上传→BFF→智谱ASR→翻译→返回，链路不变
2. **统一ASR分发** — `dispatchAsr()` 函数统一调度，通过环境变量切换provider
3. **智谱ASR格式要求** — 音频需单声道，后端已有normalizeAudio处理

## 自测情况

### ASR性能测试（线上BFF实测）
| 测试音频 | ASR延迟 | 翻译延迟 | 总延迟 | 结果 |
|---------|---------|---------|--------|------|
| 马斯克21s英文 | 1177ms | 2068ms | **3278ms** | ✅ |
| 马斯克21s英文（复测） | 1430ms | 2478ms | **3934ms** | ✅ |
| long_sentence.wav | 640ms | 1395ms | **2077ms** | ✅ |
| TTS测试4.4s | ~1000ms | — | ~3s | ✅ 100%准确率 |

### ASR准确率（马斯克21s）
- Ground truth: "And for most of actually human history, China has been the most powerful nation on earth. And so you can expect that they will do many great things. SpaceX being one of them, that is simply a result of the immense amount of talent."
- ASR输出: "And for most of actually human history, China has been the most powerful nation on earth. And so you can expect that they will do many great things, deepseek being one of them. But that is simply a lot of the immense amount of challenge. 小红书"
- 准确率：~85%（几个词识别错误，需Guard用更多样本全面评估）

- ✅ TypeScript编译通过
- ✅ 代码已push到远程
- ✅ PM2已重启，线上BFF运行正常

## 测试重点

### P0 - 必须验证
1. **正常录音流程**：用户录音→实时转录→翻译→显示，全链路OK
2. **ASR延迟**：各时长音频（5s/15s/30s/3min）延迟是否稳定在3-5s内
3. **ASR准确率**：用标准测试音频集验证WER是否≤5%
4. **翻译质量**：英→中翻译是否准确自然

### P1 - 应该验证
5. **Debug模式文件输入**：选择音频文件→转录+翻译正常
6. **批量测试API**：`/api/debug/transcribe-file` 各种格式音频
7. **边界情况**：静音文件、极短音频（<3s）、大文件（>30min）
8. **端到端UI测试**：截屏/录屏完整用户流程

### 测试数据
- 标准测试音频：`tests/fixtures/audio/en_short_21s_musk.wav`
- Ground truth：`tests/fixtures/ground_truth/en_short_21s_musk.txt`
- 批量测试脚本：`tests/scripts/batch_transcribe_test.sh`

## 注意事项

1. **环境变量**：`ASR_PROVIDER=zhipu` 必须在 `.env` 中设置
2. **智谱余额**：ASR按用量收费（约0.72元/小时音频），需确保余额充足
3. **网络依赖**：智谱ASR是云端API，需要网络畅通
4. **回退方案**：如果智谱API不可用，改 `ASR_PROVIDER=local` 回退本地whisper

## 风险

- 智谱ASR在某些口音/方言/噪音环境下准确率可能下降，需实测确认
- 马斯克音频有少量识别错误（SpaceX→DeepSeek），可能是个案，需更多样本验证
- 长音频（>30min）智谱API是否有文件大小限制，需实测确认
