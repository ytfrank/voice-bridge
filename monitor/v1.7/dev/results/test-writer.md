# test-writer result

## 完成内容

- 基于 `monitor/v1.7/dev/TECH_PLAN.md`、`monitor/v1.7/dev/SUBMISSION.md`、`monitor/v1.7/qa/TEST_PLAN.md`、`monitor/v1.7/qa/report.md`、`tests/`、`backend/` 收敛了 v1.7 本轮必须覆盖的行为测试与回归建议。
- 结论聚焦当前已知高风险点：`musk_21s.wav -> "You"` 幻觉回退、`face_medium.aiff` 截断短句、结构化空结果返回、服务版本错位、服务启停脚本、前端对 `skipped/reason` 的消费以及录音 cycle 恢复。

## 本轮必须覆盖的测试场景

### 1. API 结构化空结果与质量门回归

- 覆盖目标：
  - `silence_1s.wav` 返回结构化空结果，不再是裸空串。
  - `musk_21s.wav` 不再向调用方透传 `"You"`。
  - `oh.aiff` / `uh.aiff` 被拦截为低价值或过短音频，不进入翻译。
  - `face_medium.aiff` 命中 `truncated_short_phrase`，`face_short.aiff` 不误杀。
- 通过标准：
  - `silence_1s.wav`：HTTP 200，`skipped=true`，`text=""`，`reason` 属于 `empty_transcript` 或 `no_speech`，且 `reasons[]` 非空。
  - `musk_21s.wav`：HTTP 200，`skipped=true`，`text=""`，`reason` 命中质量门原因；响应文本中不得出现 `"You"`。
  - `oh.aiff` / `uh.aiff`：HTTP 200，`skipped=true`，不得透传可翻译文本。
  - `face_medium.aiff`：HTTP 200，`skipped=true`，`reason=truncated_short_phrase`。
  - `face_short.aiff`：HTTP 200，`skipped=false`，`text` 非空。

### 2. `buildAsrResponse()` 返回协议回归

- 覆盖目标：
  - 空文本、显式 `emptyReason`、质量门阻断三类输入都能稳定输出 `skipped/reason/reasons/qualityDecision`。
  - `requestId`、`sessionId` 透传不丢失。
- 通过标准：
  - `text=""` 时，响应必须携带 `skipped=true`。
  - `reason` 与 `quality.primaryReason` / `metadata.emptyReason` 的优先级稳定，不能出现 `skipped=true` 但 `reason` 缺失。
  - 非阻断文本不能错误携带 `reasons[]`。

### 3. `/health` 与服务版本识别回归

- 覆盖目标：
  - `/health` 暴露 `whisperQueue` 与 `buildCommit`。
  - 启停后 `buildCommit` 与当前 `git rev-parse --short HEAD` 一致，用于避免旧 BFF 假通过。
- 通过标准：
  - `GET /health` 返回 200。
  - JSON 内存在 `status=ok`、`whisperQueue`、`buildCommit`。
  - `buildCommit` 与 verify 时工作树 HEAD 短 SHA 一致。

### 4. 服务启停与端口占用回归

- 覆盖目标：
  - `npm run bff:start|stop|status|restart`、`npm run services:start|stop|status` 可用。
  - `backend/start.sh` 能处理旧监听进程，`status.sh` 能识别 pid-file mismatch。
- 通过标准：
  - `bff:start` 后 `bff:status` 显示 `running`，且 3001 端口监听 pid 与脚本输出一致。
  - 手动保留旧监听者后再次 `bff:start`，旧监听者会被清理，新服务可成功启动。
  - `services:status` 脚本存在且返回 0。

### 5. 量化基准回归

- 覆盖目标：
  - 三标准样本仍按 Guard 当前口径跑通，结果产物可供继续比较。
  - `musk_21s_correct.wav` 保持可识别；`face_short.aiff` 作为正常短句对照；`face_medium.aiff` 作为过滤样本。
- 通过标准：
  - `tests/scripts/benchmark_v17_hotfix.py` 能对 3 个样本输出 JSON。
  - 结果中必须含每次 run 的 `text/wer/accuracy/latency_ms`。
  - 对过滤类样本，报告必须额外记录 `skipped/reason`，避免只看 WER 掩盖过滤是否生效。

### 6. 翻译入口拦截回归

- 覆盖目标：
  - 空文本、低价值文本、被 ASR 拦截的文本不会继续进入 `/api/translate`。
  - 正常句子翻译仍可用。
