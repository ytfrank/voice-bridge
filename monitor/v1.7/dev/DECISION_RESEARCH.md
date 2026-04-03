# DECISION_RESEARCH.md — voice-bridge V1.7 竞品与技术方案评估

## 0. 本文目的

回答波哥的两个核心问题：

1. **行业标杆与主流产品是什么？**
2. **如果要达到“97% 准确率 + 3s 延迟”，有哪些可选方案、成本多少、风险在哪？**

> 重要前提：本次目标场景先定义为 **手机播放音频 → 手机麦克风二次采集 → ASR → 翻译**（即马斯克视频测试场景）。

---

## 1. 先讲结论

### 1.1 当前架构的真实位置

根据本地标准音频基线（`monitor/v1.7/dev/baseline_benchmark.json`）：

- ASR Accuracy：**95.56%**
- WER：**4.44%**
- ASR 平均延迟：**7.55s**
- 翻译平均延迟：**1.69s**
- 端到端估算：**9.24s**

所以当前 `Whisper medium + GLM-4-flash + 5s chunk`：
- **未达到 97%**
- **远超 3s**
- 在线上外放场景还叠加 **空结果率高 / 幻觉 / iOS 录音循环失败**

### 1.2 更关键的事实：当前测试场景本身非常不友好

“**同机外放 + 同机录音**”在 iOS 上天然会被回声消除（AEC）和音频会话机制影响。也就是说：

- 麦克风收到的并不是“干净的原音”
- 往往是被削弱、残缺、带噪的二次采集音频
- 这会显著降低任何 ASR 的可达上限

因此：

> **即便换更强模型，也不能保证在这个场景下稳定做到 97% / 3s。**

如果业务必须支持这个场景，技术路线要从“优化模型”升级为“重新定义音频链路 + 实时架构”。

---

## 2. 竞品调研（Top 3 + 开源）

## 2.1 产品 Top 3（偏“实时语音转译”能力）

### A. Wordly
- 官网：https://wordly.ai/
- 官方描述：提供 **real-time AI translation, captions, transcripts, and summaries**
- 形态：会议/活动实时翻译，用户扫码或链接进入，读字幕/听翻译音频
- 关键特征：
  - dozens of languages
  - live captions / live translation
  - custom glossaries
  - 会议/活动场景优化
- 观察：偏 **会务/会议 SaaS**，产品完成度高，但未公开细颗粒准确率/延迟硬指标

### B. KUDO
- 官网：https://kudo.ai/
- 官方描述：**Human or AI-powered live speech translation and captions**，支持 **200 languages**
- 形态：会议、活动、远程/混合场景；既支持 AI，也支持真人同传
- 关键特征：
  - continuous, real-time speech translation
  - translated speech + captions
  - 多设备/多平台集成
- 观察：偏 **专业会议与企业级多语协作**，强调连续实时翻译，而不是 stop-and-go 式一句句翻

### C. Interprefy
- 官网：https://www.interprefy.com/ai-live-translation/
- 形态：活动/直播/会议实时 AI 翻译 + live captions
- 关键特征：
  - AI Speech Translation
  - Live Captions & Subtitles
  - 与会议/活动平台集成
- 观察：同样是 **B2B 会议/活动实时翻译** 路线，强调平台能力而非底层模型细节

## 2.2 行业标杆的共同点

这些头部产品的共同点不是“单个模型更强”，而是：

1. **不是同机外放 + 同机录音这种极端输入链路**
2. 有成熟的 **会议/活动接入方式**（原始音频流、平台集成、专门收音）
3. 采用 **实时连续翻译架构**，而不是简单 5s chunk + 句后翻译
4. 有产品级防错设计：字幕、回退、术语表、场景优化

结论：

> 头部产品的优势主要来自 **输入链路 + 实时架构 + 产品工程化**，不是只靠把 Whisper medium 换成大模型。

---

## 3. 行业标准：到底什么叫“实时”

公开市场上，厂商通常不会给出统一的 “97% / 3s” 标准；常见表达是：

- **real-time / continuous / little to no delay**
- 可展示 partial transcript / live captions
- 最终稳定输出一般在 **1~5s 量级**（依赖场景与输入质量）

### 我们对行业的实事求是判断

对于 **高质量近场音频 / 平台原始音频流**：
- **字幕首屏**：可做到 **<1s ~ 2s**（partial）
- **较稳定翻译结果**：常见落在 **2s ~ 5s**

