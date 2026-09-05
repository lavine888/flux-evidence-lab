# AI Handoff: Flux Evidence Lab

## 0. 你的任务

你是现场队友的项目协作 AI。先理解项目，再帮助队友运行、解释、排障、排练或准备提交材料。不要擅自扩展成真实交易系统，也不要替团队确认尚未完成的比赛、法律或许可事项。

本文件与 `PROJECT-CONTEXT.json` 是当前队友包的最高优先级说明。它描述完整 Windows 便携 handoff；如果从 GitHub 获取的是源码 checkout，应以根目录 `README.md` 和 `PROJECT-CONTEXT.json` 的 `artifact_scope` 为准。`docs/` 中的内容提供更深证据；其中个别历史段落可能描述更早的候选包，当前源码不应被当作便携包，旧便携包文件清单才以 `manifest.sha256` 为准。

## 1. 项目身份

- 名称：Flux Evidence Lab
- 资产：BTC-USD
- 类型：可验证的 BTC Paper-only 研究、推理、风控与审计 Agent
- 目标用户：数字资产研究员、模型风险/风控复核人员；次要用户为审计、合规和工程复核人员
- 核心价值：让候选动作能追溯到公开证据、模型版本、风险规则、模拟订单和完整性验证
- 当前能力：研究和本地 Paper 模拟
- 明确不具备：交易所连接、钱包连接、真实资金、实盘下单、收益承诺、持牌投顾能力

统一描述：

> 真实公开输入 + Paper-only 模拟执行；不连接交易所、不连接钱包、不接触真实资金。

## 2. 系统主链路

```text
PUBLIC / SYNTHETIC evidence
    -> whitelist deterministic transforms
    -> btc-multinomial-logit@1.0.0
    -> BUY / HOLD / SELL candidate
    -> btc-paper-risk@1.1.0 deterministic final veto
    -> local Paper order or NOT_CREATED
    -> evidence/model/risk/order SHA-256 chain
    -> ephemeral-runtime Ed25519 signature
    -> independent verification
```

关键责任关系：

- 模型直接产生候选动作，不是装饰性摘要。
- 风控位于模型之后，拥有最终否决权。
- 人工只选择场景、点击运行、审阅和导出；没有实盘批准功能。
- `decision_id` 绑定一次决策，`research_id` 绑定证据快照。
- API envelope 内的耗时和体积是未签名观测数据，不属于签名 artifact。

## 3. 数据渠道

`public-btc-live` 每次运行读取四个免 Key 公开渠道：

| 渠道 | 主要用途 | 时间语义 |
| --- | --- | --- |
| CoinLore | BTC 价格和市场变化 | 请求抓取时间 |
| Coin Metrics Community | 网络活动日线指标 | 来源观测时间 |
| Alternative.me | Fear & Greed 情绪指标 | 来源发布时间 |
| GitHub `bitcoin/bitcoin` | 开发活动 | 仓库事件时间 |

这些来源不是严格同一时点快照。应用同时保留 `retrievedAt` 和来源自己的 `asOf`。原始响应只在内存中解析，不缓存、不写入包。

失败策略：

- 市场价格源失败时，公开场景失败关闭。
- 其他公开源部分失败时，页面显式降级，不用合成值填补。
- 特征覆盖、来源健康、新鲜度或参考价绑定不足时，风控阻断可执行动作。
- `local-8790` 是可选只读多源研究输入，不是核心依赖。

## 4. 模型与风控

模型文件：`app/model/btc-multinomial-logit-v1.mjs`

核心接口：`app/src/core/index.mjs`

模型输入八类特征，并输出三类概率、候选动作和逐因子贡献。缺失特征按 0 处理并显式披露。模型参数是透明比赛演示参数，没有生产级准确率、校准、漂移或盈利验证。

风控至少检查：

