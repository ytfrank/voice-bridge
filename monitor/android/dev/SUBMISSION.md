# SUBMISSION.md — VoiceBridge Android 版 提测提交

**提交者**: Peter  
**分支**: `hermes/v2.0`  
**提测 commit**: `760836d fix(android): improve voice bridge test readiness`  
**提交时间**: 2026-06-03 21:05:08 +0800  
**状态**: Android 构建与模拟器安装 smoke 已通过；公网 BFF 仍阻塞完整真机 E2E。

---

## 1. 本次改动

### 1.1 Android 麦克风权限显式处理

修改文件：
- `hooks/useAudioRecording.ts`
- `components/ControlButtons.tsx`

改动：
- 录音启动前显式检查/请求麦克风权限。
- 优先使用 `expo-audio` 权限 API；Android fallback 到 `PermissionsAndroid.RECORD_AUDIO`。
- 权限拒绝时抛出清晰中文错误，并由按钮层 Alert 展示。
- `startRecording` 失败不再静默吞掉，Guard 可以直接观察到错误提示。

### 1.2 APK 构建收敛

已产出：

| 类型 | 路径 | 大小 | SHA256 |
|---|---|---:|---|
| Debug APK | `android/app/build/outputs/apk/debug/app-debug.apk` | 135MB | `382a2a6fe4d38b80d29630045a42b04840b8b2f31d8a60f50eac1ff01ff9bdc8` |
| Release APK | `android/app/build/outputs/apk/release/app-release.apk` | 66MB | `435a1b751dc313abfb3d3ed487bd0299937aacbabb85ed528e6bb5f4809649fc` |

提测优先使用 release APK，因为它内置：

```text
assets/index.android.bundle
```

Debug APK 只作为开发调试备用。

---

## 2. 自测结果

| 验证项 | 命令/动作 | 结果 |
|---|---|---|
| 子代理 review | Readiness Reviewer 只读复查 | ✅ 完成，识别 BFF 公网、standalone APK、权限三类风险 |
| Codex 开发 | Codex 修改权限链路 | ✅ 完成，仅改 2 个文件 |
| targeted lint | `npx eslint hooks/useAudioRecording.ts components/ControlButtons.tsx` | ✅ 0 errors，1 warning（既有 hook dependency warning） |
| 后端单测 | `npm test` | ✅ 57 pass / 0 fail |
| Debug 构建 | `cd android && ./gradlew assembleDebug --no-daemon` | ✅ BUILD SUCCESSFUL |
| Release 构建 | `cd android && ./gradlew assembleRelease --no-daemon` | ✅ BUILD SUCCESSFUL |
| Release bundle | `unzip -l app-release.apk` | ✅ 存在 `assets/index.android.bundle` |
| Emulator boot | `Pixel_8_API_36` headless | ✅ boot completed |
| APK 安装 | `adb install -r app-release.apk` | ✅ Success |
| App 启动 | `adb shell monkey -p com.voicebridge.app ...` | ✅ package 存在，未见 VoiceBridge fatal crash |
| BFF local health | `curl http://127.0.0.1:3001/health` | ✅ 200 / status ok |
| BFF public health | `curl $EXPO_PUBLIC_BFF_URL/health` | ❌ 当前 trycloudflare URL SSL 失败 |
| 新 tunnel | `cloudflared tunnel --url http://127.0.0.1:3001` | ❌ quick tunnel API EOF |

---

## 3. 当前可提测范围

### 可以交 Guard 立即测

1. 小米/模拟器安装 release APK：
   - `android/app/build/outputs/apk/release/app-release.apk`
2. 首次启动 smoke。
3. 麦克风权限弹窗：允许、拒绝、设置里重新授权。
4. 无公网链路条件下的 UI 基础回归。

### 暂不应宣称完成

1. 小米手机 4G/5G 完整链路：录音 → Deepgram ASR → 英文显示 → GLM 翻译 → 中文显示。
2. 延迟 <3s / 英文准确率 >90%。
3. 应用市场上线。

原因：当前 BFF 公网入口不可达，真机蜂窝网络无法稳定访问后端。

---

## 4. Guard 测试重点

1. 安装：小米真机安装 release APK，记录机型、Android/MIUI 版本、安全提示。
2. 启动：断开开发机/Metro 后打开，确认不依赖开发服务器。
3. 权限：首次录音授权、拒绝、二次授权、系统设置恢复。
4. UI：三区布局、历史页、保存、新建、异常提示。
5. 网络：待 Atlas 提供公网 BFF 后，手机切 4G/5G 测 `/health` 与 App 内转写/翻译 API。
6. E2E：英文广播 30s/1min/3min，记录 ASR latency、translation latency、P90 延迟、准确率。
7. 稳定性：连续录音 10–30 分钟，观察卡顿、崩溃、重复字幕、幻觉文本。

---

## 5. 阻塞项

### BFF 公网访问阻塞

当前 `.env` 中公网 BFF URL：

```text
https://maintained-hop-arbor-meat.trycloudflare.com
```

验证失败：

```text
curl /health → LibreSSL SSL_ERROR_SYSCALL
cloudflared quick tunnel → EOF
```

需要 Atlas 处理：
- 恢复 Cloudflare Tunnel；或
- 提供正式域名 `voice.doramax.cn`；或
- 提供其他可从小米手机 4G/5G 访问的 HTTPS BFF 地址。

拿到新公网地址后，必须重新构建 release APK，确保 `EXPO_PUBLIC_BFF_URL` 注入新地址。

---

## 6. 风险

| 风险 | 等级 | 说明 |
|---|---|---|
| 公网 BFF 不可达 | 高 | 阻塞完整真机 E2E |
| Release 仍用 debug signing | 中 | 内测可用；应用市场不可用 |
| BFF health commit 与前端 HEAD 不一致 | 中 | 提测前需对齐部署版本 |
| `.env` / `backend/.env` 被 git 跟踪 | 高 | 存在密钥治理/轮换风险；本次未输出具体密钥 |
| Android 真机权限/录音行为未验证 | 高 | 已补代码，但仍需小米真机确认 |

---

## 7. 提交结论

Android 侧已经从“只有 debug 构建”推进到：

```text
权限修复 ✅
Debug build ✅
Release standalone build ✅
Emulator install ✅
App launch smoke ✅
本地 BFF health ✅
公网 BFF ❌
```

因此当前状态是：**可交 Guard 做安装/权限/UI smoke；完整小米真机 E2E 等 Atlas 恢复公网 BFF 后再测。**


---

## 8. 状态源说明

当前 `monitor/android/status.json` 还未同步 dev 成果物状态；Peter 依据团队规则不直接修改 status.json。请 PMO 读取本文件与 `monitor/android/handoffs/001-dev-to-test.md` 后更新阶段/门禁状态。
