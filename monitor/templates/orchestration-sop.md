# 编排 SOP — {{project_name}}

## 1. 前置条件检查
- [ ] status.json 存在且格式正确
- [ ] 当前分支是目标开发分支
- [ ] TECH_PLAN.md 已写好
- [ ] 模型额度充足（或 fallback 路径已确认）

## 2. 生成 agent 卡片和 prompt
```bash
bash monitor/templates/scaffold-agents.sh \
  {{project_name}} \
  {{branch}} \
  "{{tech_stack}}" \
  {{project_dir}}
```

## 3. 启动 agent（并行）
每个 agent 用独立 session：
```bash
claude-auto --permission-mode bypassPermissions --print "$(cat {{prompt_path}})"
```

## 4. 收集结果
- 所有 agent 完成后，检查 `results/` 目录
- 每个 agent 必须有对应的结果文件
- 结果文件必须包含"完成/失败"标记

## 5. 汇总 → verify → review → submission
```
results/*.md → SUMMARY.md → verify → review → SUBMISSION.md → 提测
```

## 6. 提测检查清单
- [ ] 所有 blocking issues 已修复
- [ ] verify 全部通过
- [ ] SUBMISSION.md 与最新 commit 一致
- [ ] status.json runtime 已更新
- [ ] 群里发提测报告 + @Guard
