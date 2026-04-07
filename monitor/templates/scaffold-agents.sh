#!/bin/bash
# scaffold-agents.sh — 为新项目生成 agent 编排结构
# 用法: scaffold-agents.sh <project_name> <branch> <tech_stack> <project_dir>
# 示例: scaffold-agents.sh voice-bridge dev_v1.6 "React Native+Expo+Node.js" ~/projects/voice-bridge

set -euo pipefail

PROJECT="${1:?用法: scaffold-agents.sh <project_name> <branch> <tech_stack> <project_dir>}"
BRANCH="${2:?需要指定分支}"
TECH_STACK="${3:?需要指定技术栈}"
PROJECT_DIR="${4:?需要指定项目目录}"
MONITOR_DIR="${PROJECT_DIR}/monitor/${PROJECT}"
DEV_DIR="${MONITOR_DIR}/dev"
TEMPLATES="${PROJECT_DIR}/monitor/templates"

# 获取最新 commit
cd "$PROJECT_DIR"
LATEST_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

echo "🏗️  为 ${PROJECT} 生成编排结构..."
echo "   分支: ${BRANCH}"
echo "   commit: ${LATEST_COMMIT}"
echo "   技术栈: ${TECH_STACK}"
echo ""

# 创建目录结构
mkdir -p "${DEV_DIR}/cards"
mkdir -p "${DEV_DIR}/prompts"
mkdir -p "${DEV_DIR}/runs"
mkdir -p "${DEV_DIR}/results"
mkdir -p "${DEV_DIR}/verify"
mkdir -p "${DEV_DIR}/review"
mkdir -p "${DEV_DIR}/handoffs"
echo "✅ 目录结构已创建"

# 定义标准 agent 列表
declare -A AGENTS
AGENTS=(
  ["test-writer"]="Test Writer|Codex 5.4|claude-auto|TDD先行：根据行为规格写测试代码|tests/, __tests__/|业务代码"
  ["backend-dev"]="Backend Dev|Codex 5.4|claude-auto|后端实现：API、业务逻辑、DB|backend/, server.js, *.py|frontend/"
  ["frontend-dev"]="Frontend Dev|Claude Code|claude-auto|前端实现：UI组件、样式、交互|components/, hooks/, services/, screens/|backend/"
  ["verify-runner"]="Verify Runner|claude-auto|claude-auto|自动化验证：tsc+lint+unit test+冒烟|所有改动的文件|无"
  ["code-reviewer"]="Code Reviewer|Codex 5.4|claude-auto|代码审查：审查所有改动|所有改动的文件|无"
  ["refactor-agent"]="Refactor Agent|Codex 5.4|claude-auto|代码重构优化（按需触发）|指定范围内|核心配置文件"
)

for agent_id in "${!AGENTS[@]}"; do
  IFS='|' read -r role model fallback desc scope exclusions <<< "${AGENTS[$agent_id]}"
  
  # 生成 agent card
  cat > "${DEV_DIR}/cards/${agent_id}.md" << CARD_EOF
# Agent Card: ${role}

## 基本信息
| 字段 | 值 |
|------|---|
| Agent ID | ${agent_id} |
| 角色 | ${role} |
| 首选模型 | ${model} |
| 备选模型 | ${fallback} |
| 输入 | TECH_PLAN.md, 任务描述 |
| 输出 | results/${agent_id}.md |
| 超时 | 1800s |

## 职责范围
${desc}

## 约束
- 只修改以下文件/目录：${scope}
- 不允许修改：${exclusions}
- 依赖的接口/数据结构变更需先确认

## 完成标准
- [ ] 任务描述中的所有子项已完成
- [ ] 语法检查通过
- [ ] 结果文件已写入 results/${agent_id}.md
- [ ] 无遗留 TODO 或临时 hack
CARD_EOF

  # 生成 agent prompt
  cat > "${DEV_DIR}/prompts/${agent_id}.md" << PROMPT_EOF
# ${role} Agent — ${PROJECT}

