# Phase 0 Batch 3 — 发布、快照、通知与账本一致性

本批仅做本地实现与验证；没有真实邮件、线上刷新、生产部署、提交或推送。
起点为 `main` / `6625cdb8108fbcc7ffb6a003baae7c392ee90d51` 上已经存在的
Batch 1 / Batch 2 工作区修改。没有重做 ENSO、USDA、数据健康或 GDO 证据门槛。
没有新增数据库、队列、订阅系统或 Phase 1 元数据架构。

## A. 之前的失败模型及实际流水线

记源代码检出版本为 S；刷新后提交的数据版本为 D；最新持久化账本为 L。

| 原有阶段 | 实际读取或产生的版本 |
| --- | --- |
| 检出 / 测试 | 触发任务的 S；原默认浅检出 |
| 官方资料、天气、GDO、ENSO 刷新 | S 的适配器，更新工作区缓存；失败保留旧有效资料与原日期 |
| 预警评估 | 刷新后的四份缓存 + S 的历史预警 + S 的邮件账本 + S 的规则/作物配置 |
| 再测试 / Vite 构建 | 同一工作区；预警与缓存进入网站，邮件状态还是构建前的账本状态 |
| 生成数据提交 / 推送 | 提交五份 JSON，得到 D；直接推送 main |
| Pages 上传 / 部署 | 构建前提交、但数据字节对应 D 的 dist |
| 通知检出 | 从 build 输出取得 D，而不是直接检出最新 main |
| 账本读取 | 获取最新 main，仅把 alert-delivery.json 替换成 L |
| 通知资格 / SMTP | D 的预警 + L 的已发送记录；只有时间新鲜度与 episode 去重，没有发布顺序校验 |
| 账本保存 | SMTP 后原子写本地 JSON，保存恢复 artifact，再提交、rebase、推送 |

通知原本已经使用 D 的预警；问题不是通知每次任意读取最新预警，而是把**旧 D 的分析状态**
与**新 L 的邮件状态**组合，却无法判断两者的顺序。
在 72 小时窗口内重跑旧通知，未发送的旧信号可能被重新当成当前风险，旧健康状态也可能写回账本。
同一 market/episode 的去重无法证明整个发布是否已经过时。

SMTP 与 Git 不是一个事务。原流程没有发送前的持久化意图；服务器接受后若进程中断、本地写入失败或
账本推送失败，重试看不到接受记录，可能重复发送。JSON rebase 也不是通知状态合并策略。

## B. 新的不变量

> 每次通知必须来自指定发布 D 的原始预警快照；D 必须绑定源版本、评估输入和规则版本。
> 后续任务不能把通知/健康账本悄悄回退到更旧发布。SMTP 之前必须成功持久化发送意图。

不可变分析输入与可变发送状态明确分开。顺序使用 Git 提交祖先关系，不使用文件修改时间，
也不把较晚的评估/抓取时间误认为较新的发布。

## C. 最小发布身份

生成 `public/data/release-manifest.json`：

| 字段 | 必要性 |
| --- | --- |
| schemaVersion = 1 | 验证契约形状 |
| releaseId | 确定性评估身份：SHA-256(契约版本、S、评估时间、规则版本、inputsHash) |
| sourceRevision | 完整源提交 S；绑定规则、适配器和应用源代码 |
| evaluatedAt | 指出这次评估的时间窗口，但不单独用来排序 |
| rulesVersion | 沿用规则版本 1，没有改变触发规则 |
| inputsHash | 对有序输入清单的文件字节哈希再做 SHA-256 |
| snapshotSha256 | 对 monitor-alerts.json 的实际 UTF-8 字节校验 |

输入清单包括四份当前缓存、S 上的前次预警与邮件账本、代表点表、作物日历和官方发布日程。
缺失的可选缓存明确以 null 表示；无效但存在的文件仍按原始字节记录，不伪装成缺失。
生成后的预警携带 `release: {id, sourceRevision, inputsHash}`。

