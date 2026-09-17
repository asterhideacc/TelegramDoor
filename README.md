# TelegramDoor

**对话有来有往，打扰到此为止。**

运行在 Cloudflare Workers 上的 Telegram 双向私信机器人，带人机验证、防骚扰规则和中文管理后台。一个机器人对应一位管理员，部署在你自己的 Cloudflare 账户里。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fmaodeyu180%2FTelegramDoor)

想保留本文档对照部署？按住 **⌘（Mac）/ Ctrl（Windows、Linux）** 再点击部署按钮，或右键选择「在新标签页中打开链接」；手机可长按按钮选择新标签页。GitHub README 不支持通过 `target="_blank"` 强制链接在新标签页打开。

> 本项目仍处于首个版本。自动化测试使用本地 Workers/D1 和模拟 Telegram API；正式使用前，请完成下面的真实账号验收。不要把聊天内算术题视为强人机验证，持续收到广告时建议启用 Turnstile。

## 功能

- **双向私信**：访客发送消息，管理员直接引用回复。保留文本实体；常见图片、视频、语音、文件、贴纸由 Telegram 直接复制，不经过服务器下载。
- **引用与编辑**：保存双向消息对应关系，尽可能保留引用关系；同步已转发文本、媒体和说明的编辑，编辑也经过防骚扰过滤。
- **表情回应**：双方均可使用消息下方的 👍 / ❤ / 🔥 / 👏 按钮，管理员也可以使用 `/react`，支持撤销。
- **人机验证**：默认聊天内算术题，开箱即用；可在后台切换到免费的 Cloudflare Turnstile。
- **防骚扰**：用户限频、验证失败冷却、永久/临时封禁、白名单、关键词过滤、链接拦截、暂停接收。
- **中文后台**：统计概览、拦截记录、消息记录、访客管理、防护设置；今天、近 7 天、近 30 天、全部历史；搜索、分页、详情和后台回复。
- **部署简化**：三个必填配置，D1 自动绑定、首次访问自动建表，Webhook 密钥自动派生。
- **隐私**：可关闭文本记录；媒体不下载；定期清理记录；Turnstile Secret 加密保存，Bot Token 和管理员密码不返回前端。

## 三个必填配置

| 名称             | 说明                                                                                |
| ---------------- | ----------------------------------------------------------------------------------- |
| `ADMIN_PASSWORD` | 后台密码，至少 16 个字符，建议使用密码管理器生成的随机长密码。                      |
| `BOT_TOKEN`      | 通过 Telegram 官方 `@BotFather` 的 `/newbot` 创建机器人后获得。                     |
| `OWNER_ID`       | 管理员自己的 **数字用户 ID**，不是 `@username`、群 ID 或机器人的 ID。必须是正整数。 |

D1 的 `DB` 是资源绑定，不是第四个需要手工提供的密钥。启用 Turnstile 还需要 Site key 与 Secret key，在后台填写；默认聊天内验证无需额外配置。

请不要将实际密码或 Bot Token 提交到仓库、Issue、截图和日志里。

## 部署到 Cloudflare

### 一键部署（推荐）

**不需要提前 Fork。** 直接点击本仓库的部署按钮，登录并授权自己的 GitHub 与 Cloudflare 账号；Cloudflare 会创建你自己的源码副本、Worker 和 D1。副本不会自动同步本仓库后续更新。

