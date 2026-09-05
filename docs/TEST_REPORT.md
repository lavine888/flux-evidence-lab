# 测试执行报告

## 当前源码 checkout 复现记录（本次交付）

本节只记录当前 GitHub 源码 checkout 的实际复现结果，不复用 2026-09-03 外部 Windows x64 便携候选包的数字。审计脚本由当前源码直接调用核心决策器、HTTP 服务和验证器；公开接口结果按运行时实际状态记录。

| 检查 | 实际结果 |
| --- | --- |
| 执行窗口 | 2026-09-06 03:14–03:15（Asia/Shanghai）；审计批次生成时间 2026-09-05T19:14:28.437Z |
| 操作系统 | Windows 10 Home China，10.0.26200.9168 |
| PowerShell | 7.6.5 |
| Node.js / npm | v24.15.0 / 11.12.1 |
| 依赖安装 | cd app; npm ci --ignore-scripts：PASS；up to date，1 package audited，0 vulnerabilities |
| JavaScript 检查 | cd app; npm run check：PASS；server 与 browser entrypoint 语法检查通过 |
| 自动化测试 | cd app; npm test：32/32 PASS，3 suites，0 fail，0 skipped |
| 审计证据生成 | node tools/review-evidence.mjs：PASS；离线/风险/篡改批次、HTTP smoke、样本写入和验证均无脚本失败 |
| 审计样本验证 | node tools/review-evidence.mjs --verify-examples：PASS；两个样本均 verification: PASS |
| 公开实时场景 | 3 次尝试，0 次观察到可用结果，3 次 HTTP 502 / EXTERNAL_DEPENDENCY_UNAVAILABLE；这是当前外部网络依赖不可用，不被改写成 live 成功 |
| 原始公开响应 | 不持久化；runner 只在内存中读取响应，摘要只保留状态、计数、动作和风险结果 |
| 秘密与大文件扫描 | 排除 staging 后扫描常见私钥/token 模式并查找超过 10 MiB 的文件 | 0 secret-pattern hits；0 files over 10 MiB；`runtime/`、`promo/offline-kit/`、`app/node_modules/` 均不在当前 source checkout |

### 当前审计批次

| Scenario | Runs | Success | Fail | Avg / Max | Human intervention | Failure reason |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Offline Constructive | 10 | 10 | 0 | 5.039 / 21.986 ms | None | — |
| Risk Limit | 10 | 10 | 0 | 2.745 / 3.288 ms | None | — |
| Tamper Detection | 10 | 10 | 0 | 4.320 / 4.711 ms | None | — |

HTTP smoke 实际结果：health 200 / PAPER_ONLY；scenario catalog 200 / 5 scenarios；static console 200；离线建设性与风险超限均 200 且验证为 true；篡改请求 200 但被拒绝。两个提交样本分别为 examples/offline-constructive.json（32,276 bytes，btc_dec_7e3a0f93525e0cc339c39b65）和 examples/risk-limit.json（31,567 bytes，btc_dec_099feab304bd5a369bf3c24a），均由 runner 实际生成并随后独立验证为 PASS。

### 源码与 handoff 产物边界

原始 handoff ZIP D:\ADownloads\Flux-Evidence-Lab-Team-Handoff.zip 的 SHA-256 为 689fa29dfc0df100ede8410bcb7577f350becb6e8c53f5ad9fa4d5d2855efcff；解压 staging 的原始 manifest 校验为 86/86 匹配、0 missing、0 modified、0 invalid、0 extra。当前源码导入了 54 个相关文件，并有意排除 33 个文件（约 103,316,066 bytes），包括完整 runtime/ 和 promo/offline-kit/；因此旧 manifest、旧 BUILD-INFO.json 和 2026-09-03 portable 数字不是当前 Git source build 结果。为保留可恢复性，本地 staging 目录仍在工作区但被 `.gitignore` 忽略，未暂存、未提交、未推送。

## 历史执行信息（旧记录）

| 项目 | 值 |
| --- | --- |
| 执行时间 | 初始全流程：2026-09-02 11:12 CST；源码复跑：2026-09-02 14:59 CST；Windows x64 便携候选包独立验收：2026-09-03（Asia/Shanghai） |
| 操作系统 | Microsoft Windows 10 专业版 10.0.19045 |
| Node.js | v24.19.0 |
| npm | 11.17.0 |
| PowerShell | 7.6.4 |
| 测试对象 | `competition/flux-verifiable-agent` 与 `Flux-Evidence-Lab-Portable-Windows-x64.zip` 候选包；技术验收已完成，外部提交未执行 |
| 候选包平台 | Windows x64；内含 Node.js v24.19.0 |
| 网络 | 离线测试 + 四个公开 HTTPS 接口 + 本地 `8790` |
| 外部凭据 | 未使用；公开接口均免 Key |
| 行情边界 | `public-btc-live` 使用运行当刻的真实公开数据，不是合成行情 |
| 执行边界 | 仅 Paper 模拟；未使用真实资金，实盘路由物理不可用 |

