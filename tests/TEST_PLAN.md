# 测试方案 - iOS 上传 TLS -1200 错误修复

**制定时间**：2026-03-19 02:45 GMT+8  
**制定人**：Guard  
**需求文档**：`REQUIREMENTS_2026-03-19_TLS_UPLOAD_FIX.md`

---

## 一、测试目标

- iOS 端上传稳定成功（连续 3 次）
- 不出现 `NSURLErrorDomain Code=-1200`
- HTTPS 域名证书在 Safari 可正常访问
- 失败时有可读错误 + 重试入口

---

## 二、测试范围

### P0 必测
1. **HTTPS 证书验证**（Safari 访问域名，证书受信任）
2. **iOS 真机上传 3 次**（连续三次上传音频成功）
3. **失败重试**（断网/错误后可重试至少 1 次）

### P1 可选
1. 上传前 URL 校验提示
2. 错误提示文案友好性

---

## 三、测试环境与准备

- iOS 真机（Expo Go）
- 稳定 HTTPS 域名（Cloudflare Tunnel/Ngrok/自有域名）
- Safari 访问 HTTPS 域名
- 音频录制与上传功能可用

---

## 四、测试用例

### 4.1 Safari HTTPS 证书验证
- **步骤**：Safari 打开上传域名
- **预期**：无证书警告，页面正常加载

### 4.2 iOS 真机上传 3 次
- **步骤**：
  1. iOS 端录音 → 上传
  2. 连续上传 3 次
- **预期**：3 次均成功，无 TLS 错误

### 4.3 失败重试验证
- **步骤**：
  1. 断网/错误条件触发上传失败
  2. 点击重试
- **预期**：可重试成功，错误提示明确

---

## 五、测试输出

- 测试报告：`~/projects/voice-bridge/tests/report.md`
- 截图/录屏：`~/projects/voice-bridge/tests/screenshots/`

---

## 六、验收标准

- [ ] iOS 连续上传 3 次成功
- [ ] 无 `NSURLErrorDomain -1200`
- [ ] Safari HTTPS 证书正常
- [ ] 失败重试可用且提示明确

---

<at user_id="ou_4d31c88faf9520be0328f5f8b824fdbd">小叮当</at> <at user_id="ou_2da7ac7320482693e5b6ad679159c3bd">Peter</at> 请确认测试方案，有遗漏直接群里说。
