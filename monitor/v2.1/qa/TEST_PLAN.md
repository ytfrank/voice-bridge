# TEST_PLAN.md — Voice Bridge V2.1 Android 测试方案

**项目**: voice-bridge V2.1（安卓版）
**负责人**: Guard
**测试时间**: 2026-06-04
**风险等级**: 中高风险

---

## 1. 测试范围

### 本次测试范围
- Release APK 安装校验（sha256、签名、bundle完整性）
- Android 模拟器安装与启动 smoke
- 麦克风权限弹窗测试（允许/拒绝/恢复）
- UI 基础 Smoke（三区布局、按钮、页面导航）
- 静态代码审查（AndroidManifest.xml 权限声明、.env 安全、签名配置）

### 不在本次范围（阻塞项）
- 真机 4G/5G 完整 E2E（依赖 Atlas 恢复公网 BFF）
- 延迟 P90 < 3s 性能测试
- ASR 准确率 > 90% 验证
- 10-30分钟稳定性长时录音
- 小米 MIUI 特殊权限行为

## 2. 测试矩阵

| # | 测试项 | 类型 | 优先级 | 依赖 | 状态 |
|---|--------|------|--------|------|------|
| T1 | APK sha256 校验 | 静态 | P0 | 无 | pending |
| T2 | APK 签名校验 | 静态 | P0 | 无 | pending |
| T3 | bundle 完整性（index.android.bundle） | 静态 | P0 | 无 | pending |
| T4 | 模拟器安装 release APK | 功能 | P0 | 模拟器 | pending |
| T5 | App 启动不崩溃 | 功能 | P0 | T4 | pending |
| T6 | 不依赖 Metro/开发服务器 | 功能 | P0 | T5 | pending |
| T7 | 麦克风权限弹窗（首次点击录音） | 功能 | P0 | T5 | pending |
| T8 | 权限允许后可录音 | 功能 | P0 | T7 | pending |
| T9 | 权限拒绝后显示中文提示 | 功能 | P0 | T7 | pending |
| T10 | UI 三区布局渲染 | UI | P1 | T5 | pending |
| T11 | 历史记录页面 | UI | P1 | T5 | pending |
| T12 | AndroidManifest 权限声明 | 静态 | P0 | 无 | pending |
| T13 | .env 安全审查 | 安全 | P0 | 无 | pending |
| T14 | debug signing 风险确认 | 安全 | P1 | 无 | pending |

## 3. 降级验证策略

由于公网 BFF 不可达，采用降级验证：

**第一轮（立即可做）**: T1-T3, T12-T14（静态校验）
**第二轮（需模拟器）**: T4-T11（功能测试）
**第三轮（等 Atlas 恢复公网 BFF）**: 真机 E2E、性能、稳定性

## 4. 分工

| 执行者 | 任务 |
|--------|------|
| Guard 主线程 | TEST_PLAN产出、APK静态校验、代码审查、report产出、最终结论 |
| Sub-Agent（模拟器） | 模拟器启动、APK安装、权限测试、UI smoke |

## 5. ETA

- 静态校验（T1-T3, T12-T14）: 10分钟
- 模拟器功能测试（T4-T11）: 20分钟
- report + handoff 产出: 10分钟
- **总计: 40分钟内给出第一轮测试结论**

## 6. 未覆盖风险

| 未覆盖项 | 风险等级 | 原因 |
|---------|---------|------|
| 真机E2E完整链路 | 高 | 公网BFF不可达 |
| 延迟/准确率性能 | 高 | 依赖真机+公网 |
| 30分钟稳定性 | 中 | 依赖公网 |
| 小米MIUI特殊行为 | 中 | 需真机 |
| 正式签名验证 | 中 | 当前debug signing |

## 7. 预期结论

- 如果第一轮+第二轮全部通过 → **Conditional Pass**（条件通过：降级验证通过，待公网BFF恢复后补完整E2E）
- 如果发现 crash/权限严重缺陷 → **Fail**
