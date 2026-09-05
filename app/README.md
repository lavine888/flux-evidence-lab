# Flux Evidence Lab：BTC 可验证决策 Agent

面向 AIx Origin Summit Flux 赛道的 **BTC Paper-only 研究、推理、风控与审计原型**。系统可以把现场抓取的 BTC 公开数据或内置合成测试证据转换为版本化模型的候选动作，再交给确定性风控决定是否允许生成模拟订单；整个过程由统一 `decision_id`、SHA-256 步骤哈希链和 Ed25519 签名串联。

> 本项目不连接交易所、不接触真实资金、不持有钱包私钥，也不提供实盘下单能力。模型和示例数据不代表历史或未来收益，不构成投资、交易、法律或税务建议。

## 一眼看懂

```text
真实公开数据 / 合成测试证据
      ↓
版本化概率模型（直接产生 BUY / HOLD / SELL 候选动作）
      ↓
确定性 Paper 风控（最终否决权）
      ↓
仅本地模拟订单或不创建订单
      ↓
统一 decision_id + 哈希链 + Ed25519 签名 + 离线验证
```

系统当前只支持 `BTC-USD`。三个离线场景无需 API Key 或网络，便于评委在干净环境中复现；`public-btc-live` 每次运行直接读取 CoinLore、Coin Metrics Community、Alternative.me 和 GitHub 的免 Key 公开接口。

## 目标用户与工作场景

主要用户不是散户交易者，而是需要复核数字资产模型决策的研究员、模型风险/风控人员；次要用户是审计、合规和工程复核人员。典型工作包括 Paper 研究、模型变更复核、异常事件回放和证据审计。产品价值是让一条候选动作能够对应到输入证据、模型版本、风险规则和完整性结果，而不是代替用户做真实资金投资决定。

评委控制台是比赛评审界面，不应被误写为面向公众的交易产品。真实用户访谈、采用意向和效率提升数据尚未完成，相关结论均为 `TBD`。

## 为什么 AI 是实质承重环节

核心推理不是装饰性摘要。`btc-multinomial-logit@1.0.0` 是一个透明、冻结、版本化的多项逻辑回归推理资产：

- 八个基本面、市场和风险特征进入模型；
- 模型输出 `BUY`、`HOLD`、`SELL` 三类概率及逐因子贡献；
- 最高概率类别直接成为 `candidate_action`；
- 删除或绕过模型就无法产生候选动作，后续风控和模拟订单也无法继续；
- 确定性风控不替代模型，而是在模型动作之上执行证据新鲜度、置信度、名义金额、仓位、库存和频率限制，并保留最终否决权。

该模型是比赛演示参数，不声称经过可获利训练，也不声称具备预测收益。透明系数和完整贡献记录用于让评委检查“模型为何得到这个动作”。模型卡位于 [`model/btc-multinomial-logit-v1.mjs`](model/btc-multinomial-logit-v1.mjs)。

当前模型不是生成式 LLM，因此没有文本生成幻觉路径；这不等于输出不会错。上游数据错误、不同源时点偏差、缺失特征零填充、演示参数偏差、错误分类、概率未校准和分布漂移都可能造成不适当候选动作。项目尚未完成预测准确率、概率校准、漂移或盈利性验证；软件测试通过率不能被解释为模型有效性证明。

## Paper-only 安全边界

- **Paper-only 只描述执行边界，不表示输入行情是模拟的。** `public-btc-live` 的价格和指标来自运行当刻的公开接口，但订单、余额、仓位和成交始终是本地模拟。
- 执行模式只接受 `PAPER` 或 `PAPER_SIMULATION`；其他模式由 `PAPER_ONLY_MODE` 规则阻断。
- 项目没有交易所下单适配器、钱包连接器或真实资金路径。
- 模拟订单明确标注 `external_route: DISABLED` 和 `real_funds: false`。
- 不允许做空；卖出候选动作必须通过 Paper BTC 库存检查。
- 风控失败时最终动作回落为 `HOLD`，且不创建模拟订单。
- Ed25519 私钥只在进程内临时生成，不写入审计产物；产物只包含验签所需公钥。
- 人工选择场景并点击运行后，模型和风控自动形成本地 Paper 结果；当前没有实盘动作，也没有可被描述成“实盘前人工批准”的确认功能。任何未来 Live 集成都必须另设独立人工批准，且不属于本提交。

