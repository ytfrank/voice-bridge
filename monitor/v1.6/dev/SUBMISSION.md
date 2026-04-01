# 提测报告 — voice-bridge V1.6 Phase 1（P0 可观测性）

## 分支
`dev_v1.6`

## Commit
`6b8f39d`

## 修复说明（Guard 打回后补充）
- 修复 `backend/server.js` 中 `finish` 回调再次调用 trace 绑定导致潜在 `ERR_HTTP_HEADERS_SENT` 的问题
- 处理方式：拆分“提取 trace”与“写响应头”职责，`finish` 回调只读取 `req.reqId / req.sessionId`，不再写 header
- 修复后补做最小验证：`node --check backend/server.js` 通过

## 改动摘要
本轮完成 V1.6 Phase 1（P0 可观测性）前后端最小闭环，实现“用户链路可追踪、前后端日志可关联”的基础能力。

### 后端
- `backend/server.js`
  - 补齐结构化日志字段：`timestamp`、`requestId`、`sessionId`、`step`、`duration`、`payload`
  - 新增 trace 提取/生成逻辑，支持从请求头与 body 读取 `sessionId/requestId`
  - 响应头回传 `X-Request-Id` / `X-Session-Id`
  - 新增 `POST /api/logs`，支持前端批量上传埋点事件
  - 关键处理步骤 step 化日志：`asr_*`、`translate_*`、`frontend_logs_batch`、`fe_<event>` 等

### 前端
- `services/analyticsService.ts`
  - 新建统一埋点服务，支持 `sessionId`、`requestId`、队列、批量 flush、错误埋点
- `hooks/useAudioRecording.ts`
  - 接入 `recording_start`、`chunk_generated`、`asr_result`、`translate_result`、`recording_stop`、error 等事件
  - 将 `sessionId/requestId` 透传到 ASR / 翻译服务
- `services/transcriptionService.ts`
  - 支持请求级 trace 元数据，并记录 `chunk_uploaded` 状态/耗时
- `services/translationService.ts`
  - 支持 `X-Session-Id` / `X-Request-Id` 及 body 内关联字段
- `services/errorReporter.ts`
  - 错误上报附带 `sessionId`，并镜像到 analytics
- `app/index.tsx`
  - 接入 `app_enter` / `session_end`
- `components/ControlButtons.tsx`
  - 接入 `export`、导出失败、`session_reset` 事件

## 自测结果
### 已验证
- ✅ `npx tsc --noEmit` 通过
- ✅ `node --check backend/server.js` 通过（由后端实现侧 smoke 验证）
- ✅ `POST /api/logs` 最小 smoke 成功
- ✅ `GET /api/logs?component=FrontendEvent` 可看到结构化前端事件
- ✅ 响应头包含 `X-Request-Id` / `X-Session-Id`

### 未完全通过 / 基础设施缺口
- ⚠️ `npm run lint -- --quiet` 未通过，原因不是本轮业务代码报错，而是仓库当前缺少 ESLint 配置文件，命令在项目级配置阶段直接失败
- ⚠️ 本轮尚未补齐自动化测试文件与 Verify Runner 全量验证闭环
- ⚠️ 本轮尚未完成 Code Review Agent 正式审查结论

## 风险点
1. **验证基础设施不完整**
   - 当前 lint 无法作为质量门禁使用，需后续补 ESLint 配置
2. **前端本地持久化能力有限**
   - analytics 持久化当前优先走 `localStorage`，离线缓存能力在 web 更强，native 仍主要依赖内存队列
3. **展示层事件未全覆盖**
   - 本轮重点覆盖主链路与关键生命周期，`transcript_display` / `translation_display` 这类展示层细粒度事件尚未补齐
4. **P0 已闭环但未完全收口到标准验证体系**
   - 后续需要补 Verify / Review 正式闭环

## 建议测试重点
- P0: 
  - 前端是否稳定上报 `app_enter`、录音、chunk、ASR、翻译、导出、错误、`session_end`
  - 后端 `/api/logs` 是否稳定接收批量事件并写入结构化日志
  - `sessionId` / `requestId` 是否能从前端一路串到后端日志
  - 正常使用时，是否能通过日志还原完整用户链路
- P1:
  - 暂不作为本轮提测重点；P1（ASR 质量）后续单独推进
