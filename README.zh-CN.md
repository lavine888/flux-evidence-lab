<div align="center">

# 🔎 Flux Evidence Lab

### 不只是相信 AI 的决策，而是验证它。

**面向 AI 辅助金融决策的可验证证据与审计层。**

`证据 → 模型 → 风控 → Paper 决策 → 密码学验证`

**Built for AIx Origin Summit · Flux Track**

[English](README.md) · [系统架构](docs/ARCHITECTURE.md) · [3 分钟演示稿](docs/DEMO_SCRIPT_3MIN.md) · [审计样例](docs/AUDIT_REPORT_SAMPLE.md)

</div>

> **从设计上就是 Paper-only。** 不连接交易所、不连接钱包、不使用真实资金、不进行真实执行。

<p align="center">
  <img src="promo/agent-ui/dashboard-full.png" alt="Flux Evidence Lab 评审控制台" width="100%" />
</p>

## 我们在解决什么问题

AI 可以在几秒钟内给出一个金融决策，但真正负责审核的人仍然需要回答更难的问题：

- 这个决策来自哪些证据？
- 原始证据是如何变成模型输入的？
- 风控有没有改变模型的建议？
- 系统最终有没有真的生成订单记录？
- 运行结果之后有没有被修改过？

大多数 Demo 只展示**答案**。

**Flux Evidence Lab 保留完整的决策轨迹。**

## Flux Evidence Lab 做了什么

Flux Evidence Lab 把一次 BTC 研究决策变成一个可以重放、可以核验的审计产物：

```text
公开 / 离线证据
        ↓
确定性的特征转换
        ↓
版本化概率模型
        ↓
候选 BUY / HOLD / SELL
        ↓
确定性风控否决
        ↓
本地 Paper 结果
        ↓
SHA-256 哈希链 + Ed25519 签名
        ↓
独立验证 + 篡改检测
```

系统的职责边界被刻意拆开：

- **模型负责提出建议。** `btc-multinomial-logit@1.0.0` 输出候选动作、类别概率和每个特征的贡献。
- **风控负责最终决定。** `btc-paper-risk@1.1.0` 拥有最终决策权，即使模型给出 `BUY` 或 `SELL`，风控仍然可以将最终结果改为 `HOLD`。
- **Paper 层负责模拟。** 订单、余额、仓位和成交都只是本地演示记录。
- **验证器负责检查。** 独立验证路径会重新执行证据标准化、模型推理、风险评估、订单构造、哈希链和签名验证。

## 它和普通 AI Trading Demo 有什么不同

| 普通 AI Trading Demo | Flux Evidence Lab |
| --- | --- |
| 展示一个推荐结果 | 保留完整证据链 |
| 模型输出就是最终答案 | 模型提议，风控决定 |
| 很难完整复现 | 提供确定性的离线基准 |
| 结果可以事后修改 | 生成带签名的审计产物 |
| 验证依赖前端显示 | 提供独立验证器 |
| 容易让人误以为可真实执行 | 强制 Paper-only 边界 |

本项目**不声称**演示模型能够预测市场、不声称完成了真实校准，也不声称可以产生收益。这个原型真正验证的是：决策是否可追溯、可复现、风控是否明确，以及运行后是否可以检查完整性。

## 核心 Demo：验证、篡改、拒绝

最快理解这个项目的方法，是直接跑离线基准：

1. 运行 `offline-constructive`。
2. 生成一个带签名的决策审计产物。
3. 点击 **验证原件** → 原始产物应该验证通过。
4. 点击 **篡改副本测试**。
5. 再次验证 → 修改后的产物应该被拒绝。

验证器检查的是完整的决策路径，而不只是前端页面上的一个“验证通过”状态。

这里的“完整性”含义是有限的：SHA-256 和 Ed25519 可以检测证据被采集并签名之后发生的修改，但它们**不能证明上游数据一定真实、模型一定正确、策略一定盈利、签名者具有持续的现实身份，或时间戳来自可信时间服务**。

## 系统架构

<p align="center">
  <img src="docs/architecture-diagram.svg" alt="Flux Evidence Lab 系统架构" width="100%" />
</p>

同一个 `decision_id` 会把 `evidence → model → risk → order` 四段载荷绑定成一条 SHA-256 哈希链。最终审计产物由运行时临时生成的 Ed25519 密钥签名，私钥不会写入产物中。

更完整的组件边界和信任假设见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 证据与决策流程

1. 证据首先会被标准化，包含来源、分类、观测时间，以及稳定的 `research_id`。
2. `public-btc-live` 可以读取四个无需 API Key 的公开数据源：CoinLore、Coin Metrics Community、Alternative.me，以及 GitHub `bitcoin/bitcoin`。
3. 8 个经过边界约束的特征会被映射为 `BUY` / `HOLD` / `SELL` 概率和特征贡献。
4. 风控层会检查 Paper-only 模式、证据时效性、未来时间证据、特征覆盖率、数据源健康状态、参考价格绑定、模型置信度、订单金额、仓位、库存，以及单日订单限制。
5. 通过风控的可执行决策会生成本地 `SIMULATED_ACCEPTED` 记录；如果结果为 `HOLD` 或被风控否决，则生成 `NOT_CREATED`。
6. 最终审计产物可以被重放并独立验证。

