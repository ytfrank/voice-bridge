# TECH_PLAN.md — VoiceBridge Android 版 提测收敛

**项目**: voicebridge-android（VoiceBridge Android 版）  
**负责人**: Peter  
**分支**: `hermes/v2.0`  
**基线 commit**: `f7c10f0 feat(android): first successful APK build (debug, 129MB)`  
**更新时间**: 2026-06-03 20:53:27 +0800  

---

## 1. 当前判断

本项目官方状态源是 `monitor/android/status.json`（当前仍标记 develop/in_progress）。本轮先补齐此前缺失的 dev 门禁成果物：TECH_PLAN、SUBMISSION、dev-to-test handoff，并基于已提交 commit `760836d` 收敛 Android 安装/权限/UI smoke 提测范围。

## 2. P0 范围

来源：`monitor/android/requirements/REQUIREMENTS.md`

| 编号 | 需求 | 本轮处理 |
|---|---|---|
| P0-1 | APK 可安装 | 已复跑 `assembleDebug`；新增 `assembleRelease`，产出 standalone release APK |
| P0-2 | Android 麦克风权限 | 已补显式录音权限请求与拒绝提示 |
| P0-3 | 真机完整链路 | 已完成 emulator 安装/启动 smoke；小米真机链路仍交 Guard |
| P0-4 | BFF 公网访问 | 本地 BFF health 可用；当前 trycloudflare URL 不可达，仍需 Atlas/网络侧恢复公网入口 |

## 3. 本次拆分与 subagent

| 字段 | 值 |
|---|---|
| planned_dev_subagents | 2 |
| actual_started_subagents | 2 |
| active_subagents | 0 |
| 子代理 1 | Readiness Reviewer：只读复查 Android 提测风险 |
| 子代理 2 | Codex Android Dev：实现最小 Android 权限修复 |
| 偏差 | 原先误把任务理解成基础环境验证；已纠偏回 Voice Bridge Android 项目 |
| 修正动作 | 直接在 `/Users/bibo/projects/voice-bridge` 复盘需求、构建、权限、APK、emulator smoke |

## 4. 实施方案

### 4.1 Android 权限修复

文件：
- `hooks/useAudioRecording.ts`
- `components/ControlButtons.tsx`

设计：
1. 录音启动前调用 `ensureMicrophoneRecordingPermission()`。
2. 优先使用 `expo-audio` SDK 54 的 `getRecordingPermissionsAsync` / `requestRecordingPermissionsAsync`。
3. 若权限 helper 不可用，Android fallback 到 `PermissionsAndroid.RECORD_AUDIO`。
4. 权限拒绝抛出明确中文错误：`麦克风权限未开启，请在系统设置中允许 Voice Bridge 使用麦克风后重试`。
5. `startRecording` 失败不再静默吞掉，错误向按钮层传播。
6. `ControlButtons` 展示真实错误消息，便于 Guard 验证拒绝权限场景。

### 4.2 APK 产物策略

| 产物 | 路径 | 用途 |
|---|---|---|
| Debug APK | `android/app/build/outputs/apk/debug/app-debug.apk` | 开发调试；可能依赖 Metro，不作为正式提测首选 |
| Release APK | `android/app/build/outputs/apk/release/app-release.apk` | standalone 包，内置 `assets/index.android.bundle`，作为 Guard 安装 smoke 首选 |

Release 当前使用 debug signing（项目原配置），适合内部测试；不满足应用市场正式签名要求。

## 5. 验证计划

已执行：

```bash
npx eslint hooks/useAudioRecording.ts components/ControlButtons.tsx
npm test
cd android && ./gradlew assembleDebug --no-daemon
cd android && ./gradlew assembleRelease --no-daemon
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb shell monkey -p com.voicebridge.app -c android.intent.category.LAUNCHER 1
```

结果摘要：
- targeted ESLint：0 error，1 warning（既有 hook dependency warning）。
- `npm test`：57 pass / 0 fail。
- `assembleDebug`：BUILD SUCCESSFUL。
- `assembleRelease`：BUILD SUCCESSFUL。
- Release APK：66MB，sha256 `435a1b751dc313abfb3d3ed487bd0299937aacbabb85ed528e6bb5f4809649fc`。
- Release APK 内置 `assets/index.android.bundle`。
- Emulator 安装：Success。
- Emulator 启动：`package:com.voicebridge.app`，未见 VoiceBridge fatal crash 日志。

## 6. 当前阻塞 / 风险

| 风险 | 等级 | 状态 | 处理 |
|---|---|---|---|
| BFF 公网 URL 不可达 | 高 | `https://maintained-hop-arbor-meat.trycloudflare.com/health` SSL 失败；新 quick tunnel 请求 EOF | 需 Atlas 恢复 Cloudflare Tunnel/正式域名后重打包或确认 env 注入 |
| 真机权限/录音未验证 | 高 | Emulator 已安装启动；未实际点击录音授权 | Guard 小米真机覆盖首次授权、拒绝、重新授权 |
| Release 签名未正式化 | 中 | release 当前用 debug signing | P1/上架前配置正式 keystore |
| BFF 运行版本不一致 | 中 | 本地 `/health` buildCommit 返回 `e2a7991`，与当前前端 HEAD `f7c10f0` 不一致 | 提测前重启/部署 BFF 到明确 commit |
| `.env`/`backend/.env` 被 git 跟踪 | 高（安全） | reviewer 发现存在明文 key 风险；本次未打印具体值 | 上线前迁移密钥并轮换 |

## 7. 提测门槛

可以交 Guard 做 **本地/USB/模拟器安装 smoke**；若要做 **小米 4G/5G 完整 E2E**，必须先解决 BFF 公网入口。

推荐交付物：
- `android/app/build/outputs/apk/release/app-release.apk`
- `monitor/android/dev/SUBMISSION.md`
- `monitor/android/handoffs/001-dev-to-test.md`



---

## 8. 状态源说明

`monitor/android/status.json` 当前仍显示 `tech_plan/submission: pending`，这是状态源未被 PMO 同步导致；按项目纪律 Peter 不直接修改 `status.json`。本文档落地后需由小叮当/PMO 将 artifact 状态同步为 ready，并决定是否从 develop 推进到 test。
