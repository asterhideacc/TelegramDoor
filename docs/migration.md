# 从其他双向机器人迁移

[返回部署教程](deployment-manual.md) · [只想同步代码？](updating.md)

如果机器人是你自己在 BotFather 创建的，可以保留原机器人和用户名，不需要找到之前接入的双向服务。建议先撤销旧 Token，再把消息接收地址切换到 TelegramDoor；只更换接收地址，仍持有有效 Token 的旧服务就仍能控制机器人。

1. 打开官方 [@BotFather](https://t.me/BotFather)，发送 `/mybots`，选择要迁移的机器人。
2. 进入 **API Token → Revoke current token**，按提示撤销旧 Token 并获取新 Token。旧服务持有的 Token 随即失效；迁移期间机器人会暂时无法正常处理消息。
3. 首次部署 TelegramDoor 时，将新 Token 填入 `BOT_TOKEN`。如果已经部署，在 Cloudflare 中打开对应 Worker 的「设置 → 变量和机密」，修改 `BOT_TOKEN` 并保存、部署，使新配置生效。
4. 使用管理员账号打开机器人，发送 `/start`，然后登录 TelegramDoor 后台，在「防护设置」点击 **连接 Telegram → 检查连接**。这会设置新的 Webhook，替换旧接收地址，无需先调用 `deleteWebhook`。
5. 用另一个 Telegram 账号发送消息、完成验证，再由管理员引用回复，确认双向通信正常。

如果之前已经在 TelegramDoor 配置了 Turnstile，换 Bot Token 后还需要重新填写一次 **Turnstile Secret key** 并保存；Site key 和 Turnstile 组件本身无需重建。

旧服务里的黑名单、验证状态和消息对应关系不会自动迁移。请让访客重新发一条消息后再引用回复，旧服务转发的历史消息不能直接用于 TelegramDoor 的回复和管理命令。更换 Token 也不会删除旧服务已经保存的数据。

如果机器人由第三方管理机器人代为创建，并仍有管理授权，还需要在 BotFather 中解除对应的管理授权；仅轮换 Token 不等于解除管理权限。如果机器人不属于你、无法在 BotFather 管理，请先创建自己的机器人。

官方参考：[Token 管理](https://core.telegram.org/bots/tutorial#obtain-your-bot-token)、[设置 Webhook](https://core.telegram.org/bots/api#setwebhook)、[托管机器人机制](https://core.telegram.org/bots/features#managed-bots)。