## 已执行结果摘要

下表汇总历史时间窗口的真实执行记录。2026-09-03 的 Windows x64 便携候选包独立验收是外部历史产物记录；当前 GitHub 源码 checkout 的技术口径以上方“当前源码 checkout 复现记录”为准。2026-09-02 的源码、场景、公开来源、浏览器和旧 ZIP 行也只作历史追溯。

| 检查 | 命令 / 方法 | 结果 |
| --- | --- | --- |
| 历史源码基线：JavaScript 语法 | `npm run check`（2026-09-02 14:59 复跑） | 通过 |
| 历史源码基线：核心、公开适配器与 HTTP 集成测试 | `node --test test/*.test.mjs`（2026-09-02 14:59 复跑） | 30/30 通过，3 suites，0 失败/跳过 |
| 第三方 npm 依赖 | `npm ls --all --json` | 无运行时或开发依赖 |
| 历史窗口：五场景 API 冒烟 | 2026-09-02 约 10:55 CST，在本地 `8814/api/run` 依次运行全部场景 | 当时 5/5 返回结构化产物且验签通过；不代表最终提交包 |
| 历史窗口：真实公开来源 | 2026-09-02 约 10:55 CST 的 `public-btc-live` 请求 | 当时 CoinLore、Coin Metrics、Alternative.me、GitHub 4/4 可用；不代表当前可用性 |
| 历史窗口：公开场景开销 | 2026-09-02 15:04:52 CST 的 `audit_metrics` | 当时采集 5362.330 ms；决策链 1.127 ms；离线验证 1.791 ms；总计 5365.568 ms；artifact 27,868 bytes；4/4 来源且验签通过 |
| 失败语义 | 受控 adapter 测试 | 部分失败显式记录、无合成回退；市场源失败关闭 |
| 历史窗口：浏览器桌面/移动验收 | 应用内浏览器运行 `public-btc-live`；默认桌面宽度与 390 px 移动断点 | 当时价格/涨跌、4/4 来源、HOLD 语义、7 项完整性检查均正确；无横向溢出，控制台无 warning/error；不代表最终 UI 复核 |
| 历史包：文档同步前提交 ZIP | `npm run build:submission` + 独立临时目录解压复测 | 当时白名单 36 个文件 + `manifest.sha256`；秘密扫描、清单复算、`npm run check` 与 21/21 测试均通过；该包已过期，不得提交 |
| Windows x64 便携候选包 | 2026-09-03 独立解压、manifest、秘密扫描、测试、五场景、篡改与 UI 验收 | **技术验收 PASS**；94 个文件条目，manifest 93/93、0 失败；外部提交与人工授权仍为 TBD |

## 提交候选包技术验收记录（已执行）

本节记录 2026-09-03 对 Windows x64 便携候选包的独立技术验收。技术检查已通过，但这不代表报名后台上传、参赛资格、规则版本、视频、排练、跨境/供应商条款、赛期新增比例、LICENSE 或最终提交授权已完成。ZIP 内容若再次变化，以下技术结果必须重新执行并更新。

