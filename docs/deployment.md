# 一键部署与排错

默认使用 [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fmaodeyu180%2FTelegramDoor)。**不需要先 Fork，也不需要在自己的电脑 clone。** 需要登录自己的 Cloudflare 和 GitHub 账号并授权；向导会把本项目复制到你的 GitHub 账号，再创建资源、构建并发布。

如果按钮持续失败，使用[浏览器分步备用教程](deployment-manual.md)。分步方案里的 Fork、手工建 D1、填写 ID 不是正常一键部署的前置步骤。

## 正常流程

1. 准备 `ADMIN_PASSWORD`、`BOT_TOKEN`、`OWNER_ID` 三个值，格式见 [README](../README.md#三个必填配置)。曾使用旧双向服务的机器人先按[迁移说明](../README.md#从其他双向机器人迁移)撤销旧 Token。
2. 点击源仓库的部署按钮，选择自己的 Cloudflare 账户，连接自己的 GitHub 账号。公开源仓库可以属于别人。
3. 在向导中选择仓库/Worker 名称，填写三个密钥。D1 选择 **Create new**，名称可保留 `telegramdoor`；自己的账户内有同名资源时换个可用名称。不要选择其他应用的数据库。
4. 保留根目录 `/`、部署命令 `npm run deploy`。向导复制源码、创建 D1 并将真实数据库 ID 写入副本里的 `wrangler.jsonc`；部署脚本构建后台并发布 Worker。
5. 确认发布成功，再打开 Worker 地址的 `/health`，应返回 `{"ok":true,"version":"0.1.0"}`。首次请求自动建表，无需手工运行 SQL。
6. 登录后台，管理员用自己的 Telegram 账号向机器人发送 `/start`，在「防护设置」点击「连接 Telegram」和「检查连接」，再用另一个账号验收双向通信。

**成功检查点：** GitHub 副本包含完整源码；D1 数据库真实存在；配置中的 `database_id` 与该账户 D1 详情一致，已不是全零占位值；Worker 发布成功且 `/health` 正常。只有生成了一个数据库 ID、完成前端构建或创建了占位 Worker，都不算部署完成。

表结构初始化只负责已有 D1 数据库内部的表，不能补建 Cloudflare 账户里的数据库资源。默认算术验证只需要上述三个密钥；Turnstile 是可选功能，启用时另行创建组件并填写两个 key。

当前本项目的一键部署仍待真实账户验收。本地构建、测试和 dry-run 不能验证 Cloudflare 控制台的仓库导入、账户授权及资源创建服务。

## 需要先 Fork 吗

不需要。Cloudflare 的部署按钮直接接收本仓库的公开 URL，由向导创建部署者自己的 Git 副本。这不是将维护者的仓库绑定到所有用户的 Worker，也不会自动同步上游更新。[官方流程](https://developers.cloudflare.com/workers/platform/deploy-buttons/)

两条入口有不同的配置步骤：

| 入口                                | 仓库                          | D1 与密钥                               |
| ----------------------------------- | ----------------------------- | --------------------------------------- |
| README 的 Deploy to Cloudflare 按钮 | 向导自动复制，无需提前 Fork   | 向导创建并绑定 D1，询问三个密钥         |
| Cloudflare 导入已有 Git 仓库        | 先有自己的完整副本，例如 Fork | 按备用教程创建并绑定 D1，设置运行时密钥 |

只 Fork 不会修复 D1 自动创建的问题。Fork 后 README 的按钮仍指向原项目，继续点它仍会进入复制模板的流程；要使用自己已有的 Fork，请按[备用教程](deployment-manual.md)从 Cloudflare 导入已有仓库。

## 与公开模板的配置对照

2026-09-17 对照了公开源代码和部署文档。这是配置比较，不代表在同一账户完成了这些项目的部署实测，也不能推算按钮的整体成功率。

| 项目                                                                                            | 是否要求提前 Fork      | D1 模板配置                                        | 建表与后续步骤                                            |
| ----------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| [Cloudflare D1 模板](https://github.com/cloudflare/templates/tree/main/d1-template)             | 按钮直接指向官方源仓库 | 同时提供 `binding`、`database_name`、`database_id` | `predeploy` 调用远程迁移                                  |
| [Payload D1 模板](https://github.com/payloadcms/payload/tree/main/templates/with-cloudflare-d1) | 不要求                 | `database_id: "DATABASE_ID"` 占位值                | 发布脚本执行数据库迁移，再构建发布；还使用 R2             |
| [web-monitor-rss](https://github.com/isitest1/web-monitor-rss/blob/main/QUICKSTART.md)          | 不要求，按钮复制源仓库 | `database_id` 为全零 UUID 占位值                   | 发布前远程迁移；发布后另填 Worker 密钥、GitHub Secrets 等 |
| TelegramDoor                                                                                    | 不要求                 | 本次补齐全零 `database_id` 占位值，由向导替换      | 三个密钥由向导询问；发布后首次请求通过绑定建表            |

官方按钮文档要求为资源名称、资源 ID 等属性提供默认值。TelegramDoor 此前省略 `database_id`，这次按[官方要求](https://developers.cloudflare.com/workers/platform/deploy-buttons/#automatic-resource-provisioning)及 [web-monitor-rss 的配置](https://github.com/isitest1/web-monitor-rss/blob/main/wrangler.toml)补齐。占位值属于模板，不能拿它直接绑定生产 Worker；命令行/分步部署必须替换为自己的真实 ID。不要复制其他模板的实际数据库 ID。

**这是模板兼容性修正，尚未证实是此前 D1 未创建的根因。** 此前失败副本已被向导写入非占位 ID，但同一 Cloudflare 账户没有对应数据库，说明还需要验证资源是否实际创建。先 Fork 不能代替这项验证。

其他差异也不能混为一谈：

- 本项目从仓库根目录部署，前后端属于同一个 npm 项目，没有跨目录 workspace 依赖；不涉及按钮截取 monorepo 子目录后丢失依赖的问题。
- 其他模板在构建时迁移，本项目在运行时通过 `DB` 绑定初始化表结构，避免额外依赖构建令牌的 D1 编辑权限。建表时机不会解释发布时数据库资源不存在的问题。
- Payload 模板注明因 Worker 包体大小需要 Workers Paid，这是该模板自身的限制，不是 D1 的收费门槛。TelegramDoor 不依赖 R2；D1 在 Workers Free 中有免费额度。[Payload 说明](https://github.com/payloadcms/payload/blob/main/templates/with-cloudflare-d1/README.md)、[D1 定价](https://developers.cloudflare.com/d1/platform/pricing/)

## 仓库创建失败或源码不完整

如果提示 `Cloudflare could not create the Git repository right now`，问题出在创建/导入 Git 仓库阶段，此时 Telegram Token、Turnstile 和程序里的建表代码还没有运行。

1. 检查目标 GitHub 账号是否已有同名仓库，以及 Cloudflare 账号是否已有同名 Worker；测试时可以用一个未使用的名字。
2. 在 GitHub「Settings → Applications → Installed GitHub Apps」检查 Cloudflare Workers and Pages 对目标账号/仓库的访问权限；组织账号还可能需要管理员批准。
3. 检查刚创建出的仓库。至少应包含 `package.json`、`package-lock.json`、`src/`、`migrations/`、`wrangler.jsonc`。只有 `README.md` 和 Wrangler 配置时，源码导入没有完成，重新点构建也无法补齐源码。

Cloudflare 上游有[源码导入不完整的报告 #31](https://github.com/cloudflare/developer-platform/issues/31)：生成仓库只有两个文件，提交为 `Initial commit` 和 `Uploading template.`；报告还列出了官方模板遇到相同现象的案例。截至 2026-09-17，该问题仍未关闭。这是相同现象的证据，不是对每次通用报错根因的确认；模板无法保证绕过 Cloudflare 的导入服务故障。

本项目没有启用状态的 `.github/workflows/` 文件，以排除额外工作流写权限风险；这项预防措施并不能证明或修复所有导入失败。详细权限背景见[贡献指南](../CONTRIBUTING.md)。

持续失败时，可向 Cloudflare 支持提供失败时间、源仓库链接、生成仓库链接及上述提交记录。不要提供 Bot Token 或后台密码，也不必反复删除仓库。

## 发布时提示 D1 不存在（10181）

`D1 binding 'DB' references database '…' which was not found` 表示发布引用的数据库无法在当前账户找到。它与 Telegram Token、算术验证、Turnstile 或数据库里有没有表无关。

1. 在 **Worker 所属的同一 Cloudflare 账户**打开 D1 列表，确认数据库是否实际存在。
2. 对照部署者副本 `wrangler.jsonc` 的 `database_id` 和数据库详情页的 Database ID；不要拿源模板的占位值、账户 ID 或其他账户的数据库 ID 代替。
3. 如果列表为空，自动资源创建没有完成；不应把配置里生成了 ID 当成创建成功。先检查日志中是否有更早的资源创建/权限错误。错误码本身不能确认失败的具体原因。
4. 测试修正后的源模板时，需要让按钮重新复制最新源码。源仓库的更新不会自动进入已有副本，重跑旧提交也不会获得新配置；可换未使用的名称测试，不必删除已有资源。
5. 持续失败时，按[备用教程](deployment-manual.md#从失败的按钮部署继续)复用完整副本和 Worker，手工补建并绑定 D1。如果资源实际存在且账户、ID 均一致仍报错，保留日志联系 Cloudflare 支持，不要反复删除数据库。

这些步骤用于定位或恢复，手工补建成功不能算作一键部署成功。D1 不要求先购买付费套餐；没有证据表明升级套餐能修复这次故障。

## 已导入完整源码，但构建或启动失败

| 现象                                         | 检查与处理                                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 找不到 `package.json`、`src/worker/index.ts` | 检查源码是否完整，构建根目录是否为仓库根目录。                                                            |
| Node/Vite 报版本不支持                       | 保留 `.node-version`；当前选择 Node.js 24。删除构建设置中冲突的旧 `NODE_VERSION` 覆盖值后重试。           |
| 找不到 `dist` 或静态页面                     | 使用 `npm run deploy`，它自身包含前端构建；只运行 `wrangler deploy` 前必须先 `npm run build`。            |
| 旧构建命令在 D1 迁移时报权限错误             | 更新源码并确认部署命令是新的 `npm run deploy`；当前版本已取消部署前的远程迁移，首次请求通过 D1 绑定建表。 |
| 页面提示缺少三个配置                         | 在 Worker 的「变量和机密」配置运行时密钥。Build variables/secrets 只对构建过程可见。                      |
| 页面提示缺少 `DB` 绑定                       | 检查资源绑定名是否严格为 `DB`，指向自己账户的 D1，并让 `wrangler.jsonc` 与实际绑定一致。                  |
| 初始化暂时失败，HTTP 503                     | 稍后刷新；持续失败时检查 D1 绑定、数据库状态和额度。失败事务不会留下半套表结构，不需要清空数据库。        |
| 页面仍是 Hello World                         | 检查完整源码是否真的构建成功并发布；占位 Worker 存在、密钥保存成功不等于应用已发布。                      |

当前运行时自动初始化只负责初始表结构。重新部署不会重置用户、封禁或后台设置；未来新增迁移需按对应版本升级说明执行。

官方参考：[构建配置、令牌权限与运行时变量](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)、[构建环境与 Node 版本](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)、[Worker 名称限制](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/#limitations)、[D1 事务批处理](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)。
