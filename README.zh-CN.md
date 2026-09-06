# Flux Evidence Lab

[English](README.md) | **简体中文**

**面向 AI 辅助金融决策的可验证证据与审计基础设施。**

Flux Evidence Lab 是一个面向 AIx Origin Summit Flux 赛道的 BTC 研究与决策审计原型。它把公开或离线证据连接到确定性的特征转换、版本化概率模型、确定性风险控制、本地 Paper 模拟，以及可被独立验证的审计产物。

> **这不是一个真实交易系统。**
>
> 公开证据 + 仅 Paper 模拟 · 不连接交易所 · 不连接钱包 · 不使用真实资金

![Flux Evidence Lab 评审控制台](promo/agent-ui/dashboard-full.png)

## 为什么要做这个项目

对于研究者或风控审核者来说，一个 `BUY`、`HOLD` 或 `SELL` 标签本身远远不够。真正重要的问题是：这个结果能否从原始证据一路追溯到模型输入、风险决策、模拟结果，以及运行后的完整性校验。

Flux Evidence Lab 把这条链路明确呈现出来：

```text
证据 → 决策 → 风控 → 结果 → 验证
```

本项目并不声称演示模型能够预测市场或产生收益。它的目标是让 AI 辅助金融决策变得**可追溯、可解释、可复现、可独立审查**。

## 核心架构

```text
公开 / 离线证据
        ↓
确定性、白名单化的特征转换
        ↓
btc-multinomial-logit@1.0.0
        ↓
候选 BUY / HOLD / SELL
        ↓
btc-paper-risk@1.1.0 确定性否决层
        ↓
本地 Paper 订单或 NOT_CREATED
        ↓
SHA-256 哈希链 + 临时 Ed25519 签名
        ↓
独立验证路径与篡改检测
```

系统的职责边界是刻意拆分的：

- **模型负责提出建议。** 透明的多项逻辑回归模型直接输出候选动作、类别概率，以及每个特征对结果的贡献。
- **风控负责最终决定。** 确定性的 Paper 风控层拥有最终决策权，即使模型候选为 `BUY` 或 `SELL`，它仍可以返回 `HOLD`。
- **Paper 层负责模拟。** 订单、余额、仓位和成交都只是本地演示记录，不存在任何外部下单通道。
- **验证器负责检查。** 验证器会重新执行证据标准化、模型推理、风险评估、订单构造、四步哈希链和 Ed25519 签名验证。

更详细的组件图与信任边界说明见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) 和 [`docs/architecture-diagram.svg`](docs/architecture-diagram.svg)。

## 工作流程

1. 证据首先会被标准化，包含来源、分类、观测时间以及稳定的 `research_id`。
2. 当运行 `public-btc-live` 时，系统会读取四个无需 API Key 的公开数据源：CoinLore、Coin Metrics Community、Alternative.me，以及 GitHub `bitcoin/bitcoin`。数据获取时间与来源时间会被分别保留；响应不会被缓存或写入磁盘。
3. 版本化模型会把 8 个经过边界约束的特征映射为 `BUY` / `HOLD` / `SELL` 概率及因子贡献。模型参数是透明的演示参数，不代表模型具备真实准确率、校准能力或盈利能力。
4. `btc-paper-risk@1.1.0` 会检查：是否为 Paper-only 模式、各指标时效性、未来时间证据、特征覆盖率、公开数据源健康状态、参考价格绑定、模型置信度、订单名义金额、仓位、库存以及单日订单限制。
5. 如果一个可执行决策通过全部风控检查，就会创建本地 `SIMULATED_ACCEPTED` 订单；如果结果为 `HOLD` 或被风控否决，则生成 `NOT_CREATED`。整个系统不存在交易所或钱包操作。
6. `evidence → model → risk → order` 四段载荷共享同一个 `decision_id`，组成 SHA-256 哈希链，并由运行时临时生成的 Ed25519 密钥签名。私钥不会被写入审计产物。

## 演示场景

| 场景 | 输入 | 展示内容 |
| --- | --- | --- |
| `offline-constructive` | 固定合成数据 | 新鲜证据、模型候选、风控通过、本地 Paper 订单 |
| `stale-evidence` | 固定合成数据 | 触发 `EVIDENCE_FRESHNESS` 否决；模型候选仍可见，但不会创建订单 |
| `risk-limit` | 固定合成数据 | 触发 `ORDER_NOTIONAL_LIMIT` 否决；最终动作回退为 `HOLD` |
| `public-btc-live` | 四个实时、无需 API Key 的公开 HTTPS 数据源 | 请求时刻的真实公开证据，并显式展示来源状态与时间语义 |
| `local-8790` | 可选本地只读服务 | 未验证、仅供审阅的输入；绝不是核心依赖，也不是可执行 Paper 路径 |

前三个离线场景构成可复现的基准。公开数据源的可用性、价格、时间戳、概率和动作可能随运行时间变化，因此必须按实际观测结果报告。如果公开数据源失败，应用会直接暴露失败状态，而不会偷偷替换为合成数据。

## 快速开始

环境要求：Node.js `>=20.11.0`（推荐 Node.js 24）。运行离线基准不需要数据库、API Key、钱包、交易所账户或 `.env` 文件。

```powershell
cd app
npm ci
npm run check
npm test
npm start
```