对于 **同机外放 + 同机录音**：
- 这是更差的输入链路
- 要稳定做到 **97% 准确率 + 3s 内最终翻译**，难度显著高于普通会议场景

因此，波哥提出的目标不是不能追，但它不是“当前方案做点优化”就能到的目标，而是：

> **接近头部产品的“输入链路 + 流式架构 + 模型 + 工程”组合目标。**

---

## 4. 开源项目调研（Twitter/GitHub 方向）

### 4.1 ufal/whisper_streaming
- Repo：https://github.com/ufal/whisper_streaming
- GitHub 标题：**Whisper realtime streaming for long speech-to-text transcription and translation**
- Stars：约 **3.6k**
- 特点：
  - 针对 Whisper 做流式封装
  - 支持 translation
  - 支持 `faster-whisper`、OpenAI API、MLX 等 backend
- 价值：适合作为 **流式 Whisper 架构参考**，但不是直接可上线产品

### 4.2 ScienceIO/whisper_streaming_web
- Repo：https://github.com/ScienceIO/whisper_streaming_web
- GitHub 标题：**Whisper Streaming with Websocket and Fastapi server**
- 特点：
  - WebSocket + FastAPI
  - 浏览器/前端实时接入
  - 支持更适合产品 demo 的在线链路
- 价值：适合作为 **前后端实时交互实现参考**

### 4.3 其他值得继续盯的方向
- WhisperLive / RealtimeSTT / 流式转写 WebSocket 项目
- 重点不是“能跑 demo”，而是：
  - 是否支持 partial transcript
  - 是否支持长连接与 backpressure
  - 是否有 VAD / endpointing
  - 是否支持翻译而不是只转写

---

## 5. 方案对比（至少 4 案）

## 方案 A：维持当前架构，做止血优化

### 定义
- 继续使用本地 `Whisper medium`
- 保留当前 BFF 与翻译链路
- 修：
  - iOS 录音 session 循环失败
  - chunk 队列长尾
  - hallucination / empty result 拦截
  - 更短 chunk / 更强 VAD / 文本过滤

### 能达到什么水平（预估）
- 场景：**近场真人说话**
  - Accuracy：**95% ~ 96.5%**
  - 端到端延迟：**5s ~ 8s**
- 场景：**同机外放 + 同机录音**
  - Accuracy：**不稳定，可能 70%~95% 波动，长尾极差**
  - 幻觉率：可通过拦截下降，但不能根治

### 开发工期
- **2 ~ 4 天**

### 运行成本
- API 增量成本低（沿用现有）
- 若上 GPU 自托管：
  - Modal A10：`$0.000306/s` ≈ **$1.10/hr**
  - Modal L4：`$0.000222/s` ≈ **$0.80/hr**
- 当前 CPU 跑虽便宜，但性能明显不够

### 风险
- **大概率达不到 97% / 3s**
- 对二次采集场景提升有限
- 适合作为“先可用、先止血”，不适合作为达标方案

### 结论
- **不推荐作为目标达标方案**
- 只适合作为低成本止血版

---

## 方案 B：换更强 ASR，但仍以“非流式 / 半流式”为主

### B1. 本地 Whisper 升级（large-v3 / large-v3-turbo）

#### 定义
- 本地/自托管更强 ASR 模型
- 配合 GPU（L4 / A10 / L40S）
- 继续保留现有整体架构，尽量少改业务层

#### 预估表现
- 近场干净语音：
  - Accuracy：**96.5% ~ 98%**
  - 延迟：**4s ~ 7s**（取决于 GPU 和是否 partial）
- 同机外放 + 同机录音：
  - Accuracy：**有机会提升，但仍不稳定**
  - 本质瓶颈仍是输入链路，不是单纯模型

#### 开发工期
- **3 ~ 6 天**

#### 运行成本
- 自托管 GPU：
  - L4：约 **$0.80/hr**
  - A10：约 **$1.10/hr**
  - L40S：约 **$1.95/hr**（按 Modal `$0.000542/s` 估算）

#### 风险
- 成本上升但 **3s 仍未必达成**
- 同机二次采集场景的提升可能不成比例

#### 结论
- 可作为 **低风险中间方案**
- 但我不认为它能稳定交付 “97% + 3s” 的目标

