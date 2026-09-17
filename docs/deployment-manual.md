# Fork 后部署到 Cloudflare（推荐）

推荐先在 GitHub Fork 本项目，再让 Cloudflare 直接构建这个 Fork。这样既避开模板按钮创建 Git 仓库的环节，也保留 `Sync fork` 更新入口。全程使用网页，不需要安装 Node.js、运行命令行或手工执行 SQL。

流程：**Fork → 创建 D1 → 填写绑定 → 在 Cloudflare 选择自己的 Fork → 保存三个密钥 → 连接 Telegram**。机器人仍只有三个必填环境变量，但首次还需创建 D1 并填写数据库 ID。

已有可用 Worker、想从旧模板副本换成 Fork？请按[迁移步骤](updating.md#已用旧按钮部署如何迁到-fork)继续使用原来的数据库和 Worker。尚未部署成功则可看[从失败的按钮部署继续](#从失败的按钮部署继续)。

## 1. 准备账号、配置和仓库

准备 GitHub、Cloudflare 账号，以及以下三个值：

| 名称             | 填写内容                                                     |
| ---------------- | ------------------------------------------------------------ |
| `ADMIN_PASSWORD` | 自己设置的后台密码，至少 8 个字符。                          |
| `BOT_TOKEN`      | Telegram 官方 `@BotFather` 提供的机器人 Token。              |
| `OWNER_ID`       | 管理员个人账号的数字用户 ID，不是用户名、群 ID 或机器人 ID。 |

如果机器人以前接入过其他双向服务，先按[迁移说明](../README.md#从其他双向机器人迁移)撤销旧 Token，再使用新 Token。

打开 [TelegramDoor 源仓库](https://github.com/maodeyu180/TelegramDoor)，点击右上角 **Fork → Create fork**，复制到自己的 GitHub 账号。仓库名可以保留 `TelegramDoor`。如果已有这个项目的 Fork，直接使用；独立复制的仓库虽然也可部署，但没有 `Sync fork`，需要按迁移说明建立真正的 Fork。

**检查点：** 仓库名下显示 `forked from maodeyu180/TelegramDoor`；自己的仓库里能看到 `src/`、`migrations/`、`package.json`、`package-lock.json` 和 `wrangler.jsonc`。只有 README 和 Wrangler 配置的仓库不完整，请另建完整 Fork。无需删除旧仓库。

## 2. 在 Cloudflare 创建 D1 数据库

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，选定要部署机器人的账户。后面创建 Worker 时使用同一账户。
2. 找到 **Storage & databases → D1 SQL Database**（中文界面为「存储和数据库」下的 D1）。
3. 点击 **Create Database / 创建数据库**，名称可填写 `telegramdoor`；如果已被其他应用占用，使用 `telegramdoor-inbox` 等新名称。
4. 位置保持默认，完成创建，打开数据库详情并复制 **Database ID**。

**检查点：** 数据库实际出现在当前账户的 D1 列表里，并且详情页有 Database ID。数据库目前没有表是正常的，TelegramDoor 首次访问会自动建表。

请为这个机器人使用专用数据库；不要选择其他应用的数据库。Database ID 是资源编号，不是管理员密码、API Token 或账户 ID。

## 3. 在自己的仓库填写绑定

在 GitHub 打开自己的仓库，点击 `wrangler.jsonc`，再点击铅笔图标编辑。保留其他配置，只检查以下位置：

- 顶层 `name` 是 Worker 名称，例如 `telegramdoor`。它需要在自己的 Cloudflare 账户内可用；可以改成 `telegramdoor-inbox` 等名称。
- 找到已有的 `d1_databases` 数组，填入刚创建的数据库名称和真实 ID。不要再添加第二份数组。

下面是需要替换的配置片段；**不是整个文件**，其中中文占位符必须替换为真实值：

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "telegramdoor",
    "database_id": "替换为第2步复制的Database ID",
    "migrations_dir": "migrations"
  }
],
```

如果数据库不是叫 `telegramdoor`，将 `database_name` 改成实际名称。`binding` 必须保持 `DB`。Worker 名称、数据库名称可以不同，后续步骤分别按实际值填写。

点击 **Commit changes**，保存到自己的 `main` 分支。三个密钥不要写进这个文件或任何 GitHub 提交。

**检查点：** `database_id` 与 Cloudflare D1 详情页完全一致；数据库属于接下来部署 Worker 的同一账户。Worker 名称只使用字母、数字和短横线，首尾不为短横线，最长 63 个字符。

## 4. 关联 GitHub 并部署 Worker

回到自己 Fork 的 README，点击 **在 Cloudflare 部署自己的 Fork**，会打开 Cloudflare 控制台。选择创建 D1 的同一账户，进入 **Workers & Pages → Create application / 创建应用 → Import a repository / 导入仓库**（界面也可能显示 **Connect GitHub**）。本项目部署目标是 **Worker**。

这个入口不会复制仓库。在仓库列表中选中 **自己的 GitHub 用户名 / 自己的 Fork 仓库名**；不要选择维护者的源仓库。若看不到自己的 Fork，检查 GitHub App 是否已获准访问该仓库。

授权 Cloudflare 访问自己上一步的 GitHub 仓库，选中仓库和 `main` 分支，核对构建设置：

| 设置        | 值                                                          |
| ----------- | ----------------------------------------------------------- |
| Worker 名称 | 与 `wrangler.jsonc` 顶层 `name` 一致，例如 `telegramdoor`。 |
| 生产分支    | `main`                                                      |
| 根目录      | 仓库根目录 `/`；不要填写 `src/` 或 `dist/`。                |
| 构建命令    | `npm run build`                                             |
| 部署命令    | `npm run deploy`                                            |

仓库中的 `.node-version` 指定 Node.js 24，依赖通过 `package-lock.json` 安装。部署命令也包含一次构建，单独重跑部署命令仍能生成页面。初次部署只需要生产分支，无需启用预览分支部署。

点击部署并等待完成。D1 绑定由已经填写好的 `wrangler.jsonc` 上传，表结构无需提前初始化。

**检查点：** 发布成功，得到自己的 HTTPS 地址，例如 `https://telegramdoor.<你的子域>.workers.dev`。只有前端 `Build command completed` 或静态文件上传成功不代表 Worker 已发布；还要确认部署阶段成功。

首次尚未配置密钥时，打开页面提示缺少配置属于预期状态，接着完成下一步。

## 5. 保存三个运行时密钥

打开刚部署的 Worker，进入 **Settings → Variables and Secrets / 设置 → 变量和机密**，分别添加下列三个名称，类型选 **Secret / 机密**：

- `ADMIN_PASSWORD`
- `BOT_TOKEN`
- `OWNER_ID`

名称保持一致且首尾不加空格。通过网页输入值时，不要添加示例文件中的包裹引号；`OWNER_ID` 只填写数字。

点击 **Deploy / 保存并部署**，使三个密钥应用到生产 Worker。这些是运行时配置，不能只填在 **Build → Variables and secrets** 里；构建变量不会自动传入正在运行的 Worker。

**检查点：** Worker 的「变量和机密」列表里有这三个名称，保存后的部署已经生效。这里不需要添加 `CLOUDFLARE_API_TOKEN`、`ACCOUNT_ID` 或 Turnstile 密钥。

## 6. 检查数据库和后台

1. 在自己的 Worker 域名后加 `/health` 并打开，应返回 `{"ok":true,"version":"0.1.0"}`。首次请求会初始化数据库表结构。
2. 打开 Worker 根地址，使用 `ADMIN_PASSWORD` 登录。
3. 打开概览、拦截记录、访客管理和防护设置，初次应为空数据。

**检查点：** 健康检查成功、后台可以登录，页面无数据库错误。自动建表只负责已有数据库内部的表结构，不能创建 Cloudflare 账户里的 D1 资源；后者已在第 2 步完成。

## 7. 连接 Telegram 并验收

1. 用 `OWNER_ID` 对应的 Telegram 账号打开自己的机器人，发送 `/start`。
2. 在后台「防护设置」点击 **连接 Telegram**，再点击 **检查连接**；Webhook 地址应指向自己的 Worker 域名。
3. 用另一个 Telegram 账号发消息，完成默认算术验证后重新发送留言。
4. 管理员引用收到的消息回复，确认对方收到。
5. 测试 `/ban`、`/unban` 和消息下方的表情按钮。完整检查项见[真实账号验收清单](acceptance.md)。

默认算术验证无需额外密钥。需要 Turnstile 时，再按[Turnstile 教程](../README.md#使用-turnstile)创建组件并在后台保存 Site key 和 Secret key。

## 8. 后续更新

在自己的 Fork 首页点击 **Sync fork → Update branch**。同步到 `main` 后，Cloudflare 会按已保存的 Git 构建设置自动部署。先检查上游版本说明；如有配置合并冲突，保留自己的 Worker 名称和真实数据库 ID，不要用模板占位值覆盖。详见[更新与迁移说明](updating.md)。

## 从失败的按钮部署继续

已成功导入完整源码时，可以保留当前仓库和 Worker。按第 2～3 步创建数据库并修正绑定；第 3 步的 Worker 名称填写现有 Worker 名称，不必重新创建。

随后到现有 Worker 的 **Settings → Builds** 检查是否已关联该仓库的 `main` 分支，以及部署命令是否为 `npm run deploy`。源码新提交应触发构建；如果没有关联，先连接已有仓库，再构建最新提交。不要只重跑仍使用旧配置的旧提交。

如果上次向导已保存三个运行时密钥，第 5 步只需要检查是否齐全、生效，不必重新录入。只留下两个文件的仓库则从第 1 步新建完整 Fork。已有完整独立副本也可先恢复运行；要获得后续 `Sync fork` 更新能力，再按[迁移步骤](updating.md#已用旧按钮部署如何迁到-fork)切换。

## 常见错误

| 现象                                                | 处理                                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `D1 binding 'DB' ... was not found`，错误码 `10181` | 对照第 2～3 步，确认数据库实际存在、账户相同、`database_id` 一致。没有数据库时先创建，换仓库名无法补建 D1。 |
| D1 页面没有任何数据库                               | 尚未创建，或旧模板自动创建失败；按第 2 步创建并使用真实 ID。                                                |
| 找不到 `package.json` 或 Worker 入口                | 检查源码完整性和构建根目录。                                                                                |
| Node/Vite 报版本不支持                              | 保留 `.node-version`，去掉构建设置中冲突的旧 `NODE_VERSION`。                                               |
| 找不到 `dist`                                       | 部署命令使用 `npm run deploy`。                                                                             |
| 提示缺少三个配置                                    | 按第 5 步保存运行时密钥，检查拼写、格式并使其生效。                                                         |
| 缺少 `DB` 绑定                                      | 保留绑定名 `DB`，检查配置文件和 Worker 绑定是否一致。                                                       |
| 初始化失败，HTTP 503                                | 检查 D1 状态和用量，稍后重试。初始化事务失败会回滚，无需清空数据库。                                        |
| 页面是 Hello World                                  | 检查真实源码是否成功发布；占位 Worker 或密钥保存成功不等于应用发布成功。                                    |

如果实际数据库存在、账户和 ID 也都一致，却仍收到 `10181`，保留日志并联系 Cloudflare 支持，不要反复删除有数据的数据库。相同错误码也可能对应平台问题，不能只根据错误码断言原因。

官方参考：[Workers Git 构建](https://developers.cloudflare.com/workers/ci-cd/builds/)、[D1 创建与绑定](https://developers.cloudflare.com/d1/get-started/)、[运行时密钥](https://developers.cloudflare.com/workers/configuration/secrets/)、[构建配置与令牌权限](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)。
