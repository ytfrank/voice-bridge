# 提测报告 — voice-bridge V1.5

> **提测人**: Peter
> **日期**: 2026-03-28
> **分支**: feature/v1.5
> **Commit**: b900a26

---

## 改动文件清单（21 files, +1573/-81）

### 新增文件
| 文件 | 说明 |
|------|------|
| `ecosystem.config.js` | PM2 配置，一键启动 BFF |
| `services/websocketService.ts` | WebSocket 心跳保活客户端 |
| `REQUIREMENTS_V1.5_FINAL.md` | V1.5 需求终版 |
| `TECH_PLAN_V1.5.md` | V1.5 技术方案 |
| `tests/TEST_PLAN_V1.5.md` | V1.5 测试方案（Guard） |

### 修改文件
| 文件 | 改动说明 |
|------|---------|
| `backend/server.js` | 全局异常捕获 + WebSocket 服务端 + /tmp 清理 + Express 错误中间件 + debug/crash 端点 + 翻译 prompt 简化 |
| `backend/package.json` | 新增 ws 依赖 |
| `backend/.env` | WHISPER_MODEL=base → medium |
| `hooks/useAudioRecording.ts` | WS 连接/断开 + 看门狗 + AppState 来电中断恢复 |
| `services/transcriptionService.ts` | 530 状态码 3s 重试 |
| `services/translationService.ts` | words 改为可选 |
| `services/saveService.ts` | 新增 exportSessionMarkdown（Share Sheet） |
| `app/history/[id].tsx` | 去掉生词列表 + 英中对照 + 导出按钮 |
| `components/StatusIndicator.tsx` | 来电中断状态提示 |
| `constants/api.ts` | 新增 WS_URL |
| `utils/pipelineLogger.ts` | 新增事件类型 |
| `.gitignore` | 新增 logs/ |

---

## P0 改动点说明

### PM2 进程守护
- `ecosystem.config.js` → `pm2 start ecosystem.config.js` 一键启动
- max_restarts=10, restart_delay=3000ms
- 日志输出到 ./logs/

### 全局异常捕获
- `uncaughtException` + `unhandledRejection` 已注册
- 捕获后记录日志，不立即退出（PM2 决策重启）

### WebSocket 心跳
- 服务端：30s ping，10s 无响应 terminate
- 客户端：30s 发 ping，断线后指数退避重连（3s → 6s → 12s → ... → 30s max）

### 530 崩溃修复
- transcriptionService.ts 对 530 状态码等 3s 后重试
- PM2 自动重启兜底

### 来电中断恢复
- AppState 监听 background/active 切换
- 回到前台后 5s 自动恢复录音
- StatusIndicator 显示「录音已暂停 - 来电中断」

### 音频流看门狗
- 30s 无新 chunk → 触发 attemptRecovery
- 恢复失败 → 清除 watchdog，停止录音

### /tmp 清理
- 每小时清理超过 1 小时的 voice-bridge 临时文件

---

## P1 改动点说明

### ASR 模型升级
- .env: WHISPER_MODEL=medium
- faster-whisper medium 模型已预下载成功
- 预估准确率 ~97%，延迟 2-3s

### 翻译 prompt 简化
- 去掉 JSON 格式要求和生词返回
- 直接返回纯中文翻译文本
- 预估 token 消耗降低 70-80%

### 导出 Markdown
- saveService.ts 新增 exportSessionMarkdown
- 用 expo-sharing 调用 iOS Share Sheet
- 文件名：voice-bridge-YYYY-MM-DD-HH-MM.md
- 格式：每句带 [HH:MM:SS] 时间戳

### 历史详情页
- 去掉生词列表 section
- 改为英中对照展示
- 新增导出按钮

---

## 冒烟后修复（2026-03-28 16:55）

### Bug 1：导出时长失真
- **问题**：历史会话导出时长用 `Date.now() - 首条翻译时间` 计算，旧会话导出时长严重失真
- **修复**：在会话持久化中新增 `sessionStartTime` 和 `sessionDurationMs`
- **涉及文件**：`store/transcriptStore.ts`、`hooks/useAudioRecording.ts`、`components/ControlButtons.tsx`、`services/saveService.ts`、`app/history/[id].tsx`

### Bug 2：录音时间格式不稳定
- **问题**：`toLocaleString('zh-CN')` 受平台和系统区域设置影响，格式不稳定
- **修复**：改为显式格式化 `YYYY-MM-DD HH:MM:SS`（基于 `toISOString().replace('T', ' ').slice(0, 19)`）
- **涉及文件**：`services/saveService.ts`

### PM2 安装与确认
- `npm install -g pm2` ✅
- `pm2 start ecosystem.config.js` ✅
- `pm2 list` 显示 `voice-bridge-bff` 为 `online` ✅

## 自测情况

| 检查项 | 结果 |
|--------|------|
| TypeScript 编译 | ✅ 无新增错误（仅预存 expo-audio 类型声明缺失） |
| backend npm install | ✅ ws 依赖安装成功 |
| faster-whisper medium 模型 | ✅ 下载成功，加载 OK |
| PM2 安装并启动 | ✅ `voice-bridge-bff` online |
| Git commit + push | ✅ feature/v1.5 已推送 |

---

## 测试重点（Guard 请关注）

1. **PM2 守护**：`pm2 start ecosystem.config.js` → kill BFF → 验证 3s 内重启
2. **2 小时稳定性**：连续录音，观察内存和崩溃
3. **来电恢复**：真机测试，来电后 5s 内恢复
4. **ASR 准确率**：medium 模型，马斯克演讲 ≥ 97%
5. **翻译零跳动**：中文区整句输出
6. **导出按钮**：历史详情页 → 导出 → Share Sheet
7. **无生词表**：历史详情页确认已移除

---

## 注意事项

- **V1.4 对比**：main 分支保持不动，feature/v1.5 是新分支
- **530 模拟**：可用 `kill -9 <BFF_PID>` 或 `/api/debug/crash`（非 production 环境）
- **来电测试**：必须真机，模拟器不支持 AudioSession interruption
- **首次启动**：medium 模型首次加载约 10-15s，后续 cached
- **历史会话兼容**：旧会话没有持久化 `sessionStartTime/sessionDurationMs`，已在 `loadSession` 中加 fallback 兼容逻辑

---

*提测时间: 2026-03-28*
*Commit: b900a26*
*分支: feature/v1.5*
