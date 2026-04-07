# Agent Card: {{agent_role}}

## 基本信息
| 字段 | 值 |
|------|---|
| Agent ID | {{agent_id}} |
| 角色 | {{agent_role}} |
| 首选模型 | {{primary_model}} |
| 备选模型 | {{fallback_model}} |
| 输入 | {{inputs}} |
| 输出 | {{output_path}} |
| 超时 | {{timeout}} |

## 职责范围
{{responsibilities}}

## 约束
- 只修改以下文件/目录：{{scope}}
- 不允许修改：{{exclusions}}
- 依赖的接口/数据结构变更需先确认

## 完成标准
- [ ] 任务描述中的所有子项已完成
- [ ] 语法检查通过（tsc / node -c / python -c）
- [ ] 结果文件已写入 `{{output_path}}`
- [ ] 无遗留 TODO 或临时 hack

## 失败处理
- 模型额度耗尽 → 自动 fallback 到 {{fallback_model}}
- 语法检查失败 → 修复后重试，最多 3 次
- 3 次仍失败 → 写入失败原因到结果文件，输出 `FAILED:{{agent_id}}`
