# Git 开发规范 — voice-bridge

**生效时间**：2026-03-22  
**确认人**：波哥

---

## 核心原则

1. **一个项目**：voice-bridge
2. **一个目录**：`~/projects/voice-bridge/`
3. **一个仓库**：不同版本用分支管理

---

## 分支命名规范（下划线）

| 类型 | 命名格式 | 示例 |
|------|---------|------|
| 功能分支 | `feature_<版本号>` | `feature_1.3`, `feature_1.4` |
| 修复分支 | `hotfix_<版本号>` | `hotfix_1.3`, `hotfix_1.3.1` |
| 上线分支 | `master` | — |

---

## 开发流程

```
从 master 创建分支
  ↓
在 feature_X.X 分支开发
  ↓
推送到远程
  ↓
提测（Guard 测试）
  ↓
测试通过
  ↓
PR 合并到 master
  ↓
从 master 部署
```

---

## 禁止事项

- ❌ 创建新项目目录（所有版本都在 ~/projects/voice-bridge/）
- ❌ 使用斜杠命名（feature/1.3）
- ❌ 直接提交到 master（必须通过 PR）

---

## 提交规范

```
类型(范围): 描述

feat: 新功能
fix: 修复
docs: 文档
test: 测试
refactor: 重构
```

---

*2026-03-22 波哥确认*
