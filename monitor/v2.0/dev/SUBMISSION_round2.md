# SUBMISSION_round2.md — Voice Bridge V2.0 Deepgram 静音空 transcript 修复

## 基本信息

- 项目：voice-bridge V2.0
- 分支：`hermes/v2.0`
- 轮次：Round2 blocking fix
- 提交者：Peter
- 修复 Commit：c589692
- 提测时间：2026-06-08 14:51:12 +0800

## 本次是否拆分

- 本次是否拆分：是
- 计划启动 subagent：1
- 实际已启动 subagent：1
- 当前活跃 subagent：0
- 偏差原因：Backend Fix Agent 落盘了 `backend/server.js` 的核心改动，但长时间无后续输出；Peter 按主线程接管规则停止悬挂进程并补齐测试、env、提测报告、验证与提交。
- 当前最新成果物更新时间：2026-06-08 14:51:12 +0800

## Blocking Issue

Guard 发现静音 5s 音频在 Deepgram Nova-3 返回空 transcript 时，没有被质量门控标记为 `skipped=true`，而是进入 ASR 错误分支返回 500。

根因：
- `deepgramAsr()` 原逻辑使用 `success: text.length > 0`。
- Deepgram 对静音音频返回 HTTP 200 + 空 transcript 时，`text === ''` 被误判为 `success:false`。
- `/api/transcribe` 后续 `if (!result.success)` 分支直接返回 500，绕过 `buildAsrResponse()`。

## 修复摘要

- `deepgramAsr()` 对 Deepgram HTTP 200 响应统一返回 `success:true`。
- 空 transcript 时保留 `text:''`，并在 metadata 增加 `emptyReason:'empty_transcript'`。
- Deepgram HTTP/API 错误与异常仍保持 `success:false`，继续走错误分支。
- 补充 V2.0 回归契约测试，确保空 transcript 不再被识别为 ASR failure，并能经 `buildAsrResponse()` 输出 `skipped=true`。
- 根 `.env` 补充 `DEEPGRAM_API_KEY`，值来自既有 `backend/.env`，报告中不暴露密钥。

## 修改文件

- `backend/server.js`
- `backend/__tests__/v20_pipeline_contract.test.js`
- `.env`
- `monitor/v2.0/dev/TECH_PLAN.md`
- `monitor/v2.0/dev/SUBMISSION_round2.md`

## 自测结果

```bash
npm test
```

结果：通过

- tests：58
- pass：58
- fail：0
- duration：约 69ms

覆盖点：
- `deepgramAsr()` 不再使用 `success: text.length > 0` 将空 transcript 判为失败。
- Deepgram 空 transcript metadata 标记 `emptyReason:'empty_transcript'`。
- 空 transcript 经 `buildAsrResponse()` 输出 `skipped=true`，并保留 Deepgram metadata。

```bash
git diff --check -- backend/server.js backend/__tests__/v20_pipeline_contract.test.js monitor/v2.0/dev/TECH_PLAN.md monitor/v2.0/dev/SUBMISSION_round2.md .env
```

结果：通过（无 whitespace error）

```bash
BFF_PORT=3011 ASR_PROVIDER=deepgram node backend/server.js
curl -X POST http://127.0.0.1:3011/api/transcribe -F audio=@/tmp/voicebridge-round2-silence.wav -F sessionId=round2-smoke
```

结果：通过

- 输入：ffmpeg 生成的 5s mono silent wav
- HTTP：200
- `skipped`：true
- `text`：空字符串
- `reason`：`empty_transcript`
- `asr.metadata.provider`：`deepgram`
- `asr.metadata.emptyReason`：`empty_transcript`

## Guard 测试重点

1. 静音 5s 音频上传 `/api/transcribe`：应返回 200，`skipped=true`，`text:''`，`reason` 为 `empty_transcript` 或等价空文本原因。
2. Deepgram 真实 HTTP/API 错误：仍应返回错误响应，不应被误吞成 skipped。
3. 正常英文音频：仍应返回 `skipped=false` 和有效英文文本。
4. 前端收到 skipped/空文本后：不应 append 英文字幕，不应触发中文翻译。

## 风险与注意事项

- 本轮只修复 Deepgram HTTP 200 + 空 transcript 语义，未调整音频前置门控阈值。
- `.env` 仍被仓库跟踪且包含密钥，属于既有密钥治理风险；本轮按要求补齐 Deepgram key，但后续建议迁移到安全 secret 管理。
- 工作区存在历史无关 dirty 文件，本次 commit 只应暂存上述 V2.0 round2 文件。
