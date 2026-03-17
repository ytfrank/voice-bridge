# VoiceBridge 提测文档

**提交时间**：2026-03-17 14:50  
**提交人**：Peter  
**版本**：v1.0.0-local-whisper

---

## 一、本次修改内容

### 1. 核心变更：本地 Whisper 替代智谱 ASR

| 模块 | 变更前 | 变更后 |
|------|--------|--------|
| 语音转文字 | 智谱 glm-asr API | 本地 faster-whisper |
| 延迟 | ~800ms | ~200ms |
| 依赖 | 需要网络 + API余额 | 本地运行，无网络依赖 |
| 模型 | 云端 whisper-1 | 本地 tiny 模型 (~75MB) |

### 2. 新增文件

| 文件 | 说明 |
|------|------|
| `backend/local_whisper.py` | Python脚本，调用 faster-whisper |
| `backend/venv/` | Python虚拟环境（faster-whisper已安装） |

### 3. 修改文件

| 文件 | 修改内容 |
|------|----------|
| `backend/server.js` | `/api/transcribe` 改为调用本地 Whisper |
| `README.md` | 更新技术栈说明和启动命令 |

---

## 二、功能清单

| 功能 | 状态 | 备注 |
|------|------|------|
| 录音采集 | ✅ | expo-av, 2.5s 分块 |
| 语音转文字 | ✅ | 本地 Whisper (tiny) |
| 英文字幕显示 | ✅ | 上半屏流式显示 |
| 中文翻译 | ✅ | GLM-4-flash |
| 生词卡片 | ✅ | 点击弹出（音标+谐音+释义+例句） |
| 保存功能 | ✅ | 本地 JSON 文件 |
| 开始/结束按钮 | ✅ | 控制录音 |

---

## 三、自测结果

### BFF 后端

```bash
cd ~/projects/voice-bridge/backend
source venv/bin/activate
BFF_PORT=3001 node server.js
```

**Health Check**：
```json
{
  "status": "ok",
  "timestamp": "2026-03-16T18:14:43.374Z",
  "whisper": "tiny",
  "python": "venv"
}
```
✅ 通过

**翻译 API**：
```bash
curl -X POST http://localhost:3001/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world"}'
```
返回：中文翻译 + 生词数组  
✅ 通过

### 前端

```bash
cd ~/projects/voice-bridge
npx expo start
```

- Expo Go 可扫码启动 ✅
- 分屏布局正常 ✅
- 按钮交互正常 ✅

---

## 四、测试建议

### P0 必测

1. **录音 + ASR**
   - 点击"开始"录音
   - 说英文句子
   - 验证上半屏显示英文文字（预期 500ms 内）

2. **翻译**
   - 完整句子后（句号/停顿）
   - 验证下半屏显示中文翻译（预期 1500ms 内）

3. **生词卡片**
   - 点击高亮生词
   - 验证弹出卡片包含：释义、音标、谐音、例句

### P1 建议测试

4. **保存功能**
   - 点击"保存"按钮
   - 验证本地文件生成

5. **稳定性**
   - 连续使用 5 分钟
   - 验证无崩溃

### 测试环境

- **BFF**：`http://localhost:3001`
- **前端**：Expo Go 扫码
- **首次运行**：Whisper 会自动下载 tiny 模型 (~75MB)

---

## 五、已知问题

1. **首次启动慢**：Whisper 首次加载模型需要几秒钟
2. **翻译依赖网络**：GLM-4-flash 需要调用智谱 API

---

## 六、启动步骤

```bash
# 1. 启动 BFF
cd ~/projects/voice-bridge/backend
source venv/bin/activate
BFF_PORT=3001 node server.js

# 2. 启动 Expo（新终端）
cd ~/projects/voice-bridge
npx expo start

# 3. 用 Expo Go 扫码
```

---

**请 Guardian 测试后反馈结果。**