- 通过标准：
  - 对 `text=""`、`"You"`、`"Oh."`、`"Uh"` 这类输入，返回跳过或 4xx/受控失败，不能产出正常翻译正文。
  - 对 `Hello, how are you today?` 等正常文本仍返回 200 和非空 `translation`。

### 7. 前端消费结构化 ASR 结果回归

- 覆盖目标：
  - `services/transcriptionService.ts` 正确解析 `skipped/reason/status`。
  - `hooks/useAudioRecording.ts` 在空结果/跳过结果时只记日志和恢复状态，不追加无效 transcript，也不触发翻译。
- 通过标准：
  - `transcribeAudio()` 对结构化空结果返回 `{ text: '', skipped: true, reason }`。
  - `processChunk()` 收到空文本时不调用 `appendTranscript()`、不调用 `processSentence()`。
  - 正常文本仍能进入 transcript buffer 与翻译链路。

### 8. 录音循环稳定性最小回归

- 覆盖目标：
  - 非重入 cycle、防重复 start/stop、后台回前台恢复仍符合 v1.7 设计。
- 通过标准：
  - 快速连点 start/stop 时，不会出现并发 cycle 或状态机卡死。
  - 切后台再回前台后，能重新进入 `listening` 或给出受控 `error/retrying`，不能无声失败。
  - 该项若无法自动化，verify 必须附录屏/日志证据，不得口头判定通过。

## 建议新增/修改的测试文件

- 修改 [backend/__tests__/quality_gate.test.js](/Users/bibo/projects/voice-bridge/backend/__tests__/quality_gate.test.js)
  - 新增 `low_value_text`、`too_little_text_for_audio`、`high_no_speech_prob`、`buildAsrResponse()` 的协议级断言。
  - 目的：把当前最容易反复回退的质量门和结构化响应固定在纯单测里。

- 修改 [tests/test_bff_api.py](/Users/bibo/projects/voice-bridge/tests/test_bff_api.py)
  - 新增 `silence_1s.wav`、`musk_21s.wav`、`oh.aiff`、`uh.aiff`、`face_short.aiff`、`face_medium.aiff` 的 API 回归。
  - 新增 `/health.buildCommit`、`/health.whisperQueue`、服务版本一致性断言。
  - 目的：把 Guard 已经反复抓到的线上接口回退变成可重复脚本。

- 修改 [tests/scripts/benchmark_v17_hotfix.py](/Users/bibo/projects/voice-bridge/tests/scripts/benchmark_v17_hotfix.py)
  - 支持样本清单输入，输出 `skipped/reason/status`，并区分“正常识别样本”和“应被过滤样本”。
  - 目的：避免 `face_medium` 这类样本因为 WER 高而看起来失败，但实际上 v1.7 目标是“拦截而不是识别”。

- 新增 `tests/fixtures/ground_truth/face_short.txt`
  - 内容对应 `face_short.aiff` 的 ground truth。
  - 目的：让短句对照样本能纳入同一基准脚本。

- 新增 `tests/fixtures/ground_truth/face_medium_expected_behavior.md`
  - 只需要记录“应命中 `truncated_short_phrase`，不是正常识别样本”。
  - 目的：给 benchmark/verify-runner 一个机器外的解释锚点，避免误用 WER 口径。

- 修改 [tests/e2e_api_screenshot.spec.ts](/Users/bibo/projects/voice-bridge/tests/e2e_api_screenshot.spec.ts)
  - 把 `/health.whisperWorkers == 3` 这种过时硬编码改为检查 `whisperQueue/buildCommit`，并加入结构化空结果截图用例。
  - 目的：当前文件仍是旧版本假设，容易制造伪失败或伪通过。

- 修改 [tests/functional_test_v1.4.spec.ts](/Users/bibo/projects/voice-bridge/tests/functional_test_v1.4.spec.ts)
  - 复制或升级为 v1.7 用例，至少增加“过滤样本不进翻译”和 `/health.buildCommit` 检查。
  - 目的：现有文件是 v1.4 命名和断言，不能直接代表 v1.7 行为。

- 建议新增 `tests/useAudioRecording.v17.spec.ts`
  - 覆盖 `transcribeAudio()` 返回空结果、`skipped=true`、恢复 `listening`、不触发翻译。
  - 目的：前端对结构化结果的消费是 v1.7 新行为，当前仓库里没有对应保护。

## 每个场景的通过标准汇总

