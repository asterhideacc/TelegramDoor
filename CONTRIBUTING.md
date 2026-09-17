# 参与开发

使用 Node.js 22.12+ 和 npm；推荐 Node.js 24 LTS。本地启动与命令行部署见[开发指南](docs/development.md)。不要提交真实配置、`.dev.vars`、`.wrangler` 本地状态或聊天记录。

1. Fork 仓库，新建功能分支。
2. `npm ci` 安装项目依赖。
3. 执行 `npm run check`，修改消息路由/鉴权/验证逻辑时补充对应行为测试。
4. 新数据库改动追加 migration，不修改已经发布的迁移。
5. 提交 PR 时说明用户可见行为、验证结果和未覆盖的 Telegram 能力限制。

默认不使用真实 Telegram/Cloudflare 凭据运行 CI。真实账号验收参考 `docs/acceptance.md`；请只使用你有权控制的机器人和测试账户。

## 可选的 GitHub Actions 检查

工作流示例放在 `docs/examples/github-actions-ci.yml`，默认不自动运行。需要 GitHub Actions 的开发者可以在自己的仓库中将它复制到 `.github/workflows/ci.yml` 后提交；它会执行类型检查、测试、构建和部署打包检查，不执行云端部署。

GitHub 对写入 `.github/workflows/` 有额外的 Workflows 权限要求，而 Cloudflare Workers and Pages GitHub App 当前未申请这项权限。这也是此前将工作流移为文档示例的原因；它不是已确认的导入失败根因。源模板继续保留文档示例形式，避免将额外工作流写权限引入复制流程。参见 [GitHub 文件写入权限](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents) 和 [Cloudflare App 权限](https://api.github.com/apps/cloudflare-workers-and-pages)。

即使不启用 GitHub Actions，提交前仍应运行 `npm run check`。

前端验证应同时检查空数据、有数据、网络失败和移动端。不要将展示用统计数字放进生产默认状态。

## 部署与数据库兼容

默认入口是 `docs/deployment-manual.md` 的 Fork 后关联已配置 Worker 的流程，`docs/deployment.md` 保留可选模板部署与排错，`docs/updating.md` 说明同步更新和迁移。README 的 Cloudflare 入口应打开控制台，不能指向再次复制模板的服务。修改配置或部署方式时同步更新 README、教程和验收清单，明确区分 D1 资源创建、绑定配置、表结构初始化和运行时密钥。

`.node-version` 为 Cloudflare Builds 指定 Node.js 24。保持 `.dev.vars.example` 只有三个必填项且值为空；部署向导会把示例值当作实际默认值，不要在其中放可用的测试密码或 Token。

默认 D1 配置只保留 `binding: "DB"` 与 `migrations_dir`，不写 `database_name` 或 `database_id`，让 Wrangler 沿用控制台已有绑定。保留 `keep_vars: true`，避免发布覆盖控制台普通变量。不要把个人数据库 ID、全零占位值或固定名称重新加入默认配置：固定名称会让继承绑定时额外查询 D1 API，恢复构建令牌的权限要求。可选模板入口与推荐网页流程分别验收，不能把本地通过说成模板云端创建成功。对照记录见[部署说明](docs/deployment.md#为什么不再要求填写数据库-id)。

`src/worker/database.ts` 通过 D1 绑定初始化 `0001_initial.sql`，避免默认构建令牌缺少 D1 管理权限时卡在迁移步骤。这个初始文件已发布，不应改写；其中只有幂等 CREATE 语句，运行时的分号切分不适用于带触发器或字符串分号的新 SQL。初始化事务还写入 Wrangler 标准迁移标记，保持手工迁移兼容。

未来新增迁移必须同时设计新部署和已有数据库的升级方式，覆盖失败回滚与数据保留测试；当前初始化函数不会自动执行新增文件。`npm run db:remote` 保留给明确的管理操作，使用它时需在本地配置真实数据库名称/ID，并使用具有 D1 编辑权限的 Cloudflare 凭据；不需要将个人配置提交上游。不要把它重新无条件放回默认部署命令。
