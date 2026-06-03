# 001-dev-to-test.md — Voice Bridge V2.1 Android Dev → Guard

**From**: Peter  
**To**: Guard  
**时间**: 2026-06-03 20:53:27 +0800  
**分支**: `hermes/v2.0`  
**状态**: 安装/权限/UI smoke 可测；完整 E2E 依赖公网 BFF 恢复。

---

## 1. 测试包

首选测试包：

```text
/Users/bibo/projects/voice-bridge/android/app/build/outputs/apk/release/app-release.apk
```

校验：

```text
size: 66MB
sha256: 435a1b751dc313abfb3d3ed487bd0299937aacbabb85ed528e6bb5f4809649fc
```

备用 debug 包：

```text
/Users/bibo/projects/voice-bridge/android/app/build/outputs/apk/debug/app-debug.apk
sha256: 382a2a6fe4d38b80d29630045a42b04840b8b2f31d8a60f50eac1ff01ff9bdc8
```

注意：debug 包可能依赖开发服务器；Guard 优先使用 release 包。

---

## 2. 已验证

- `npm test`：57 pass / 0 fail。
- `npx eslint hooks/useAudioRecording.ts components/ControlButtons.tsx`：0 error，1 warning。
- `./gradlew assembleDebug`：BUILD SUCCESSFUL。
- `./gradlew assembleRelease`：BUILD SUCCESSFUL。
- release APK 内置 `assets/index.android.bundle`。
- Android emulator `Pixel_8_API_36`：boot completed。
- `adb install -r app-release.apk`：Success。
- `adb shell monkey -p com.voicebridge.app -c android.intent.category.LAUNCHER 1`：启动 smoke 完成，未见 VoiceBridge fatal crash。

---

## 3. 本轮新增需测点

### 麦克风权限

Peter/Codex 已补：
- 开始录音前显式请求麦克风权限。
- 拒绝权限时提示：`麦克风权限未开启，请在系统设置中允许 Voice Bridge 使用麦克风后重试`。

Guard 请重点覆盖：
1. 首次点击录音是否弹权限弹窗。
2. 允许后是否开始录音。
3. 拒绝后是否显示明确中文提示，不崩溃。
4. 去系统设置恢复授权后是否可录音。
5. 小米 MIUI 权限管理下关闭/开启麦克风后的行为。

---

## 4. 当前阻塞

公网 BFF 未恢复。

当前公网地址 health 失败：

```text
https://maintained-hop-arbor-meat.trycloudflare.com/health
LibreSSL SSL_ERROR_SYSCALL
```

新建 quick tunnel 失败：

```text
failed to request quick Tunnel: EOF
```

因此 Guard 可以先做安装/权限/UI smoke；完整 4G/5G E2E 等 Atlas 给出新的 HTTPS BFF 地址后再测。拿到新地址后需要重新构建 APK，确保 `EXPO_PUBLIC_BFF_URL` 注入新公网地址。

---

## 5. Guard 测试顺序建议

1. 小米真机安装 release APK。
2. 断开开发机/Metro，启动 App。
3. 测麦克风权限允许/拒绝/恢复。
4. 基础 UI：三区布局、历史、保存、新建。
5. Atlas 恢复公网 BFF 后，手机切 4G/5G 测完整链路：
   - 录音 → Deepgram ASR → 英文显示 → GLM 翻译 → 中文显示。
   - 记录 P90 延迟，目标 <3s。
   - 抽样英文准确率，目标 >90%。
6. 长时稳定性：连续录音 10–30 分钟。

---

## 6. 不能放过的风险

- release 当前仍使用 debug signing，只适合内测，不适合应用市场上架。
- BFF `/health` 返回的 buildCommit 与前端 HEAD 不一致，完整 E2E 前需确认部署版本。
- `.env` / `backend/.env` 存在被 git 跟踪的密钥治理风险；本交接不包含任何密钥内容。

