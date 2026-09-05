# Flux Evidence Lab 队友现场包

> **入口边界：** 本页是完整 Windows 便携 handoff 的现场说明，不是普通 GitHub 源码 checkout 的启动说明。当前源码 checkout 请先阅读根目录 [`README.md`](README.md)，再在 `app/` 执行 Node.js Quick Start；只有拿到包含匹配 `runtime/`、`manifest.sha256`、`tools/*.ps1` 和线下物料的完整便携包时，才运行本页的 `VERIFY-FILES.cmd`、`START-FLUX.cmd` 和 `OPEN-MEDIA-KIT.cmd`。

先完整解压 ZIP，不要在压缩包预览窗口内直接运行。

## 现场 30 秒启动

1. 双击 `VERIFY-FILES.cmd`，看到“便携包完整性校验通过”。
2. 双击 `START-FLUX.cmd`。
3. 浏览器会打开 `http://127.0.0.1:8810/`；若端口被占用，启动窗口会显示实际端口。
4. 双击 `OPEN-MEDIA-KIT.cmd` 打开全部线下物料。
5. 演示结束后双击 `STOP-FLUX.cmd`。

不需要安装 Node.js，不需要 API Key，不需要数据库。应用只绑定本机 `127.0.0.1`。

## 这是什么

Flux Evidence Lab 是一个 BTC Paper-only 可验证决策 Agent。它把公开 BTC 数据或离线测试证据依次送入：

```text
证据采集 -> 确定性归一化 -> 版本化概率模型 -> 确定性风控 -> Paper 模拟订单 -> 哈希链与签名验证
```

模型直接产生 `BUY`、`HOLD` 或 `SELL` 候选动作；风控拥有最终否决权。所有订单都只是本地模拟。

必须使用这句统一口径：

> 真实公开输入 + Paper-only 模拟执行；不连接交易所、不连接钱包、不接触真实资金。

不要说“可以实盘交易”“已经盈利”“签名证明数据绝对真实”或“模型概率等于收益概率”。

## 推荐现场演示顺序

1. 运行“真实公开数据（免 Key）”，展示四个来源、时间、原始值和确定性变换。
2. 运行“离线建设性”，展示候选动作、风控通过和本地 Paper 模拟订单。
3. 运行“超限阻断”，展示模型候选仍为 BUY，但风控回落为 HOLD 且不创建订单。
4. 点击“验证原件”，确认 7/7。
5. 点击“篡改副本测试”，确认副本被拒绝，原件保持有效。

网络失败时不要等待或伪造结果，直接使用三个离线场景完成演示。

## 物料位置

- `promo/offline-kit/PDF/`：8 份正式 PDF，包含易拉宝、A3 展板、评委手册、队友 Runbook、带走卡、桌牌、主屏 Deck 和 HDMI 兜底页。
- `promo/offline-kit/PNG/`：17 张对应的投屏与预览 PNG。
- `promo/offline-kit/Flux-Evidence-Lab-Offline-Media-Kit.zip`：可单独交给打印店的物料包。
- `promo/agent-ui/`：05 正式 Agent UI 的实机截图。
- `promo/COPY_DECK.md`：项目介绍、社交文案、评委陈述和统一口径。

用户明确不要的 3 张模块化 3D 宣传图、对应 Lovart 原图及编辑源没有放入本包。

主屏出故障时，直接全屏打开：

`promo/offline-kit/PNG/hdmi-fallback-1920x1080.png`

## 给队友 AI

让 AI 按以下顺序读取：

1. `AI-HANDOFF.md`
2. `PROJECT-CONTEXT.json`
3. `docs/ARCHITECTURE.md`
4. `docs/COMPLIANCE.md`
5. `docs/DEMO_SCRIPT_3MIN.md`
6. `docs/COMPETITION_REQUIREMENTS_MATRIX.md`

也可以把 `PROMPT-FOR-TEAMMATE-AI.txt` 直接作为第一条提示词交给 AI。

## 文件地图

| 路径 | 用途 |
| --- | --- |
| `app/` | Agent、前端、模型、场景和当前源码测试 |
| `docs/` | 架构、合规、演示、测试和比赛要求 |
| `promo/` | 正式线下物料、UI 截图和宣传文案 |
| `runtime/node.exe` | 内嵌 Node.js Windows x64 运行时 |
| `tools/` | 启动、停止和完整性校验脚本 |
| `AI-HANDOFF.md` | 给队友 AI 的完整项目说明 |
| `PROJECT-CONTEXT.json` | 机器可读的项目边界与入口 |
| `manifest.sha256` | 包内所有其他文件的 SHA-256 清单 |

## 比赛提交前仍需人工确认

- 官方规则版本、参赛资格和后台项目 ID；
- 3 分钟视频成片、链接和实际时长；
- 现场排练人、设备与实际耗时；
- 第三方服务条款和跨境处理要求；
- 赛期新增 `>=70%` 的官方口径与证据；
- 项目 LICENSE 和最终提交授权。

这些项目没有证据时必须保持 `TBD`，不能让 AI 自动写成已完成。

## 校验边界

`manifest.sha256` 用来检查解压后的文件是否改变。ZIP 自身 SHA-256 以 ZIP 同目录的 `.sha256` 文件为准。哈希和 Ed25519 签名只证明采集后完整性，不证明上游数据、模型结论或收益。