- `PAPER_ONLY_MODE`
- `EVIDENCE_FRESHNESS`
- `NO_FUTURE_EVIDENCE`
- `FEATURE_COVERAGE`
- `SOURCE_HEALTH`
- `REFERENCE_PRICE_BOUND`
- `MODEL_CONFIDENCE`
- `ORDER_NOTIONAL_LIMIT`
- `PAPER_POSITION_LIMIT`
- `PAPER_SELL_INVENTORY`
- `DAILY_PAPER_ORDER_LIMIT`

风控失败时，候选动作保留用于审计，但 `final_action` 回落为 `HOLD`，订单为 `NOT_CREATED`。

## 5. 五个场景

| 场景 ID | 类型 | 预期用途 |
| --- | --- | --- |
| `offline-constructive` | 离线合成 | 展示建设性 BUY、风控通过和本地 Paper 模拟订单 |
| `stale-evidence` | 离线合成 | 展示 `EVIDENCE_FRESHNESS` 阻断 |
| `risk-limit` | 离线合成 | 展示 `ORDER_NOTIONAL_LIMIT` 阻断 |
| `public-btc-live` | 公开实时 | 展示四个免 Key 来源和实际运行结果；动作与价格不可预写 |
| `local-8790` | 可选本地 | 读取本机 8790 研究服务；不可用时直接跳过 |

离线前三个场景用于软件行为复现，不代表现实市场。公开场景的价格、来源可用性、概率和动作必须以现场输出为准。

## 6. 完整性与信任边界

签名 artifact 包含 `evidence -> model -> risk -> order` 四步 SHA-256 链。Ed25519 签名清单绑定链头、完整 artifact 哈希、模型版本、动作和状态。

可以声称：

- 签名后的字段被修改时，独立验证器会拒绝。
- 页面能重新计算链、签名、公钥指纹和确定性重放结果。

不可以声称：

- 签名认证了上游网站的真实性。
- 签名证明模型正确或可盈利。
- 临时公钥等于长期可信身份或可信时间戳。

## 7. 运行方式

面向非技术队友：

```text
VERIFY-FILES.cmd
START-FLUX.cmd
OPEN-MEDIA-KIT.cmd
STOP-FLUX.cmd
```

面向 AI 或工程排障：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\Verify-Files.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\Start-Flux.ps1 -NoBrowser
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\Stop-Flux.ps1
```

启动器只执行 `runtime/node.exe`，清除可能影响行为的 `NODE_OPTIONS` 和 `NODE_PATH`，服务只绑定 `127.0.0.1`。默认尝试 8810 到 8899。

源码级检查：

```powershell
cd .\app
..\runtime\node.exe --check server.js
..\runtime\node.exe --check public\app.js
..\runtime\node.exe --test test\*.test.mjs
```

历史便携候选包基线为 30/30；当前 GitHub 源码 checkout 的最新实际结果以 `docs/TEST_REPORT.md` 的“当前源码 checkout 复现记录”为准。

## 8. 本地 API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/health` | 服务、核心、验证器和 Paper-only 状态 |
| GET | `/api/scenarios` | 五场景目录 |
| GET | `/api/model-card` | 模型用途、版本、特征和限制 |
| POST | `/api/run` | 运行场景，返回 artifact、验证结果和未签名遥测 |
| GET | `/api/reports/:id` | 读取本进程内已生成报告 |
| POST | `/api/verify` | 按报告 ID 或 artifact 重新验链验签 |

请求示例：

```json
{"scenario":"offline-constructive"}
```

验证器只验证，不会触发订单。

## 9. 现场讲解顺序

1. 首屏先说目标用户、Paper-only 和不连接真实资金。
2. 运行 `public-btc-live`，展示来源、不同时间语义和公开原始值。
3. 运行 `offline-constructive`，沿证据、模型、风控、模拟订单解释主链路。
4. 运行 `risk-limit`，展示风控最终否决权。
5. 点击“验证原件”，再点击“篡改副本测试”。
6. 回到限制区，明确无收益与准确率声明。

完整台词见 `docs/DEMO_SCRIPT_3MIN.md`。

## 10. 物料地图（完整便携 handoff 专用）