### B2. 云端 ASR API（非完整重构）

候选：
- **Azure Speech Translation**
- **Deepgram Nova-3**
- Google / OpenAI / 其他 STT API（可继续补对比）

#### 已抓到的公开价格（官方页面）
- Azure Real-time Speech Translation：**$2.5/hr**（约 **$0.0417/min**）
- Azure Real-time STT：**$1.0/hr**（约 **$0.0167/min**）
- Deepgram Nova-3 Monolingual：约 **$0.0077/min**
- Deepgram Nova-3 Multilingual：约 **$0.0092/min**
- Google STT V2 Dynamic Batch：**$0.003/min**（但这不是实时低延迟路径，不能拿来对标 3s）

#### 预估表现
- 近场干净音频：
  - Accuracy：**96% ~ 98%+**（取决于 provider 与语种）
  - 延迟：**2.5s ~ 5s**（若只是 API 替换，不做真正流式改造）
- 同机外放 + 同机录音：
  - 比本地 medium 更有希望
  - 但仍受输入链路限制，**97% 不能承诺**

#### 开发工期
- **4 ~ 7 天**

#### 风险
- 供应商锁定
- 成本上升
- 如果只换 API、不重做流式链路，**3s 仍然危险**

#### 结论
- 比方案 A 更靠谱
- 但若目标是“硬 3s + 97%”，单纯换 API 仍不够稳

---

## 方案 C：流式 ASR 架构重构（推荐重点评估）

### 定义
- 从 5s chunk 改为 **实时流式音频**
- 前端长连接（WebSocket / WebRTC）
- 服务端增量 ASR（partial transcript）
- endpointing / VAD / backpressure / 重试 / 置信度拦截
- 翻译链路也做增量化或快速句级输出

### 推荐组合方向

#### C1. 流式云端 ASR + 快速翻译
- ASR：Azure / Deepgram / 其他低延迟流式 STT
- 翻译：轻量模型 or provider translation
- 目标：先把延迟打下来

#### C2. 流式本地 ASR + GPU
- 参考 `ufal/whisper_streaming` / `whisper_streaming_web`
- 后续再做更强优化

### 预估表现
- 近场干净音频：
  - Accuracy：**96.5% ~ 98%+**
  - partial latency：**<1s ~ 1.5s**
  - final usable translation：**2s ~ 4s**
- 同机外放 + 同机录音：
  - 能显著改善体验，但 **97% 仍取决于输入链路质量**
  - 这是唯一有机会逼近“3s 体验目标”的方案

### 开发工期
- **1.5 ~ 3 周**

### 运行成本
- 云端流式 STT：按供应商分钟/小时计费
  - Azure Speech Translation：**$2.5/hr** 量级
  - Deepgram Nova-3：**$0.0077 ~ 0.0092/min**
- 如果自建 GPU：
  - L4/A10/L40S 按小时租用

### 风险
- 改动面最大
- 要重做协议、状态机、重试、partial 合并、UI 展示
- 若继续保留“同机外放 + 同机录音”场景，仍需额外处理音频链路问题

### 结论
- **这是唯一真正有机会逼近 3s 目标的主路线**
- 但它不是 hotfix，而是 **架构升级项目**

---

## 方案 D：改变输入链路（如果业务允许，这是性价比最高的“隐形优化”）

### 定义
不是只改模型，而是改“音频怎么进来”：
- 允许从视频/音频源直接上传或接入
- 尽量避免“同机外放 + 同机录音”
- 如果是视频播放场景，优先接入原始音频流或文件流

### 预估表现
- 准确率会比当前二次采集场景明显上升
- 即便还用现有模型，也可能提升数个百分点
- 幻觉率和空结果率会显著下降

### 开发工期
- **2 ~ 7 天**（视接入方式）

### 运行成本
- 低到中
- 主要是产品与工程改造成本，不一定增加模型成本

### 风险
- 取决于业务是否接受改交互方式
- 如果波哥坚持“就是要同机外放测试过”，那此方案不能单独解决问题

### 结论
- **如果业务允许改输入链路，这是 ROI 最高的优化项之一**
- 但它需要产品侧接受“不要拿最差输入链路当主链路”

---

## 6. 四案横向对比