打开服务输出的本地地址，通常是 [http://127.0.0.1:8810](http://127.0.0.1:8810)。服务只绑定到 `127.0.0.1`。如果要使用其他端口：

```powershell
$env:PORT = '8811'
npm start
```

在 UI 中，评审者可以运行不同场景，查看 `research_id` 与 `decision_id`，检查证据和风险规则，重新验证审计产物，执行内存中的篡改测试，查看 JSON，并下载报告。

## 验证机制

本地 API 提供：

- `GET /api/health`
- `GET /api/scenarios`
- `GET /api/model-card`
- `POST /api/run`
- `GET /api/reports/:id`
- `POST /api/verify`

要演示离线验证链路，可以运行 `offline-constructive`，点击 **验证原件**，然后点击 **篡改副本测试**。原始报告应该通过验证，而修改后的安全字段应该被拒绝。自动化测试覆盖相同的契约，也包括重新构造哈希链、重新签名等试图绕过公开转换、数据源健康、参考价格或 Paper-only 检查的攻击方式。

这里的“完整性”含义是有限的。SHA-256 和 Ed25519 可以检测证据被采集并签名之后发生的修改，但它们**不能证明上游数据一定真实、模型一定正确、策略一定盈利、签名者具有长期身份，或时间戳来自可信时间服务**。

无需联网，也可以验证仓库中已经提交的审计示例：

```powershell
node tools/review-evidence.mjs --verify-examples
```

字段级审计映射见 [`docs/AUDIT_REPORT_SAMPLE.md`](docs/AUDIT_REPORT_SAMPLE.md)，生成的审计产物见 [`examples/`](examples/)。

## 安全与合规边界

本项目仅用于竞赛演示、软件研究和 Paper 决策审查。它不是券商、交易所、投资顾问、托管机构、钱包或真实交易执行服务。

- 不连接交易所
- 不连接钱包
- 不使用账户凭证或真实资金
- 不存在外部订单路由
- 不提供真实交易模式
- 不宣称投资收益、模型表现或准确率
- 不支持隐式做空；Paper `SELL` 必须有模拟库存

`public-btc-live` 使用真实公开输入，但执行始终保持为模拟。“Paper-only”描述的是账户、订单、仓位和成交的边界，并不意味着把公开市场数据重新定义成合成数据。完整的数据、网络、跨境与责任边界见 [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md)。

## 仓库结构

```text
app/
├─ server.js                 # 本地 HTTP API 与静态评审控制台服务
├─ public/                   # 评审控制台
├─ src/adapters/             # BTC 公开只读数据适配器
├─ src/core/                 # 证据、模型链路、风控、哈希链、签名、验证
├─ model/                    # 冻结的透明模型产物
├─ fixtures/                 # 可复现离线场景
└─ test/                     # Node 原生测试
docs/                        # 架构、合规、演示、测试、提交说明
examples/                    # 已提交、可独立验证的审计示例
promo/agent-ui/              # 评审控制台代表性截图
promo/COPY_DECK.md           # 竞赛与路演文案
tools/                       # 审计检查与便携交付工具
```

## 源代码仓库与便携交付包

这个仓库是**源代码仓库**。Windows 便携交付 ZIP 是另一个独立交付产物。完整的中文现场说明保留在 [`README.portable.zh-CN.md`](README.portable.zh-CN.md)。

源代码检出版本有意不包含：

- `runtime/node.exe` 和便携运行时目录；
- 生成的 `promo/offline-kit/` PDF、PNG 与打印 ZIP；
- 缓存、日志、`node_modules/`、覆盖率文件和本地输出。

原始 [`manifest.sha256`](manifest.sha256) 被保留下来，作为经过验证的便携交付 ZIP 的来源证明。它描述的是那个便携产物，而不是当前源代码检出版本；因此，正常从 GitHub clone 下来的仓库**不应该被预期能够匹配或通过便携包 manifest 校验**。根目录下的 `.cmd` 启动器和 `tools/*.ps1` 辅助脚本同样面向包含对应 runtime 与 manifest 的完整便携交付包。对于源码检出版本，请使用上面的 Node.js 命令运行。

历史 Windows x64 便携候选版本的测试结果仍保留在 [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md) 和 [`docs/SUBMISSION.md`](docs/SUBMISSION.md) 中，作为外部证据。该候选 ZIP、其内置 Node 运行时以及 `promo/offline-kit/` 均不属于当前源码检出内容；当前源码测试结果会单独记录，不应与历史交付包结果混淆。

## 竞赛背景

本项目定位为**可验证 AI 推理 / 量化因子基础设施**，并辅以 AI × Fintech 决策闭环。仓库中包含演示脚本、测试计划/报告、竞赛要求矩阵、已有工作披露和第三方声明：

- [`docs/DEMO_SCRIPT_3MIN.md`](docs/DEMO_SCRIPT_3MIN.md)
- [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md)
- [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md)
- [`docs/COMPETITION_REQUIREMENTS_MATRIX.md`](docs/COMPETITION_REQUIREMENTS_MATRIX.md)
- [`docs/PRIOR_WORK_DISCLOSURE.md`](docs/PRIOR_WORK_DISCLOSURE.md)
- [`docs/THIRD_PARTY_NOTICES.md`](docs/THIRD_PARTY_NOTICES.md)
- [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md)
- [`docs/AUDIT_REPORT_SAMPLE.md`](docs/AUDIT_REPORT_SAMPLE.md)
- [`docs/ATTRIBUTION.md`](docs/ATTRIBUTION.md)
- [`docs/TEAM_CONFIRMATION_REQUIRED.md`](docs/TEAM_CONFIRMATION_REQUIRED.md)

官方规则版本、提交平台细节、视频、彩排证据、跨境/供应商审查、赛期新增比例 `>=70%` 的计算、最终许可证批准，以及外部提交授权仍属于需要团队确认的 `TBD` 项。技术测试结果不能被表述为模型性能证明，也不能被表述为竞赛提交已完成的证明。

## 许可证

**在团队做出明确决定前，本项目为 UNLICENSED。** 未经团队授权，不会擅自添加 MIT、Apache-2.0 或其他项目许可证。详见 [`docs/LICENSE-DECISION.md`](docs/LICENSE-DECISION.md)。
