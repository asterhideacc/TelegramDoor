# 部署排错

部署统一使用[连接 GitHub、选择仓库部署](deployment-manual.md)的流程。遇到问题时，从下面选择对应现象，不用反复删除 Worker 或数据库。

## 按现象排错

- [后台提示缺少配置，或密码无法登录](#后台提示缺少配置或无法登录)
- [GitHub 仓库找不到，或没有开始构建](#连接后没有开始构建)
- [页面仍是旧版或 Hello World](#页面仍是旧版或-hello-world)
- [D1 不存在、名称不一致或 10181](#d1-不存在或名称不一致)
- [D1 读取权限不足](#d1-读取权限不足)
- [Worker 名称不匹配、找不到 dist 等](#其他构建错误)
- [旧模板生成的源码不完整](#旧模板生成的源码不完整)

## 后台提示缺少配置或无法登录

到**当前 Worker → Settings → Variables and Secrets** 检查：

1. 是否有 `ADMIN_PASSWORD`、`BOT_TOKEN`、`OWNER_ID`，名称没有拼写错误或首尾空格。
2. 密码至少 8 位；Bot Token 完整；OWNER_ID 是管理员自己的正整数 ID。
3. 是否点击 **Deploy / 保存并部署**，让配置生效。

只填 Builds 的构建变量不会传给运行中的应用。网页输入值时不要添加包裹引号。忘记密码可修改 `ADMIN_PASSWORD` 并部署，然后用新密码登录；旧登录会话会失效。

## 连接后没有开始构建

看不到自己的 Fork 时，检查 Cloudflare 的 GitHub App 是否获准访问该仓库。部署目标应为 **Worker**，不是 Pages。

到 **Worker → Settings → Builds** 确认关联的仓库、生产分支 `main` 和根目录 `/`。新提交才会触发自动构建；如果刚连接但没有开始，可在 Builds 中启动构建，或向 Fork 提交一次文档修改。没有新提交时，重复点击 Sync fork 不会产生新构建。

## 页面仍是旧版或 Hello World

查看最新提交的部署日志，确认 **Build 和 Deploy 都成功**，而不只是前端文件构建完成。

确认访问的是自己的 Worker 地址、生产版本已切换到新部署，再刷新页面。保存密钥不能代替发布应用；仅更新上游不会自动更新你的 Fork。[更新检查](updating.md#同步了但页面还是旧版)

## D1 不存在或名称不一致

默认部署会查找当前账户里名为 **`telegramdoor`** 的 D1：

1. 在 Worker 所属的同一账户打开 D1 列表，确认数据库实际存在且名称一致。不存在时，按[教程第 2 步](deployment-manual.md#2-创建-d1-数据库)创建，再重试构建。
2. 使用自定义名称或升级旧部署的，按[更新说明](updating.md#先确认数据库名称)保留自己的实际数据库名称；不要把其他应用的数据库当作本项目数据库。
3. 如果旧配置还有 `database_id`，它会优先于名称；`10181` 报错时核对该 ID 是否属于当前账户的现有数据库。无效或全零 ID 应移除，保留正确名称；已经有效的固定 ID 可以继续保留。
4. 部署后 Worker 的 Bindings 中应有 `DB`，指向本机器人的数据库。

若名称、ID 和账户均正确仍报错，保留日志排查平台问题。不要通过删除有数据的数据库或升级付费套餐来尝试解决。

数据库初始化暂时失败、返回 HTTP 503 时，检查 D1 状态和用量后重试；不用清空数据库。

## D1 读取权限不足

按名称绑定需要构建令牌查询 D1。若日志明确显示 D1 API 的 `403`、`Authentication error` 或权限不足：

1. 在 **Worker → Settings → Builds** 确认这次构建使用的 API token。
2. 到 Cloudflare **My Profile → API Tokens** 编辑同一个令牌，保留原权限，为部署账户增加 **Account → D1 → Read** 权限。
3. 保存后重试构建。查询已有数据库只需读取权限，表结构通过运行时绑定自动初始化。

这不会增加机器人的运行时环境变量，也不需要把 Cloudflare API Token 写入 GitHub。先确认数据库已经创建；本教程不依赖构建令牌自动创建 D1。

如果日志先提示 `Skipping automatic provisioning`，原因是没有权限，随后又要求 `database_id`，也按本节处理：这是名称查询未完成，不代表默认部署必须手填 ID。

官方文档中的[默认构建令牌权限](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#api-token)未列出 D1 权限，因此不能保证所有账户都无需这项调整。补足权限后仍然按原来的 GitHub 部署流程重试。

## 其他构建错误

| 现象                             | 处理                                                             |
| -------------------------------- | ---------------------------------------------------------------- |
| Worker 名称不匹配                | 部署命令使用 `npx wrangler deploy --name 实际Worker名称`。       |
| 找不到 `package.json` 或入口文件 | 检查 Fork 完整，根目录为 `/`。                                   |
| Node/Vite 版本不支持             | 保留 `.node-version`，移除构建设置里旧的 `NODE_VERSION` 覆盖值。 |
| 找不到 `dist`                    | 构建命令填 `npm run build`，部署命令填 `npx wrangler deploy`。   |
| 旧脚本执行远程 D1 迁移失败       | 更新构建和部署命令；当前首版表结构在首次访问时自动初始化。       |

## 旧模板生成的源码不完整

以前模板按钮创建的仓库若只有 README 和 Wrangler 配置，说明源码导入不完整。当前统一使用 GitHub Fork，不再提供模板复制入口。

从[源项目创建真正的 Fork](https://github.com/maodeyu180/TelegramDoor/fork)。尚无可用部署时按[部署教程](deployment-manual.md)继续；已有 Worker 或数据库时，按[旧部署迁移](updating.md#已用旧按钮部署如何迁到-fork)保留现有资源和数据。

## 为什么无需填写数据库 ID

与 [ldc-shop 的配置](https://github.com/chatgptuk/ldc-shop/blob/main/_workers_next/wrangler.json)一致，本项目保留 `database_name`、省略 `database_id`。Wrangler 查询同名数据库并绑定，用户无需在 GitHub 填 ID。相关能力见 [Wrangler 资源配置](https://developers.cloudflare.com/workers/wrangler/configuration/#automatic-provisioning)。

本地模拟已核对按名称查找和绑定行为；真实账户的 Git 授权、构建令牌权限和发布仍需按教程确认。

[返回首页](../README.md) · [部署教程](deployment-manual.md) · [更新说明](updating.md)
