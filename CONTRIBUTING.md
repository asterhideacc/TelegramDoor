# 参与开发

使用 Node.js 22.12+ 和 npm；推荐 Node.js 24 LTS。不要提交真实配置、`.dev.vars`、`.wrangler` 本地状态或聊天记录。

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

默认入口是 `docs/deployment-manual.md` 的 Fork 后导入已有仓库流程，`docs/deployment.md` 保留可选模板部署与排错，`docs/updating.md` 说明同步更新和迁移。README 的 Cloudflare 入口应打开控制台，不能指向再次复制模板的服务。修改配置或部署方式时同步更新 README、教程和验收清单，明确区分 D1 资源创建、绑定配置、表结构初始化和运行时密钥。

`.node-version` 为 Cloudflare Builds 指定 Node.js 24。保持 `.dev.vars.example` 只有三个必填项且值为空；部署向导会把示例值当作实际默认值，不要在其中放可用的测试密码或 Token。

源模板的 D1 绑定保留全零 `database_id` 占位值。推荐的 Fork 流程需要用户先创建数据库，再在自己的 Fork 替换为真实 ID；可选模板按钮创建资源后回写真实 ID。官方按钮文档要求资源名称、ID 等默认字段完整；Wrangler CLI 支持省略 ID 的自动资源创建是另一条流程，不应据此省略模板字段。不要把维护者的真实数据库 ID 提交到源模板，也不要把补齐占位字段说成已经修复了云端 `10181` 故障。对照记录见[部署说明](docs/deployment.md#与公开模板的配置对照)。

`src/worker/database.ts` 通过 D1 绑定初始化 `0001_initial.sql`，避免默认构建令牌缺少 D1 管理权限时卡在迁移步骤。这个初始文件已发布，不应改写；其中只有幂等 CREATE 语句，运行时的分号切分不适用于带触发器或字符串分号的新 SQL。初始化事务还写入 Wrangler 标准迁移标记，保持手工迁移兼容。

未来新增迁移必须同时设计新部署和已有数据库的升级方式，覆盖失败回滚与数据保留测试；当前初始化函数不会自动执行新增文件。`npm run db:remote` 保留给明确的管理操作，使用它的 Cloudflare 凭据需要 D1 编辑权限。不要把它重新无条件放回默认部署命令。
