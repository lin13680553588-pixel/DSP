# DSP 飞书运维交接

更新时间：2026-09-10

## 每日自动运行

- GitHub Actions 主任务：中国时间 10:30。
- 飞书 `DSP 1035 定时兜底`：中国时间 10:35，每天重复，状态应为启用。
- 两者都触发 GitHub 的 `dsp-test-import.yml`。工作流名称仍保留 TEST 历史命名，但当前写入目标是飞书 `广告投放数据`。
- 飞书 `DSP自动` 接收 GitHub 数据，按日期、国家、Campaign name、Ad group name 查找记录；找到则更新，未找到则新增。

## 人工补某一天

1. 打开 GitHub 仓库 `N0119Ning/dsp-feishu` 的 Actions。
2. 选择 `Build DSP TEST import`。
3. 点击 `Run workflow`，分支保持 `main`。
4. 在日期输入框填写 `YYYY-MM-DD`，例如 `2026-09-05`。
5. 勾选 `Write results to the TEST Feishu workflow`。
6. 运行后确认 GitHub 为绿色成功，再到 `广告投放数据` 核对该日期。

重复补同一天应更新相同业务键的记录，而不是依赖人工删行。

## 无数据或数据不一致时

按以下顺序检查：

1. GitHub 是否创建了对应运行记录；没有记录时检查两个定时触发器是否启用。
2. GitHub 是否成功；Token 报错时脚本会自动重试最多 3 次。
3. 飞书 `DSP自动` 运行日志是否成功；GitHub 成功不代表飞书内部每一步都成功。
4. 核对日期、国家、DSP Order、DSP Line item 是否一致。
5. 核对该行是否因曝光量和本币花费同时为 0 而被过滤。
6. DE 金额按 `1 EUR = 1.15 USD` 固定换算；先与 DSP 原始 EUR 对照，再乘 1.15。
7. DPV 等 `14d` 指标是归因窗口，后续可能回补；必要时重新补跑该日期。

## 模板和副本

- 选择“仅多维表格结构”创建脱敏副本。
- 副本创建后立即关闭其中所有自动化。
- 删除客户数据、运行日志、账户关联和任何凭据痕迹。
- Webhook 地址由飞书生成，不能直接编辑。新客户副本应生成新 Webhook，并把 GitHub 对应 Secret 更新为新地址。
- 若复制后仍显示旧 Webhook，删除并重新创建接收流程，不要继续使用母版地址。
- 新客户的 GitHub PAT 只授予目标仓库 Actions 读写权限，并设置合理有效期。

## 不要做

- 不要把 PAT、Webhook、Token 或账户 ID 发给客户或写进仓库。
- 不要同时启用模板母版和客户副本中的相同定时任务。
- 不要把“曝光与花费均为 0”描述成 Amazon 官方 Delivering 状态。
- 不要在未核对下把德国金额再次乘汇率。

更完整的项目口径见 `PROJECT_MASTER.md`，术语见 `CONTEXT.md`。
