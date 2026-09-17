# 更新代码与迁移到 Fork

推荐部署流程是 **GitHub Fork → Cloudflare 关联这个 Fork → Sync fork 获取更新 → Cloudflare 自动构建发布**。第一次部署见 [Fork 部署教程](deployment-manual.md)。

## 已经是 Fork：同步更新

1. 打开自己的 GitHub 仓库，确认仓库名下显示 `forked from maodeyu180/TelegramDoor`，切换到生产分支 `main`。
2. 查看上游更新说明；如新版本要求数据库迁移，先按该版本说明处理。当前运行时只自动初始化首版表结构，不会自动执行所有新增迁移。
3. 在文件列表上方点击 **Sync fork → Update branch**。这是获取上游提交，不是再次点击右上角的 Fork。
4. 同步成功后，已关联该 Fork 的 Cloudflare Worker 会构建 `main` 的最新提交。在 **Worker → Deployments → View build history** 查看构建，确认对应最新提交且发布成功，再访问 `/health` 和后台。

如果提示冲突，GitHub 会要求创建 Pull Request 解决。合并 `wrangler.jsonc` 时，保留自己的 Worker `name`、D1 `database_name` 和真实 `database_id`，结合上游新增配置解决冲突；不要把自己的 ID 换回全零占位值。不要用丢弃自己提交的方式强行同步，否则部署配置也可能丢失。

**Sync fork 不会一直自动同步上游。** 每次需要更新时手动同步；同步到生产分支的新提交再触发 Cloudflare 的自动部署。没有新提交时，显示已同步是正常的。

官方说明：[GitHub 同步 Fork](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/syncing-a-fork)、[Cloudflare Git 构建](https://developers.cloudflare.com/workers/ci-cd/builds/)。

## 已用旧按钮部署：如何迁到 Fork

旧的 Deploy to Cloudflare 模板按钮通常创建独立源码副本，没有 GitHub Fork 关系。不能通过在旧副本页面点击 Fork，将它变成原项目的 Fork。

迁移只切换 Worker 的代码来源，不需要重新创建机器人或数据库。操作前记录现有 Worker 名称、所属 Cloudflare 账户、D1 名称和 Database ID；这些可以在现有配置和 Cloudflare 控制台核对，不需要导出或公开密码、Bot Token。

1. 从 [TelegramDoor 源仓库](https://github.com/maodeyu180/TelegramDoor/fork)点击 **Fork → Create fork**。如果原仓库名已被独立副本占用，为新 Fork 取未使用的名称，例如 `telegramdoor-fork`；保留旧仓库。
2. 在新 Fork 编辑 `wrangler.jsonc`，将顶层 `name` 设置为**现有 Worker 的名称**，不必与新 Fork 的仓库名相同。把 D1 名称、真实 ID 设置为**现有机器人的数据库**，绑定名保持 `DB`。将这份配置提交到新 Fork 的 `main`。有其他自定义代码或配置时，也先检查并迁入需要保留的部分。
3. 在 Cloudflare 打开**原来的 Worker**，进入 **Settings → Builds**，确认旧的 Git 仓库关联。选择 **Disconnect** 断开构建关联，再 **Connect**，授权并选择新的 Fork。这里断开的是 Git 构建连接，不是删除 Worker。
4. 配置生产分支 `main`、根目录 `/`、构建命令 `npm run build`、部署命令 `npm run deploy`。原 Worker 名称必须与第 2 步配置一致。
5. 连接后确认新 Fork 的最新提交已开始构建；若没有触发，可以在新 Fork 提交一次实际的文档修改触发构建。不要重跑仍属于旧仓库的构建记录。
6. 在 **Settings → Variables and Secrets** 核对三个运行时密钥仍在原 Worker 上；不需要把它们提交到新 Fork。发布后检查 `/health`、后台历史记录、封禁列表和 Telegram 双向通信。

复用相同的 Worker 域名和 Bot Token 时，已有 Webhook 地址可继续使用；在后台点击「检查连接」确认。若更换域名或 Token，再按 [迁移说明](../README.md#从其他双向机器人迁移)重新连接 Telegram。

新 Fork 关联成功后，后续更新使用上面的 **Sync fork → Update branch**。数据库绑定保持同一个真实 ID，才能继续访问原来的消息记录和设置。

官方说明：[切换 Worker 关联仓库](https://developers.cloudflare.com/workers/ci-cd/builds/#disconnecting-builds)。

## 同步了，但页面还是旧版

检查 **代码更新、构建、发布** 这三个状态：

- **代码**：自己的 Fork 是否已有上游的新提交；Cloudflare 关联的是否正是这个 Fork 的 `main`。
- **构建**：最新构建是否使用新提交，是否因配置冲突、D1 ID 或权限问题失败。
- **发布**：部署命令应为 `npm run deploy`；确认成功版本是当前生产部署，然后刷新页面。

只更新维护者的源仓库不会让所有部署自动升级。重新点击模板按钮会创建另一个副本，也不会更新当前 Worker。