完整约束见 [`../docs/COMPLIANCE.md`](../docs/COMPLIANCE.md)。

## 快速启动

### 环境要求

- Node.js `>=20.11.0`，推荐使用 Node.js 24；
- 源码 checkout 不需要 PowerShell；根目录 PowerShell 辅助脚本只服务于完整便携 handoff；
- 不需要安装数据库，不需要任何 `.env` 或交易所凭据。

### 运行

在本目录执行：

```powershell
npm test
npm start
```

浏览器打开 [http://localhost:8810](http://localhost:8810)。控制台提供三个离线测试场景、`public-btc-live` 真实公开数据场景和可选的本地 `8790` 多源研究场景。公开场景需要网络但不需要 API Key；任一接口失败都会显式展示，不会用合成数据伪装成功。`local-8790` 仅为未验证的 review-only 输入，不会生成可执行 Paper 订单；离线三场景不受外部接口状态影响。

如端口被占用，可设置 `PORT` 后再启动：

```powershell
$env:PORT = '8811'
npm start
```

服务停止后可以移除当前 PowerShell 会话中的变量：

```powershell
Remove-Item Env:PORT -ErrorAction SilentlyContinue
```

## 评委建议验证路径

1. 运行 `npm test`，确认核心推理、风险否决、哈希链、签名和篡改检测测试通过。
2. 运行 `npm start`，打开评委控制台。
3. 选择“真实公开数据（免 Key）”，确认四个来源各自显示抓取时间、源数据时间和状态；注意价格快照、日线指标和代码仓库更新不共用同一频率。
4. 选择“离线建设性”并运行，查看模型概率、因子贡献、风险规则和模拟结果。
5. 复制 `decision_id`，确认各阶段均使用同一标识。
6. 点击“离线重新验证”，确认哈希链和 Ed25519 签名通过。
7. 运行“证据过期阻断”或“超限阻断”，确认模型候选动作被风控否决且没有模拟订单。
8. 下载审计 JSON，修改任一被签名字段后重新验证；验证必须失败。

连续演示台词和时间分配见 [`../docs/DEMO_SCRIPT_3MIN.md`](../docs/DEMO_SCRIPT_3MIN.md)。

## 比赛要求对齐

逐项状态、证据和人工确认点见 [`../docs/COMPETITION_REQUIREMENTS_MATRIX.md`](../docs/COMPETITION_REQUIREMENTS_MATRIX.md)。当前已从未锁定版本文本提取五项暂定评分权重，并明确记录表内合计 `95%` 与 100 分标题不一致；规则版本/后台最终口径、视频文件/链接、现场演示记录、赛期新增 `>=70%` 核验、项目 LICENSE 和最终提交授权仍为 `TBD`，不得写成已完成。

## API

本地服务仅面向比赛演示，不应暴露到公网。启动后以服务返回为准：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/health` | 返回服务状态、核心/验证器状态和 `mode: PAPER_ONLY` |
| `GET` | `/api/scenarios` | 列出三个离线场景、公开实时场景与可选本地研究场景 |
| `GET` | `/api/model-card` | 返回模型版本、特征范围、用途和限制 |
| `POST` | `/api/run` | 运行一个场景并返回已签名 artifact、验证结果及明确标注为未签名遥测的耗时/产物体积 |
| `GET` | `/api/reports/:id` | 读取本进程内已生成的只读报告 |
| `POST` | `/api/verify` | 按报告 `id` 或提交的 `artifact` 重新计算哈希链并离线验签 |

典型请求只引用内置场景，不传密钥：

```json
{
  "scenario": "offline-constructive"
}
```

典型结果包含：

```json
{
  "ok": true,
  "artifact": {
    "decision_id": "decision_...",
    "outcome": {
      "candidate_action": "BUY",
      "final_action": "BUY",
      "risk_status": "PASS",
      "order_status": "SIMULATED_ACCEPTED"
    },
    "steps": [],
    "signature": {}
  },
  "verification": { "ok": true }
}
```

字段值取决于场景；上例仅说明结构，不是收益或交易建议。完整产物可直接传给 `/api/verify`，服务不会据此执行订单。

真实公开数据场景的请求为：

```json
{
  "scenario": "public-btc-live"
}
```

CoinLore 市场快照按请求获取；Coin Metrics 和 Alternative.me 的源指标通常按日更新；GitHub 的 `pushed_at` 随仓库活动变化。响应中的 `source_status` 分别保留 `retrievedAt` 与来源自己的 `asOf`，不能把四个来源解释成同一时点快照。接口原始响应只在内存中用于确定性特征映射，不落盘、不缓存，也不进入提交 ZIP。

四源都可用时，公开场景生成四个 `MODEL_FEATURE` 证据和一个绑定 Paper 风控参考价的 `RISK_REFERENCE` 证据。每条公开证据保存原始值、单位、字段路径与白名单 `transform_id`，核心可重算标准化值；逐指标新鲜度、至少 50% 的模型特征覆盖、collection 来源健康和参考价证据绑定均由 `btc-paper-risk@1.1.0` 执行。非市场源部分失败会明确标记 `DEGRADED`，模型仍只使用可用公开特征，但可执行动作会被风控阻断，不会补入合成值。

## 程序接口

核心 ESM 接口由 [`src/core/index.mjs`](src/core/index.mjs) 导出：

```js
import {
  runBtcDecision,
  verifyDecisionArtifact,
} from "./src/core/index.mjs";
import { getDemoScenario } from "./fixtures/scenarios.mjs";

const artifact = runBtcDecision(getDemoScenario("positive-buy"));
const verification = verifyDecisionArtifact(artifact);
```

`runBtcDecision(scenario, options)` 接受可选的运行时 signer 和签名时间，便于测试确定性路径。`verifyDecisionArtifact(artifact)` 独立检查 ID 一致性、步骤顺序、前序哈希、步骤哈希、签名清单、公钥指纹及签名。

## 决策产物

每个产物至少包含以下审计面：

- `decision_id`：绑定该次决策的稳定标识；
- `research_id`：绑定归一化证据快照；
- `evidence`：来源、观测/抓取时间、数据分类、原始值、白名单变换、角色和新鲜度；
- `model`：版本、特征向量、各类概率和逐因子贡献；
- `risk`：逐指标新鲜度、特征覆盖、来源健康、参考价绑定及金额/仓位等规则、阈值、失败项和最终动作；
- `order`：仅 Paper 模拟，或明确记录未创建原因；
- `steps`：`evidence → model → risk → order` 的 SHA-256 链；
- `signature`：绑定链头与无签名产物哈希的清单、Ed25519 公钥、指纹和签名；
- `limitations` 与免责声明。

## 项目结构

```text
flux-verifiable-agent/
├─ fixtures/                 # 可复现的离线演示场景
├─ model/                    # 冻结、版本化模型与模型卡
├─ promo/                    # 现场展示与离线宣传物料
├─ public/                   # 评委控制台
├─ src/adapters/             # 真实公开 BTC 数据只读适配器
├─ src/core/                 # 推理、风控、哈希链、签名与验证
├─ test/                     # Node 原生测试

├─ server.js                 # 仅本地 HTTP 服务
└─ package.json
```

## 源码仓库与便携交付边界

当前 GitHub 仓库是源码 checkout，源码仓库不包含用于生成 Windows x64 便携包的 `build-submission.ps1` 或 `build-portable-windows.ps1`，也不宣称可以从本目录重建此前的候选包。源码验收只使用本页的 Node.js 命令；仓库根目录的 `.cmd` 与 `tools/*.ps1` 是随完整便携 handoff 使用的启动/校验辅助文件。

原始 handoff ZIP 的 `manifest.sha256` 保留在仓库根目录，仅作为已验收便携包的来源凭据，不是当前 Git checkout 的清单。任何重新生成的便携包都必须使用独立白名单流程并重新进行文件清单、秘密扫描、解压启动和哈希复算。

## 复现与测试

- 测试计划：[`../docs/TEST_PLAN.md`](../docs/TEST_PLAN.md)
- 实际测试报告：[`../docs/TEST_REPORT.md`](../docs/TEST_REPORT.md)
- 架构与信任边界：[`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)
- 比赛提交说明：[`../docs/SUBMISSION.md`](../docs/SUBMISSION.md)
- 项目简报：[`../docs/PROJECT_BRIEF.md`](../docs/PROJECT_BRIEF.md)
- 审计报告样本：[`../docs/AUDIT_REPORT_SAMPLE.md`](../docs/AUDIT_REPORT_SAMPLE.md)
- 赛前资产披露：[`../docs/PRIOR_WORK_DISCLOSURE.md`](../docs/PRIOR_WORK_DISCLOSURE.md)
- 第三方说明：[`../docs/THIRD_PARTY_NOTICES.md`](../docs/THIRD_PARTY_NOTICES.md)
- 比赛要求与证据矩阵：[`../docs/COMPETITION_REQUIREMENTS_MATRIX.md`](../docs/COMPETITION_REQUIREMENTS_MATRIX.md)
- 许可待团队确认：[`../docs/LICENSE-DECISION.md`](../docs/LICENSE-DECISION.md)

当前验证状态分三层，不能互相替代：

| 层级 | 已有证据 | 当前状态 |
| --- | --- | --- |
| 历史源码与场景窗口 | 2026-09-02 源码 30/30，以及较早场景、公开来源和 UI 记录 | 历史基线；保留用于追溯 |
| Windows x64 便携候选包 | 2026-09-03 独立解压验收：`npm run check` PASS；`npm test` 30/30、3 suites、0 fail/skip；五场景 5/5、逐场景 7/7 验签；manifest 93/93；秘密/私钥模式及列明排除项扫描 0 命中 | **技术验收 PASS** |
| 外部比赛提交 | 规则/资格、后台 ID、视频、排练、跨境/供应商条款、`>=70%` 核验、LICENSE、人工复核和最终提交授权 | `TBD`；技术通过不等于已报名或已上传 |

候选包场景验收中，`offline-constructive` 为 BUY/PASS/SIMULATED_ACCEPTED；过期和超限场景均从 BUY 回落 HOLD，并分别触发 `EVIDENCE_FRESHNESS` 与 `ORDER_NOTIONAL_LIMIT`；`public-btc-live` 为 HOLD/NO_ACTION、来源 4/4、参考价 `$77,984.74`；`local-8790` 为 HOLD/NO_ACTION、来源 12/13。一个篡改副本被拒绝并返回 `PAPER_ONLY_POLICY_VIOLATION`、`SIGNATURE_MANIFEST_MISMATCH` 和 `SIGNATURE_INVALID` 三个错误码。1440x900 与 390x844 均为 0 横向溢出、0 越界和 0 应用浏览器日志，移动报告按钮保持 2x2。

完整命令、历史记录和验收字段见 [`../docs/TEST_REPORT.md`](../docs/TEST_REPORT.md)。ZIP 自身哈希以 ZIP 同目录 `.sha256` 文件为准；外部提交必须由有权限的团队成员人工确认。

## 已知限制

- 当前模型是透明演示参数，不是经生产数据训练或验证的交易模型。
- 仅支持 BTC；没有组合优化、真实撮合、滑点、费用、延迟或市场冲击建模。
- 合成场景用于可复现软件验证，不代表现实市场状态。
- `public-btc-live` 的市场价格、日线网络/情绪指标和开发活动具有不同更新频率；报告保留各自时间戳，不宣称它们严格同步。
- 公开接口失败不会回退到合成值：市场价格源不可用时请求失败关闭，其他来源失败时会显式记录并仅使用仍可用的公开特征；变换绑定的 collection 降级或覆盖率不足时风控会阻断可执行动作。
- 四个第三方接口可能经境外或跨境基础设施处理请求和常规网络元数据。应用请求不发送客户、账户、组合、凭据或主动收集的个人数据，但供应商实际处理地域与适用条款仍需参赛团队按所在地复核。
- 本地 `8790` 研究适配器是可选、未验证的 review-only 输入，服务不可用时不会降级为实盘或伪造在线数据。
- 哈希和签名只证明公开数据采集并写入产物后未被修改，不证明上游接口绝对真实、完整、及时，也不证明模型盈利或决策正确。
- 模型类别概率可能错误且尚未完成现实校准；确定性风控和 Paper-only 只能限制软件行为，不能把错误模型变成正确模型。
- 本项目不是持牌交易、经纪、投顾或资产管理服务。

## 许可状态

许可尚未由参赛团队最终选择。请在提交前完成 [`../docs/LICENSE-DECISION.md`](../docs/LICENSE-DECISION.md) 中的决策，不要在未获团队授权时对外声称 MIT、Apache-2.0 或其他许可。
