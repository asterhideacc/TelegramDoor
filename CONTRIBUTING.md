# 参与开发

使用 Node.js 22.12+ 和 npm；推荐 Node.js 24 LTS。不要提交真实配置、`.dev.vars`、`.wrangler` 本地状态或聊天记录。

1. Fork 仓库，新建功能分支。
2. `npm ci` 安装项目依赖。
3. 执行 `npm run check`，修改消息路由/鉴权/验证逻辑时补充对应行为测试。
4. 新数据库改动追加 migration，不修改已经发布的迁移。
5. 提交 PR 时说明用户可见行为、验证结果和未覆盖的 Telegram 能力限制。

默认不使用真实 Telegram/Cloudflare 凭据运行 CI。真实账号验收参考 `docs/acceptance.md`；请只使用你有权控制的机器人和测试账户。

前端验证应同时检查空数据、有数据、网络失败和移动端。不要将展示用统计数字放进生产默认状态。
