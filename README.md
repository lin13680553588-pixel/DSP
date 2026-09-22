# Amazon DSP → 飞书多维表格

该项目每日从 Amazon DSP 获取 US、DE 的 CAMPAIGN 报告（`ORDER + LINE_ITEM + DAILY` 粒度），经飞书工作流 `DSP自动` 写入多维表格。每条记录的业务键是：`日期 + 国家 + Campaign name + Ad group name`。飞书工作流必须据此查找后更新，找不到才新增。

## 已实现的运行规则

- GitHub Actions 每日 10:30（中国标准时间）执行；手动运行支持单日或日期范围补数。
- 默认刷新最近三个完整的中国日期，允许归因指标回补。
- 仅保留广告主名称匹配 `DSP_ADVERTISER_NAME_PATTERN`（默认 `AutoFull`）的记录。
- 曝光量和本币花费均为 0 的记录不会写入。这是停投的代理规则，不是 Amazon 的 delivery status。
- DE 金额按固定汇率 `1 EUR = 1.15 USD` 写入 USD 字段；US 按 1:1。
- 同一次数据内的重复业务键、无效日期、空 Order/Line item、负数指标和点击大于曝光会使运行失败，避免静默写入错误数据。
- 仅 Token 获取有 3 次退避重试；不会在网络错误时盲目重放整批飞书写入。

## 配置

将 `.env.example` 中的值配置为 GitHub Secrets（不要提交 `.env`）：

| GitHub Secret | 用途 |
| --- | --- |
| `AMAZON_TOKEN_ENDPOINT` | 返回短期 Amazon access token 的已授权安全端点 |
| `AMAZON_ADS_CLIENT_ID` | Amazon Ads API client ID |
| `FEISHU_WEBHOOK_URL` | `DSP自动` 接收工作流的 Webhook URL |
| `FEISHU_WEBHOOK_TOKEN` | 对应 Webhook verification token |

可选 GitHub Actions Variable：`DSP_ADVERTISER_NAME_PATTERN`。例如 `AutoFull`；不要填客户账号 ID。

飞书 Webhook 接收的字段为：`report_date`、`country`、`campaign_name`、`ad_group_name`、`impressions`、`dpv`、`clicks`、`spend_usd`、`units_sold`、`sales_usd`、`purchases`、`new_to_brand_purchases`、`atc`、`business_key`。

## 飞书工作流必须满足

1. 接收 Webhook JSON。
2. 用 `report_date`、`country`、`campaign_name`、`ad_group_name` 查找目标多维表格记录（或使用 `business_key`）。
3. 找到记录时更新 13 个展示字段；没有记录时新增。
4. 不要让 Webhook 自动化再次触发同一个 GitHub 工作流。10:35 兜底若保留，只能由独立的飞书定时任务触发。

## 原交接资料

远端仓库原有的业务口径和运维说明已保留在根目录：
[`PROJECT_MASTER.md`](PROJECT_MASTER.md)、[`HANDOFF_DSP_FEISHU.md`](HANDOFF_DSP_FEISHU.md)、[`CONTEXT.md`](CONTEXT.md)。如与当前代码冲突，以本 README 和 `src/dsp_feishu_sync/` 为准。

## 验证与上线

```bash
node --check src/dsp_feishu_sync/main.mjs
node --test test/core.test.mjs
# GitHub Actions 手动运行：先填写 start_date/end_date，write_feishu 保持 false。
# 核对日志后再将 write_feishu 设为 true。
```

首次上线建议补跑一个历史日，核对 US、DE 的 DSP 原始报表和飞书数值；再重复写入同一天，确认飞书更新而不是新增。确认后再启用（或保留）飞书 10:35 兜底。
