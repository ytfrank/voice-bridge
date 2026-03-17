# 提测报告 — voice-bridge iOS 录音修复

**提测时间：** 2026-03-17 10:00  
**提测人：** Peter  
**分支：** main  
**最新 Commit：** `4c6ea4d`  

---

## 一、功能说明

修复 iOS 端点击录音按钮后报错 `NSOSStatusErrorDomain Code=1718449215` 的问题，以及录音完成后上传 BFF 转写时报 `Cannot read property 'MULTIPART' of undefined` 的问题。

## 二、改动文件清单

| 文件 | 改动说明 |
|------|---------|
| `hooks/useAudioRecording.ts` | 修复 iOS 录音配置：使用正确的 `IOSOutputFormat.MPEG4AAC` 枚举替代字符串 `'aac'`；使用 `AudioQuality.MAX` 替代字符串 `'max'`；修正 API 调用（`prepareToRecordAsync`、`recorder.uri`）；调整 `RecordingOptions` 结构 |
| `services/transcriptionService.ts` | 修复 `expo-file-system` API 导入：从 `expo-file-system/legacy` 导入 `uploadAsync` 和 `FileSystemUploadType` |
| `services/saveService.ts` | 同样修复 `expo-file-system` API 导入：从 `expo-file-system/legacy` 导入文件操作相关 API |

## 三、影响范围

- **直接影响：** iOS 录音功能、音频上传转写功能、会话保存功能
- **需回归：** 录音 → 转写 → 翻译完整链路、保存会话功能

## 四、自测结论

- ✅ TypeScript 编译零错误（项目代码部分）
- ✅ `useAudioRecording.ts` — 录音配置使用官方枚举值，API 调用与 expo-audio 类型定义一致
- ✅ `transcriptionService.ts` — 从正确路径导入 `uploadAsync` 和 `FileSystemUploadType`
- ✅ `saveService.ts` — 从正确路径导入文件操作 API
- ✅ BFF 后端 health check 正常（通过 Cloudflare Tunnel）
- ⚠️ 需 iOS 真机（Expo Go）验证录音和转写完整流程

## 五、已知问题/遗留项

1. `EXPO_PUBLIC_BFF_URL` 已更新为 Cloudflare Tunnel 临时域名，tunnel 重启后域名会变化，需重新配置
2. expo 自身 tsconfig 有一个 `--module` 选项警告（TS6046），非项目代码问题，不影响运行

## 六、Changelog

```
4c6ea4d fix: use expo-file-system/legacy imports for uploadAsync and file operations
9c5c4f7 fix(ios): use correct expo-audio enum values for recording options
```

## 七、测试重点

1. **核心验证：** iPhone Expo Go 上点击录音 → 不再报 `NSOSStatusErrorDomain` 错误
2. **转写验证：** 录音后音频成功上传 BFF → 返回转写文本
3. **翻译验证：** 转写文本 → GLM-4-Flash 翻译 → 中文显示
4. **回归验证：** 保存会话功能正常