| 方案 | 预估准确率 | 预估延迟 | 工期 | 运行成本 | 达成 97%/3s 概率 | 风险 |
|---|---:|---:|---:|---:|---|---|
| A 当前架构止血 | 95%~96.5%（近场）；二次采集不稳 | 5~8s | 2~4天 | 低；若上GPU约 $0.8~1.1/hr | 很低 | 只能止血，无法达标 |
| B1 本地更强模型 | 96.5%~98%（近场） | 4~7s | 3~6天 | 中；GPU约 $0.8~2/hr | 低~中 | 输入链路仍是硬伤 |
| B2 云端ASR替换 | 96%~98%+（近场） | 2.5~5s | 4~7天 | 中；Deepgram $0.0077~0.0092/min，Azure $0.0417/min | 中 | 只换API不一定过3s |
| C 流式架构重构 | 96.5%~98%+（近场）；体验最佳 | partial <1.5s，final 2~4s | 1.5~3周 | 中~高 | **最高** | 改动最大，仍受输入质量限制 |
| D 改输入链路 | 对所有方案都是乘数增益 | 对所有方案都有帮助 | 2~7天 | 低~中 | 取决于是否允许改变产品形态 | 需要业务接受 |

---

## 7. 我的推荐

## 推荐结论

### 如果目标是“先尽快把产品拉回可测、可用”
做：**A + D（局部）**

- 先修稳定性与防幻觉
- 建立量化指标（WER / latency / hallucination rate）
- 明确哪些输入场景是支持的，哪些不是

适合：快速止血，低成本恢复可验证状态。

### 如果目标是“真的逼近 97% + 3s”
做：**C 为主，B2 为辅，并强烈建议评估 D**

更具体地说：
1. **流式 ASR 重构**（核心）
2. **优先接云端低延迟 ASR** 做首轮验证（比本地大模型更快拿到结论）
3. **保留输入链路优化**，不要继续默认同机外放是主验证场景

原因：
- 3s 是架构问题，不是单纯模型问题
- 97% 在坏输入链路下不是一句“换更强模型”就能保证
- 先用云端流式拿数据，最快知道目标是否可达

---

## 8. 给团队的决策建议

建议把 V1.7 从“hotfix”改成两阶段：

### Phase 1：评估与止血（短周期）
交付：
- 修当前稳定性问题
- 建完整量化评测
- 跑 2~3 个 ASR provider 对比
- 给出真实数字，不再凭体感争论

### Phase 2：达标方案（中周期）
若要追求 97% / 3s：
- 立项做流式架构升级
- 明确输入链路策略
- 决定是云端主导还是自建 GPU 主导

---

## 9. 生产可用标准：支持几十人并发意味着什么

V2.0 已不是单用户工具，而是要支持**几十人同时使用**的产品。因此评估维度必须从“模型能不能识别”升级为“系统能不能稳定承载”。

### 9.1 架构上至少需要的东西

#### 单用户方案不够的点
当前 V1.x 基本是：
- 单 BFF
- 本地 Whisper worker pool
- 以单会话排队为主
- 无明确租户隔离 / 并发调度 / 流控指标

这套设计不适合几十人生产并发，原因是：
- 一个慢请求会拖垮队列
- 无法隔离不同用户会话
- 无弹性伸缩
- 观测性不够，不知道并发下哪一步先崩

#### 生产版最少要升级为
1. **前端接入层**
   - WebSocket / WebRTC 长连接
   - 每个会话独立 session
   - 客户端断线重连与 backoff

2. **API / Session Gateway**
   - 负责认证、配额、session 管理
   - 不直接做重 ASR 运算

3. **Streaming ASR Workers**
   - 可横向扩容
   - 按会话分发，不同用户隔离
   - 支持 partial transcript / endpointing / VAD

4. **Translation Workers**
   - 与 ASR 解耦
   - 可批量或并发处理短文本

5. **Message Bus / Queue（可选但推荐）**
   - 用于高峰削峰和异步解耦
   - 至少对日志、分析、补偿任务使用

6. **Observability**
   - per-session latency
   - ASR empty rate
   - hallucination rate
   - worker queue depth
   - GPU/CPU utilization
   - P50/P95/P99 latency

7. **Rate limit / admission control**
   - 高峰期限流
   - 当系统超载时优雅降级，而不是整体失真

### 9.2 多用户下，延迟和准确率会怎么变

多用户场景下，不会只是“成本线性增加”，还会引入性能衰减：

