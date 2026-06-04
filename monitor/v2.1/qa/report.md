# VoiceBridge V2.1 — 测试报告

| 字段 | 值 |
|------|-----|
| **版本** | V2.1 Android |
| **测试日期** | 2026-06-04 |
| **测试人** | Guard (QA Lead) |
| **测试环境** | Android Emulator (Pixel 8, API 36) |
| **APK** | `app-release.apk` (69,682,740 bytes) |
| **APK SHA256** | `435a1b751dc313abfb3d3ed487bd0299937aacbabb85ed528e6bb5f4809649fc` |
| **BFF** | 本地 `127.0.0.1:3001` 正常；公网 Cloudflare Tunnel SSL 失败 |
| **结论** | **⚠️ Conditional Pass（有条件通过）** |

---

## 1. 测试范围

| 维度 | 覆盖 | 说明 |
|------|------|------|
| APK静态校验 | ✅ 已覆盖 | SHA256、bundle完整性 |
| APK签名校验 | ❌ 未覆盖 | 无Java Runtime，apksigner不可用 |
| 模拟器安装 | ✅ 已覆盖 | adb install 成功 |
| 权限测试 | ✅ 已覆盖 | 授权/拒绝两种场景 |
| UI Smoke | ✅ 已覆盖 | 主界面、录音、保存、历史、新建 |
| 录音主流程 | ✅ 部分覆盖 | 录音启动/停止正常，但模拟器无真实音频输入 |
| 静态代码审查 | ✅ 已覆盖 | AndroidManifest.xml、权限声明、.env安全 |
| 真机E2E | ❌ 未覆盖 | 无真机可用 |
| ASR准确率 | ❌ 未覆盖 | 需真实音频输入 |
| 延迟P90 | ❌ 未覆盖 | 需公网BFF可达 |
| 稳定性2h | ❌ 未覆盖 | 需完整环境（真机+公网BFF） |
| 公网连通性 | ❌ 未覆盖 | Cloudflare Tunnel SSL失败 |

---

## 2. 已验证项（有证据）

### 2.1 APK静态校验 ✅

- **SHA256**: `435a1b751dc313abfb3d3ed487bd0299937aacbabb85ed528e6bb5f4809649fc`
- **JS Bundle**: `assets/index.android.bundle` 存在，大小 1,600,372 字节
- **签名校验**: 跳过（无Java Runtime）

### 2.2 模拟器安装 ✅

- **设备**: Pixel 8, API 36 (emulator-5554)
- **安装命令**: `adb install app-release.apk`
- **结果**: Success

### 2.3 App启动 ✅

- **启动命令**: `am start -n com.voicebridge.app/.MainActivity`
- **进程PID**: 4337
- **状态**: 运行中，无崩溃
- **初始界面**: 显示"准备就绪"，四按钮（开始/保存/历史/新建），生词区"暂无生词"

### 2.4 权限测试 ✅

**场景A — 拒绝麦克风权限**:
1. 点击"开始"按钮 → 系统弹出"Allow VoiceBridge to record audio?"
2. 点击"Don't allow" → App显示错误弹窗：
   - 标题："录音操作失败"
   - 内容："麦克风权限未开启，请在系统设置中允许 Voice Bridge 使用麦克风后重试"
   - ✅ **判断**: 错误提示清晰，引导用户去系统设置授权

**场景B — 授予麦克风权限**:
1. `pm grant` + `appops set` 授权后重启App
2. 点击"开始" → App正常进入录音状态
3. ✅ **判断**: 权限授予后功能正常

### 2.5 录音主流程 ✅

1. 授权后点击"开始" → 状态变为"正在聆听..." + "录音中"（红色）
2. "开始"按钮变为"结束"（红色）
3. 录音pipeline正常工作（logcat可见seg chunk_recorded）
4. 模拟器无麦克风输入 → `chunk_skipped, reason: client_low_signal`（预期行为）
5. 点击"结束" → App回到"准备就绪"状态

**Logcat关键信息**:
- Pipeline正常：2秒分片录制，peakMeteringDb=-78dB（模拟器静音环境正常）
- 状态机：`stopping → preparing → recording` 循环正常
- ⚠️ **MediaRecorder: stop failed: -1007** — 快速启动/停止时偶发（可能仅模拟器环境）
- Analytics flush error — 预期（无网络）

### 2.6 功能按钮测试 ✅

