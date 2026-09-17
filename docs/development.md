# 本地开发

本文用于本地开发和测试；上线统一使用[连接 GitHub 部署教程](deployment-manual.md)。

使用 Node.js 22.12+（推荐 Node.js 24 LTS）和 npm，在项目根目录运行以下命令。

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