1. **延迟增加**
- worker 被占满后，请求要排队
- 如果还是 5s chunk 模式，排队会叠加 chunk 等待，长尾更严重
- 因此多用户下应重点看 **P95/P99**，不是只看平均数

2. **准确率会间接下降**
- 当系统拥塞、buffer 抖动、chunk 丢失时，ASR 输入质量下降
- partial / final 合并处理不好，也会放大错误
- 所以并发下的准确率通常会比单用户实验室数据更差

3. **可靠性压力更大**
- 单用户能跑，不代表几十人可用
- 生产标准至少要明确：
  - availability 目标（建议先按 **99.5%~99.9%** 级别设计）
  - 单会话错误率
  - reconnect 成功率
  - 超时率 / 空结果率 / 幻觉率

### 9.3 几十人规模的粗成本模型

以下是按**连续 1 小时实时使用**做的粗估（仅语音识别/翻译主链路，不含研发人力）：

#### 云端 API 路线

| 并发人数 | Azure Speech Translation | Azure STT only | Deepgram Nova-3 Mono | Deepgram Nova-3 Multi |
|---:|---:|---:|---:|---:|
| 10 | $25.00/hr | $10.00/hr | $4.62/hr | $5.52/hr |
| 30 | $75.00/hr | $30.00/hr | $13.86/hr | $16.56/hr |
| 50 | $125.00/hr | $50.00/hr | $23.10/hr | $27.60/hr |

说明：
- Deepgram 这里按官网分钟价格线性估算
- Azure Speech Translation 价格明显更高，但它是更完整的实时 speech translation 产品线

#### 自托管 GPU 路线（粗估）

以 L4 为例，假设 1 张卡可承载 **10~20 路** 实时流（真实值要压测验证）：

| 并发人数 | L4 容量按 10 路/GPU | L4 容量按 15 路/GPU | L4 容量按 20 路/GPU |
|---:|---:|---:|---:|
| 10 | 1 GPU ≈ $0.8/hr | 1 GPU ≈ $0.8/hr | 1 GPU ≈ $0.8/hr |
| 30 | 3 GPU ≈ $2.4/hr | 2 GPU ≈ $1.6/hr | 2 GPU ≈ $1.6/hr |
| 50 | 5 GPU ≈ $4.0/hr | 4 GPU ≈ $3.2/hr | 3 GPU ≈ $2.4/hr |

但要注意：
- 这只是**裸算力成本**，不含：网关、监控、日志、备用实例、运维成本
- 如果为了更高准确率换更大模型，单卡承载会下降
- 如果要做高可用，至少还要留冗余

### 9.4 生产版推荐的可靠性指标（建议值）

在正式定目标前，建议团队至少统一这些生产指标：

- **Availability**：99.5% 起步，成熟后再冲 99.9%
- **P50 端到端延迟**：2~3s
- **P95 端到端延迟**：<5s
- **空结果率**：<2%
- **幻觉率**：<1~2%
- **会话失败率**：<1%
- **重连恢复成功率**：>95%

原因：生产系统不能只看平均数，更要看尾延迟和失败率。

---

## 10. 当前最重要的一句话

> **当前架构不是“再调一调就能到 97% / 3s”，而是需要重新选择目标场景、实时架构和 ASR 路线。**

如果一定要用“同机外放 + 同机录音”当主场景，建议不要先承诺 97% / 3s，而是先做 provider benchmark，把可达上限测出来。

同时，既然产品定位已升级为生产可用产品，就不能再以单用户 hotfix 思路推进，必须把**并发、可靠性、观测性、成本**一起纳入决策。

---

## 11. 参考来源（本轮已核对）

- Wordly 官方首页：https://wordly.ai/
- KUDO 官方首页：https://kudo.ai/
- Interprefy AI Live Translation：https://www.interprefy.com/ai-live-translation/
- Azure Speech 定价：https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/
- Google STT 定价：https://cloud.google.com/speech-to-text/pricing
- Deepgram 定价：https://deepgram.com/pricing
- Modal 定价（GPU 估算）：https://modal.com/pricing
- ufal/whisper_streaming：https://github.com/ufal/whisper_streaming
- ScienceIO/whisper_streaming_web：https://github.com/ScienceIO/whisper_streaming_web
- 当前项目 baseline：`monitor/v1.7/dev/baseline_benchmark.json`
