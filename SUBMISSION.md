# 提测报告 — 线上确认跳转失败修复

**提测时间**：2026-03-31 08:41  
**提测人**：Peter  
**分支**：feature/v1.5  
**最新 Commit**：`431ca89`  

---

## 一、问题根因

本次线上确认失败不是单点问题，而是链路上有 3 个问题叠加：

1. **BFF 根路径 `/` 未实现**
   - 公网域名直接指向 BFF 时，访问根路径会返回 `Cannot GET /`
   - 导致 iPhone 浏览器点开后不是跳转页，而是错误页

2. **Expo Go 跳转地址存在写死/过期风险**
   - 旧跳转页里写的是历史 `exp://...` 地址
   - Expo tunnel 变化后，旧地址会失效，导致无法稳定跳转

3. **公网 tunnel 需要重新校正**
   - 线上确认依赖临时 Cloudflare Quick Tunnel
   - 旧域名可能已失效或未指向当前运行中的修复版 BFF

---

## 二、修复内容

### 1. 后端补齐根路径跳转页
- 文件：`backend/server.js`
- 新增 `GET /`
- 访问公网域名根路径时，返回跳转页面而不是 `Cannot GET /`
- 页面包含：
  - 自动跳转到 Expo Go
  - 手动“打开 Expo Go”按钮
  - 当前解析到的 Expo 地址和来源

### 2. Expo Go 链接改为运行时动态解析
- 文件：`backend/server.js`
- 新增 Expo 地址解析逻辑：
  - 优先读 `EXPO_GO_URL`
  - 否则自动扫描本机 Expo 开发端口（8081/8082/19000/19006）
  - 读取 Expo manifest，实时提取当前 `hostUri`
  - 动态生成当前可用的 `exp://...` 地址
- 这样可以避免使用过期的硬编码地址

### 3. 新增调试接口
- 文件：`backend/server.js`
- 新增 `GET /api/meta/expo-link`
- 用于检查当前解析出的 Expo Go 地址，便于线上排障和验收

### 4. 健康检查补充链路状态
- 文件：`backend/server.js`
- `GET /health` 增加：
  - `expoGoUrl`
  - `expoSource`
- 便于确认当前公网入口指向的版本是否正确

### 5. 启动脚本增强
- 文件：`scripts/start-dev.sh`
- Cloudflare tunnel 启动时增加 `--no-tls-verify`
- 启动完成后尝试自动打印当前 Expo Go URL
- 减少“服务起来了，但外链不可确认”的排障成本

---

## 三、修改文件清单

- `backend/server.js`
- `scripts/start-dev.sh`
- `SUBMISSION.md`

---

## 四、自测结果

### 本地自测
- ✅ `http://127.0.0.1:3001/` 返回跳转页 HTML，不再报错
- ✅ `http://127.0.0.1:3001/health` 返回 200
- ✅ `http://127.0.0.1:3001/api/meta/expo-link?refresh=1` 返回当前 Expo 地址
- ✅ 当前自动解析到的 Expo Go 地址：`exp://aswx_oy-ytfrank-8082.exp.direct`

### 公网自测
- ✅ 新公网域名已拉起：`https://wrapping-examined-flame-honolulu.trycloudflare.com`
- ✅ `GET /` 返回跳转页（HTTP 200）
- ✅ `GET /health` 返回 200
- ✅ `GET /api/meta/expo-link` 返回当前 Expo Go 地址

---

## 五、Guard 测试重点

请重点验证以下 4 点：

1. **iPhone 浏览器打开公网域名根路径**
   - 访问：`https://wrapping-examined-flame-honolulu.trycloudflare.com`
   - 预期：出现 VoiceBridge 跳转页，而不是 `Cannot GET /`

2. **自动跳转是否生效**
   - 预期：页面自动尝试跳转到 Expo Go

3. **手动按钮兜底是否生效**
   - 如果自动跳转失败，点击“打开 Expo Go”按钮可继续进入 Expo Go

4. **链路状态接口是否正确**
   - 访问：`https://wrapping-examined-flame-honolulu.trycloudflare.com/health`
   - 预期：返回 200，且包含 `expoGoUrl`

---

## 六、当前可用地址

- 公网入口：`https://wrapping-examined-flame-honolulu.trycloudflare.com`
- 健康检查：`https://wrapping-examined-flame-honolulu.trycloudflare.com/health`
- Expo 地址查询：`https://wrapping-examined-flame-honolulu.trycloudflare.com/api/meta/expo-link`
- 当前 Expo Go 地址：`exp://aswx_oy-ytfrank-8082.exp.direct`

---

## 七、注意事项

1. 当前公网域名仍然是 **Cloudflare Quick Tunnel 临时域名**，后续 tunnel 重建后域名会变化
2. 本次已修复“根路径报错 + 跳转地址写死”两个核心问题；后续如果要彻底稳定线上确认链路，建议升级为 **Named Tunnel / 固定公网域名**
3. Guard 开始测试后，我这边按规则冻结当前分支，不再继续 push

---

*Peter · 2026-03-31*
