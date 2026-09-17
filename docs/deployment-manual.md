# 网页部署教程

第一次部署，从「开始前准备」往下操作即可。全程使用浏览器，不需要复制数据库 ID、改代码或执行 SQL。

已经部署过？[更新版本](updating.md) · [从旧独立副本迁到 Fork](updating.md#已用旧按钮部署如何迁到-fork) · [处理部署报错](deployment.md#按现象排错)

## 开始前准备

准备 GitHub、Cloudflare、Telegram 账号，以及以下三个值。**先自己保存好，在第 4 步填入 Cloudflare；不要写进 GitHub 仓库。**

| 配置名称         | 怎么获得                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_PASSWORD` | 自己设置一个至少 8 位的后台密码。                                                                                                                              |
| `BOT_TOKEN`      | 打开官方 [@BotFather](https://t.me/BotFather)，发送 `/newbot`，按提示创建机器人，保存它给出的 Token。已有机器人可继续使用。                                    |
| `OWNER_ID`       | 管理员本人账号的数字 ID。若不知道，可向 [@userinfobot](https://t.me/userinfobot) 发送 `/start`，获取回复中的数字用户 ID；不是 `@username`、群 ID 或机器人 ID。 |

`@userinfobot` 是第三方 ID 查询机器人，只需发送 `/start`，不要向它提供 Bot Token 或后台密码。

**机器人以前接入过其他双向服务？** 先按[迁移教程](migration.md)撤销旧 Token，再使用新 Token。首次不需要配置 Turnstile，默认算术验证即可使用。

## 1. Fork 项目

打开 **[创建 TelegramDoor 的 Fork](https://github.com/maodeyu180/TelegramDoor/fork)**，点击 **Create fork**。Fork 就是把项目复制到自己的 GitHub 账号，并保留以后获取更新的入口。仓库名可以保持默认。

**完成标志：** 页面进入自己的仓库，名称下显示 `forked from maodeyu180/TelegramDoor`。

接下来的第 2～5 步都在 [Cloudflare 控制台](https://dash.cloudflare.com/)完成，选定同一个账户。想保留教程对照操作，可右键链接选择「在新标签页中打开」；Mac 也可按住 ⌘ 点击，Windows / Linux 按住 Ctrl 点击，手机长按链接。

## 2. 创建 Worker

**点哪里：** Workers & Pages → Create application（创建应用）→ Start with Hello World!

名称填 `telegramdoor`，点击 **Deploy**。

**完成标志：** 能进入这个 Worker 的详情页，看到自己的 `workers.dev` 地址。现在打开地址显示 Hello World 是正常的；第 5 步会用 TelegramDoor 替换这段示例程序。

<details>
<summary>已经有 Worker，或想用其他名称？</summary>

已有 Worker 可以直接复用，跳过创建。名称只需在自己的 Cloudflare 账户内可用，其他用户使用 `telegramdoor` 不影响你。

如果自己已有同名 Worker，或想部署第二个机器人，可改用 `telegramdoor-inbox` 等名称；第 5 步有对应部署命令。不要为了重新部署而删除已有数据库。

</details>

## 3. 创建并选择 D1

D1 用来保存机器人设置、封禁名单和消息记录。创建数据库后，还要把它选到 Worker 上：

1. 打开 **Storage & databases → D1 SQL Database → Create Database**，名称填 `telegramdoor`，位置保持默认，完成创建。
2. 回到刚才的 Worker，打开 **Bindings（绑定）→ Add binding → D1 database**。部分界面在 **Settings → Bindings**。
3. **Variable name** 填 `DB`，下拉选择刚创建的数据库，点击 **Add binding / Save**，按界面提示保存并部署。

**完成标志：** Worker 的绑定列表出现 **`DB` → 你选择的 D1**。数据库暂时没有表是正常的，首次访问会自动创建。

数据库名称可自选，但绑定名必须是大写 `DB`。已有机器人的数据库直接复用；新机器人请使用专用数据库。这里不用复制 Database ID。

## 4. 保存三个运行时密钥

**点哪里：** 当前 Worker → Settings（设置）→ Variables and Secrets（变量和机密）→ Add。

将准备好的值分别添加为下面三个名称，类型都选 **Secret / 机密**：

```text
ADMIN_PASSWORD
BOT_TOKEN
OWNER_ID
```

每个名称对应一个值。输入时不要加包裹引号或首尾空格；`OWNER_ID` 只填数字。完成后点击 **Deploy / 保存并部署**。

**完成标志：** 当前 Worker 的变量列表中有这三个名称，保存后的部署已生效。

> 请填在 **Worker 的设置**里，不是 **Builds 的构建变量**里。这里不需要 Cloudflare API Token、Account ID 或 Turnstile key。

## 5. 关联自己的 Fork 并部署

**点哪里：** 还是这个 Worker → Settings → Builds（构建）→ Connect。

授权 Cloudflare 访问 GitHub，在列表里选择 **自己的用户名 / 第 1 步创建的 Fork**，然后填写：

| 设置     | 填写值         |
| -------- | -------------- |
| 生产分支 | `main`         |
| 根目录   | `/`            |
| 构建命令 | **留空**       |
| 部署命令 | 复制下面这一行 |

```sh
npm run deploy
```

部署命令已经包含构建，不需要再填一次构建命令。保存连接并启动构建。

<details>
<summary>我的 Worker 不叫 telegramdoor，命令怎么填？</summary>

在命令末尾加上实际 Worker 名称即可。例如 Worker 叫 `telegramdoor-inbox`，填写：

```sh
npm run deploy -- --name telegramdoor-inbox
```

把 `telegramdoor-inbox` 换成自己的 Worker 名称，不是 GitHub 仓库名或数据库名；不用编辑 Fork 文件。

</details>

**完成标志：** 最新提交的构建和部署均成功。只看到前端构建完成、静态文件上传成功，还不代表 Worker 已发布。没有开始构建时，按[这几项检查](deployment.md#连接后没有开始构建)。

## 6. 登录后台并连接 Telegram

1. 打开自己的 Worker 地址，在地址末尾加 `/health`；返回中有 `"ok":true` 表示应用和数据库可用。
2. 去掉 `/health` 打开后台，用 `ADMIN_PASSWORD` 登录。
3. 管理员在 Telegram 向自己的机器人发送 `/start`，回到后台「防护设置」点击 **连接 Telegram → 检查连接**。
4. 用另一个 Telegram 账号发消息，完成算术验证，**再重新发送留言**；管理员引用收到的消息回复。

**部署完成：** 访客和管理员都能收到对方的消息。

接下来可以[学习封禁、表情回应和后台使用](usage.md)，或[启用 Turnstile](usage.md#使用-turnstile)。正式使用前建议完成[验收清单](acceptance.md)；本地测试不能替代真实账号收发验证。

## 后续更新

自己的 GitHub Fork → **Sync fork → Update branch**，新提交会触发 Cloudflare 部署。数据库绑定和密钥沿用 Worker 中的设置，不用重填。详见[更新说明](updating.md)。

## 从失败的按钮部署继续

保留原来的 Worker 和数据，按[恢复步骤](deployment.md#从失败的按钮部署继续)检查；不必重新走完所有创建步骤。

## 常见错误

按症状直接查找：[后台进不去](deployment.md#后台提示缺少配置或无法登录) · [数据库报错](deployment.md#d1-不存在或权限错误) · [仍显示 Hello World](deployment.md#还是-hello-world或页面没更新) · [完整排错](deployment.md#按现象排错)。

[返回首页](../README.md) · 官方参考：[创建 Worker](https://developers.cloudflare.com/workers/get-started/dashboard/)、[绑定 D1](https://developers.cloudflare.com/d1/get-started/)、[连接已有 Worker](https://developers.cloudflare.com/workers/ci-cd/builds/#connect-an-existing-worker)、[运行时密钥](https://developers.cloudflare.com/workers/configuration/secrets/)。
