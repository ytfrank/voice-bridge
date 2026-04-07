# Code Review Bug Fixes — v1.7

**Date:** 2026-04-07
**Branch:** dev_v1.6
**Status:** DONE

---

## B1: assessTextQuality 副作用 — metadata 被直接修改

**File:** `backend/quality_gate.js`
**Root cause:** `assessTextQuality()` 在 line 131 执行 `metadata.emptyReason = ...`，直接修改了调用方传入的对象。
**Fix:** 在函数开头增加 `metadata = { ...metadata }` 浅拷贝，确保后续赋值不影响原始对象。

```
- function assessTextQuality(text = '', metadata = {}) {
+ function assessTextQuality(text = '', metadata = {}) {
+   // Shallow copy to avoid mutating the caller's object (B1 fix)
+   metadata = { ...metadata };
```

**Verification:** `node -c quality_gate.js` pass

---

## B2: quality_gate.js 与 local_whisper.py 质量规则重复且阈值不同步

**Files:** `backend/quality_gate.js` vs `backend/local_whisper.py`
**Root cause:** 两处独立实现了质量判断逻辑，存在阈值分歧：

| Rule | JS (quality_gate.js) | Python (local_whisper.py) |
|---|---|---|
| too_little_text | `durationSec >= 0.8` | `durationSec >= 2.0` |
| dense text flag | `text_audio_mismatch` | `text_too_dense_for_audio` |
| quality score | 不计算 | 计算 penalties |

此外 Python 端的 `qualityFlags` / `qualityScore` 被 JS 端 `assessTextQuality` 完全忽略——两套评分体系并存但只有 JS 生效。

**Fix:** 以 `quality_gate.js` 为唯一权威来源。Python 端只输出原始 metadata 指标，不再做质量判断：
- 删除 `quality_flags` 列表构建、`quality_score` 评分计算
- 删除 metadata 输出中的 `qualityFlags` 和 `qualityScore` 字段
- 保留 `emptyReason`（属于事实性 metadata，非质量门控判断）
- 添加注释标明 `quality_gate.js` 为 single source of truth

**Verification:** `python3 -c "import ast; ast.parse(...)"` pass, `node -c quality_gate.js` pass

---

## B3: BUILD_COMMIT 硬编码回退值

**File:** `backend/server.js`
**Root cause:** `BUILD_COMMIT` 硬编码回退值 `'cc355f4'`，部署新版本时若未设 `VOICE_BRIDGE_BUILD_COMMIT` 环境变量，health 接口仍返回旧 commit hash。

**Fix:** 改为三级回退策略：
1. 环境变量 `VOICE_BRIDGE_BUILD_COMMIT`（最高优先级）
2. `git rev-parse --short HEAD` 运行时读取
3. `'unknown'` + console.warn 提示设置环境变量

```js
let BUILD_COMMIT = process.env.VOICE_BRIDGE_BUILD_COMMIT;
if (!BUILD_COMMIT) {
  try {
    const { execSync } = require('child_process');
    BUILD_COMMIT = execSync('git rev-parse --short HEAD', { cwd: __dirname, encoding: 'utf8' }).trim();
  } catch {
    BUILD_COMMIT = 'unknown';
    console.warn('...BUILD_COMMIT: unable to detect...');
  }
}
```

**Verification:** `node -c server.js` pass

---

## Summary

| Bug | File | Change | Risk |
|-----|------|--------|------|
| B1 | quality_gate.js | +1 行浅拷贝 | 极低 — 行为不变，仅消除副作用 |
| B2 | local_whisper.py | 删除 ~25 行质量判断代码 | 低 — JS 端已有完整门控，Python 端 qualityFlags/qualityScore 原本未被决策使用 |
| B3 | server.js | git 动态获取 + warn | 低 — 环境变量优先，git 回退仅在开发环境生效 |

**Syntax check:** all 3 files pass (`node -c` / `python3 ast.parse`)