| 按钮 | 无内容时行为 | 判断 |
|------|------------|------|
| 保存 | 弹窗"提示 - 暂无内容可保存" | ✅ 正确 |
| 历史 | 弹窗"提示 - 暂无内容可保存" | ✅ 正确 |
| 新建 | 弹窗"提示 - 暂无内容可保存" | ⚠️ 可接受但建议优化 |

### 2.7 静态代码审查 ✅

**AndroidManifest.xml**:
- 7个权限声明：INTERNET, MODIFY_AUDIO_SETTINGS, READ_EXTERNAL_STORAGE, RECORD_AUDIO, SYSTEM_ALERT_WINDOW, VIBRATE, WRITE_EXTERNAL_STORAGE
- Portrait锁定、expo updates disabled
- ✅ 权限声明合理，无多余权限

**.env安全**:
- .env文件在.gitignore中
- ⚠️ 存在3个.env文件（建议确认不含敏感信息提交到Git）

---

## 3. 未验证项

| 项目 | 原因 | 风险等级 |
|------|------|---------|
| APK签名校验 | 无Java Runtime | 中 |
| 真机E2E全流程 | 无真机 | 高 |
| ASR准确率(WER) | 需真实音频输入 | 高 |
| 延迟P90测试 | 公网BFF不可达 | 中 |
| 稳定性2h测试 | 需完整环境 | 中 |
| 多次录音/保存/历史全链路 | 需真实音频输入 | 中 |
| 权限重新请求 | App缓存权限状态 | 低 |

---

## 4. 发现的问题

### P2（建议修复）

| # | 问题 | 详情 | 建议 |
|---|------|------|------|
| BUG-1 | MediaRecorder stop failed -1007 | 快速启停时偶发 `RuntimeException: stop failed` | 检查stop前状态判断 |
| UX-1 | "新建"按钮语义不清 | 无内容时显示"暂无内容可保存"而非"当前无内容需要清除" | 区分新建和保存的空状态提示 |

### P3（低优先级）

| # | 问题 | 详情 |
|---|------|------|
| OBS-1 | Analytics flush error | 无网络时持续报错，建议静默或降频 |

---

## 5. 风险评估

| 风险 | 等级 | 说明 |
|------|------|------|
| 真机功能未验证 | 🔴 高 | 模拟器验证通过≠真机通过，录音/ASR依赖真实硬件 |
| 公网BFF不可达 | 🔴 高 | 核心翻译功能依赖后端，当前无法验证 |
| 签名未校验 | 🟡 中 | 无法确认APK是否正确签名 |

---

## 6. 结论与建议

### 结论：⚠️ Conditional Pass（有条件通过）

**可放行部分**:
- App安装、启动、UI渲染正常
- 权限处理逻辑正确（拒绝有友好提示，授权后功能正常）
- 录音状态机工作正常
- 空状态处理正确
- 代码静态审查无重大问题

**放行条件**:
1. 需在真机上完成E2E全流程验证（录音→ASR→翻译→保存→历史）
2. 需修复公网BFF连通性后验证完整链路
3. 建议修复 BUG-1（MediaRecorder stop异常）

### 建议下一步

1. **Peter** — 修复公网BFF Cloudflare Tunnel SSL问题
2. **波哥/小叮当** — 提供真机进行E2E验证
3. **Peter** — 检查 MediaRecorder stop前状态判断
4. 修复后安排第二轮真机测试

---

## 7. 截图索引

| 文件 | 说明 |
|------|------|
| `/tmp/vb_screenshot_1.png` | App主界面 — "准备就绪" |
| `/tmp/vb_screenshot_permission.png` | 系统权限弹窗 "Allow VoiceBridge to record audio?" |
| `/tmp/vb_screenshot_perm_deny.png` | 权限拒绝后错误提示 "录音操作失败" |
| `/tmp/vb_screenshot_recording2.png` | 录音状态 "正在聆听..." + "录音中" |
| `/tmp/vb_screenshot_ended.png` | 结束录音后回到 "准备就绪" |
| `/tmp/vb_screenshot_save.png` | 保存按钮空状态提示 |
| `/tmp/vb_screenshot_history.png` | 历史按钮空状态提示 |
| `/tmp/vb_screenshot_new.png` | 新建按钮空状态提示 |

---

*报告生成时间: 2026-06-04 15:50*
*Guard QA Lead — VoiceBridge V2.1*
