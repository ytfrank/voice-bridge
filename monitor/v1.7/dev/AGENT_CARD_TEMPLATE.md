# AGENT_CARD_TEMPLATE.md

> 用途：为每个 subagent 生成结构化任务卡。任务卡是 prompt 的上层结构，不允许只给一句口头描述就启动 agent。

---

## 1. 基本信息
- `agent_name`:
- `role_type`: AI Agent / Script Runner / Human Review Gate
- `owner`: Peter
- `project`: voice-bridge v1.7

## 2. Goal
- 本 agent 本轮唯一目标是什么？

## 3. Scope
### In Scope
- 

### Out of Scope
- 

## 4. Inputs
- repo path:
- branch:
- related files:
- dependency artifacts:
- upstream agent outputs:

## 5. Working Rules
- cwd:
- can edit:
- cannot edit:
- can commit:
- must not modify official status:

## 6. Startup Method
- tool/runtime:
- model:
- command:
- prompt path:
- expected output path:

## 7. Deliverables
必须交付：
- result markdown:
- code/tests/scripts changed:
- unresolved items:
- risks:
- self-check:

## 8. Done Definition
满足以下条件才算完成：
- 

## 9. Failure Protocol
如果失败，必须输出：
- 失败点
- 已验证过什么
- 阻塞原因
- 需要谁决策/接力

## 10. Dependency Graph
- depends_on:
- blocks:
- handoff_to:

## 11. Completion Report Format
```md
# <agent_name> result
- status:
- completed:
- files_changed:
- self_check:
- unresolved:
- risks:
- next_handoff:
- timestamp:
```