- `promo/offline-kit/PDF/`：8 份正式 PDF（当前 Git 源码 checkout 不包含）。
- `promo/offline-kit/PNG/`：17 张正式 PNG（当前 Git 源码 checkout 不包含）。
- `promo/offline-kit/Flux-Evidence-Lab-Offline-Media-Kit.zip`：独立打印交付包（当前 Git 源码 checkout 不包含）。
- `promo/agent-ui/`：当前 checkout 保留的代表性 Agent UI 截图；不等同于 offline-kit。
- `promo/COPY_DECK.md`：长短介绍、社交文案和评委陈述。

用户已拒绝上一版 3 张模块化 3D 宣传图，因此本包不含 `promo/modular-3d/`、其 Lovart 原图或编辑源。不要建议队友从历史包恢复这些图，除非用户重新明确要求。

## 11. 重要文件阅读顺序

1. `README-FIRST.md`
2. `PROJECT-CONTEXT.json`
3. `docs/ARCHITECTURE.md`
4. `docs/COMPLIANCE.md`
5. `docs/DEMO_SCRIPT_3MIN.md`
6. `docs/TEST_REPORT.md`
7. `docs/COMPETITION_REQUIREMENTS_MATRIX.md`
8. `docs/THIRD_PARTY_NOTICES.md`

代码排障顺序：`app/server.js` -> `app/src/adapters/public-btc.mjs` -> `app/src/core/index.mjs` -> 相关测试。

## 12. 不得自动完成的事项

以下字段必须由有权限的团队成员基于真实证据确认；没有证据时保持 `TBD`：

- 官方规则版本、报名资格和后台项目 ID；
- 3 分钟视频文件、链接和实际时长；
- 现场排练人、设备和耗时；
- 第三方条款、跨境处理和所在地要求；
- 赛期新增 `>=70%` 的官方分母、比例和证据；
- 项目 LICENSE；
- 最终上传和提交授权。

不要代表团队上传、发布、提交或对外发送任何文件，除非用户在当次任务中明确授权并确认最终动作。

## 13. 排障规则

- 页面打不开：读取启动窗口中的实际地址，检查 `/api/health`，不要猜端口。
- 端口占用：让启动器自动回退；不要停止身份不明的进程。
- 公开源失败：保留错误状态，使用离线场景，不伪造在线成功。
- 验签失败：停止演示，保存错误，运行 30 项测试；不要剪辑或隐藏失败。
- 文件校验失败：停止使用该副本，重新从可信 ZIP 解压；不要绕过清单。
- Windows 安全提示：先核对 ZIP 同目录 SHA-256；不要指导用户关闭安全策略。

## 14. 对队友 AI 的回答标准

回答项目问题时：

1. 先给结论，再给对应文件或运行证据。
2. 区分实时公开数据、离线合成证据和本地 8790 数据。
3. 区分候选动作、最终动作和订单状态。
4. 区分采集后完整性、上游真实性、模型正确性和盈利性。
5. 不把软件测试通过率解释为预测准确率。
6. 不把 Paper 模拟描述为交易能力。
7. 不泄露、索取或保存交易所、钱包、Lovart 或其他服务密钥。

## 15. 当前包校验

源码 checkout 采用以下 Node.js 验收路径；完整便携 handoff 才采用下一行的 `VERIFY-FILES.cmd`：

```powershell
cd app
npm ci --ignore-scripts
npm run check
npm test
cd ..
node tools/review-evidence.mjs --verify-examples
```

当前源码仓库有意不包含 `runtime/node.exe`、`promo/offline-kit/` 和此前的便携 ZIP；根目录 manifest 与 `BUILD-INFO.json` 是历史 handoff 追溯资料，不是当前源码构建清单。

完整便携 handoff 的校验指令：
先运行 `VERIFY-FILES.cmd`。`manifest.sha256` 覆盖包内除自身外的所有文件。外层 ZIP 的最终 SHA-256 不可能写进自身，必须读取 ZIP 同目录 `.sha256` 文件。