对于实时公开数据，系统会分别保留“获取时间”和“数据源时间”。公开源失败时，系统不会静默替换为合成数据。

## 演示场景

| 场景 | 输入 | 展示内容 |
| --- | --- | --- |
| `offline-constructive` | 固定合成数据 | 新鲜证据、模型候选、风控通过、本地 Paper 订单 |
| `stale-evidence` | 固定合成数据 | 触发 `EVIDENCE_FRESHNESS` 否决；候选仍可见，但不会创建订单 |
| `risk-limit` | 固定合成数据 | 触发 `ORDER_NOTIONAL_LIMIT` 否决；最终结果回退为 `HOLD` |
| `public-btc-live` | 四个无需 API Key 的公开 HTTPS 数据源 | 请求时刻的真实公开证据、来源状态和时间语义 |
| `local-8790` | 可选本地只读服务 | 仅供审阅的输入；不是核心依赖，也不是可执行 Paper 路径 |

前三个离线场景构成可复现的基准。实时公开数据源的价格、时间戳、概率、可用性和最终动作都可能随运行时间变化。

## 快速开始

**环境要求：** Node.js `>=20.11.0`（推荐 Node.js 24）。

运行离线基准不需要数据库、API Key、钱包、交易所账户或 `.env` 文件。

```powershell
cd app
npm ci
npm run check
npm test
npm start
```

打开服务打印出的本地地址，通常是：

```text
http://127.0.0.1:8810
```

如果要使用其他端口：

```powershell
$env:PORT = '8811'
npm start
```

在 UI 中，评审者可以运行不同场景、查看 `research_id` 与 `decision_id`、检查证据和风险规则、重新验证审计产物、执行内存中的篡改测试、查看 JSON，并下载报告。

## 离线验证

无需联网，也可以验证仓库中已经提交的审计样例：

```powershell
node tools/review-evidence.mjs --verify-examples
```

本地 API 提供：

```text
GET  /api/health
GET  /api/scenarios
GET  /api/model-card
POST /api/run
GET  /api/reports/:id
POST /api/verify
```

字段级审计映射见 [docs/AUDIT_REPORT_SAMPLE.md](docs/AUDIT_REPORT_SAMPLE.md)，已经提交的验证产物见 [examples/](examples/)。

## 安全与合规边界

这个仓库用于比赛展示和软件研究。它**不是**券商、交易所、投资顾问、托管服务、钱包或真实执行系统。

- 不连接交易所
- 不连接钱包
- 不使用账户凭证或真实资金
- 不存在外部下单通道
- 不存在真实执行模式
- 不作投资收益、模型表现或准确率承诺
- 不支持隐式做空；Paper `SELL` 必须有模拟库存

`public-btc-live` 使用真实公开数据，但执行仍然完全是模拟的。这里的 “Paper-only” 描述的是账户、订单、仓位和成交边界，并不意味着公开市场数据会被重新标记为合成数据。

完整的数据、网络、跨境和责任边界见 [docs/COMPLIANCE.md](docs/COMPLIANCE.md)。

## 仓库结构

```text
app/
├─ server.js                 # 本地 HTTP API + 控制台服务
├─ public/                   # 评审控制台
├─ src/adapters/             # BTC 公开只读数据适配器
├─ src/core/                 # 证据、模型、风控、哈希链、签名、验证
├─ model/                    # 冻结的透明模型产物
├─ fixtures/                 # 可复现离线场景
└─ test/                     # Node 原生测试

docs/                        # 架构、合规、测试、Demo、提交材料
examples/                    # 已提交、可独立验证的审计样例
promo/agent-ui/              # 评审控制台截图
tools/                       # 审计检查与便携交付辅助工具
```

## 文档入口

- [系统架构](docs/ARCHITECTURE.md)
- [3 分钟演示稿](docs/DEMO_SCRIPT_3MIN.md)
- [审计报告样例](docs/AUDIT_REPORT_SAMPLE.md)
- [测试计划](docs/TEST_PLAN.md)
- [测试报告](docs/TEST_REPORT.md)
- [合规边界](docs/COMPLIANCE.md)
- [比赛要求矩阵](docs/COMPETITION_REQUIREMENTS_MATRIX.md)
- [赛前已有工作披露](docs/PRIOR_WORK_DISCLOSURE.md)
- [第三方声明](docs/THIRD_PARTY_NOTICES.md)
- [提交说明](docs/SUBMISSION.md)

## 源码仓库与便携交付包

这个 GitHub 仓库是**源码仓库**。历史 Windows 便携交付包属于独立交付产物，其中可能包含打包后的运行时和离线材料，这些内容被有意排除在当前源码仓库之外。

仓库保留的 [manifest.sha256](manifest.sha256) 用于记录该便携交付物的来源信息，因此普通 GitHub 源码 checkout 不应被期待与便携包 manifest 完全一致。当前源码测试结果和历史便携候选包测试结果应被视为两组独立证据。

## License

**UNLICENSED，等待团队明确决定。** 在没有团队授权前，项目没有擅自添加 MIT、Apache-2.0 或其他许可证。详见 [docs/LICENSE-DECISION.md](docs/LICENSE-DECISION.md)。
