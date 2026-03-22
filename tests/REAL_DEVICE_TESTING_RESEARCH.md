# Voice Bridge 真机测试方案调研

**调研时间**：2026-03-22  
**调研人**：Guard  
**背景**：V1.2生产事故后，需解决真机测试障碍

---

## 一、当前环境限制

检查结果：
- ❌ Xcode未安装（iOS Simulator不可用）
- ❌ Android SDK未安装（Android Emulator不可用）
- ✅ 有Mac设备（可安装模拟器）

---

## 二、可行方案对比

| 方案 | 成本 | 可行性 | 优点 | 缺点 |
|------|------|--------|------|------|
| **方案1: Xcode iOS Simulator** | 免费 | ⭐⭐⭐⭐⭐ | 官方支持，Expo Go兼容 | 需下载Xcode（~10GB） |
| **方案2: Android Studio Emulator** | 免费 | ⭐⭐⭐⭐ | 可测试Android兼容性 | 需下载Android Studio |
| **方案3: BrowserStack云真机** | $29/月起 | ⭐⭐⭐ | 真实设备，无需安装 | 付费，网络延迟 |
| **方案4: 物理设备+手动** | 0 | ⭐⭐⭐⭐ | 最真实可靠 | 需人工介入 |
| **方案5: EAS Build + TestFlight** | 免费额度 | ⭐⭐⭐ | 可分发到真机测试 | 配置复杂 |

---

## 三、推荐方案：Xcode iOS Simulator

### 3.1 安装步骤

```bash
# 1. 从App Store安装Xcode（约10GB，需Apple ID）
# 2. 安装Command Line Tools
xcode-select --install

# 3. 启动iOS Simulator
open -a Simulator

# 4. 在模拟器中安装Expo Go
# 方法：模拟器Safari打开 expo.dev/go → 下载Expo Go
```

### 3.2 测试流程

```bash
# 1. 启动BFF和Expo服务
cd ~/projects/voice-bridge
bash scripts/start-dev.sh

# 2. 启动iOS Simulator
open -a Simulator

# 3. 在模拟器中打开Expo Go，输入连接地址
# exp://localhost:8081

# 4. 执行测试
# - 点击"开始录音"
# - 播放测试音频（如马斯克视频）
# - 验证识别和翻译结果

# 5. 截图留证
# Cmd+S 在模拟器中截图
```

### 3.3 模拟器播放音频到App

**关键问题**：如何让模拟器中的App"听到"音频？

**方案A：系统音频路由**
```bash
# 安装BlackHole（虚拟音频驱动）
brew install blackhole-2ch

# 在系统偏好设置中：
# 1. 音频输出 → BlackHole
# 2. 音频输入 → BlackHole
# 3. 播放测试音频 → App可以"听到"
```

**方案B：外放+麦克风**
```bash
# 1. 用Mac扬声器播放测试音频
# 2. 模拟器使用Mac麦克风作为输入
# 3. 音量足够大时可以被识别
```

---

## 四、测试音频准备

### 4.1 马斯克音频提取

波哥已提供马斯克视频（21秒），需要：

```bash
# 提取音频
ffmpeg -i musk_video.mp4 -vn -acodec copy musk_audio.m4a

# 或转为wav
ffmpeg -i musk_video.mp4 -vn -acodec pcm_s16le musk_audio.wav
```

### 4.2 标准测试音频集

| 音频 | 时长 | 用途 |
|------|------|------|
| `test_short.wav` | 3秒 | 冒烟测试 |
| `test_medium.wav` | 10秒 | 常规测试 |
| `musk_speech.wav` | 21秒 | 真实场景测试 |
| `test_long.wav` | 60秒 | 稳定性测试 |

生成测试音频：
```bash
# 使用macOS say命令生成英文语音
say -o test_short.wav "Hello, how are you today?"
say -o test_medium.wav "The quick brown fox jumps over the lazy dog. This is a test of the voice recognition system."
```

