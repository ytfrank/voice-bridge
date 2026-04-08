# 提测报告 - Debug模式：音频文件输入

## 基本信息
- **commit**: b181756
- **分支**: dev_v1.6
- **日期**: 2026-04-08

## 修改文件

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `hooks/useAudioFileInput.ts` | 新增 | 音频文件选择+处理hook |
| `components/DebugPanel.tsx` | 修改 | 增加📁文件输入按钮+进度显示 |
| `utils/pipelineLogger.ts` | 修改 | 新增debug_file_*事件类型 |
| `package.json` | 修改 | 新增expo-document-picker依赖 |
| `tests/fixtures/audio/README.md` | 新增 | 测试音频命名规范和分类 |

## 功能说明

### 使用方式
1. 三击右下角小圆点打开Debug面板
2. 点击 📁 按钮
3. 选择音频文件（支持 mp3/wav/m4a）
4. 系统自动：上传转录 → 翻译 → 结果显示到主界面

### 处理流程
```
选择文件 → uploadAsync(/api/transcribe) → 拿到transcription → translateText() → addTranslation()
```

### 测试音频命名规范
```
{lang}_{duration}_{description}.{ext}
```
分类：短(3-15s)、中(1-5min)、长(30min+)、边界(silent/noise)

## 改动点说明

1. **不修改正常录音流程** — Debug功能完全在DebugPanel内，不影响正常用户体验
2. **复用现有接口** — 直接调用已有的 `/api/transcribe` 和 `translateText()`，无需新后端端点
3. **类型安全** — TypeScript编译零错误，所有类型严格对齐

## 自测情况
- ✅ TypeScript编译通过 (tsc --noEmit)
- ✅ 代码已push到远程

## 测试重点

1. **功能测试**：选择不同格式音频文件（mp3/wav/m4a），验证转录+翻译正常
2. **边界测试**：
   - 极短音频（<1s）— 应该被quality gate跳过
   - 静音文件 — 应返回空/skipped
   - 大文件（>30min）— 验证不超时
3. **UI测试**：Debug面板文件选择按钮交互、进度显示、结果展示
4. **端到端测试**：用标准测试音频集验证准确率和延迟

## 注意事项

- 需要 `npx expo install expo-document-picker` 后重启 Expo
- 音频文件处理可能耗时较长（大文件），注意超时设置
- 后端 whisper 默认超时 30s，超长音频可能需要调大 `WHISPER_TIMEOUT_MS`

## 风险

- expo-document-picker 在 iOS Simulator 上的文件选择体验可能受限（沙箱限制）
- 超大音频文件（>1h）可能超过 whisper 处理能力，需要实测确认
