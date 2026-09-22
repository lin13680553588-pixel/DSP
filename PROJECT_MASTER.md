# DSP 飞书项目总览

最后更新：2026-09-10

## 当前状态

项目的日常自动导入链路已经跑通：Amazon DSP 报告可被 GitHub Actions 获取并处理，飞书接收工作流可新增或更新记录，手动指定日期补数可用，飞书定时兜底也已成功触发 GitHub 并完成写入。

当前飞书对象：

- 文件：`DSP广告数据自动更新`
- 数据表：`广告投放数据`
- 客户视图：`客户查看`
- 接收工作流：`DSP自动`
- 定时兜底工作流：`DSP 1035 定时兜底`
- 旧对象：集中在 `旧版` 分组，不参与当前链路

## 运行结构

```text
10:30 GitHub schedule ─┐
                       ├─ GitHub workflow ─ Amazon DSP report ─ data transform
10:35 Feishu fallback ─┘                                      │
                                                              ▼
                                                    Feishu workflow DSP自动
                                                              │
                                                              ▼
                                                       广告投放数据
```

两个触发器运行的是同一个 GitHub 工作流。10:35 飞书任务用于弥补 GitHub schedule 可能明显延迟的问题。重复触发依赖飞书按业务键更新已有记录，因此正常情况下不会故意生成重复行。

## 数据口径

每行粒度：`日期 × 国家 × DSP Order × DSP Line item`。

飞书展示字段：

`日期`、`国家`、`Campaign name`、`Ad group name`、`曝光量`、`DPV`、`点击量`、`花费 USD`、`销量`、`销售额 USD`、`订单量`、`新客订单`、`加购`。

字段来源：

- `Campaign name` 对应 DSP `orderName`。
- `Ad group name` 对应 DSP `lineItemName`。
- 流量、花费和归因指标均直接读取 CAMPAIGN 报告的 `ORDER + LINE_ITEM + DAILY` 粒度，不再拼接 PRODUCTS 报告。
- DPV 使用 `dpv14d`。`14d` 是归因窗口，不代表一次读取 14 天日期。
- 归因指标包括 DPV、加购、订单、新客订单、销量和销售额。

## 筛选规则

- 只处理目标 AutoFull 广告主。
- 当一行的曝光量和本币花费同时为 0 时，不写入飞书。
- 该规则是 delivery status 不可用时的代理规则。它不会把“有历史归因 DPV、但当日曝光和花费均为 0”的停投行写入。
- 它不等同于真正的 Delivering 状态判断；如果未来获得稳定的 Order/Line item 状态接口，应改为状态优先并重新验证。

## 金额换算

- US：DSP 报告金额按 USD 使用，汇率为 1。
- DE：DSP 报告 EUR 花费与销售额都乘以固定汇率 `1.15`，结果保留两位小数并写入 USD 字段。
- 当前不是实时汇率。若业务需要按日汇率，必须先明确汇率来源、日期口径和历史重算规则。

## 可靠性设计

- Token 获取最多尝试 3 次：首次立即请求，失败后分别等待 15 秒、45 秒重试。
- 重试只覆盖 Token 获取，不会盲目重复整套导入。
- GitHub 主定时为每天 `02:30 UTC`，即中国时间 10:30。
- 飞书兜底为每天中国时间 10:35，已通过实际触发验证。
- 手动运行可指定 `report_date=YYYY-MM-DD`；留空时刷新最近 3 个完整日期。
- 手动运行只有勾选 `write_feishu` 才会写入飞书。

## 已知限制与风险

1. Manager 账户当前没有可用且稳定的 Line item delivery status 读取路径；零曝光零花费仅为代理筛选。
2. GitHub schedule 不保证准点，曾出现长时间延迟，因此保留飞书兜底。
3. 德国站使用固定汇率 1.15；表内 USD 是业务换算值，不是逐日市场汇率。
4. 10:30 与 10:35 可能都执行；飞书查找/更新逻辑必须保持可重复运行。
5. 飞书关联 GitHub 账户使用仅限该仓库的细粒度 PAT。该令牌当前无过期时间，应定期人工轮换，不得写入文档、日志或仓库。
6. Amazon 归因数据可能回补，因此刷新最近 3 个完整日是预期行为。

## 运维原则

- 不在日志、截图、文档或代码中记录 Token、Webhook、PAT、Authorization Header、账户 ID 或客户原始数据。
- 补数前确认日期和 `write_feishu`，完成后核对 GitHub 运行结果及飞书记录数值。
- 不删除旧表和旧工作流，除非确认没有引用；优先停用并移入 `旧版`。
- 客户共享时只开放所需数据内容。若权限模型无法隐藏自动化，不要用“互联网链接可编辑”暴露母版。
- 制作模板时只复制结构，清空数据和日志，关闭复制出的工作流，并为新客户重新生成 Webhook、重新关联最小权限 GitHub 凭据。

## 接下来要持续验证

- 连续观察 3–7 天 10:30/10:35 的运行记录及飞书写入结果。
- 定期抽查 US、DE 的曝光、点击、花费、DPV、加购、订单、销量和销售额是否与 DSP 后台同日期、同 Line item 口径一致。
- 特别核验 DE 的原始 EUR、固定汇率和最终 USD，避免把已是 USD 的来源再次换算。
- 若状态 API 权限发生变化，优先恢复真正的 Delivering 筛选。

## 代码位置

- 实际仓库：`.remote-dsp-feishu`
- 导入脚本：`src/dsp_feishu_sync/build_test_import.mjs`
- GitHub 工作流：`.github/workflows/dsp-test-import.yml`
- 历史设计与计划：`docs/superpowers/`，仅用于追溯
