# SUBMISSION.md — voice-bridge V1.7 Phase 1

**提交人**: Peter  
**提交时间**: 2026-04-04  
**分支**: main  
**状态**: 提测

---

## 一、改动概述

在 **不换模型**（继续 Whisper medium + GLM-4-flash）前提下，完成 Phase 1 全部 P0 + P1 改动：

### P0（必须）
1. **幻觉拦截** — ASR 输出低质量结果不再进入翻译
2. **空结果修复** — iOS 录音循环稳定性 + VAD fallback + 空结果分类
3. **空/低质量文本不进翻译** — 前后端双重拦截

### P1（跟做）
1. **chunk 策略预留** — chunk 时长可配置，支持实验更短 chunk
2. **队列优化** — session 串行 + 全局限流 + 过期淘汰
3. **启停脚本** — 服务默认关闭，按需启动

---

## 二、改动文件清单

### 后端（8 文件）
| 文件 | 改动点 |
|---|---|
| `backend/local_whisper.py` | ASR 输出升级：segment 级质量指标 + 聚合置信度 + 重复文本启发式 + VAD fallback + qualityScore/qualityFlags/emptyReason |
| `backend/server.js` | 质量门禁（空文本/低logprob/高noSpeech/重复文本/文本音频不匹配拦截）+ 空结果分类 + 翻译侧拦截 + WhisperWorkerPool 优化（session 串行/全局上限/TTL 淘汰/短任务优先）+ ffprobe 音频探测 |
| `backend/package.json` | 新增 bff:start/stop/status/restart 命令 |
| `backend/start.sh` | BFF 后台启动脚本 |
| `backend/stop.sh` | BFF 停止脚本 |
| `backend/status.sh` | BFF 状态查询脚本 |
| `backend/restart.sh` | BFF 重启脚本 |
| `package.json` | 新增 services:start/stop/status + bff:start/stop/status/restart 入口 |

### 前端（6 文件）
| 文件 | 改动点 |
|---|---|
| `hooks/useAudioRecording.ts` | 录音 chunk 循环改为非重入自调度 + 防重叠/竞态 + 后台回前台恢复 + 空结果/skipped 埋点 |
| `services/transcriptionService.ts` | 返回结构化结果（text/skipped/reason/status）|
| `services/websocketService.ts` | 手动 disconnect 后不再自动重连 |
| `constants/audio.ts` | chunk 时长可通过环境变量配置 + 句尾匹配扩展 |
| `components/ControlButtons.tsx` | 按钮 busy 态防重复点击 + 失败提示 |
| `README.md` | 补充启停命令说明 |

### 统计
- **14 文件改动**
- **+1433 行 / -290 行**

---

## 三、自测结果

### 语法 / 编译检查
- `node --check backend/server.js` ✅
- `python3 -m py_compile backend/local_whisper.py` ✅
- `npx tsc --noEmit` ✅（无 TypeScript 错误）
- 全部 shell 脚本 `bash -n` ✅

### 冒烟验证
- `/health` 正常返回，含新增 `whisperQueue` 状态 ✅
- `/api/transcribe` 对测试音频返回 `skipped: true` + 低质量原因 ✅
- `/api/translate` 对异常重复文本返回跳过 ✅
- `npm run services:status` 正常输出 ✅

---

## 四、预期指标对比

| 指标 | V1.6 现状 | Phase 1 目标 | 说明 |
|---|---|---|---|
| 空结果率 | 84.4% | <10% | 录音链路修复 + VAD fallback + 空结果分类 |
| 幻觉率 | 严重 | <5% | 后端质量门禁 + 前端低质量过滤 |
| 端到端延迟 | ~12s | 5~7s（保守 7~9s） | 队列优化 + 超时淘汰 + chunk 可配置 |
| ASR 有效返回率 | 15.6% | >90% | 上面三项综合结果 |
| 并发 | 1人 | 3人 | session 串行 + 全局限流 |
| 服务启停 | 无 | 一键启停 | start/stop/status 脚本 |

> 注意：以上目标需要 Guard 用真实广播/面对面样本实测验证。

---

## 五、测试重点（给 Guard）

### 重点 1：空结果率
- 用广播音频（如马斯克专访视频）连续录制 2~3 分钟
- 统计有效返回 vs 空返回比例
- 目标：空结果率 <10%

### 重点 2：幻觉率
- 对比 ASR 英文输出与实际音频内容
- 检查是否还存在"编造不存在的内容"
- 目标：幻觉率 <5%

### 重点 3：延迟
- 记录从"说出话"到"看到翻译"的端到端时间
- 目标：5~7s（保守 7~9s）

### 重点 4：录音稳定性
- 连续 start/stop 录音 20+ 次
- iPhone 锁屏 → 切后台 → 回前台
- 检查是否还出现录音循环失败

### 重点 5：低价值文本
- 只说 "Oh" / "Uh" / "嗯" 等
- 检查是否不再触发翻译请求

### 重点 6：启停
- `npm run services:start` / `npm run services:stop` / `npm run services:status`
- 验证不启动时不占内存

---

## 六、已知风险 / 边界

1. **质量门阈值是保守初始值**
   - 可能需要根据 Guard 测试数据微调
   - 如果误拦截太多正常文本，需放宽阈值

2. **iOS 真机层面的 Audio Session**
   - 代码侧竞态已收掉
   - 但系统级中断/权限/真机状态仍要实际回归

3. **短文本过滤是启发式**
   - "Oh" / "Uh" 这类会被跳过翻译
   - 如果业务希望保留，可再调阈值

4. **chunk 策略暂未切换**
   - 已支持环境变量配置
   - 默认仍是 5s
   - 建议 Guard 测完当前版本后，再单独实验 3s chunk

---

*提交人：Peter | 2026-04-04*