| 验收项 | 预期或记录内容 | 实际结果 |
| --- | --- | --- |
| 验收状态 | `PASS` / `FAIL` / `BLOCKED` | **PASS（技术验收）** |
| 验收时间与时区 | `Asia/Shanghai` | 2026-09-03（Asia/Shanghai） |
| 执行标识 / 人工复核人 | 团队内可追溯标识 / 姓名 | Codex 本地验收 / 人工复核人 TBD |
| 候选包标识 | 平台与文件名 | Windows x64；`Flux-Evidence-Lab-Portable-Windows-x64.zip` |
| 内含运行时 | Node.js 版本 | v24.19.0 |
| 语法检查 | 独立解压环境执行 `npm run check` | PASS |
| 自动测试 | 独立解压环境执行 `npm test` | 30/30 通过，3 suites，0 fail/skip |
| 五场景 API | 下表五行均完成且逐场景验签 | 5/5；每场景 7/7 验签通过 |
| `public-btc-live` 现场证据 | 来源、参考价、候选/最终动作、风险状态 | 4/4；`$77,984.74`；HOLD → HOLD；NO_ACTION |
| ZIP 文件条目 | 不含目录占位的文件条目 | 94 |
| 构建白名单输入 | `app` / `docs` / `promo` / `launcher` | 88：26 / 11 / 43 / 8 |
| 文件数关系 | 白名单、运行时、构建信息和 manifest | 88 + runtime 4 + `BUILD-INFO.json` 1 = 93 个 manifest 覆盖项；再加 manifest 自身 = 94 个文件条目 |
| 媒体文件 | PDF / PNG | 8 / 25；PNG = offline-kit 17 + modular final 3 + Lovart originals 3 + UI screenshots 2 |
| ZIP SHA-256 | ZIP 自身校验值不写入包内文档 | **以 ZIP 同目录 `.sha256` 文件为准** |
| `manifest.sha256` 复算 | 覆盖除 manifest 自身外的文件 | 93/93 匹配，0 失败 |
| 秘密与排除项扫描 | 秘密/私钥模式命中 / `.env` / `node_modules` / 旧宣传目录（`promo/media-kit-lovart-final`、`promo/exports/lovart`） | 0 / 0 / 0 / 0 |
| 篡改副本验证 | 将一个篡改副本交给独立验证器 | 副本被拒绝并返回三个错误码：`PAPER_ONLY_POLICY_VIOLATION`、`SIGNATURE_MANIFEST_MISMATCH`、`SIGNATURE_INVALID` |
| UI 桌面复核 | 1440x900：横向溢出 / 越界元素 / 应用浏览器日志 | 0 / 0 / 0 |
| UI 移动复核 | 390x844：横向溢出 / 越界元素 / 应用浏览器日志；报告按钮布局 | 0 / 0 / 0；2x2 |
| 本轮技术失败项 | manifest、测试、场景、篡改与 UI 检查 | 0；人工/法律/外部提交项见下方 TBD |

五场景实际值来自同一候选包验收窗口：

| 场景 | 结果 / 验签 | 候选 → 最终动作 | 风控 / 失败规则 | 订单 | 来源状态 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| `offline-constructive` | PASS；7/7 | BUY → BUY | PASS | SIMULATED_ACCEPTED | 1/1 | Paper-only 模拟接受 |
| `stale-evidence` | PASS；7/7 | BUY → HOLD | BLOCK；`EVIDENCE_FRESHNESS` | NOT_CREATED | 1/1 | 证据过期被确定性风控否决 |
| `risk-limit` | PASS；7/7 | BUY → HOLD | BLOCK；`ORDER_NOTIONAL_LIMIT` | NOT_CREATED | 1/1 | 名义金额超限被确定性风控否决 |
| `public-btc-live` | PASS；7/7 | HOLD → HOLD | NO_ACTION | NOT_CREATED | 4/4 | 参考价 `$77,984.74` |
| `local-8790` | PASS；7/7 | HOLD → HOLD | NO_ACTION | NOT_CREATED | 12/13 | 降级来源被如实展示，不伪装为 13/13 |

本技术结论已同步到 [`SUBMISSION.md`](SUBMISSION.md) 与 [`COMPETITION_REQUIREMENTS_MATRIX.md`](COMPETITION_REQUIREMENTS_MATRIX.md)。ZIP 自身哈希统一写为“以 ZIP 同目录 `.sha256` 文件为准”；人工复核人与外部提交授权保持 `TBD`。

## 比赛要求文档审计

以下是文档覆盖状态，不是新增自动测试结果，也不改变上表 30/30 的含义：

