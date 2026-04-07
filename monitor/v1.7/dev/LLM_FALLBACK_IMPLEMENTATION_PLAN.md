# LLM_FALLBACK_IMPLEMENTATION_PLAN.md — v1.7 CLI Fallback + Run Record

## 目标

为 Peter 的 sub-agent 编排补齐一套**可执行、可回退、可留痕**的 CLI 启动方案，解决以下问题：

1. Claude Code quota / auth / rate-limit 时，Claude 线任务不至于直接中断
2. Codex quota / auth / provider 问题时，有明确备用路径或明确阻塞口径
3. 每次 sub-agent 启动、fallback、失败、产物位置都可追踪
4. 让 v1.7 能基于真实流水线继续推进，而不是再次停留在口头编排

---

## 适用范围

### 适用
- `frontend-dev`
- `backend-dev`
- `test-writer`
- `code-reviewer-codex`
- `code-reviewer-claude`
- 未来所有通过 CLI 启动的 coding sub-agent

### 不适用
- OpenClaw 内建工具本身
- 非 CLI 的普通 read/write/edit 流程
- 直接修改官方 `status.json`

---

## 总体策略

### Claude 线
优先顺序：
1. Claude Code native
2. Claude Code + GLM-5.1 fallback
3. 若仍失败，再切 Codex 作为跨工具 fallback
4. 仍失败 -> 明确报阻塞

### Codex 线
优先顺序：
1. Codex native / OpenAI
2. Codex + proxy/gateway fallback（若已配置）
3. 若 proxy 未配置或失败 -> 明确报阻塞

### 当前阶段原则
- 先做最小可用 fallback
- 不一上来搞统一 gateway 平台
- 先让 v1.7 能稳定跑起来

---

## 设计原则

1. **fallback 在 CLI 入口 wrapper 做，不在 skill 层做**
2. **不静默切换，必须留日志**
3. **不直接 alias 覆盖原生 `claude` / `codex`**
4. **先保留原生命令用于诊断**
5. **run record 必须记录 preferred runner / actual runner / fallback 结果**
6. **非 quota/auth/rate-limit 类错误，不做无意义 fallback**

---

## 目录结构

```text
~/bin/
  llm-auto-common.sh
  claude-auto
  codex-auto
  llm-auto-status

~/.claude/
  settings.cc.json
  settings.glm.json
  settings.json

~/.codex/
  config.openai.toml
  config.proxy.toml
  config.toml

~/.llm-auto/
  logs/
  locks/
```

---

## Claude fallback 方案

## 目标
当 Claude Code native 命中：
- quota
- rate-limit
- auth/token 问题

自动切到 GLM-5.1，并保留 Claude 这条工作流形态。

## 配置

### `settings.cc.json`
Claude 原生配置。

### `settings.glm.json`
第一阶段统一使用：
- `ANTHROPIC_DEFAULT_OPUS_MODEL=glm-5.1`
- `ANTHROPIC_DEFAULT_SONNET_MODEL=glm-5.1`

原因：
- 先减少变量
- 先验证 fallback 稳定性
- 后续再做成本/性能精细化拆分

## 实现要求

### 必须做
1. 使用 wrapper：`claude-auto`
2. 识别 quota/auth/rate-limit 关键词
3. fallback 前写日志
4. fallback 后写日志
5. 返回最终退出码

### 风险控制
1. **并发风险**：`settings.json` 是全局配置
   - 第一阶段加锁：`~/.llm-auto/locks/claude-config.lock`
   - 同时只允许一个 Claude fallback 配置切换
2. **参数传递风险**：不能用脆弱字符串拼接
   - 使用稳妥参数转发，不允许 prompt 因 quoting 损坏
3. **安全边界**：prompt/命令错误不应触发 fallback

---

## Codex fallback 方案

## 目标
给 Codex 增加：
- quota/auth 错误识别
- provider/proxy fallback 入口
- 未配置 proxy 时明确阻塞，而不是伪装成功

## 配置

### `config.openai.toml`
Codex 默认配置。

### `config.proxy.toml`
第二配置位，供后续 proxy/gateway 使用。

## 当前阶段策略

### Phase 1A
先实现：
- `codex-auto`
- quota/auth 错误识别
- 日志记录
- run record 联动

### Phase 1B
待 proxy/gateway 配好后，再启用真正 provider fallback。

---

## run record 升级方案

当前 `monitor/v1.7/dev/runs/*.md` 已有基础记录，但字段还不够。
后续统一升级为：

```md
# run record — <agent_name>
- agent_name:
- role:
- preferred_runner:
- actual_runner:
- preferred_model/provider:
- actual_model/provider:
- fallback_used: true|false
- fallback_reason:
- command:
- cwd:
- prompt_path:
- output_path:
- started_at:
- completed_at:
- session_id:
- exit_code:
- status: planned|started|active|done|failed|blocked
- result_path:
- notes:
```

## 记录原则
1. 只要启动 sub-agent，就必须有 run record
2. 只要发生 fallback，就必须更新 run record
3. 只要失败，就必须记录 exit_code + 失败原因
4. run record 与 result artifact 必须互相可追踪

---

## 与 Peter 编排的接入方式

## agent role -> preferred runner

- `frontend-dev` -> `claude-auto`
- `code-reviewer-claude` -> `claude-auto`
- `backend-dev` -> `codex-auto`
- `test-writer` -> `codex-auto`
- `code-reviewer-codex` -> `codex-auto`

## 编排器职责
Peter 编排层不直接处理 provider 细节，只关心：
- 期望用谁跑
- 实际用谁跑
- 是否 fallback
- 是否产生产物
- 是否进入 blocked

---

## v1.7 具体落地顺序

## Step 1
先完成文档和标准：
- `LLM_FALLBACK_IMPLEMENTATION_PLAN.md`
- run record 字段升级约定

## Step 2
先实现 Claude 线最小 fallback
原因：当前真实卡点在 `frontend-dev` 的 Claude Code quota。

## Step 3
恢复 `frontend-dev`
目标：先让 frontend agent 能成功产出 `results/frontend-dev.md`

## Step 4
汇总 test-writer / backend-dev / frontend-dev 首轮结果

## Step 5
进入 verify / review 链路

## Step 6
形成与最新 commit 一致的 `SUBMISSION.md`

---

## 当前已知限制

1. Claude 全局配置切换存在并发风险，第一阶段只能用加锁降低风险
2. Codex proxy fallback 第一版可能只有壳子，未必当天就真正接通
3. CLI fallback 能解决入口资源问题，但不能替代代码/架构本身的问题
4. 如果 Claude 和 Codex 同时额度受限，只能明确报阻塞并请求外部资源调整

---

## DoD

满足以下条件，才算 fallback 方案进入“可用”状态：

1. `frontend-dev` 能通过 fallback 跑通至少一轮
2. 每个启动过的 agent 都有 run record
3. 至少一条 fallback 记录可在日志里追踪
4. v1.7 能基于这套机制继续推进到 verify，而不是再次停滞

---

## 结论

这套方案的目标不是追求一步到位的统一模型网关，而是先解决 v1.7 当前最真实的执行问题：
**sub-agent 能启动、能 fallback、能留痕、能继续把项目往下推。**