---

## 五、自动化测试脚本

### 5.1 冒烟测试脚本

```bash
#!/bin/bash
# smoke_test.sh - 冒烟测试（5分钟）

echo "=== Voice Bridge 冒烟测试 ==="

# 1. BFF健康检查
echo "[1/4] BFF健康检查..."
curl -s http://localhost:3002/health | jq .
if [ $? -ne 0 ]; then
  echo "❌ BFF健康检查失败"
  exit 1
fi
echo "✅ BFF健康检查通过"

# 2. 上传测试音频
echo "[2/4] ASR转写测试..."
RESPONSE=$(curl -s -X POST http://localhost:3002/api/transcribe \
  -F "audio=@tests/fixtures/test_short.wav")
echo "$RESPONSE" | jq .
TEXT=$(echo "$RESPONSE" | jq -r '.text')
if [ -z "$TEXT" ] || [ "$TEXT" == "null" ]; then
  echo "❌ ASR转写失败"
  exit 1
fi
echo "✅ ASR转写通过: $TEXT"

# 3. 翻译测试
echo "[3/4] 翻译测试..."
RESPONSE=$(curl -s -X POST http://localhost:3002/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, how are you?"}')
echo "$RESPONSE" | jq .
TRANSLATION=$(echo "$RESPONSE" | jq -r '.translation')
if [ -z "$TRANSLATION" ] || [ "$TRANSLATION" == "null" ]; then
  echo "❌ 翻译失败"
  exit 1
fi
echo "✅ 翻译通过: $TRANSLATION"

# 4. 检查无500错误
echo "[4/4] 错误检查..."
if echo "$RESPONSE" | grep -q "500"; then
  echo "❌ 存在500错误"
  exit 1
fi
echo "✅ 无500错误"

echo ""
echo "=== 冒烟测试全部通过 ✅ ==="
```

### 5.2 真机E2E测试Checklist

```markdown
## 真机E2E测试清单

### 测试环境
- [ ] iOS Simulator已启动
- [ ] Expo Go已安装
- [ ] BFF服务运行中
- [ ] Expo服务运行中

### 测试步骤
1. [ ] Expo Go连接到exp://localhost:8081
2. [ ] App正常加载，无报错
3. [ ] 点击"开始"按钮
4. [ ] 播放测试音频（外放或音频路由）
5. [ ] 英文字幕区域出现识别文字
6. [ ] 中文翻译区域出现翻译结果
7. [ ] 点击"结束"按钮
8. [ ] 截图留证

### 验收标准
- [ ] 识别准确率 ≥80%
- [ ] 翻译可读性良好
- [ ] 无崩溃、无卡顿
- [ ] 有截图证据

### 截图要求
- 开始前状态
- 录音中状态
- 识别结果
- 翻译结果
- 结束后状态
```

---

## 六、立即行动

### 本周任务
1. [ ] 安装Xcode（需波哥确认）
2. [ ] 配置iOS Simulator + Expo Go
3. [ ] 准备测试音频集
4. [ ] 编写冒烟测试脚本
5. [ ] 执行V1.2回归测试

### 备选方案
如果Xcode安装不可行：
- 使用波哥iPhone进行手动测试
- 小叮当执行真机测试，我提供checklist

---

## 七、云真机服务（备选）

如果本地模拟器方案不可行，可考虑：

| 服务 | 价格 | 特点 |
|------|------|------|
| BrowserStack | $29/月起 | 支持iOS/Android真机 |
| LambdaTest | $15/月起 | 支持React Native |
| Sauce Labs | 企业定价 | 企业级支持 |
| AWS Device Farm | 按使用付费 | AWS生态集成 |

---

**调研结论**：推荐安装Xcode + iOS Simulator作为主力方案，配合手动真机测试作为补充。

*调研人：Guard*
*调研时间：2026-03-22 08:25*
