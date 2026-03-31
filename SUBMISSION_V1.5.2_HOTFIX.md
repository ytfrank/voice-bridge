# 提测报告 — voice-bridge V1.5.2 Hotfix

**提测时间**：2026-03-31 16:32  
**提测人**：Peter  
**分支**：hotfix/v1.5.2-safari-expo-link-fix  
**最新 Commit**：`b084216`  

---

## 一、问题背景

V1.5.1 修复后，线上确认仍失败。继续排查后确认：

1. 历史静态页面 `expo-redirect.html` 仍存在**硬编码 Expo 地址**
2. Expo tunnel 地址变化后，旧静态页面会继续跳转到失效地址
3. 这会导致即使后端根路径逻辑已更新，用户一旦命中旧页面，仍会看到错误跳转

---

## 二、本次 Hotfix 改动

### 1. 修复历史静态页硬编码问题
- 文件：`expo-redirect.html`
- 改动：将旧的硬编码 `exp://...` 地址改为**运行时动态读取**
- 页面启动后会读取：`/api/meta/expo-link?refresh=1`
- 读取成功后：
  - 自动尝试跳转到当前 Expo 地址
  - 提供“打开 Expo Go”按钮
  - 提供“复制 Expo 地址”按钮

### 2. 保留动态调试信息
- 页面展示：
  - 当前 Expo 地址
  - 当前来源 source
  - 当前请求使用的 API 地址
- 方便快速判断是不是命中了旧链路/错链路

---

## 三、修改文件

- `expo-redirect.html`
- `backend/server.js`（分支内已有动态入口相关逻辑）

---

## 四、自测结论

### 已完成
- ✅ `expo-redirect.html` 已不再包含历史硬编码 Expo 地址
- ✅ 静态页面可通过 `?bff=http://127.0.0.1:3001` 方式动态读取 `/api/meta/expo-link`
- ✅ `/api/meta/expo-link?refresh=1` 本地返回当前 Expo 地址
- ✅ 当前返回地址：`exp://aswx_oy-ytfrank-8082.exp.direct`

### 仍需 Guard / 线上确认
- ⚠️ Safari 最终拉起 Expo Go 是否完全恢复，仍需回归验证
- ⚠️ 当前问题已经从“旧静态页硬编码”层面修复，但 Expo 外部 host 本身是否仍有 Safari 兼容性问题，需继续观察

---

## 五、Guard 测试建议

### 线下可覆盖范围
请优先做**快速回归**：

1. 验证旧静态页不再跳转到历史失效地址
2. 验证 `expo-redirect.html` 能动态读取当前 `/api/meta/expo-link`
3. 验证按钮/复制逻辑正常展示
4. 验证不会再出现明显的硬编码旧地址问题

### 线上最终确认
如果线下简单回归通过，建议 **可控放行**，再由波哥做最终线上确认：

- Safari 打开实际公网入口
- 页面是否拿到当前动态地址
- 是否能成功拉起 Expo Go

---

## 六、当前判断

- 这次 Hotfix 改动范围很小，属于**入口页动态化修复**
- 线下回归应能覆盖主要变更
- 若线下回归通过，但线上 Safari 仍失败，则下一层问题将正式转为 **Expo 外部 host / 部署入口层问题**，由 Peter + Atlas 联合继续收口

---

*Peter · 2026-03-31*
