# 第三方依赖与素材说明

## 当前运行时依赖

截至本文件本次核对，比赛模块使用 Node.js 原生能力和团队编写的 HTML、CSS、JavaScript、模型、fixtures、测试与文档，未在前端引用 CDN，也未声明第三方 npm 运行时依赖。最终事实仍以提交包内 `package.json`、锁文件和源码 import 为准。

### Node.js

- 项目：Node.js
- 用途：JavaScript 运行时、HTTP、文件系统、`node:crypto`、`node:test` 等标准模块
- 分发方式：运行环境前置条件；Node.js 二进制不包含在比赛 ZIP 中
- 许可：Node.js 自带的许可与第三方声明
- 官方许可信息：[https://github.com/nodejs/node/blob/main/LICENSE](https://github.com/nodejs/node/blob/main/LICENSE)

Node.js 包含其自身的第三方组件和许可。使用者应以所安装 Node.js 版本随附的 LICENSE 为准。

## 前端素材

- 页面使用本地 HTML、CSS 和 JavaScript；
- 当前使用系统字体栈，不分发字体文件；
- 当前没有打包第三方图标库、图片库、图表库或分析 SDK；
- 控件中的简单文本符号属于界面字符，不代表引入图标包；
- 文档中的 Mermaid 代码块只是架构图源文本，是否渲染由查看文档的平台决定；运行时不打包 Mermaid 库。

如果提交前新增 Lucide、字体、截图、交易所标识、第三方图表或其他素材，必须在本文件追加名称、版本、来源、作者、许可和修改情况，不能只在 `package.json` 中出现而不披露。

## 模型与代码

`btc-multinomial-logit@1.0.0` 的结构、系数、模型卡和实现属于本比赛模块的透明演示资产。它不下载或打包第三方模型权重，也不调用远程 LLM。

因此当前没有第三方生成式模型、提示词或文本幻觉路径；这不代表结构化模型不会误判。演示系数、特征映射、缺失值处理、错误上游输入、未校准概率和分布漂移仍可能造成错误候选动作，且没有第三方模型供应商为结果背书。

当前代码未声明复制自第三方仓库。若提交前引入模板、片段或生成式工具产生且需要归属说明的内容，团队应根据赛事规则和相应许可补充披露。

## 数据与来源

内置 fixtures 由 `Flux BTC Synthetic Fixture Generator` 标记为 `SYNTHETIC_DEMO`，用于软件复现，不是现实市场数据，也不代表 BTC 的真实历史状态。

`public-btc-live` 在运行时读取以下第三方公开接口：

| 数据/来源 | 运行时 URL | 更新/时间语义 | 使用方式 | 许可/条款 | 是否再分发 |
| --- | --- | --- | --- | --- | --- |
| CoinLore BTC market | `https://api.coinlore.net/api/ticker/?id=90` | 每次场景运行抓取市场快照 | `RISK_REFERENCE` 价格、7d 动量特征及 24h 展示摘要 | [API 页面](https://www.coinlore.com/cryptocurrency-data-api)及其当前条款 | 否；原始响应不落盘、不入 ZIP |
| Coin Metrics Community | `https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=AdrActCnt,TxCnt&frequency=1d&page_size=8` | `1d` 日线，保留最新源行时间 | 活跃地址变化特征 | [API 文档](https://docs.coinmetrics.io/api/v4)及其当前条款 | 否；原始响应不落盘、不入 ZIP |
| Alternative.me Fear & Greed | `https://api.alternative.me/fng/?limit=7&format=json` | 来源日度指标时间戳 | 情绪特征 | [API 说明](https://alternative.me/crypto/fear-and-greed-index/#api)及其当前条款 | 否；原始响应不落盘、不入 ZIP |
| GitHub `bitcoin/bitcoin` | `https://api.github.com/repos/bitcoin/bitcoin` | `pushed_at` 随仓库活动更新 | 开发活跃度特征 | [GitHub Terms](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service) | 否；原始响应不落盘、不入 ZIP |

上述来源更新频率不同。CoinLore 的请求时市场快照不能与 Coin Metrics/Alternative.me 日线或 GitHub 开发时间戳解释为同一时点。适配器分别保留抓取时间和来源时间，且 `cached: false`。

`PUBLIC_DEMO` 是用途和数据边界标签，不表示这些接口返回值是合成行情。Paper-only 只表示执行、账户、仓位和成交是模拟的。

运行时原始 JSON 只在内存中解析并映射为标准化特征；项目不缓存、不归档、不在 fixtures 中固化，也不通过提交 ZIP 再分发第三方原始响应。ZIP 仅包含适配器源码、测试用自有 mock 数据和来源说明。公开接口失败时不会填充合成数据；CoinLore 市场源失败会关闭失败，其他来源失败会明确记录并只使用仍可用的公开特征。

可选 `local-8790` 场景只读取用户本机研究服务，也不得把该服务的原始缓存或数据集复制进比赛 ZIP。

不得把“公开可访问”等同于“可自由再分发”。付费、登录后、限制抓取或含个人信息的数据不应进入比赛包，除非团队持有明确授权并符合赛事要求。

## 跨境与个人数据边界

上述四个服务可能使用境外或跨境网络、处理与存储基础设施，实际地域可能随供应商和路由变化。本项目不对供应商注册地、数据中心或法律适用范围作未经核实的固定陈述。

应用发出的请求只包含公开资产、指标、频率、页大小或公开仓库标识，不发送客户姓名、联系方式、身份标识、账户、持仓、组合、订单、钱包、凭据或其他主动收集的个人数据。供应商仍可能收到 IP 地址、User-Agent 等常规网络元数据。GitHub 等通用上游响应可能附带公开主体元数据；应用不选择这些字段作为模型特征、不持久化、不画像，也不在 ZIP 中再分发。

提交前必须由有权限的团队成员复核每个来源当时有效的条款、限流、归属要求、处理地域和参赛主体所在地的跨境/出境要求。当前复核日期、复核人和结论为 `TBD`；技术上的“无主动个人数据出站”不能替代法律判断。

## 名称与商标

“BTC”用于描述比特币相关演示资产；“Flux”用于赛事赛道与本项目工作名称。项目不声称获得任何交易所、数据供应商、比特币相关组织或其他商标权利人的背书。

## 提交前复核命令

在模块目录执行：

```powershell
Get-Content -Raw package.json
rg -n "from |import\(" src model fixtures test server.js
rg -n "https?://|@font-face|cdn|unpkg|jsdelivr|cdnjs" public src model fixtures docs
```

不同 PowerShell / ripgrep 版本对正则支持可能不同；若命令报错，应改用等价的依赖清单和源码人工检查，不得把命令失败当作“没有第三方依赖”。

复核清单：

- [ ] `package.json` 与锁文件一致；
- [ ] 所有非 `node:` import 均已识别；
- [ ] 前端没有未披露的远程脚本、字体、图片或追踪代码；
- [ ] fixtures 全部有来源和数据分类；
- [ ] 四个公开接口的当前使用条款、限流和归属要求已复核；
- [ ] 四个公开接口的处理地域、跨境/出境适用要求与复核人/日期已记录；
- [ ] 出站请求不含客户、账户、组合、钱包、凭据或主动收集的个人数据；
- [ ] ZIP 不含四个来源的原始响应、缓存或历史镜像；
- [ ] 第三方 NOTICE / LICENSE 已按其要求随包提供；
- [ ] 项目自身许可已由团队确认。
