# backend-dev result

## 1. 完成了哪些后端改动

基于当前仓库与 v1.7 文档，backend 方向已经能确认的工程事实如下：

### A. BFF 已接入独立质量门，并把 ASR 输出改成结构化返回
- `backend/quality_gate.js` 已抽离质量门逻辑，提供 `PASS / SOFT_BLOCK / HARD_BLOCK` 三态判断。
- 规则已覆盖：
  - 空文本 / `no_speech`
  - 低价值文本（`oh` / `uh` / `you` 等）
  - 短音频只有极少 token 的异常结果
  - `a quick brown.` / `the quick brown.` 这类 article-led 截断短句
  - 重复文本、语言概率偏低、logprob 偏低、文本与音频时长不匹配
- `backend/server.js` 的 `/api/transcribe` 已接入质量门：
  - 小于 `MIN_AUDIO_BYTES` 或时长低于 `MIN_AUDIO_DURATION_SEC` 的音频直接返回结构化 skip 结果
  - Whisper 成功返回后会再次走 `assessTextQuality`
  - 被拦截时返回统一结构：`text=""`, `skipped=true`, `reason`, `reasons`, `qualityDecision`, `asr.metadata`, `asr.quality`
- `backend/server.js` 的 `/api/translate` 与 `/api/translate/stream` 已增加输入质量门，低质量文本不再继续翻译。

### B. ASR 本地转写链路已经补齐质量元数据
- `backend/local_whisper.py` 当前使用 `faster-whisper`，输出内容不再只有文本，而是带有：
  - `durationSec`
  - `durationAfterVadSec`
  - `languageProbability`
  - `avgLogprob`
  - `maxNoSpeechProb`
  - `qualityFlags`
  - `qualityScore`
  - `emptyReason`
  - 分段 `segments`
- 已实现 VAD 首轮失败后的 retry 策略：当启用 VAD 且长于阈值但无文本时，会自动退回到 `vad_filter=False` 再试一次。
- 当前默认参数与 v1.7 结论一致：默认模型仍保留 `medium` 基线，turbo 继续作为参数实验候选，不直接切主线。

### C. BFF 服务治理与版本确认链路已具备可验证入口
- `backend/start.sh` 启动前会清理 3001 端口旧监听，启动时注入 `VOICE_BRIDGE_BUILD_COMMIT="$(git rev-parse --short HEAD)"`。
- `backend/status.sh` 会同时检查 pid 文件和端口监听，输出 `pid-file=ok/mismatch`。
- `backend/server.js` 的 `/health` 会返回：
  - `buildCommit`
  - `whisper`
  - `whisperWorkers`
  - `python`
  - `whisperQueue`
- 根目录 `package.json` 当前已经存在：
  - `npm run bff:start|stop|status`
  - `npm run services:start|stop|status`
- `scripts/start-services.sh` / `stop-services.sh` / `status-services.sh` 已形成 BFF + Cloudflare tunnel 的统一启停脚本。

### D. v1.7 模型对比与 turbo 参数实验已有可复跑脚本和结果
- `monitor/v1.7/dev/model_compare.py` 已固定样本、模型集合和输出文件 `model_compare_results.json`。
- `monitor/v1.7/dev/turbo_param_experiment.py` 已固定 turbo 参数组合与输出文件 `turbo_param_experiment_results.json`。
- 文档结论与代码方向一致：
  - 不建议直接切 `large-v3`
  - `medium` 继续做默认基线
  - `turbo` 参数实验只能作为备选，不能替代质量门

## 2. 涉及哪些文件

- `backend/quality_gate.js`
- `backend/__tests__/quality_gate.test.js`
- `backend/server.js`
- `backend/local_whisper.py`
- `backend/whisper_transcribe.py`
- `backend/start.sh`
- `backend/status.sh`
- `backend/stop.sh`
- `backend/restart.sh`
- `backend/package.json`
- `package.json`
- `scripts/start-services.sh`
- `scripts/stop-services.sh`
- `scripts/status-services.sh`
- `monitor/v1.7/dev/model_compare.py`
- `monitor/v1.7/dev/model_compare_results.json`
- `monitor/v1.7/dev/MODEL_COMPARE_SUMMARY.md`
- `monitor/v1.7/dev/turbo_param_experiment.py`
- `monitor/v1.7/dev/turbo_param_experiment_results.json`
- `monitor/v1.7/dev/TURBO_PARAM_EXPERIMENT_SUMMARY.md`
- `monitor/v1.7/qa/report.md`

## 3. 如何自测

当前仓库下可直接执行的最小自测命令：

```bash
node --test backend/__tests__/quality_gate.test.js
node -c backend/server.js
python3 -m py_compile backend/local_whisper.py backend/whisper_transcribe.py backend/server.py
npm run services:status
```

