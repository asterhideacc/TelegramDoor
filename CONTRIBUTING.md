# 参与开发

使用 Node.js 22.12+ 和 npm；推荐 Node.js 24 LTS。不要提交真实配置、`.dev.vars`、`.wrangler` 本地状态或聊天记录。

1. Fork 仓库，新建功能分支。
2. `npm ci` 安装项目依赖。
3. 执行 `npm run check`，修改消息路由/鉴权/验证逻辑时补充对应行为测试。
4. 新数据库改动追加 migration，不修改已经发布的迁移。
5. 提交 PR 时说明用户可见行为、验证结果和未覆盖的 Telegram 能力限制。

默认不使用真实 Telegram/Cloudflare 凭据运行 CI。真实账号验收参考 `docs/acceptance.md`；请只使用你有权控制的机器人和测试账户。

## 可选的 GitHub Actions 检查

为兼容 Cloudflare 一键部署时复制仓库的权限，工作流放在 `docs/examples/github-actions-ci.yml`，默认不自动运行。需要 GitHub Actions 的开发者可以在自己的仓库中将它复制到 `.github/workflows/ci.yml` 后提交；它会执行类型检查、测试、构建和部署打包检查，不执行云端部署。

GitHub 对写入 `.github/workflows/` 有额外的 Workflows 权限要求，而 Cloudflare Workers and Pages GitHub App 当前未申请这项权限。作为一键部署源模板的仓库应保留文档示例形式，避免把工作流写入权限引入模板复制流程。参见 [GitHub 文件写入权限](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents) 和 [Cloudflare App 权限](https://api.github.com/apps/cloudflare-workers-and-pages)。

即使不启用 GitHub Actions，提交前仍应运行 `npm run check`。

前端验证应同时检查空数据、有数据、网络失败和移动端。不要将展示用统计数字放进生产默认状态。