D 是包含这些文件的完整 Git 提交，不写进该提交自己的文件，避免自引用提交哈希。
它通过 build 输出传给 notify，并进入账本指针 `{releaseId, dataRevision, snapshotSha256}`。
验证要求 D 的直接前驱是 S，D 不混入源代码改动，快照与输入字节全部匹配 manifest。
旧无身份预警仍可供网页阅读；通知不接受缺失或损坏的身份。

## D. 修改后的流水线

```text
检出 S（完整历史）→ 测试 → 刷新缓存（保留 Batch 2 失败语义）
  → 评估 + manifest → 全量测试 → 构建
  → 校验 dist 与生成文件字节相同、源版本未改变、main 仍为 S
  → 提交并普通推送 D → 上传 Pages artifact → Pages 成功部署
  → notify 检出 D
  → git show D 的快照与 manifest（不可变）
  + 获取 main 的最新发送账本（可变）
  → 版本/资格校验 → 普通推送发送意图
  → 再核对最新账本与数据版本 → SMTP
  → 原子写结果 → 仅覆盖账本的提交 → 普通推送
  → 尝试保存恢复 artifact（无论通知成功与否）
```

通知内容不从工作区可能被修改的预警读取，而是始终从完整 D 的 Git 对象读取。
当前 main 只参与账本读取、分支竞态检查及判断是否已存在更新的生成数据发布。
没有为即时邮件时间再次构建网站。网页中邮件状态明确属于**构建前已经持久化的通知周期**，
服务器接收不等于收件箱投递。

数据提交前 main 已前进：拒绝，重新从当前 main 构建。推送竞态：普通推送失败，不部署该未成功推送版本。
账本保存使用临时 Git index 在最新 main 上仅覆盖账本，且要求原始账本哈希仍等于读取时的值。
人工修改其他文件会保留；并发账本修改或推送竞态直接失败，不自动合并 JSON，不 rebase，不 force-push。

## E. 重试语义

| 状态 | 行为 |
| --- | --- |
| 更新发布 | 验证输入与顺序，按既有 episode / severity 规则计算通知 |
| 同一发布，明确 SMTP 拒绝且失败结果已经持久化 | 可重新尝试；读取同一 D，不刷新、不重新评估、不构建 |
| 同一发布，已成功发送或无变化而成功处理 | 跳过 already-processed，不发送，不改写账本 |
| 未配置邮件 | 保存未配置状态和最新版本，但不标记该发布已完成发送；配置后仍可处理同一版本 |
| 存在未核实的 pendingAttempt | 标记 uncertain，暂停此后自动发送，等待人工核对 |
| 超过原有 72 小时新鲜度窗口 | 不发送过时风险；更新发布应重新检查资料 |

在 GitHub Actions 使用 **Re-run failed jobs**，或只重跑 notify job。
notify 的 `needs.build.outputs.published_sha` 保持 D，成功的 build/deploy 不重跑。
重跑整个 workflow 则是新的评估，不是同版本通知重试；旧检出遇到 main 前进会安全失败。
这是沿用 GitHub 自身重跑能力，没有新增工作流框架。
[GitHub 重跑文档](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)。

## F. 回退保护

账本新增 `latestRelease` 水位与 `lastProcessedRelease` 成功处理指针。
同一提交但身份冲突、复用身份到不同提交、分叉历史、无效指针全部失败关闭。
旧版本跳过，不更新 episode、健康状态、时间戳或成功指针；原因保存在日志与私有计划 artifact。

此外，获取 main 最近一次 manifest 修改对应的生成数据提交。
只要 main 已包含更新的数据发布，旧通知便以 superseded-data-release 跳过，
即使新 Pages 部署/通知失败。这是有意采用的保守策略：不以过时快照复活风险。

