# Frontend Skipped/Reasons Fix Report

**Date:** 2026-04-07
**Branch:** dev_v1.6
**Status:** DONE

## Summary

前端完整消费后端 `skipped`/`reason`/`reasons` 字段，Guard 测试阻塞项已修复。

## Changes

### P0-1: TranscriptionResult 增加 reasons[] 解析
**File:** `services/transcriptionService.ts`

- `TranscriptionResult` 接口增加 `reasons?: string[]`
- 解析 `data.reasons`（Array.isArray 检查）
- 向后兼容：`reason` 字段保留，优先取 `reason`，否则 fallback 到 `reasons.join(', ')`
- pipelineLogger 日志同时输出 `reason` 和 `reasons`

### P0-2: DebugPanel skipped 条目高亮
**File:** `components/DebugPanel.tsx`

- skipped 条目（`"skipped":true` 或 `chunk_skipped`）添加 `[SKIP]` 前缀
- 新增 `skipLine` 样式：灰色（`#999`）+ 80% opacity

### P1: 用户可见的 skipped 反馈
**File:** `store/transcriptStore.ts`
- 新增 `skipNotification: string | null` 状态
- `showSkipNotification(msg)` — 设置后 2.5s 自动清除
- reset 时清除

**File:** `components/EnglishTranscript.tsx`
- 消费 `skipNotification`，显示灰色斜体提示
- 样式：`#888`，14px，italic

**File:** `hooks/useAudioRecording.ts`
- 后端返回 `skipped=true` 时调用 `showSkipNotification` 显示跳过原因

## Verification

- `npx tsc --noEmit` — 零错误通过
- 所有改动为增量修改，无破坏性变更

## Impact

- 后端返回 `reasons[]` 数组时前端完整消费
- DebugPanel 可视化区分 skipped 条目
- 用户可短暂看到被跳过的原因提示
