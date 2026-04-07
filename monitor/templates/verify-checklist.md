# Verify 检查清单

## 静态检查
- [ ] `npm run lint` 通过（0 errors）
- [ ] `npx tsc --noEmit` 通过（0 errors）
- [ ] 无 console.log 残留（非 debug 模式）

## 测试
- [ ] `npm test` 全部通过
- [ ] 测试覆盖率 ≥ 80%（如果项目配置了覆盖率）

## 服务生命周期（如有 BFF）
- [ ] `npm run services:start` 正常启动
- [ ] `/health` 返回 200 且 buildCommit 匹配 HEAD
- [ ] `npm run services:stop` 正常停止

## API 冒烟（如有）
- [ ] 正常音频 → 返回有效文本
- [ ] 静音/空音频 → 返回 skipped=true + reason
- [ ] 低质量音频 → 返回 skipped=true + reason

## Git 检查
- [ ] 工作区无未提交的关键改动
- [ ] 当前分支正确
- [ ] HEAD commit 与远程同步

## 结果
- 总计: __ 项
- 通过: __ 项
- 失败: __ 项（标注是否预存在）
- 跳过: __ 项（标注原因）
