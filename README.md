# DSP 飞书自动同步

Amazon DSP Line item 日报到飞书多维表格的项目工作区。

截至 2026-09-10，GitHub Actions 拉取、指标处理、飞书写入、重复运行更新和飞书 10:35 兜底触发均已实际跑通。运行代码位于 `.remote-dsp-feishu`；本目录中的文档是项目交接与操作依据。

## 文档入口

- `PROJECT_MASTER.md`：当前架构、规则、已知限制与维护原则
- `HANDOFF_DSP_FEISHU.md`：日常运行、补数、排错与模板复用手册
- `CONTEXT.md`：项目统一术语
- `handoff_next.md`：下一次接手时的最短入口

## 当前生产链路

1. GitHub Actions 每天中国时间 10:30 运行。
2. 飞书工作流 `DSP 1035 定时兜底` 每天 10:35 再触发同一 GitHub 工作流。
3. 脚本读取 US、DE 的 Amazon DSP Line item 日报。
4. `DSP自动` 工作流按业务键更新或新增到 `广告投放数据`。

德国花费和销售额使用固定汇率 `1 EUR = 1.15 USD` 转为美元。当前无法可靠取得每个 Line item 的 delivery status，因此采用“曝光量和本币花费同时为 0 时排除”的业务规则。

任何历史设计文档只用于追溯；如与 `PROJECT_MASTER.md` 冲突，以后者及当前代码为准。
