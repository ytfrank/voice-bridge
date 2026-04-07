# Jest Fix — npm test 统一

**日期**: 2026-04-07
**分支**: dev_v1.6

## 问题

`npm test` 指向 `jest`，但 `backend/__tests__/quality_gate.test.js` 使用 `node:test` 格式（`const test = require('node:test')`），jest 无法识别，报错：

```
Your test suite must contain at least one test
```

## 方案选择

| 方案 | 优劣 |
|------|------|
| A: 改 package.json test 脚本为 `node --test` | 改动最小（1行），保留 node:test 原生格式，无需 jest 依赖 |
| B: 重写测试文件为 jest 格式 | 改动大，引入不必要的 describe/it/expect 改写 |

**选择方案 A**：项目中仅此一个测试文件，且已使用 node:test 格式通过 `node --test` 验证，改脚本成本最低。

## 修复内容

`package.json` test 脚本：

```diff
- "test": "jest",
+ "test": "node --test backend/__tests__/**/*.test.js",
```

## 验证结果

```
$ npm test

✔ flags truncated article-led fragment for short audio
✔ flags article-led incomplete sentence variant with the
✔ keeps normal short sentence allowed
✔ does not classify short complete article-led sentence as fragment when verb exists

tests 4 | pass 4 | fail 0 | duration 57ms
```

## 状态

DONE — npm test 4/4 PASS