| 场景 | 通过标准 |
|---|---|
| 结构化空结果 | `text=""` 时必须返回 `skipped=true`，且 `reason/reasons[]` 可用 |
| `You` 幻觉回退 | `musk_21s.wav` 对外不可再返回 `"You"` |
| filler 拦截 | `oh/uh` 不进入翻译链路，不返回正常翻译正文 |
| 截断短句规则 | `face_medium.aiff` 命中 `truncated_short_phrase`，`face_short.aiff` 放行 |
| `/health` 版本识别 | `buildCommit` 与当前 HEAD 一致，`whisperQueue` 存在 |
| 服务脚本 | `bff:*` 与 `services:*` 全部可执行，状态与真实监听进程一致 |
| 基准脚本 | 结果 JSON 同时保留识别指标和过滤指标 |
| 前端结构化消费 | 空结果不追加 transcript、不触发翻译、状态恢复受控 |
| 录音稳定性 | start/stop 连点、后台恢复均无卡死或静默失败 |

## 未覆盖风险

- 真机 iOS `AudioSession` 中断、权限弹窗、锁屏恢复仍无法在当前仓库内自动化闭环，只能通过录屏与日志对账补证。
- 当前仓库没有现成的 React Native hook 单测基础设施，前端录音链路建议短期先做文档化人工回归，后续再补可执行测试。
- 基准脚本仍以本地 BFF 全文件 ASR 为主，不能直接代表移动端 2~5s chunk 实时体验。
- 质量门阈值是启发式规则，自动化用例能防“明显回退”，但不能证明误杀率已经足够低。
- 服务脚本验证依赖本机端口和 shell 环境；verify 机器若缺 `lsof` 或端口被其他进程长期占用，需要单独备注环境差异。

## 给 verify-runner 的执行建议

1. 先做版本先决条件校验。
   - `git rev-parse --short HEAD`
   - `npm run bff:restart`
   - `npm run bff:status`
   - `curl -s http://127.0.0.1:3001/health`
   - 若 `buildCommit` 与 HEAD 不一致，直接阻塞，不进入后续验证。

2. 再跑后端纯单测，先拦协议回退。
   - 建议命令：`node --test backend/__tests__/quality_gate.test.js`

3. 再跑 API 行为回归。
   - 建议命令：`python3 tests/test_bff_api.py`
   - 要求报告中单列：
     - 结构化空结果
     - `musk_21s.wav`
     - `oh/uh`
     - `face_short/face_medium`
     - `/health.buildCommit`

4. 再跑量化基准，不把过滤样本混进正常识别口径。
   - 建议命令：
   - `python3 tests/scripts/benchmark_v17_hotfix.py --audio tests/fixtures/audio/musk_21s_correct.wav --ground-truth tests/fixtures/ground_truth/musk_21s_correct.txt --bff http://127.0.0.1:3001 --runs 3`
   - `python3 tests/scripts/benchmark_v17_hotfix.py --audio monitor/v1.7/qa/samples/face_short.aiff --ground-truth tests/fixtures/ground_truth/face_short.txt --bff http://127.0.0.1:3001 --runs 3`
   - `face_medium.aiff` 不建议继续按纯 WER 成败判定，应单独验证其被过滤。

5. 最后补前端和真机最小冒烟。
   - Web/截图用例只保留 v1.7 相关断言，去掉旧版本硬编码。
   - 真机必须至少留下一份 start/stop 连点和一份后台恢复证据；没有证据时只能标记为“未覆盖”，不能写通过。

## 未完成项

- 未直接修改测试代码；当前只输出测试收敛与建议文件，符合本阶段要求。

## 风险

- 如果 backend-dev / frontend-dev 后续继续改质量门阈值，本文件中的 `reason` 枚举需要同步调整，否则 verify 会出现“代码正确但用例过旧”的假失败。

## 自测结果

- 已核对当前仓库存在的相关资产：
  - 后端单测：`backend/__tests__/quality_gate.test.js`
  - API 测试脚本：`tests/test_bff_api.py`
  - 基准脚本：`tests/scripts/benchmark_v17_hotfix.py`
  - 关键样本：`tests/fixtures/audio/musk_21s.wav`、`tests/fixtures/audio/musk_21s_correct.wav`、`monitor/v1.7/qa/samples/silence_1s.wav`、`monitor/v1.7/qa/samples/face_short.aiff`、`monitor/v1.7/qa/samples/face_medium.aiff`

## 需要的下游动作

- verify-runner 按本文件先校验服务版本，再跑单测/API/基准/最小真机证据。
- backend-dev 优先补 `quality_gate` 与 API 回归。
- frontend-dev 补结构化空结果消费与录音恢复最小回归。

## 时间戳

- 2026-04-07 Asia/Shanghai