本次实际执行结果：

- `node --test backend/__tests__/quality_gate.test.js`
  - 4/4 通过
  - 已覆盖 `a quick brown.` / `the quick brown.` 被拦截
  - 已覆盖正常短句 `Hello, how are you today?` 放行
- `node -c backend/server.js`
  - 通过
- `python3 -m py_compile backend/local_whisper.py backend/whisper_transcribe.py backend/server.py`
  - 通过
- `npm run services:status`
  - 脚本存在且可执行
  - 当前机器状态为 `BFF: stopped`、`Cloudflare tunnel: stopped`

建议补充的联调自测：

```bash
npm run bff:start
curl -s http://127.0.0.1:3001/health
npm run bff:status
```

联调期重点核对：

- `/health` 中的 `buildCommit` 是否等于当前 HEAD
- `/api/transcribe` 是否对以下样本返回结构化 skip：
  - `tests/fixtures/audio/musk_21s.wav`
  - `monitor/v1.7/qa/samples/oh.aiff`
  - `monitor/v1.7/qa/samples/uh.aiff`
- `/api/transcribe` 是否对 `monitor/v1.7/qa/samples/face_short.aiff` 继续放行
- `/api/translate` 与 `/api/translate/stream` 是否对被拦截文本返回 `skipped=true`

## 4. 当前仍有哪些未完成项 / 风险

- `face_medium` 问题仍未被仓库内现有证据证明已经根治。`MODEL_COMPARE_SUMMARY.md`、`TURBO_PARAM_EXPERIMENT_SUMMARY.md`、`qa/report.md` 都指向同一事实：质量门能挡住明显坏结果，但不能把这类样本修成正确识别。
- `backend/package.json` 当前没有 `test` script。verify 若直接执行 `npm --prefix backend test` 会失败，需要改用 `node --test backend/__tests__/quality_gate.test.js`。
- `backend/server.js` 内 `BUILD_COMMIT` 默认回退值仍是硬编码 `cc355f4`。虽然 `backend/start.sh` 启动时会注入当前 HEAD，但若有人绕过 `start.sh` 直接 `node backend/server.js`，`/health` 里的 `buildCommit` 可能失真。
- 现有后端单测只覆盖 `quality_gate` 规则，没有覆盖：
  - `/api/transcribe` HTTP 层
  - Whisper worker queue / timeout / queue full
  - `/api/translate` skip 分支
  - `/health` 版本确认分支
- 当前只完成了静态校验与规则级 smoke，未在本轮重新跑真实音频端到端回归；`qa/report.md` 记录的历史结论仍然有效参考，尤其是：
  - 幻觉率未稳定收敛到 `<5%`
  - `face_medium` 仍是主要失败样本
  - 端到端延迟还未稳定收口到目标区间

## 5. verify-runner 应如何验证

verify-runner 不应只跑 lint/语法；需要按“脚本存在性 -> 服务版本 -> 规则行为 -> 回归样本”顺序验证。

建议执行顺序：

1. 静态与脚本入口验证
```bash
node --test backend/__tests__/quality_gate.test.js
node -c backend/server.js
python3 -m py_compile backend/local_whisper.py backend/whisper_transcribe.py backend/server.py
npm run services:status
```

2. 服务版本确认
```bash
npm run bff:stop
npm run bff:start
npm run bff:status
curl -s http://127.0.0.1:3001/health
```

验收点：
- `bff:status` 显示 running
- `/health.buildCommit` 与当前 `git rev-parse --short HEAD` 一致
- `/health.whisperQueue` 正常返回结构

3. 规则行为验证
- 用最小音频 / filler / 旧问题样本调用 `/api/transcribe`
- 期望结果：
  - 空音频或极短音频：`skipped=true`, `reason=audio_too_short`
  - filler 或低价值文本：`skipped=true`
  - `the quick brown.` 这类截断短句命中 `truncated_short_phrase`
  - 正常短句不会被误杀

4. v1.7 回归样本验证
- 至少复跑：
  - `tests/fixtures/audio/musk_21s_correct.wav`
  - `tests/fixtures/audio/musk_21s.wav`
  - `monitor/v1.7/qa/samples/face_short.aiff`
  - `monitor/v1.7/qa/samples/face_medium.aiff`
  - `monitor/v1.7/qa/samples/oh.aiff`
  - `monitor/v1.7/qa/samples/uh.aiff`
- verify 结论必须单独写清：
  - 哪些样本被正确放行
  - 哪些样本被正确拦截
  - `face_medium` 是否仍失败
  - 当前延迟是否达到 v1.7 目标

## 6. 时间戳

- 结果写入时间：2026-04-07 08:41:36 CST
- 本文件性质：基于当前仓库与 v1.7 文档的 backend 收口结果，不包含 commit 动作
