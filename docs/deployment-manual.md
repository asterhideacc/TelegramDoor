# 连接 GitHub 部署

全程在网页完成：**Fork → 创建 D1 → Cloudflare 连接 GitHub、选择仓库部署 → 填三个密钥 → 连接 Telegram**。数据库使用默认名称时，无需复制 ID 或修改仓库配置。

已部署的用户看[更新说明](updating.md)，报错看[排错文档](deployment.md#按现象排错)。

## 开始前准备

准备 GitHub、Cloudflare、Telegram 账号，以及以下三个值。**先自己保存好，在第 4 步填入 Cloudflare；不要写进 GitHub 仓库。**

| 配置名称         | 怎么获得                                                                                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_PASSWORD` | 自己设置一个至少 8 位的后台密码。                                                                                                                                            |
| `BOT_TOKEN`      | 打开官方 [@BotFather](https://t.me/BotFather)，发送 `/newbot`，按提示创建机器人，保存它给出的 Token。已有机器人可继续使用。                                                  |
| `OWNER_ID`       | 管理员本人账号的数字 ID。若不知道，可向 [@username_to_id_bot](https://t.me/username_to_id_bot) 发送 `/start`，获取回复中的数字用户 ID；不是 `@username`、群 ID 或机器人 ID。 |

`@username_to_id_bot` 是第三方 ID 查询机器人，只需发送 `/start`，不要向它提供 Bot Token 或后台密码。

**机器人以前接入过其他双向服务？** 先按[迁移教程](migration.md)撤销旧 Token，再使用新 Token。首次不需要配置 Turnstile，默认算术验证即可使用。

## 1. Fork 项目

打开 **[创建 TelegramDoor 的 Fork](https://github.com/maodeyu180/TelegramDoor/fork)**，点击 **Create fork**。仓库名可以保持默认。

**完成标志：** 进入自己的仓库，名称下显示 `forked from maodeyu180/TelegramDoor`。后续在这个仓库点击 **Sync fork** 即可获取更新。

接下来打开 [Cloudflare 控制台](https://dash.cloudflare.com/)，选定自己的账户。想保留教程对照操作，可右键链接选择「在新标签页中打开」；Mac 按住 ⌘ 点击，Windows / Linux 按住 Ctrl 点击，手机长按链接。

## 2. 创建 D1 数据库

**点哪里：** Storage & databases → D1 SQL Database → Create Database。

数据库名称填写：

```text
telegramdoor
```

位置保持默认，完成创建。这个名称已经写在项目配置里，部署时会查找并绑定它，不用复制 Database ID 或手动执行 SQL。

**完成标志：** 当前账户的 D1 列表出现 `telegramdoor`，暂时没有表是正常的。

数据库必须与下一步的 Worker 属于同一 Cloudflare 账户，并专用于这个机器人。已有这个机器人的同名数据库可以复用；如果同名数据库属于其他应用，或正在升级旧部署，先看[保留自己的数据库](updating.md#先确认数据库名称)。

## 3. 连接 GitHub，选择项目部署

**点哪里：** Workers & Pages → Create application（创建应用）→ Import a repository（导入仓库）。部分界面显示 **Connect GitHub / Connect to Git**。

连接自己的 GitHub 账号，授权 Cloudflare 访问 Fork，然后选择 **自己的用户名 / 第 1 步的仓库**。在部署页面填写：

| 设置                       | 填写值                |
| -------------------------- | --------------------- |
| Worker 名称                | `telegramdoor`        |
| 生产分支                   | `main`                |
| 根目录                     | `/`                   |
| Build command（构建命令）  | `npm run build`       |
| Deploy command（部署命令） | `npx wrangler deploy` |

点击 **Save and Deploy / Deploy**，等待构建与部署完成。Cloudflare 会创建 Worker，并将第 2 步的数据库绑定为 `DB`。

<details>
<summary>想用其他 Worker 名称？</summary>

例如 Worker 名称填写 `telegramdoor-inbox`，部署命令对应改为：

```sh
npx wrangler deploy --name telegramdoor-inbox
```

数据库名称仍按第 2 步使用 `telegramdoor`。每个机器人使用专用数据库；不要让第二个机器人共用第一个机器人的 D1。

</details>

**完成标志：** 部署成功，获得自己的 `workers.dev` 地址。此时打开应用提示缺少配置是正常的，继续第 4 步。

如果 D1 查找报权限错误，按[权限排错](deployment.md#d1-读取权限不足)调整当前构建令牌后重试即可。

## 4. 保存三个运行时密钥

**点哪里：** 刚部署的 Worker → Settings（设置）→ Variables and Secrets（变量和机密）→ Add。

将准备好的值分别添加为下面三个名称，类型都选 **Secret / 机密**：

```text
ADMIN_PASSWORD
BOT_TOKEN
OWNER_ID
```

每个名称对应一个值。输入时不要加包裹引号或首尾空格；`OWNER_ID` 只填数字。完成后点击 **Deploy / 保存并部署**。

**完成标志：** Worker 的变量列表中有这三个名称，保存后的部署已生效。

> 请填在 **Worker 的设置**里，不是 **Builds 的构建变量**里。默认算术验证不需要 Turnstile key。

## 5. 登录后台并连接 Telegram

1. 打开自己的 Worker 地址，在地址末尾加 `/health`；返回中有 `"ok":true` 表示应用和数据库可用。首次访问会自动建表。
2. 去掉 `/health` 打开后台，用 `ADMIN_PASSWORD` 登录。
3. 管理员在 Telegram 向自己的机器人发送 `/start`，回到后台「防护设置」点击 **连接 Telegram → 检查连接**。
4. 用另一个 Telegram 账号发消息，完成算术验证，**再重新发送留言**；管理员引用收到的消息回复。

**部署完成：** 访客和管理员都能收到对方的消息。

接下来可以[学习封禁、表情回应和后台使用](usage.md)，或[启用 Turnstile](usage.md#使用-turnstile)。真实账户收发请按[验收清单](acceptance.md)检查。

## 后续更新

自己的 GitHub Fork → **Sync fork → Update branch**，新提交会触发 Cloudflare 部署。三个运行时密钥不用重填。旧部署或自定义数据库先看[更新说明](updating.md)。

## 常见错误

按症状查找：[后台进不去](deployment.md#后台提示缺少配置或无法登录) · [数据库不存在](deployment.md#d1-不存在或名称不一致) · [D1 权限错误](deployment.md#d1-读取权限不足) · [完整排错](deployment.md#按现象排错)。

[返回首页](../README.md) · 官方参考：[导入 Git 仓库](https://developers.cloudflare.com/workers/ci-cd/builds/#connect-a-new-worker)、[D1](https://developers.cloudflare.com/d1/get-started/)、[运行时密钥](https://developers.cloudflare.com/workers/configuration/secrets/)。
