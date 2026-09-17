# 本地开发与命令行部署

只想使用机器人，按[网页部署教程](deployment-manual.md)即可；本文面向本地开发或使用 CLI 的用户。

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

自动化测试在 Workers 运行时使用本地 D1，模拟 Telegram 与 Turnstile HTTP 响应。测试覆盖空库初始化、并发建表、失败回滚重试、旧数据兼容，以及鉴权、CSRF、去重、消息映射、编辑过滤、验证码绑定/过期/重放、封禁、限频、双方回应、Turnstile 服务端核验、时间过滤和清理。[可选 CI 示例](examples/github-actions-ci.yml)不包含部署操作，启用方法见[贡献指南](../CONTRIBUTING.md)。

目录：

```text
src/worker/       Webhook、验证、防护、D1 和管理 API
src/web/          React 中文后台与验证页
src/shared/       前后端共用类型
migrations/      D1 数据库迁移
tests/           Workers/D1 集成测试
docs/            上线验收与设计说明
```

## 命令行部署

要求 Node.js 22.12+（推荐 Node.js 24 LTS）和 npm。Cloudflare Builds 通过仓库的 `.node-version` 使用 Node.js 24。

```sh
git clone https://github.com/maodeyu180/TelegramDoor.git
cd TelegramDoor
npm ci
npx wrangler login
```

先执行一次部署；Wrangler 可交互创建/选择 D1，并把资源 ID 写入本地配置。已有同名 Worker 时，请先确认目标是自己的机器人：

```sh
npm run deploy
```

推荐的网页流程通过控制台预先保存 `DB` 绑定；命令行也会沿用这个绑定。只有自动创建新资源时，登录凭据才需要相应的 D1 管理权限。不要把自己的资源 ID 提交回上游仓库。

交互录入三个配置，避免把密钥留在 shell 历史中：

```sh
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put BOT_TOKEN
npx wrangler secret put OWNER_ID
npm run deploy
```

部署后打开 Worker 地址，检查 `/health` 并登录后台。管理员向机器人发送 `/start`，在后台连接 Telegram 并验收双向通信。Webhook 注册在登录后的管理后台触发，不提供公开的 `/setup` 后门。

如果修改了机器人 Token 或域名，请重新连接 Telegram。**修改 Bot Token 后也需要在后台重新输入 Turnstile Secret**：它的加密密钥由 Bot Token 派生，旧密文不能用新 Token 解密。修改管理员密码会让现有登录会话失效。
