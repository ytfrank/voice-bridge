# VoiceBridge — 英文语音实时翻译 App

实时语音翻译 App：监听英文语音 → 实时显示英文字幕 → 翻译成中文 → 点击生词查释义。

## 功能

- 🎙 **实时语音采集** — 点击"开始"持续监听麦克风
- 📝 **英文字幕** — 上半屏流式显示英文（~500ms延迟）
- 🇨🇳 **中文翻译** — 下半屏整句翻译（句子完整后显示）
- 📖 **点词释义** — 点击生词展开卡片（释义+音标+谐音+例句）
- 💾 **保存记录** — 点击保存当前对话到本地
- 🌙 **深色主题** — 全中文界面

## 技术栈

| 模块 | 方案 |
|------|------|
| 框架 | React Native + Expo SDK 51 |
| 录音 | expo-av（.m4a，2.5s分块） |
| 语音转文字 | 智谱 ASR API（via BFF） |
| 翻译+生词 | GLM-4-flash（via BFF） |
| 状态管理 | zustand |
| API代理 | Node.js Express BFF |

## 快速启动

### 1. 安装依赖

```bash
# 前端
npm install

# BFF后端
cd backend && npm install
```

### 2. 配置 API Key

```bash
# 在 backend/.env 中配置（已配好）
ZHIPU_API_KEY=your_key_here
BFF_PORT=3001
```

### 3. 启动 BFF 后端

```bash
cd backend && npm start
```

### 4. 启动 Expo 开发服务器

```bash
# 新终端窗口
npx expo start
```

### 5. 使用

- **iPhone**: 用 Expo Go 扫码
- **Android**: 用 Expo Go 扫码，或打包 APK

## 项目结构

```
voice-bridge/
├── app/                    # Expo Router 页面
│   ├── _layout.tsx         # 根布局
│   └── index.tsx           # 主界面（分屏显示）
├── components/             # UI 组件
│   ├── EnglishTranscript   # 上半屏英文字幕
│   ├── ChineseTranslation  # 下半屏中文翻译
│   ├── VocabularyCard      # 生词卡片弹窗
│   ├── ControlButtons      # 控制按钮
│   └── StatusIndicator     # 状态指示器
├── hooks/                  # 自定义 Hooks
│   └── useAudioRecording   # 录音+分块+ASR
├── services/               # API 服务
│   ├── transcriptionService # ASR调用
│   ├── translationService  # 翻译调用
│   └── saveService         # 本地保存
├── store/                  # Zustand 状态
│   └── transcriptStore     # 全局状态
├── constants/              # 常量配置
│   ├── api.ts              # API端点
│   └── audio.ts            # 录音参数
├── backend/                # BFF 代理服务器
│   ├── server.js           # Express server
│   ├── package.json
│   └── .env                # API Key（不提交git）
├── app.json                # Expo 配置
├── package.json
└── tsconfig.json
```

## 数据流

```
麦克风 → expo-av录音 → 2.5s分块
→ BFF代理 → 智谱ASR → 英文文字（上半屏实时显示）
→ 句子完整判断（句号/停顿）
→ BFF代理 → GLM-4-flash → 中文翻译+生词（下半屏显示）
```

## 打包 APK

```bash
npx eas build --platform android --profile preview
```