所以 N 通知失败后，N+1 进入 main，再重试 N：确定性跳过。
N+1 仍活跃、需要通知的 episode 可在 N+1 处理；已解除或待核实的旧状态不会被 N 复活。
若 N 有未核实发送意图，N+1 的邮件也暂停，不把 N 的未知结果自动当作未发送。

原有全流程 concurrency 保留，但不是顺序保证。GitHub 不承诺按创建顺序执行所有并发任务，
因此 Git 版本校验仍不可少。
[GitHub concurrency 文档](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)。

## G. SMTP 不确定性及恢复

`pendingAttempt` 只包含发布指针、稳定 Message-ID 与 preparedAt，没有收件人或邮件正文。
在 SMTP 前已经提交该意图。状态暂为 uncertain，意为尚无最终持久化结论，不是已投递。

| 故障 | 实际语义 |
| --- | --- |
| 连接 / 认证失败、明确 DATA/收件人拒绝 | 本地 failed，移除意图、不登记已发送 episode；失败结果成功推送后允许重试 |
| send_message 期间断线 / 超时 | 无法证明服务器是否接受 DATA；uncertain，保留意图，自动重发暂停 |
| SMTP 接收后 QUIT / close 失败 | 不推翻已知接收事实 |
| SMTP 接收后结果计算或本地文件写入失败 | 不谎称肯定未发送；Git 上仍有意图，之后暂停自动重发 |
| 本地成功回执已写，但提交 / 推送失败 | 本地恢复 artifact 可能证明 smtp-accepted；Git 仍为 pending，重试进入 uncertain |
| 意图推送失败 | 发送步骤不运行，没有 SMTP 接触 |
| 手动重跑 | 已处理就跳过，明确失败可重试，未知结果需核对；同一 Message-ID 不作为外部服务器必然去重的保证 |

恢复 artifact 保留 14 天，包含 `alert-delivery.json` 与 `.wfl-notification-plan.json`。
这是恢复资料，不是事务日志；runner 丢失也可能让 artifact 不可用。

人工恢复步骤（本次未执行）：

1. 核对 pending 的 releaseId / dataRevision / snapshotSha256 / Message-ID，查看该次通知的 artifact。
2. 若 artifact 有已知 SMTP 接收回执：基于**最新** main 账本，只合并该次真实接收的 episode、
   接收时间等字段；移除匹配意图。不能把旧整个账本覆盖新账本，不能降低 latestRelease。
   lastProcessedRelease 也只能前进。处理后仍需核对最新发布是否有待通知的升级。
3. 只有能确定 SMTP 未接收时，才移除匹配意图并保留失败状态，让当前有效发布重试。
4. 若无法确认，保留 uncertain。人为决定重发时必须明确接受重复邮件风险；没有自动强制重发开关。

这提供可证实的重复避免与明确失败重试，不承诺 exactly-once，也不承诺所有风险通知最终必达。
为避免重复而暂停未知结果，可能延迟后续所有邮件；网站分析与资料发布不因此停止。

## H. 本批精确变更文件

以下仅列 Batch 3，相对仓库根；工作区还有此前 Batch 1 / Batch 2 的修改。

- `.github/workflows/deploy-pages.yml`
- `scripts/evaluate_alerts.mjs`
- `scripts/release_pipeline.py`（新增）
- `scripts/send_alert_email.py`
- `src/services/releaseIdentity.js`（新增）
- `src/services/automaticAlerts.js`
- `src/services/alertFeed.js`
- `src/components/AlertCenter.jsx`（仅邮件周期说明及 uncertain 标签）
- `tests/releaseIdentity.test.js`（新增）
- `tests/test_release_pipeline.py`（新增）
- `docs/AUTOMATIC_MONITORING.md`
- `docs/PHASE0_BATCH3.md`（新增）

`public/data/` 本次没有改动；manifest 由之后真正运行评估的发布任务生成，未捏造线上发布身份。

## I. 测试与权限检查