已有机器人曾接入其他双向服务？请先阅读[从其他双向机器人迁移](#从其他双向机器人迁移)，撤销旧 Token 后使用新 Token 部署。

1. 注册/登录 Cloudflare 和 GitHub，准备三个必填配置。
2. 点击上方 **Deploy to Cloudflare**，按向导创建自己的仓库与 Worker，填写三个配置。D1 选择 **Create new**，为这个机器人使用新的专用数据库；无需提前去 D1 页面创建。
3. 保留模板的 `npm run deploy` 部署命令，它会构建后台并部署 Worker。D1 由向导创建并绑定，表结构在首次访问时自动初始化，无需额外的 D1 管理令牌。
4. 打开部署得到的 HTTPS 地址，例如 `https://telegramdoor.<你的子域>.workers.dev`，输入管理密码。
5. 用 `OWNER_ID` 对应的 Telegram 账号打开自己的机器人，发送 `/start`。
6. 在后台「防护设置」点击 **连接 Telegram**，然后「检查连接」。这会设置 Webhook 和命令菜单，不丢弃未处理消息。
7. 换另一个 Telegram 账号完成验证、发送留言，管理员引用回复进行验收。

Cloudflare 的部署按钮支持 D1 自动创建和密钥提示，配置来源分别是 `wrangler.jsonc` 和 `.dev.vars.example`。模板中的全零 `database_id` 是占位值，向导应在你的副本中替换为真实 ID。首次云端部署仍需登录、授权和填写自己的密钥；本仓库不提供共享机器人服务。

详细步骤与检查点见[一键部署与排错](docs/deployment.md)。按钮持续失败时，可使用[浏览器分步备用教程](docs/deployment-manual.md)；提前 Fork 只用于这条备用路径，不能保证解决 D1 自动创建失败。当前尚未完成本项目真实账户的一键部署验收，本地检查不能替代云端验证。

**Project name 可以保留 `telegramdoor` 吗？** 可以。其他人的 GitHub、Cloudflare 账号可以使用同名仓库和 Worker，名称不需要全网唯一；自己的账号内已有同名资源时，请换一个未使用的名字，例如 `telegramdoor-inbox`。建议只用小写字母、数字和短横线，不以短横线开头或结尾，最长 63 个字符，以兼容 `workers.dev` 域名。

**仓库创建失败，或只出现两个文件？** 完整副本应有 `package.json`、`package-lock.json`、`src/`、`migrations/` 等文件。如果只有 `README.md` 和 Wrangler 配置，源码导入没有完成，不能算部署成功。Cloudflare 有一条仍未关闭的[相同现象报告](https://github.com/cloudflare/developer-platform/issues/31)，其中官方模板也受影响。换名字只能排除重名，不能保证修复导入服务的问题。详细定位方法和浏览器恢复步骤见[部署排错](docs/deployment.md)。

模板已移出默认 GitHub Actions 工作流，以排除复制工作流的额外权限风险；这只是兼容性预防措施，不代表已经确认它就是仓库创建失败的原因。

**只填三个配置就能用吗？** 按钮正常完成资源创建与发布后，默认聊天内算术验证只需要这三个配置。部署完成后还需给机器人发送 `/start`，并登录后台点击「连接 Telegram」。不需要准备 Turnstile 密钥，也不需要手动创建数据库。

**Turnstile 也会自动创建吗？** 当前不会。部署按钮目前支持的自动创建资源不包含 Turnstile；启用它需要按[使用 Turnstile](#使用-turnstile)创建组件并填写两个密钥。Cloudflare 提供创建组件的 API，但需要额外的账户 ID 和具备 Turnstile 编辑权限的 API Token，无法只凭上面的三个配置完成。这个版本采用手动配置，不要求将 Cloudflare 账户管理凭据交给机器人。参见 [部署按钮支持的资源](https://developers.cloudflare.com/workers/platform/deploy-buttons/#automatic-resource-provisioning) 和 [Turnstile 自动化接口](https://developers.cloudflare.com/turnstile/get-started/widget-management/api/)。

### 命令行部署

要求 Node.js 22.12+（推荐 Node.js 24 LTS）和 npm。Cloudflare Builds 通过仓库的 `.node-version` 使用 Node.js 24。

```sh
git clone https://github.com/maodeyu180/TelegramDoor.git
cd TelegramDoor
npm ci
npx wrangler login
```

首次部署时创建数据库并绑定：

```sh
npx wrangler d1 create telegramdoor --binding DB --update-config
```

确认 `wrangler.jsonc` 的 `d1_databases[0].database_id` 已替换为命令返回的真实 ID。若 Wrangler 提示已有同名绑定，请手动替换全零占位值，并让 `database_name` 与实际名称一致，保留 `binding: "DB"`。占位值不能用于实际发布，不要使用他人账户的数据库 ID。

交互录入三个配置，避免把密钥留在 shell 历史中：

```sh
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put BOT_TOKEN
npx wrangler secret put OWNER_ID
npm run deploy
```

之后完成上面第 4～7 步。Webhook 注册在登录后的管理后台触发，不提供公开的 `/setup` 后门。

如果修改了机器人 Token 或域名，请重新连接 Telegram。**修改 Bot Token 后也需要在后台重新输入 Turnstile Secret**：它的加密密钥由 Bot Token 派生，旧密文不能用新 Token 解密。修改管理员密码会让现有登录会话失效。

## 从其他双向机器人迁移

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

## 使用 Turnstile

1. 在 Cloudflare 的 Turnstile 页面新建 **Managed** 组件。
2. 添加部署域名，例如 `telegramdoor.example.workers.dev`，只填主机名，不带协议或路径。
3. 在 TelegramDoor 后台选择 Turnstile，填写 Site key、Secret key 并保存。
4. 用未验证账号发送 `/verify`，在 Telegram 内置浏览器中实际完成验证。

验证码链接是随机一次性凭证，绑定 Telegram 用户，5 分钟失效。验证页会核对 Cloudflare 返回的 `hostname`、`action` 和 `cdata`，只有服务端核验成功才放行。链接放在 URL fragment，浏览器不把它作为页面路径发送或泄露为 Referer。

验证前的留言**不会自动重新转发**。验证通过后，访客需要重新发送，避免一通过验证就把之前积累的骚扰内容全部投递。

## 管理命令

以下管理命令只接受来自 `OWNER_ID` 个人私聊的消息。需要指定用户的命令支持「引用目标消息」，也支持显式填写数字 ID。

| 命令                     | 用途                                                     |
| ------------------------ | -------------------------------------------------------- |
| `/help`                  | 查看帮助。                                               |
| `/ban`                   | 引用用户消息，永久封禁。                                 |
| `/ban 1d 重复广告`       | 引用用户消息，封禁一天并备注原因。支持 `m` / `h` / `d`。 |
| `/ban 123456789 7d 广告` | 显式指定用户，封禁 7 天。                                |
| `/unban 123456789`       | 解除封禁；需要重新验证。                                 |
| `/trust` / `/untrust`    | 引用消息加入/移出白名单。                                |
| `/reset`                 | 引用消息重置验证状态，同时移出白名单。                   |
| `/who`                   | 查看对应用户 ID、用户名与状态。                          |
| `/react 👍`              | 引用消息添加回应，支持 👍 / ❤ / 🔥 / 👏 / 😁 / 🎉。      |
| `/react clear`           | 引用消息撤销回应。                                       |
| `/stats`                 | 最近 24 小时统计（与后台按本地自然日的「今天」不同）。   |
| `/pause` / `/resume`     | 暂停/恢复接收新留言。                                    |

访客命令是 `/start`、`/verify`、`/help`。后台可以直接发送文本回复，也会在管理员 Telegram 聊天中创建镜像，确保访客后续引用或表情回应有对应的消息。普通管理员回复如果以 `/` 开头，会先按命令处理；需要发送这样的原文时请使用后台回复。

白名单跳过验证和内容过滤，但不跳过限频或暂停接收。封禁优先于其他规则。解封不会把历史拦截内容重新发送。

## API 能力边界

- **私聊原生长按点赞无法自动监听**。Telegram 要求机器人为聊天管理员才推送 `message_reaction`；这个项目通过按钮和 `/react` 触发 Bot API 回应。显示的回应来自机器人，不伪装成用户账号。
- 机器人每条消息只能设置一个普通回应；选择新表情会替换旧表情。不支持付费回应和任意自定义表情。部分 Telegram 消息不允许回应，操作会提示失败。
- 相册中的图片/视频会逐条转发，当前版本不重新组合相册。
- Telegram 不为普通机器人私聊推送消息删除更新，无法自动同步删除。被保护内容、服务消息、付费媒体、部分测验等受 Bot API 复制限制；失败会记录并提示，不会伪装成成功。
- 用户封禁只表示 TelegramDoor 不再转发其消息；机器人不能禁止对方继续向机器人发送，也不能阻止有意更换账号的人。
- 算术题、人机验证和关键词规则均不能保证拦住所有广告、真人骚扰或变形链接；推荐 Turnstile + 限频 + 黑名单组合。
- Webhook 更新去重和消息对应关系可减少重复投递，但 Telegram 发送接口没有幂等键。如果 Telegram 已发送而网络或 D1 写入失败，重试仍可能重复；不承诺“恰好一次”。持续故障超过 Telegram 的保留窗口可能丢失更新。
- 并发封禁不能撤回已经进入 Telegram API 的发送请求。封禁检查会阻止后续消息。
- 原生验证与转发默认用于个人私聊；当前没有群话题、多管理员或多机器人托管模式。

## 记录、额度与安全

- 默认保存文本/媒体说明及处理元数据 30 天；媒体二进制不保存。可关闭后续文本记录，已有文本按保留期清理。
- 历史只包含尚未清理的记录，不是无限归档。Cron 每天分批清理过期记录与消息对应关系；大规模积压可能需要多次清理。旧消息对应关系清理后，无法继续引用回复或表情回应。
- 用户、黑名单和白名单持续保留，避免过期清理导致骚扰者重新获得权限。后台「全部访客」与「已封禁」统计是当前状态；其他统计按所选时间范围。
- HTTP-only、SameSite Strict 会话 Cookie，12 小时过期；登录限频；写接口检查 Origin 和专用请求头；Webhook 使用独立自动派生密钥；SQL 使用参数绑定。
- 所有配置都属于自己的 Cloudflare 账户。自部署不等于端到端加密：Telegram 和运行此服务的基础设施仍参与消息处理。
- 目前 Workers 免费版每天 10 万请求、单次 CPU 10ms；D1 免费版每天 500 万行读取/10 万行写入；Turnstile 提供免费方案。日常个人使用有机会保持零费用，但请求不等于消息数，日志、索引、重试和后台查询也消耗额度，攻击可以耗尽免费额度。额度耗尽会影响服务。
- 当前没有内置付费 AI、对象存储或收费广播；不调用 Telegram 的付费广播参数。免费额度以服务商最新规则为准。

## 本地开发

```sh
npm ci
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars；不要提交它
npm run dev
```

访问 `http://127.0.0.1:8787`。这个命令仅构建静态页面、迁移本地 D1、启动本地 Worker。生产数据库不会被用于本地开发。

只调试界面时，保留 Worker 进程，再运行 `npm run dev:ui`，Vite 将 `/api` 代理到本地 Worker。生产环境只有一个 Worker，不依赖 Vite 服务。

本地 HTTP 地址不能注册 Telegram Webhook。开发 UI 可使用满足格式的测试配置，但不要点击需要真实 Telegram API 的操作；自动化测试不使用真实 Token，不会向外发消息。

```sh
npm run typecheck
npm test
npm run build
# 可选：本地检查 Worker 打包，不会部署
npx wrangler deploy --dry-run --outdir .local/worker
```

自动化测试在 Workers 运行时使用本地 D1，模拟 Telegram 与 Turnstile HTTP 响应。测试覆盖空库初始化、并发建表、失败回滚重试、旧数据兼容，以及鉴权、CSRF、去重、消息映射、编辑过滤、验证码绑定/过期/重放、封禁、限频、双方回应、Turnstile 服务端核验、时间过滤和清理。[可选 CI 示例](docs/examples/github-actions-ci.yml)不包含部署操作，启用方法见[贡献指南](CONTRIBUTING.md)。

目录：

```text
src/worker/       Webhook、验证、防护、D1 和管理 API
src/web/          React 中文后台与验证页
src/shared/       前后端共用类型
migrations/      D1 数据库迁移
tests/           Workers/D1 集成测试
docs/            上线验收与设计说明
```

## 文档与贡献

- [架构与数据处理](docs/architecture.md)
- [一键部署与排错](docs/deployment.md)
- [浏览器分步部署（备用方案）](docs/deployment-manual.md)
- [真实账号验收清单](docs/acceptance.md)
- [贡献指南](CONTRIBUTING.md)
- [安全问题报告](SECURITY.md)
- [MIT 许可证](LICENSE)

官方参考：[Telegram Bot API](https://core.telegram.org/bots/api)、[表情更新限制](https://core.telegram.org/bots/api#update)、[Turnstile 服务端核验](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)、[Cloudflare 部署按钮](https://developers.cloudflare.com/workers/platform/deploy-buttons/)、[Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)、[D1 定价](https://developers.cloudflare.com/d1/platform/pricing/)。
