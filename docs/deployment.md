# 部署排错与其他部署方式

首次部署请看[网页教程](deployment-manual.md)。遇到问题时，从下面选择最接近的现象即可；不用从头重新部署。

## 按现象排错

- [后台提示缺少配置，或密码无法登录](#后台提示缺少配置或无法登录)
- [连接 GitHub 后没有开始构建](#连接后没有开始构建)
- [还是 Hello World，或更新后页面没变化](#还是-hello-world或页面没更新)
- [D1 不存在、缺少 DB 绑定或权限错误](#d1-不存在或权限错误)
- [Worker 名称不匹配、找不到 dist 等构建错误](#其他构建错误)
- [Cloudflare 创建仓库失败，源码只有两个文件](#仓库创建失败或源码不完整)
- [之前按钮部署失败，如何接着做](#从失败的按钮部署继续)

## 后台提示缺少配置或无法登录

到**当前 Worker → Settings → Variables and Secrets** 检查：

1. 是否有 `ADMIN_PASSWORD`、`BOT_TOKEN`、`OWNER_ID` 三个名称，且没有拼写错误或首尾空格。
2. 密码至少 8 位；Bot Token 是否完整；OWNER_ID 是否为管理员自己的正整数 ID。
3. 是否点击了 **Deploy / 保存并部署**，让配置生效。

只填 Builds 的构建变量不会传给运行中的应用。网页输入值时不要添加包裹引号。忘记后台密码可直接在这里修改 `ADMIN_PASSWORD` 并部署，然后用新密码登录；旧登录会话会失效。

## 连接后没有开始构建

检查 **Worker → Settings → Builds** 是否已连接自己的 Fork、生产分支是否为 `main`、根目录是否为 `/`。看不到仓库时，检查 Cloudflare 的 GitHub App 是否获准访问该仓库。

连接后可以在 Builds 中启动新构建；若界面没有入口，在 Fork 的 README 提交一处文档修改触发。没有新提交时，重复点击 Sync fork 不会产生新构建。不要只重跑仍使用旧源码的旧记录。

## 还是 Hello World，或页面没更新

创建 Worker 后、发布 TelegramDoor 之前，Hello World 是正常状态。关联 Fork 后仍如此，请查看**最新提交**的部署日志，确认部署阶段成功，而不只是前端构建成功。

同时确认正在访问正确的 Worker 地址、生产版本已切换到新部署，再刷新页面。保存密钥不会替代发布应用；更新上游也不会自动更新你的 Fork。[更新检查](updating.md#同步了但页面还是旧版)

## D1 不存在或权限错误

`D1 binding 'DB' references database '…' which was not found`（`10181`）表示发布引用的数据库在当前账户无法找到，与有没有建表、Telegram 或 Turnstile 无关。

1. 确认 D1 实际位于 Worker 所属账户；不存在时才创建，已有数据的数据库不要删除。
2. Worker 的绑定列表应有 `DB`，指向所需数据库。
3. 查看正在构建的提交。旧副本里的固定 `database_id` 会优先于控制台绑定；用新版配置，或移除 `DB` 条目中的 `database_id` 和 `database_name` 再构建。
4. 如果保留固定 ID 配置，必须核对它与自己账户的真实 ID 一致；固定 ID 是支持的高级用法，但不是默认教程的要求。
5. 只有数据库和绑定都正确时，再检查权限和平台故障；不要根据错误码猜测购买付费套餐可以解决。

如果出现 D1 API 权限错误，先检查是否仍写着 `database_name`，或旧部署命令还在执行远程迁移。新版推荐流程既不查 D1 名称，也不在构建中执行 SQL。

初始化暂时失败并返回 HTTP 503 时，检查 D1 状态和用量后重试，不需要清空数据库。

## 其他构建错误

| 现象                             | 处理                                                                   |
| -------------------------------- | ---------------------------------------------------------------------- |
| Worker 名称不匹配                | 部署命令用 `npm run deploy -- --name 实际Worker名称`。                 |
| 找不到 `package.json` 或入口文件 | 检查 Fork 源码完整，根目录为 `/`。                                     |
| Node/Vite 版本不支持             | 保留仓库的 `.node-version`，移除构建设置里旧的 `NODE_VERSION` 覆盖值。 |
| 找不到 `dist`                    | 部署命令用 `npm run deploy`，它会先构建页面。                          |
| 旧脚本执行 D1 迁移失败           | 更新到新版部署命令；当前通过运行时绑定自动初始化首版表结构。           |

## 仓库创建失败或源码不完整

`Cloudflare could not create the Git repository right now` 出现在模板的 Git 创建/导入阶段，此时 Telegram Token、Turnstile 和运行时建表代码还没有执行。

- 检查目标账号是否已有同名仓库，以及 GitHub 的 **Settings → Applications → Installed GitHub Apps** 中 Cloudflare 对仓库的访问授权。
- 仓库应包含 `src/`、`migrations/`、`package.json`、`package-lock.json`、`wrangler.jsonc`。只有 README 和 Wrangler 配置时，源码导入不完整，重跑构建无法补齐。
- Cloudflare 有[相同的不完整导入报告 #31](https://github.com/cloudflare/developer-platform/issues/31)，但通用错误信息不足以确认每次失败的根因。

持续失败就从源项目创建真正的 Fork，按推荐教程连接已有 Worker，不必反复删除仓库。

## 从失败的按钮部署继续

保留现有 Worker 和已有数据库：

1. 检查源码是否完整。不完整时，从原项目[建立真正的 Fork](https://github.com/maodeyu180/TelegramDoor/fork)。
2. 按[教程第 3 步](deployment-manual.md#3-创建并选择-d1)检查 `DB` 绑定，没有数据库才创建。
3. 按[第 4 步](deployment-manual.md#4-保存三个运行时密钥)检查三个运行时密钥。
4. 用新版配置关联原 Worker 并构建最新提交。需要从独立副本切换到 Fork 时，按[迁移说明](updating.md#已用旧按钮部署如何迁到-fork)操作。

旧副本若仍写着无效 `database_id`，仅添加控制台绑定无法覆盖它；先按上面的 [D1 排错](#d1-不存在或权限错误)处理。已正常使用的固定 ID 配置可以继续保留。

---

以下内容供需要了解部署机制或其他方式的人查阅。

## 为什么不再要求填写数据库 ID

参考了 [ldc-shop 的 Workers 部署说明](https://github.com/chatgptuk/ldc-shop/blob/main/_workers_next/README.md#-部署指南)及其 [Wrangler 配置](https://github.com/chatgptuk/ldc-shop/blob/main/_workers_next/wrangler.json)，区别如下：

| 项目                      | 数据库创建与绑定                                                                 | 配置文件                                  | 建表             |
| ------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------- | ---------------- |
| ldc-shop 网页流程         | 先创建名为 `ldc-shop-next` 的 D1，由 Wrangler 按名称查找；其他名称按文档手动绑定 | 保留 `database_name`，省略 `database_id`  | 首次访问自动建表 |
| TelegramDoor 原流程       | 创建 D1，复制 ID 到 Fork                                                         | 写死个人数据库 ID，更新时需要保留         | 首次访问自动建表 |
| TelegramDoor 当前推荐流程 | 在控制台创建 D1，并从 Worker 的下拉框选中，绑定为 `DB`                           | 同时省略数据库名称和 ID，部署沿用已有绑定 | 首次访问自动建表 |

ldc-shop 并没有省掉创建数据库，而是省掉了复制 ID。Wrangler 的[自动资源配置](https://developers.cloudflare.com/workers/wrangler/configuration/#automatic-provisioning)支持省略资源 ID；它也会优先尝试沿用已有绑定。

TelegramDoor 进一步省略 `database_name`：在当前锁定的 Wrangler 中，指定名称会先查询 D1 API 核对名称，而只声明 `binding: "DB"` 可以直接沿用已保存的绑定。Cloudflare [默认构建令牌的权限列表](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#api-token)未包含 D1 管理权限，所以推荐先在控制台绑定，再连接 Git。数据库名称可以自选，也不会因为不同机器人的名称相同而误连另一个数据库。

配置中的 `keep_vars: true` 保留控制台设置的普通变量；Secret 也由 Wrangler 保留。表结构通过运行时 `DB` 绑定初始化，无需构建令牌调用 D1 SQL 迁移接口。每次部署只运行一次前端构建，因此教程中的单独构建命令留空。

这些行为已做本地打包及模拟 Cloudflare API 验证；不等于已经在部署者账户完成网页验收。缺少预先保存的 `DB` 绑定时，不能承诺构建令牌自动创建数据库。

## 能否直接自动创建 D1

Wrangler 支持在没有资源 ID 时自动创建资源，命令行登录后可使用这一能力。通过 Git 构建自动创建还取决于令牌的资源权限。为了让网页部署者不用再配置 API Token，推荐流程采用一次下拉选择；后续构建沿用此选择。

D1 提供免费额度，不需要为了使用它先购买 Workers Paid；当前 Free 限额包括每天 500 万行读取、10 万行写入，以及账户总计 5 GB 存储、单库最多 500 MB。超出免费额度会受到限制，不代表可以无限使用。参见 [D1 定价](https://developers.cloudflare.com/d1/platform/pricing/)和[限制](https://developers.cloudflare.com/d1/platform/limits/)。

## 模板部署（可选）

原模板入口保留供测试；当前推荐配置已改为沿用控制台绑定，**此入口尚未完成新版配置的真实账户验收**，请不要把它当作保证自动完成资源配置的主流程：

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fmaodeyu180%2FTelegramDoor)

[Cloudflare 模板服务](https://developers.cloudflare.com/workers/platform/deploy-buttons/)会复制源码到独立仓库，通常没有 GitHub Fork 关系；即使把源地址换成自己的 Fork，也仍然会复制。它与在现有 Worker 的 **Settings → Builds → Connect** 选择仓库是两条流程。

使用模板时，检查向导是否识别 `DB` 资源并提供创建/绑定选项，以及三个运行时密钥。以完整源码、真实存在的 D1、Worker 上正确的 `DB` 绑定、部署成功和 `/health` 正常为完成标准。仅生成一个资源 ID 或上传前端文件不代表完成。

如果向导没有识别资源，或再次出现仓库创建、D1 创建失败，按[恢复步骤](#从失败的按钮部署继续)操作，复用已有 Worker 和数据。手动补建成功不能算作模板自动部署成功。

旧版本为模板向导提供过全零 `database_id` 占位值，这个值不能用于真实发布。本次为简化 Fork 部署移除了它；此前向导生成了不存在的数据库 ID 的根因，仍没有被证实。

[返回首页](../README.md) · [网页部署教程](deployment-manual.md) · [命令行部署](development.md#命令行部署)