新增 23 项测试：2 项 JavaScript、21 项 Python。Git 集成测试全部使用临时本地 bare remote；
邮件仅用注入的假发送器/SMTP mock，没有网络 SMTP。

覆盖：确定性身份、输入/源改变、精确字节哈希、缺失/损坏身份、JS 与 Python 校验互通；
N→N+1、同发布失败重试、同发布成功去重、旧发布和伪造未来时间不回退、升级；
更新发布解除与 unverified 不复活旧信号；新发布先到时旧重试跳过；
SMTP 接收后未保存、本地写失败、推送失败、持久化意图缺失、SMTP 期间断线；
QUIT/close 失败、接收后的回执计算错误；并发账本与人工源代码提交；
dist 不匹配、非数据脏文件、陈旧检出、输入被改、源代码混进数据提交、真实 Git 分叉；
工作流发送前 checkpoint、build 不读取通知 Secrets、无 PR secrets 入口。
此前真正的资料缺失/核实中断/解除状态机、ENSO、USDA 与健康门槛测试仍全部通过。

最终验证：

- 完整 JavaScript：95 passed。
- 完整 Python：95 passed。
- 总计 190 passed，0 failed。
- 生产构建成功；保留已有约 1 MB JS 包的体积警告，不在本批做拆包重构。
- `git diff --check` 通过；真实仓库 HEAD 保持原值。

默认权限仅 contents:read；build/notify 各自仅 contents:write；
Pages/id-token 写权限只给 deploy。真实 SMTP Secrets 仅出现在发送步骤，
prepare 仅得到“配置是否齐全”的布尔值；build 不读取这些 Secrets。
没有 pull_request 触发器，没有新增地址、凭据或原始 SMTP 错误内容到公开 JSON。

## J. 剩余风险与明确边界

- Git 与 SMTP 无分布式事务。持久化意图可防自动重复，但无法区分“意图保存后尚未发送”与
  “已发送但未保存回执”；两者都需人工核对。
- main 在最终发送前检查之后仍可能被外部工作流/人工前进。全流程 concurrency 限制本工作流，
  不能锁住所有外部写入。账本比较与普通推送防静默覆盖，但不能撤回已被 SMTP 接收的邮件。
- GitHub job 重跑实际执行与 Pages 服务可用性没有在线验证（遵守不部署约束）。
  本地覆盖的是版本与状态逻辑，不是云服务端到端测试。
- 仅本工作流的成功 Pages 依赖证明发布后才通知；单独运行 CLI 无法认证某提交曾在 Pages 成功上线。
  CLI 要求合法 main 内数据版本与持久化意图，但操作者仍必须遵守发布后通知的顺序。
- main 上更新的数据版本即使尚未上线也阻止旧邮件；新部署失败时可能暂时没有邮件，
  需要先恢复最新网站发布，而不是把旧风险当当前发送。
- 超过 72 小时不重发旧风险；通知是单收件人变化摘要，不是完整生产预警保证。
- 历史 legacy 账本可以迁移 episode 收据，但不反向伪造旧 release 指针。
  首次启用后从新的有效 manifest 开始建立水位。
- artifact 14 天后过期、Git 历史改写/缺失、分叉都需要人工恢复；无自动强制绕过。
- 当前使用完整 40 位 SHA-1 Git commit 身份；未来仓库对象格式改变需明确迁移。

## K. Phase 1 启示（未实施）

将来可把 sourceRevision / inputsHash / rulesVersion 与规范化数据版本、观测身份和
Central Data Health 衔接；评估快照与发送账本应继续保持分离。
`latestRelease`、`lastProcessedRelease`、`lastAttemptRelease` 与 pendingAttempt 是轻量发布/发送状态，
不是 canonical dataset metadata，更不是完整事件数据库。
若未来需要多通道、可靠恢复工具或更高投递保证，再设计事务性 outbox 和权限边界；本批没有实现这些。
