# Team Confirmation Required

这些项目需要有权限的团队成员或主办方提供外部证据；Codex 不应猜测、代签或把技术测试结果改写成已完成。

| 项目 | 当前状态 | 需要的确认/证据 |
| --- | --- | --- |
| Team roles and names | `TBD — requires team confirmation` | 产品/工程、Demo 操作、合规复核和最终提交责任人 |
| Pre-hackathon ownership | `TBD — requires team confirmation` | 赛前资产的实际作者、来源、授权和可披露范围 |
| Hackathon-period `>=70%` work | `TBD — requires team confirmation` | 官方规则版本、分母、时间边界、可计入项、工作记录和核验人；不能用文件数量替代 |
| Official competition rules | `TBD — requires team confirmation` | 最终规则版本、评分/技术门槛、赛道、视频与现场时长，以主办方/报名后台为准 |
| Third-party terms and cross-border review | `TBD — requires team confirmation` | CoinLore、Coin Metrics、Alternative.me、GitHub 的当前条款、归属、限流、处理地域和参赛主体适用性 |
| Project license | `TBD — requires team confirmation` | 选择并批准项目许可证，再同步 `LICENSE`、README、NOTICE 和提交包 |
| Video and rehearsal | `TBD — requires team confirmation` | 成片文件/链接、实际时长、录制方式、演示人、设备、网络和排练记录 |
| Human confirmation policy | `TBD — requires team confirmation` | 是否要求 Paper 结果二次确认；当前实现没有实盘前批准功能 |
| Final external submission | `TBD — requires team confirmation` | 后台项目 ID、参赛资格、上传内容、最终 ZIP/仓库版本和有权提交授权 |

## Technical facts already verified

- Current checkout is a source repository, not the historical Windows portable candidate package.
- Offline source verification, generated audit examples, and Paper-only boundaries are reported in [`TEST_REPORT.md`](TEST_REPORT.md) and [`AUDIT_REPORT_SAMPLE.md`](AUDIT_REPORT_SAMPLE.md).
- TEE / ZKP / FHE are not used in the current prototype.
- `public-btc-live` is an external dependency; an unavailable public endpoint is recorded as unavailable, not as a successful live run.
