# ORCHESTRATION_PLAN.md — voice-bridge v1.7

## 目标

把 voice-bridge v1.7 的 `developing` 阶段从“名义开发中”恢复为“真实可执行的多 agent 编排状态”，并让后续推进基于 **输入清晰、启动有证据、输出可验收、汇总可追踪** 的流水线进行。

本文件是 Peter 在 v1.7 轮次的总编排方案，不替代具体 agent prompt；它负责定义：
- 本轮目标与边界
- 需要启动的 agent 类型
- agent 间依赖关系
- 统一输出目录与交付标准
- Peter 的调度与收口规则

---

## 本轮范围

### In Scope
1. 基于现有 `monitor/v1.7/status.json`、`dev/TECH_PLAN.md` 和当前仓库事实，恢复可执行开发编排
2. 将“质量门三态重构 + 模型对比实验 + 幻觉治理收口”拆成可执行任务卡
3. 对开发、验证、审查、提测形成统一 artifact 目录
4. 后续一切 subagent 启动都以本方案和任务卡为准

### Out of Scope
1. 直接修改官方 `status.json`
2. 跳过 artifact 直接口头认定“开发进行中”
3. 让 subagent 自己猜路径、产物格式、完成标准
4. 在未形成验证链路前直接提测

---

## 本轮编排目标

### 主目标
让 v1.7 具备一条真实有效的研发流水线：

```text
需求/现状确认
  -> agent任务卡生成
  -> 开发并行执行
  -> verify 验证
  -> code review
  -> submission packager
  -> 提测给 Guard
```

### 成功标志
满足以下条件，才允许 Peter 对外表述“开发已启动 / 正常推进中”：
1. 至少 1 个开发型 subagent 已实际启动，且有启动证据
2. 所有必需 agent 都有任务卡
3. 统一输出目录已建立
4. 30 分钟内出现新的工程事实（任务卡 / 启动记录 / 结果文件 / commit / verify 报告 之一）
5. 最终产物能支持 Guard 按 artifact 而不是按聊天进行验收

---

## 本轮最小可交付编排包

本轮不再把开发等同于 3 个 agent；完整最小闭环如下：

### A. 生产型 Agent
1. **spec-writer / orchestration-writer**
   - 负责把本轮任务收敛成总方案与任务卡
2. **test-writer**
   - 负责补行为规格与回归测试
3. **backend-dev**
   - 负责后端质量门、ASR链路、实验脚本与服务治理相关实现
4. **frontend-dev**
   - 负责前端录音/交互/结构化返回消费相关实现

### B. 验证 / 审查型 Agent
5. **verify-runner**
   - 负责执行 tsc / lint / test / 冒烟 / 必要脚本验证
6. **code-reviewer-codex**
   - 负责从代码正确性、结构和风险角度做审查
7. **code-reviewer-claude**
   - 负责从产品交互、前端/协作边界角度做审查
8. **submission-packager**
   - 负责把开发结果整理为 `SUBMISSION.md` 和 handoff 文档

### C. 可选 Agent（按需）
9. **contract-checker**
   - 当前后端接口定义变化时启用
10. **refactor-agent**
   - 当前面 agent 已验证逻辑正确，但结构仍不够优雅时启用

---

## 依赖关系

### 并行启动
以下角色可以并行：
- test-writer
- backend-dev
- frontend-dev

### 串行依赖
- verify-runner 依赖：test-writer / backend-dev / frontend-dev 的首轮结果
- code-reviewer-* 依赖：verify-runner 结果 + 当前 diff
- submission-packager 依赖：verify + review 均完成

### Handoff 图

```text
orchestration-writer
  -> test-writer
  -> backend-dev
  -> frontend-dev
(test/backend/frontend 完成)
  -> verify-runner
(verify 完成)
  -> code-reviewer-codex
  -> code-reviewer-claude
(review 收敛)
  -> submission-packager
  -> Guard
```

---

## 统一目录结构

所有本轮编排产物统一放在：

```text
monitor/v1.7/dev/
  ORCHESTRATION_PLAN.md
  AGENT_CARD_TEMPLATE.md
  AGENT_RUNBOOK.md
  cards/
  runs/
  results/
  verify/
  review/
  handoffs/
  prompts/
```

### 目录用途
- `cards/`：每个 agent 的任务卡
- `prompts/`：实际发给 subagent 的 prompt 文本
- `runs/`：启动记录（命令、cwd、session、时间）
- `results/`：开发 agent 交付结果
- `verify/`：验证报告
- `review/`：代码审查报告
- `handoffs/`：提测前后的移交文档

---

## 每类产物的最低标准

### 1. Agent Card（cards/*.md）
必须包含：
- agent_name
- role_type
- goal
- inputs
- cwd
- startup_method
- deliverables
- done_definition
- failure_protocol
- depends_on / handoff_to

### 2. Prompt（prompts/*.md）
必须包含：
- 背景
- 目标
- 范围
- 输入文件
- 输出要求
- 禁止事项
- 完成后汇报格式

### 3. Run Record（runs/*.md）
必须包含：
- agent_name
- model/tool/runtime
- command
- cwd
- prompt_path
- output_path
- started_at
- session_id / run_id
- status

### 4. Result（results/*.md）
必须包含：
- 完成内容
- 修改文件
- 未完成项
- 风险
- 自测结果
- 需要的下游动作
- 时间戳

### 5. Verify Report（verify/*.md）
必须包含：
- 执行命令
- tsc 结果
- lint 结果
- test 结果
- 冒烟结果
- 失败项 / 阻塞项
- 结论

### 6. Review Report（review/*.md）
必须包含：
- blocking issues
- non-blocking issues
- 风险点
- 是否允许提测

---

## Peter 的运行规则

### 规则 1：没有任务卡，不允许启动 agent

### 规则 2：没有 run record，不允许对外称“已启动”

### 规则 3：没有定义输出目录和产物格式，不允许派单

### 规则 4：检查进度优先看 artifact，不优先看聊天

### 规则 5：planned / started / active 必须分开统计

### 规则 6：30 分钟内必须出现新的工程事实
若没有，则只能表述为：
- 编排准备中
- 阻塞中
- 等待确认
不能表述为“正常开发中”

### 规则 7：verify / review 是正式环节，不是附属动作

### 规则 8：任何提测材料必须与最新 commit 一致

---

## 当前 v1.7 的恢复动作

### Step 1
补齐本轮编排基础设施：
- `ORCHESTRATION_PLAN.md`
- `AGENT_CARD_TEMPLATE.md`
- `AGENT_RUNBOOK.md`
- `cards/*.md`

### Step 2
为本轮最小闭环生成任务卡：
- test-writer
- backend-dev
- frontend-dev
- verify-runner
- code-reviewer-codex
- code-reviewer-claude
- submission-packager

### Step 3
按任务卡启动 subagent，并在 `runs/` 留证

### Step 4
按 `results/` / `verify/` / `review/` 收结果，不以聊天替代产物

### Step 5
形成与当前 commit 一致的 `SUBMISSION.md`，再交 Guard

---

## 本文件与官方状态的关系

- 官方状态仍以 `monitor/v1.7/status.json` 为唯一状态源
- 本文件不修改官方阶段
- 本文件用于把 Peter 的执行动作结构化、可追踪、可验收
- 任何群里汇报都应引用这里定义的 artifact，而不是口头状态

---

## 结论

v1.7 后续的检验标准很简单：
**不是看 Peter 说得多好，而是看这套编排是否真的拉起 agent、生成 artifact、推动项目进入可提测状态。**
