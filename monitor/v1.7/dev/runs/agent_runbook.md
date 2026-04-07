# AGENT_RUNBOOK.md — voice-bridge v1.7 sub-agent 调度记录

# 版本: v1.0

本文件定义了 Peter 编排团队当前和历史上所有 sub-agent 启动信息。

## 已有记录
所有历史运行记录都在 `monitor/v1.7/dev/runs/` 目录下。后续新增记录也按此格式：

### 每条 run 记录也包含完整的启动命令和 prompt 全文。
用于后续定位、分析和优化。

"
<arg key="file_path">monitor/v1.7/dev/runs/agent_runbook.md</arg>
<arg key="name">run_id">str</arg>
<arg key="name">session_id">str</arg>
<arg key="name">exit_code">str</arg>
<arg key="name="started_at">str</arg>
<arg key="name="completed_at">str</arg>
<arg key="name="fallback_used">str</arg>
<arg key="name="fallback_reason">str</arg>
<arg key="name="notes">str</arg>

### 当前 run 记录
- `id`: run_001 - test-writer
- `id`: run_002 - backend-dev
    `id`: run_003 - frontend-dev
    `prompt_path`: 见各 run record
- `status`: done |started|active|failed|blocked
