# 提测报告 — voice-bridge V1.5.4 Hotfix

**提测时间**：2026-04-01 00:10  
**提测人**：Peter  
**分支**：hotfix/v1.5.4-code-audit-fix  
**最新 Commit**：`9241dff`  

---

## 一、本轮问题背景

V1.5.3 线上确认时，Safari 已能跳转到 Expo Go，但进入 App 后报错。

Atlas 初步怀疑：
- `hooks/useAudioRecording.ts` 第 8 行使用了 `expo-audio`
- 认为应改回 `expo-av`

Peter 在 V1.5.4 中做了代码级复核，结论如下：

### 结论
**Atlas 抓到的是“依赖一致性问题”，但不是“API 用错库”的问题。**

当前 `hooks/useAudioRecording.ts` 使用的 API：
- `useAudioRecorder`
- `RecordingOptions`
- `setAudioModeAsync`
- `IOSOutputFormat`
- `AudioQuality`

这些 API 实际上属于 **`expo-audio`**，并不是 `expo-av` 的一行等价替换场景。

真正问题是：
- 代码已迁移到 `expo-audio`
- 但 `package.json` 里之前**没有安装 `expo-audio`**
- 这会导致 Expo Go 运行时报模块/依赖错误

---

## 二、本轮 Hotfix 修复内容

### 1. 补齐运行时关键依赖
- 新增依赖：`expo-audio`
- 保证 `hooks/useAudioRecording.ts` 的实际 import 与项目依赖一致

### 2. 补齐测试工具链依赖
- 新增依赖：`@playwright/test`
- 解决项目中已有 Playwright spec，但依赖缺失的问题

### 3. 修复 Jest / Playwright 串跑
- 新增 `jest.config.cjs`
- 将 `/tests/` 下 Playwright 测试从 Jest 路径中剥离
- 避免 `npm test` 误跑 E2E spec，导致提测链路假红

### 4. 补充分离的 E2E 脚本入口
- 新增 npm script：`test:e2e`
- 明确 Playwright 测试通过 `playwright test` 运行，不再混入 Jest

### 5. 升级 TypeScript / React 类型版本
- TypeScript 升级到与 Expo 54 tsconfig 兼容的版本
- `@types/react` 升级到与当前 React Native 依赖更一致的版本
- 解决 `expo/tsconfig.base` 中 `module: preserve` 被旧版 TypeScript 报错的问题

---

## 三、修改文件

- `package.json`
- `package-lock.json`
- `jest.config.cjs`

---

## 四、验证结果

### 已完成验证
1. **TypeScript 编译检查通过**
```bash
./node_modules/.bin/tsc --noEmit
# EXIT:0
```

2. **Jest 链路恢复可执行**
```bash
npm test -- --runInBand
# No tests found, exiting with code 0
```
说明：当前项目没有独立 Jest 单测，但至少不再错误执行 Playwright spec。

3. **Playwright 测试入口恢复可识别**
```bash
npm run test:e2e -- --list
```
已成功列出 19 个测试用例，说明 Playwright 配置与依赖已恢复到可执行状态。

4. **Expo iOS bundle 可正常返回**
通过当前本机 Expo 实例访问 iOS bundle，返回 `200`，说明 Metro 至少已能解析当前依赖树。

### 当前未纳入本轮 Hotfix 的项
1. **ESLint 未配置**
```bash
npm run lint
```
返回：项目缺少 ESLint config。该问题为历史工具链缺口，不是本轮线上崩溃根因。

2. **尚未完成 Guard 测试 / 小叮当验收 / Atlas 部署**
当前仅完成 Peter 侧 hotfix 修复与自查。

---

## 五、Guard 建议测试重点

### P0：线上崩溃回归
1. 使用当前 Expo 入口重新在 iPhone / Safari → Expo Go 验证
2. 确认不再出现 `expo-audio` / 模块缺失类报错
3. 确认 App 首页能正常加载

### P1：录音主链路回归
1. 点击开始录音按钮
2. 验证录音控件正常渲染
3. 验证录音流程不会因音频模块初始化失败而崩溃

### P2：测试链路确认
1. 确认 `npm test` 不再错误执行 Playwright spec
2. 确认 `npm run test:e2e -- --list` 可以正常识别 E2E 用例

---

## 六、风险与说明

1. 这轮修复的主目标是：**修复 Expo Go 运行时依赖缺失问题**
2. Atlas 提到的“改回 expo-av”在本轮审计中**不成立**；当前代码 API 形态对应的是 `expo-audio`
3. 若修复后仍有线上错误，下一轮应重点看：
   - Expo tunnel / 运行环境本身
   - 录音权限或平台差异
   - 真实设备上的 runtime 行为

---

*Peter · 2026-04-01*
