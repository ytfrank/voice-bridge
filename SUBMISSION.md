# 提测报告 — iOS TLS 上传失败修复

**提测时间**：2026-03-19 11:32  
**提测人**：Peter  
**分支**：main  
**最新 Commit**：`d470e9d`  

---

## 一、改动说明

### 问题根因
iOS 端上传音频报错 `NSURLErrorDomain Code=-1200`（TLS 握手失败），原因是：
1. Cloudflare Quick Tunnel 已失效（URL 不可复用）
2. BFF 未运行
3. 端口错配（.env 配置 3002，cloudflared 指向 3001）

### 修复内容

| 改动 | 文件 | 说明 |
|------|------|------|
| 统一端口为 3001 | `.env` + `backend/.env` | 消除端口错配 |
| 重建 Cloudflare Tunnel | `.env` | 新 URL: `miami-enlarge-records-variety.trycloudflare.com` |
| 上传失败重试 1 次 | `services/transcriptionService.ts` | 1s 间隔重试，覆盖瞬态 TLS/网络错误 |
| 新增启动脚本 | `scripts/start-dev.sh` | 一键启动 BFF + Tunnel，自动更新 .env |

---

## 二、修改文件清单

| 文件 | 改动类型 | 改动原因 |
|------|---------|---------|
| `.env` | 修改 | BFF_PORT 3002→3001，更新隧道 URL |
| `backend/.env` | 修改 | BFF_PORT 3002→3001 |
| `services/transcriptionService.ts` | 修改 | 增加 1 次重试逻辑 |
| `scripts/start-dev.sh` | 新增 | 一键启动脚本，防止进程/端口混乱 |

---

## 三、自测结论

- ✅ TypeScript 编译零错误（transcriptionService.ts）
- ✅ BFF 在 3001 端口正常启动，健康检查 200
- ✅ Cloudflare Tunnel 正常运行，HTTPS 域名可访问
- ✅ `/health` 接口通过 HTTPS 返回 200
- ✅ `/api/translate` 接口通过 HTTPS 正常翻译
- ✅ 代码已 push 到 GitHub main 分支

---

## 四、测试重点（Guard 请关注）

1. **iOS 端上传测试**：在 Expo Go 中录音，确认上传不再报 TLS -1200 错误
2. **连续上传**：至少连续 3 次上传均成功
3. **HTTPS 验证**：在 Safari 打开 `https://miami-enlarge-records-variety.trycloudflare.com/health` 确认可访问
4. **重试逻辑**：可模拟网络不稳定（开关飞行模式），观察是否自动重试
5. **回归测试**：录音→ASR→翻译→生词 全流程是否正常

---

## 五、环境要求

- BFF 和 Cloudflare Tunnel 需要在测试期间保持运行
- 当前隧道 URL：`https://miami-enlarge-records-variety.trycloudflare.com`
- 如隧道失效，运行 `bash scripts/start-dev.sh` 重建

---

## 六、注意事项

- Quick Tunnel 是临时隧道，长时间不活跃可能失效（P2 长期方案：迁移到 Named Tunnel 或云部署）
- .env 文件已加入 git（之前被 .gitignore 忽略，本次用 -f 强制添加以保证远程代码可用）

---

*Peter · 2026-03-19*