| 要求 | 当前证据 | 状态 |
| --- | --- | --- |
| 目标用户 | 已定义研究员、模型风险/风控、审计/合规与工程复核工作流 | 文档完成；用户访谈/采用数据 TBD |
| AI 与金融承重点 | 模型直接产生候选动作，确定性金融风控最终否决 | 已有执行证据；映射 35% 场景价值、30% 技术创新及相关安全/合规评分项 |
| 3 分钟视频 | 已有逐秒脚本和故障预案 | 视频文件、链接、真实时长 TBD |
| 5–8 分钟现场演示 | 已有扩展 runbook | 排练记录、演示人和实际耗时 TBD |
| 人工确认 | 人工点击触发，随后自动生成本地 Paper 结果；无真实资金动作 | 边界已披露；没有实盘前人工批准功能 |
| 公开 API 跨境/个人数据 | 出站请求只包含公开查询，不发送客户/账户/组合/凭据；供应商可能跨境处理 | 技术边界已记录；地域、条款和法律复核 TBD |
| 模型误差与幻觉 | 非生成式模型，无文本幻觉路径；仍有误判、零填充、未校准和漂移风险 | 风险已披露；准确率/校准/漂移证据 TBD |
| 赛期新增 `>=70%` | 赛前资产和比赛模块已分开披露 | 比例、官方分母、日期、核验人和证据索引 TBD |
| 官方评分/技术门槛 | 已提取五项权重和准入门槛并建立证据矩阵 | 权重表合计 95% 的原文异常、规则版本和报名后台最终口径待人工核对 |
| Windows x64 候选包技术验收 | 独立解压、93/93 manifest、秘密/私钥模式扫描 0 命中、30/30 测试、五场景 5/5、逐场景 7/7 验签、篡改副本拒绝与双视口 UI 检查 | 技术 PASS；人工复核人与外部提交授权 TBD |

完整矩阵见 [`COMPETITION_REQUIREMENTS_MATRIX.md`](COMPETITION_REQUIREMENTS_MATRIX.md)。

## 自动测试明细

核心测试覆盖：

- 建设性证据直接产生 `BUY` 候选动作和本地 Paper 模拟订单；
- 中性证据产生 `HOLD`，不创建订单；
- `SELL` 候选仍只生成本地模拟结果，并接受库存约束；
- 过期证据由确定性风控否决；
- `LIVE` 模式请求在订单构建前被阻断；
- 同一输入产生稳定 `research_id`、`decision_id` 与步骤链；
- 模型载荷、重算哈希链、签名和顶层安全声明篡改均可检测；
- 重新生成密钥、重建链或篡改证据新鲜度不能绕过验证；
- 证据分类不能与来源类型矛盾。

公开数据适配器测试覆盖：

- 四个免 Key 来源映射为四个可追踪的 `PUBLIC` 模型特征；
- 参考价格直接来自 CoinLore，执行模式仍为 `PAPER_SIMULATION`；
- Coin Metrics/Alternative.me/GitHub 部分失败时只保留仍可用的公开特征；
- 部分失败不会生成或混入 `SYNTHETIC` 特征；
- CoinLore 市场价格源不可用时失败关闭，不生成决策；
- 每指标新鲜度、公开特征覆盖率和 Paper 参考价格证据绑定；
- 调用方不能把特征覆盖率下限降到策略基线以下；
- 原始值到标准化特征的白名单变换不一致可被检测；
- 删除公开证据的变换声明也不能绕过重放验证；
- 风险参考价、来源状态、来源时间和来源摘要在重建链并重新签名后仍无法绕过独立验证。

### 历史变更窗口记录

14:45 CST 在核心、适配器和测试文件并行更新尚未完成时，一次中间复跑得到 18/21，另一次语法检查在 `public/app.js` 尚未写回时失败。文件更新完成并补齐新增安全测试后，14:59 CST 重新执行完整命令，结果为 `npm run check` 通过、30/30 测试通过。该段仅为历史过程，不是最终提交验收；保留它是为了避免从测试历史中删除失败记录。

HTTP 集成测试覆盖：

- 健康状态与五场景目录；
- 建设性路径和超限阻断路径；
- 修改顶层安全声明后 `/api/verify` 返回无效；
- 非 JSON 请求返回 `415`；
- 未知场景返回 `400`，不泄露调用栈。

## 历史五场景实测结果

**历史基线，不可作为当前候选包结果。** 以下结果来自 2026-09-02 约 10:55 CST 的同一轮本地 API 冒烟。公开数据会变化，概率和价格只代表该次请求；2026-09-03 候选包实际值见上方“提交候选包技术验收记录”。

| 场景 | 数据类型 | 模型候选 | 概率 | 风控 | 最终动作 | 订单 | 验签 |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `offline-constructive` | 合成 fixture | BUY | 0.937082 | PASS | BUY | SIMULATED_ACCEPTED | 通过 |
| `stale-evidence` | 合成 fixture | BUY | 0.937082 | BLOCK | HOLD | NOT_CREATED | 通过 |
| `risk-limit` | 合成 fixture | BUY | 0.937082 | BLOCK | HOLD | NOT_CREATED | 通过 |
| `public-btc-live` | 真实公开接口 | HOLD | 0.650401 | NO_ACTION | HOLD | NOT_CREATED | 通过 |
| `local-8790` | 本地只读研究 | HOLD | 0.648148 | NO_ACTION | HOLD | NOT_CREATED | 通过 |

