# 更新代码与迁移到 Fork

第一次部署见[网页教程](deployment-manual.md)。默认配置沿用 Worker 控制台的 `DB` 绑定和运行时密钥，不需要在 Fork 写个人数据库 ID。

## 已经是 Fork：同步更新

1. 打开自己的 GitHub 仓库，确认显示 `forked from maodeyu180/TelegramDoor`，切换到生产分支 `main`。
2. 查看版本说明；新版本如要求数据库迁移，按说明处理。当前运行时只自动初始化首版表结构。
3. 点击 **Sync fork → Update branch**。
4. 到 Worker 的 **Settings → Builds** 查看最新提交的构建，确认发布成功，再检查 `/health`、后台数据和机器人收发。

默认流程不用修改仓库配置，因此减少了同步时的配置冲突。**Sync fork 不会持续自动同步上游**；每次手动同步产生的新提交，才会触发 Cloudflare 自动部署。

自己修改过代码或配置、出现合并冲突时，保留有用改动并解决冲突，不要直接丢弃所有个人提交。沿用旧的固定数据库 ID 也受支持；不得把有效 ID 换成全零占位值。

官方说明：[GitHub 同步 Fork](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/syncing-a-fork)、[Cloudflare Git 构建](https://developers.cloudflare.com/workers/ci-cd/builds/)。

## 从旧版固定 ID 改用控制台绑定

只在需要使用新版简化配置时操作；已经正常工作的固定 ID 配置可以继续保留。

1. 在**现有 Worker** 的 Bindings 中确认 `DB` 指向原数据库，且绑定已保存到当前部署。先完成这一步，再更新代码。
2. 在自己的 Fork 同步新版。合并冲突时，可移除 D1 条目的 `database_id` 和 `database_name`，保留 `binding: "DB"` 与 `migrations_dir`。
3. Worker 名称与默认 `telegramdoor` 不同时，在 **Settings → Builds** 将部署命令设为 `npm run deploy -- --name 实际Worker名称`。名称不必再写进 Fork。
4. 构建新版后，确认绑定仍指向原数据库，历史记录与设置仍在。

省略数据库名称和 ID 的前提是 Worker 上已有正确的 `DB` 绑定；不需要更名、重建或清空数据库。原来写进 Fork 的个人 ID 不会因为上游删除占位值就必然自动消失，请检查合并结果。

## 已用旧按钮部署：如何迁到 Fork

模板按钮创建的独立副本没有原项目的 Fork 关系；在旧副本上点击 Fork，不会把它变成 TelegramDoor 的 Fork。

迁移只切换代码来源，继续使用原 Worker、数据库和密钥：

1. 从 [TelegramDoor 源项目](https://github.com/maodeyu180/TelegramDoor/fork)创建真正的 Fork。名称已占用时取新名，如 `telegramdoor-fork`，保留旧仓库。
2. 打开原 Worker，确认 `DB` 指向现有机器人的数据库，三个运行时密钥已保存。已有自定义代码需要先迁入新 Fork；默认配置无需编辑。
3. 在原 Worker 的 **Settings → Builds** 断开旧仓库的 Git 连接（**Disconnect**），再 **Connect** 选择新 Fork；不要删除 Worker。
4. 生产分支 `main`，根目录 `/`，构建命令留空，部署命令 `npm run deploy`。原 Worker 不叫 `telegramdoor` 时，用 `npm run deploy -- --name 实际Worker名称`。
5. 启动最新提交的构建；若连接后未自动触发，在 Builds 启动构建，或向 Fork 提交一次文档修改。不要重跑旧仓库的构建记录。
6. 发布后检查 `/health`、后台历史记录、封禁列表和 Telegram 双向通信。

域名和 Bot Token 相同时，原 Webhook 可继续使用，在后台点击「检查连接」确认。更换域名或 Token 才需按[迁移说明](migration.md)重新连接。

官方说明：[切换 Worker 关联仓库](https://developers.cloudflare.com/workers/ci-cd/builds/#disconnecting-builds)。

## 同步了，但页面还是旧版

- **代码**：自己的 Fork 是否有上游新提交，Worker 是否关联这个 Fork 的 `main`。
- **构建**：最新记录是否对应新提交，有没有名称、绑定、权限或构建错误。
- **发布**：部署命令应为 `npm run deploy`（自定义名称时附加 `-- --name ...`），确认成功版本是当前生产版本。

只更新上游不会让所有人的部署自动升级；重新点击模板按钮也不会更新当前 Worker。
