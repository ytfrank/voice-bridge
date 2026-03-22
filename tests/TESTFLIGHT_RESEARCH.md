# TestFlight 调研报告

**调研时间**：2026-03-22
**调研人**：Guard
**目的**：了解TestFlight在VoiceBridge项目中的应用场景

---

## 一、TestFlight是什么？

TestFlight是Apple官方提供的**Beta测试平台**，用于：
- 向测试人员分发iOS/iPadOS/macOS应用的测试版本
- 管理测试人员（内部/外部）
- 收集崩溃报告和用户反馈
- 支持多版本并行测试

---

## 二、核心功能

### 2.1 内部测试（Internal Testing）
- **人数限制**：最多100人
- **要求**：必须是App Store Connect团队的成员
- **审核**：无需Apple审核，立即可用
- **适用场景**：团队内部快速验证

### 2.2 外部测试（External Testing）
- **人数限制**：最多10,000人
- **要求**：只需测试人员的邮箱
- **审核**：需要Apple审核（通常1-2天）
- **适用场景**：公测、用户验收测试

### 2.3 版本管理
- 支持多Build并行
- 每个Build有独立的安装链接
- 可设置过期时间（90天）

---

## 三、在VoiceBridge项目中的应用

### 3.1 测试流程设计

```
1. Peter提交代码 → EAS Build构建IPA
   ↓
2. 自动上传到TestFlight
   ↓
3. Guard/小叮当/波哥通过TestFlight安装测试
   ↓
4. 执行E2E真机测试
   ↓
5. 收集反馈/崩溃报告
   ↓
6. 问题修复后重新构建
```

### 3.2 与Expo/EAS集成

**Expo Application Services (EAS)** 支持自动构建并上传到TestFlight：

```bash
# 安装EAS CLI
npm install -g eas-cli

# 登录Expo账号
eas login

# 配置eas.json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "production": {
      "distribution": "store",
      "ios": {
        "autoIncrement": true
      }
    }
  }
}

# 构建并上传到TestFlight
eas build --platform ios --profile preview
```

### 3.3 测试人员管理

**内部测试人员**（推荐用于VoiceBridge）：
| 角色 | 职责 | TestFlight角色 |
|------|------|---------------|
| 波哥 | 产品验收 | Internal Tester |
| 小叮当 | 技术验收 | Internal Tester |
| Guard | 质量验收 | Internal Tester（通过真机测试） |
| Peter | 开发自测 | Internal Tester |
| Atlas | 运维验证 | Internal Tester |

---

## 四、与当前测试方案的结合

### 4.1 测试环境矩阵

| 环境 | 工具 | 用途 | 证据 |
|------|------|------|------|
| API测试 | smoke_test.sh | 冒烟测试 | JSON日志 |
| E2E模拟器 | Xcode Simulator | 自动化E2E | 截图序列 |
| E2E真机 | **TestFlight** | 真实设备验证 | 录屏/截图 |
| 性能测试 | k6/locust | 性能压测 | 性能报告 |

### 4.2 推荐测试流程

```
【阶段1：冒烟测试】
smoke_test.sh → API层快速验证
↓ 不通过？直接打回

【阶段2：模拟器测试】
Xcode Simulator + Expo Go → 自动化E2E
↓ 不通过？修复后重测

【阶段3：TestFlight真机测试】
TestFlight分发 → 波哥/小叮当真机验证
↓ 不通过？修复后重新构建

【阶段4：放行】
全部通过 → 上线
```

---

## 五、TestFlight vs Expo Go 对比

| 特性 | TestFlight | Expo Go |
|------|------------|---------|
| **安装方式** | TestFlight App | Expo Go App |
| **构建要求** | 需要完整IPA构建 | 直接加载开发服务器 |
| **适用阶段** | Beta/生产验证 | 开发阶段 |
| **审核要求** | 外部测试需审核 | 无需审核 |
| **网络要求** | 可离线使用 | 需要连接开发服务器 |
| **真实度** | 接近生产环境 | 开发环境 |
| **推荐场景** | 发布前最终验证 | 日常开发迭代 |

**结论**：
- **日常开发**：用Expo Go（快速迭代）
- **发布前验证**：用TestFlight（真实环境）

---

## 六、实施步骤

### 6.1 前置条件

- [ ] Apple Developer账号（$99/年）
- [ ] App Store Connect配置
- [ ] EAS Build配置
- [ ] TestFlight App已安装（波哥已安装✅）

### 6.2 配置步骤

```bash
# 1. 配置App Store Connect API Key
eas credentials

# 2. 配置eas.json
# （见上文）

# 3. 首次构建
eas build --platform ios --profile preview

# 4. 等待构建完成（约10-15分钟）

# 5. 在TestFlight中查看并安装
```

### 6.3 测试人员邀请

1. 登录 App Store Connect
2. 进入 TestFlight → App
3. 添加内部测试人员（输入邮箱）
4. 测试人员收到邀请邮件
5. 在TestFlight App中接受并安装

---

## 七、自动化测试可能性

### 7.1 可行的自动化方案

| 方案 | 工具 | 自动化程度 |
|------|------|-----------|
| UI自动化 | XCUITest | ⭐⭐⭐⭐ |
| 截图自动化 | Fastlane Snapshot | ⭐⭐⭐⭐ |
| 崩溃监控 | Crashlytics | ⭐⭐⭐⭐⭐ |
| 性能监控 | Xcode Instruments | ⭐⭐⭐ |

### 7.2 推荐工具链

```
EAS Build → TestFlight → XCUITest → 截图 → 报告
```

---

## 八、成本评估

| 项目 | 成本 |
|------|------|
| Apple Developer账号 | $99/年 |
| EAS Build（免费额度） | 30次/月 |
| EAS Build（付费） | $29/月起 |
| TestFlight | 免费 |

**建议**：先用免费额度，超出后再考虑付费。

---

## 九、下一步行动

1. [ ] 等Xcode安装完成
2. [ ] 配置Apple Developer账号（如已有）
3. [ ] 配置EAS Build
4. [ ] 构建第一个TestFlight版本
5. [ ] 邀请测试人员
6. [ ] 执行真机E2E测试

---

## 十、总结

**TestFlight的价值**：
- 真实设备验证（非模拟器）
- 接近生产环境
- 崩溃报告自动收集
- 多测试人员并行

**推荐使用场景**：
- 发布前的最终真机验证
- 波哥/小叮当的产品验收
- 真实网络环境测试

**与当前测试方案的结合**：
- 冒烟测试（API） → 模拟器测试 → **TestFlight真机测试** → 放行

---

*调研人：Guard*
*调研时间：2026-03-22 09:40*
