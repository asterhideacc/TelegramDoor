# 部署排错

官方部署按钮会将源码复制到部署者自己的 GitHub/GitLab 账号，再创建资源、构建并发布。它需要关联部署者的 Git 账号；源仓库可以是别人的公开仓库，Project name 不需要全网唯一。Git 副本不会自动同步上游更新。参见 [Cloudflare 部署按钮说明](https://developers.cloudflare.com/workers/platform/deploy-buttons/)。

## 仓库创建失败或源码不完整

如果提示 `Cloudflare could not create the Git repository right now`，问题出在创建/导入 Git 仓库阶段，此时 Telegram Token、Turnstile 和程序里的建表代码还没有运行。

1. 检查目标 GitHub 账号是否已有同名仓库，以及 Cloudflare 账号是否已有同名 Worker；测试时可以用一个未使用的名字。
2. 在 GitHub「Settings → Applications → Installed GitHub Apps」检查 Cloudflare Workers and Pages 对目标账号/仓库的访问权限；组织账号还可能需要管理员批准。
3. 检查刚创建出的仓库。至少应包含 `package.json`、`package-lock.json`、`src/`、`migrations/`、`wrangler.jsonc`。只有 `README.md` 和 Wrangler 配置时，源码导入没有完成，重新点构建也无法补齐源码。

Cloudflare 上游有[源码导入不完整的报告 #31](https://github.com/cloudflare/developer-platform/issues/31)：生成仓库只有两个文件，提交为 `Initial commit` 和 `Uploading template.`；报告还列出了官方模板遇到相同现象的案例。截至 2026-09-17，该问题仍未关闭。这是相同现象的证据，不是对每次通用报错根因的确认；模板无法保证绕过 Cloudflare 的导入服务故障。

本项目没有启用状态的 `.github/workflows/` 文件，以排除额外工作流写权限风险；这项预防措施并不能证明或修复所有导入失败。详细权限背景见[贡献指南](../CONTRIBUTING.md)。

持续失败时，可向 Cloudflare 支持提供失败时间、源仓库链接、生成仓库链接及上述提交记录。不要提供 Bot Token 或后台密码，也不必反复删除仓库。

### 全程浏览器的替代路径

若部署按钮持续卡在导入阶段，可以手动完成它的工作，仍不需要本地命令行：

1. 在 GitHub Fork [完整的 TelegramDoor 源仓库](https://github.com/maodeyu180/TelegramDoor)，确认文件齐全。
2. 在 Cloudflare D1 页面创建这个机器人专用的数据库，复制数据库 ID。在 Fork 的 `wrangler.jsonc` 中给现有 `d1_databases` 项添加 `database_id`，并将 `database_name` 改为实际名称，保留 `binding: "DB"`，然后提交。这一步替代部署按钮的资源创建与配置回写，不运行 SQL。
3. 在 Cloudflare Workers & Pages 创建 Worker，选择导入已有 Git 仓库并关联这个 Fork。仓库根目录为 `/`，构建命令 `npm run build`，部署命令 `npm run deploy`。Worker 名称最好与 Fork 中 `wrangler.jsonc` 的 `name` 保持一致。
4. 在对应 Worker 的「设置 → 变量和机密」中添加 `ADMIN_PASSWORD`、`BOT_TOKEN`、`OWNER_ID`，保存并使配置生效。**普通的 Git 仓库导入不会像模板按钮一样保证自动询问这三个密钥**；不要只把它们填到构建变量中。
5. 打开 Worker HTTPS 地址，登录后台，管理员向机器人发送 `/start`，在后台点击「连接 Telegram」。

这条路径比按钮多了资源绑定和密钥录入步骤，但可以避开模板源码导入环节。选择数据库时使用空的新库；不要误选其他应用正在使用的数据库。

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
