# 参与开发

使用 Node.js 22.12+ 和 npm；推荐 Node.js 24 LTS。本地启动与测试见[开发指南](docs/development.md)。不要提交真实配置、`.dev.vars`、`.wrangler` 本地状态或聊天记录。

1. Fork 仓库，新建功能分支。
2. `npm ci` 安装项目依赖。
3. 执行 `npm run check`，修改消息路由/鉴权/验证逻辑时补充对应行为测试。
4. 新数据库改动追加 migration，不修改已经发布的迁移。
5. 提交 PR 时说明用户可见行为、验证结果和未覆盖的 Telegram 能力限制。

默认不使用真实 Telegram/Cloudflare 凭据运行 CI。真实账号验收参考 `docs/acceptance.md`；请只使用你有权控制的机器人和测试账户。

## 可选的 GitHub Actions 检查

工作流示例放在 `docs/examples/github-actions-ci.yml`，默认不自动运行。需要 GitHub Actions 的开发者可以在自己的仓库中将它复制到 `.github/workflows/ci.yml` 后提交；它会执行类型检查、测试、构建和部署打包检查，不执行云端部署。

即使不启用 GitHub Actions，提交前仍应运行 `npm run check`。

前端验证应同时检查空数据、有数据、网络失败和移动端。不要将展示用统计数字放进生产默认状态。

## 部署与数据库兼容

部署文档只维护 `docs/deployment-manual.md` 这一条流程：Fork → 创建同名 D1 → Cloudflare 连接 GitHub 导入仓库 → 保存三个运行时密钥。`docs/deployment.md` 只处理报错，`docs/updating.md` 说明旧部署更新。不要再加入模板复制按钮、先建 Hello World 或另一套命令行部署教程。修改流程时同步检查 README、教程、验收清单和后台提示。

`.node-version` 为 Cloudflare Builds 指定 Node.js 24。`.dev.vars.example` 的三个必填值保持为空，不要提交可用密码或 Token。

默认配置包含 `binding: "DB"`、`database_name: "telegramdoor"` 和 `migrations_dir`，省略 `database_id`，由 Wrangler 查找已创建的同名 D1。`keep_vars: true` 保留控制台普通变量。按名称解析依赖构建令牌的 D1 读取权限；相关处理放在排错文档，不改变用户的部署顺序。不要恢复全零占位 ID，也不要写入维护者的实际数据库 ID。

已有部署可能绑定其他名称的 D1，升级时必须保留自己的有效名称或 ID，避免切换数据库。默认部署构建命令为 `npm run build`，部署命令为 `npx wrangler deploy`，只构建一次。包内的 `npm run deploy` 仍是维护用脚本，不是另一条用户教程。

`src/worker/database.ts` 通过 D1 绑定初始化 `0001_initial.sql`，避免默认构建令牌缺少 D1 管理权限时卡在迁移步骤。这个初始文件已发布，不应改写；其中只有幂等 CREATE 语句，运行时的分号切分不适用于带触发器或字符串分号的新 SQL。初始化事务还写入 Wrangler 标准迁移标记，保持手工迁移兼容。

未来新增迁移必须同时设计新部署和已有数据库的升级方式，覆盖失败回滚与数据保留测试；当前初始化函数不会自动执行新增文件。`npm run db:remote` 保留给明确的管理操作，使用它时需在本地配置真实数据库名称/ID，并使用具有 D1 编辑权限的 Cloudflare 凭据；不需要将个人配置提交上游。不要把它重新无条件放回默认部署命令。