历史快照中，`public-btc-live` 参考价格为 `$77,235.09`，四个配置来源当时 4/4 返回可用数据。`local-8790` 为可选只读集成，当时 13 个来源中 12 个状态为 `ok`；这些数值均不得用于描述最终提交窗口，离线三场景不依赖它。

## 历史公开来源实测

**历史基线，不可作为最终提交结果。** 一次独立详细采集发生在 2026-09-02 10:54:48–10:54:49 CST：

| 来源 | 状态 | 抓取时间语义 | 来源时间语义 | 缓存 |
| --- | --- | --- | --- | --- |
| CoinLore | ok | 请求时市场快照 | 同本次抓取时点 | false |
| Coin Metrics Community | ok | 本次 HTTP 抓取 | 最新 `1d` 日线为 2026-09-01 00:00 UTC | false |
| Alternative.me Fear & Greed | ok | 本次 HTTP 抓取 | 指标时间为 2026-09-02 00:00 UTC | false |
| GitHub `bitcoin/bitcoin` | ok | 本次 HTTP 抓取 | `pushed_at` 为 2026-09-01 10:39:24 UTC | false |

四源不是同一更新频率：CoinLore 按请求取市场快照，Coin Metrics 与 Alternative.me 是日度来源，GitHub 随开发活动变化。系统保留 `retrievedAt` 和来源 `asOf`，不把它们表述为严格同步数据。

原始 API JSON 只在内存中解析并转换为标准化特征；本轮没有写入缓存或 fixtures。接口失败不会回退合成值。

## 完整性与合规解释

- Ed25519 签名和 SHA-256 链证明采集结果进入报告并签名后未被修改；
- 它们不认证 CoinLore、Coin Metrics、Alternative.me 或 GitHub，也不证明上游绝对真实、完整、及时或相互同步；
- `PUBLIC_DEMO` 表示公开数据用于研究/比赛演示，不表示输入是合成行情；
- Paper-only 只约束账户、仓位、订单和成交为模拟，不改变公开行情的来源属性；
- 模型类别概率不是胜率，测试结果也不是收益证明。

## 未覆盖与限制

- 未测试真实交易所、钱包、实盘资金、真实撮合、滑点或市场冲击，因为比赛模块物理不包含这些路径；
- 未做收益、预测准确率或策略盈利性测试，不应从本报告推导任何收益结论；
- 未做概率校准、错误分类评估、分布漂移或结构化模型误判的现实标签验证；“不是生成式 LLM”不等于模型不会错；
- 未做公网部署、负载、渗透、多租户或长期密钥身份测试；
- 外部接口可在未来发生限流、格式变化、延迟或不可用；4/4 与 `$77,984.74` 只代表 2026-09-03 候选包验收窗口；
- 未完成供应商实际处理地域、跨境/出境适用要求或公开元数据法律定性的人工复核；
- 历史源码 ZIP 曾在独立临时目录复算 manifest、运行语法检查和当时的 21 项测试；该历史包已过期。2026-09-03 Windows x64 便携候选包已完成新的独立技术验收；其内容若再变化，必须重新执行同一流程；
- 3 分钟视频尚无文件/链接/时长证据，5–8 分钟现场演示尚无排练与实际耗时记录；
- `>=70%` 赛期新增比例尚未按官方口径核验，不能宣称已经满足；
- Ed25519 临时签名不提供长期身份或可信时间戳；
- 项目 LICENSE 保持 `UNLICENSED`，仍待参赛团队授权决定。

## 结论

2026-09-03，Windows x64 便携候选包完成独立技术验收：94 个文件条目，manifest 93/93、0 失败，秘密/私钥模式、`.env`、`node_modules` 与旧宣传目录扫描命中均为 0，`npm run check` 通过，`npm test` 为 30/30、3 suites、0 fail/skip，五场景 5/5 且逐场景 7/7 验签，一个篡改副本被拒绝并返回三个错误码，1440x900 与 390x844 UI 几何和应用浏览器日志检查均为 0 异常。结果证明被测软件契约和采集后完整性，不证明上游数据绝对真实、模型正确或可盈利。外部提交尚未执行；规则版本、参赛资格/后台 ID、视频、排练、跨境/供应商条款、`>=70%`、LICENSE、人工复核人与最终提交授权仍为 `TBD`。ZIP 自身校验以 ZIP 同目录 `.sha256` 文件为准。