## 身份
你是 **${PROJECT}** 的 ${role} agent。

## 项目上下文
- **项目名**: ${PROJECT}
- **项目目录**: ${PROJECT_DIR}
- **当前分支**: ${BRANCH}
- **技术栈**: ${TECH_STACK}
- **最新 commit**: ${LATEST_COMMIT}

## 任务卡
请先阅读任务卡：cards/${agent_id}.md

## 任务描述
（请在实际启动时填入具体任务描述）

## 输入文件（必读）
- monitor/${PROJECT}/dev/TECH_PLAN.md
- monitor/${PROJECT}/dev/SUBMISSION.md（如存在）
- monitor/${PROJECT}/qa/TEST_PLAN.md（如存在）

## 约束
1. 所有改动必须基于 ${BRANCH} 分支
2. 改动完成后必须通过语法检查
3. 不要修改不在任务范围内的文件
4. 遇到不确定的问题，选择最保守的方案

## 输出要求
- 结果文件：results/${agent_id}.md
- 完成标记：DONE:${agent_id}
- 结果文件必须包含：
  1. 完成了什么（具体到文件和行号）
  2. 修改理由
  3. 自测结果
  4. 遗留问题（如有）
PROMPT_EOF

  echo "   ✅ ${agent_id} (${role})"
done

# 复制 verify checklist 和 submission template（如果目录下没有）
if [ ! -f "${DEV_DIR}/verify-checklist.md" ]; then
  cp "${TEMPLATES}/verify-checklist.md" "${DEV_DIR}/verify-checklist.md" 2>/dev/null || true
fi

# 生成 status.json 骨架（如果不存在）
if [ ! -f "${MONITOR_DIR}/status.json" ]; then
  cat > "${MONITOR_DIR}/status.json" << STATUS_EOF
{
  "project_id": "${PROJECT}",
  "project_name": "${PROJECT}",
  "type": "feature",
  "lifecycle": "active",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%S+08:00)",
  "version": 1,

  "workflow": {
    "current_stage": "developing",
    "stage_status": "pending",
    "stage_owner": "peter",
    "stage_entered_at": null,
    "last_transition_at": null,
    "last_transition_by": null,
    "last_transition_note": null,
    "exception_state": null,
    "exception_since": null
  },

  "runtime": {
    "last_runtime_update_at": "$(date -u +%Y-%m-%dT%H:%M:%S+08:00)",
    "last_runtime_update_by": "peter",
    "active_role": null,
    "active_tasks": [],
    "latest_commit": "${LATEST_COMMIT}",
    "latest_artifact_update": null,
    "latest_evidence_refs": [],
    "current_blockers": [],
    "current_risks": [],
    "waiting_on": null,
    "recent_actions": ["scaffold-agents.sh 生成编排结构"],
    "dev": {
      "latest_commit": "${LATEST_COMMIT}",
      "current_branch": "${BRANCH}",
      "started_subagents": 0,
      "active_subagents": 0,
      "completed_subagents": 0,
      "orchestration_plan_exists": true,
      "pending_items": ["填写TECH_PLAN.md", "填写各agent的具体任务描述", "启动agent"]
    }
  },

  "gate": {
    "dev_passed": false,
    "test_passed": false,
    "acceptance_passed": false,
    "deploy_passed": false
  },

  "official": {
    "summary": "",
    "current_assessment": null,
    "blockers": [],
    "risks": [],
    "next_action": null,
    "decision": null,
    "updated_by": null,
    "updated_at": null
  }
}
STATUS_EOF
  echo "   ✅ status.json 骨架已生成"
fi

echo ""
echo "🎉 编排结构生成完成！"
echo ""
echo "下一步："
echo "1. 编辑 TECH_PLAN.md（技术方案）"
echo "2. 编辑 prompts/*.md（填入具体任务描述）"
echo "3. 启动 agent：claude-auto --permission-mode bypassPermissions --print \"\$(cat prompts/<agent>.md)\""
