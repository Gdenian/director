# 管理者运营控制台 V3 设计

## 背景

`director` 是一个 AI 视频创作平台。用户端已经覆盖注册登录、首页快速创建作品、工作区创作流程、资产中心、个人设置、创作引擎、模型选择、任务队列和计费流水。

当前管理端已经有角色校验、基础审计、运营指标、公告、功能开关、用户组、套餐、兑换码、任务和系统健康等雏形。但它仍然像一个报表页：能看到一些数字和配置对象，却没有把后台操作稳定地接入用户端关键路径。管理员关闭开关、配置用户组或创建套餐后，很多配置不会真正影响注册、创建作品、任务提交、模型选择、余额冻结和用户端展示。

V3 的目标是把后台定义为完整的运营控制台。每个后台模块都必须回答：

- 后台可以执行什么操作？
- 它控制用户端哪条路径？
- 它在哪个服务端 API 或服务层拦截？
- 用户会看到什么提示？
- 后台动作如何审计？
- 怎样验收它真的控制了网站？

## 第一原则

运营控制台的职责是运营网站，不是管理用户创作内容。

它应该控制：

- 谁可以进入网站。
- 谁可以创建作品。
- 谁可以使用文本、图片、视频、语音、口型同步等能力。
- 不同用户可以使用多少资源。
- 余额、冻结、扣费、充值、退款、补单是否正确。
- 任务是否可以提交、入队、取消、重试、恢复和回滚计费。
- 模型和渠道是否可用。
- 线上故障时是否可以降级、关闭入口、通知用户和保护成本。
- 后台所有写操作是否可追溯。

它不应该控制：

- 用户小说正文、prompt、分镜文本、图片、视频、音频内容。
- 用户作品、剧集、角色、场景、道具、分镜的创作内容。
- 内容审核或内容 CMS，除非后续合规需求单独立项。

## 非目标

- 不展示用户小说正文、prompt、分镜描述、媒体 URL、任务 `payload`、任务 `result`、`dedupeKey`、`billingInfo` 原始 JSON。
- 不替用户编辑作品内容。
- 不做复杂 RBAC 权限矩阵。继续使用 `user / admin / owner`，必要时通过操作类型区分 admin 和 owner。
- 不把功能开关、用户组、套餐、模型渠道做成只保存配置的表单。任何控制对象都必须有明确生效路径。
- 不只依赖前端隐藏按钮。所有后台控制必须在服务端生效。

## 角色和权限

### user

普通用户。只能访问用户端功能。

### admin

运营管理员。可以查看运营数据，处理公告、用户状态、任务事故、系统健康和常规运营动作。

### owner

站点所有者。拥有 admin 能力，并额外允许高危动作：

- 调整用户角色。
- 人工加款、扣款、退款、解冻。
- 修改全站功能开关。
- 修改模型渠道状态和商业配置。
- 查看完整管理员审计。

### 服务端权限要求

- 后台页面 `/[locale]/admin` 必须服务端校验 `role/status`。
- 后台读接口使用 `requireAdminAuth()`。
- 高危写接口使用 `requireOwnerAuth()`。
- 普通用户即使手动请求 `/api/admin/**` 也必须得到 401 或 403。
- 被禁用用户即使持有旧 session，也不能继续调用普通用户 API。

## 当前用户端关键路径

V3 规格以现有路径为基础设计控制点。

| 用户端路径 | 当前入口 | 运营控制点 |
| --- | --- | --- |
| 注册 | `POST /api/auth/register` | 注册开关、注册送额度、默认用户组 |
| 登录与会话 | NextAuth credentials、`requireUserAuth()` | 账号状态、角色、封禁、踢出登录 |
| 首页快速创建作品 | `src/lib/home/create-project-launch.ts` 串联 `/api/projects`、项目配置、首集创建 | 创建作品开关、用户组作品/任务限制、维护模式 |
| 工作区进入 | `/[locale]/workspace/[projectId]`、项目 API | 账号状态、项目权限、维护提示、公告 |
| 资产中心 | `/[locale]/workspace/asset-hub`、`/api/asset-hub/**` | 图片/语音生成开关、模型权限、并发、余额 |
| 文本生成 | story-to-script、script-to-storyboard、AI 扩写、分析类 API | 文本生成开关、模型权限、任务限制、计费 |
| 图片生成 | 项目图片生成、资产中心图片生成、图片修改 API | 图片生成开关、模型权限、任务限制、计费 |
| 视频生成 | `generate-video`、lip-sync、clips/editor 类任务 | 视频生成开关、口型同步开关、模型权限、计费 |
| 语音生成 | voice-generate、voice-design、voice-analyze | 语音生成开关、模型权限、任务限制、计费 |
| 任务提交与队列 | `src/lib/task/submitter.ts`、BullMQ | 功能开关、权益、并发、计费冻结、事故处理 |
| 余额与交易 | `/api/user/balance`、`/api/user/transactions` | 人工财务动作、冻结释放、补单、退款 |
| 模型选择 | `/api/user/models`、创作引擎配置 | 模型渠道状态、用户组可见性、高级模型开关 |
| 公告展示 | `/api/announcements`、全站 layout | 公告发布、暂停、目标人群、展示位 |

## 统一运营策略层

V3 需要新增一个明确的运营策略层，避免每个 API 自己写零散判断。

### `requireUserAuth()`

职责：

- 校验登录。
- 实时读取用户 `role/status`。
- 拒绝禁用账号。

生效路径：

- 所有普通用户 API。
- 工作区、资产中心、个人中心相关请求。

### `assertFeatureEnabled(key, context)`

职责：

- 按功能开关判断当前功能是否可用。
- 支持用户组、人群、灰度比例、时间窗口。
- 返回统一错误码和用户可读提示。

生效路径：

- 注册、创建作品、文本生成、图片生成、视频生成、语音生成、支付、维护模式。

### `assertUserEntitlement(userId, capability, context)`

职责：

- 读取用户组和用户个体覆盖规则。
- 判断用户是否有能力、额度、每日上限、并发上限、最大任务成本、模型等级权限。

生效路径：

- 模型列表过滤。
- 任务提交前校验。
- 计费冻结前校验。

### `assertTaskAllowed(userId, taskType, payload)`

职责：

- 把任务类型映射到能力：文本、图片、视频、语音、口型同步、高级模型。
- 在 `submitTask` 创建任务前统一校验功能开关、用户权益、并发和维护模式。

生效路径：

- `src/lib/task/submitter.ts`。
- 所有异步 AI 任务。

验收要求：

- 拒绝时不创建 `Task`。
- 不加入 BullMQ。
- 不冻结余额。
- 返回稳定错误码和用户提示。

### `assertBillingAllowed(userId, amount, context)`

职责：

- 在余额冻结或人工财务动作前校验余额状态、账号状态、支付开关、最大冻结金额。

生效路径：

- `prepareTaskBilling()`。
- 人工加款、扣款、退款、解冻、补单。

### `getPublicAnnouncements(context)`

职责：

- 根据用户、语言、展示位、时间窗口、人群返回公告。
- 不泄露后台审计或内部字段。

生效路径：

- 全站 layout 顶部横幅。
- 工作区提示。
- 个人中心消息。
- 登录后弹窗。

## 控制闭环矩阵

| 后台模块 | 后台操作 | 用户端生效路径 | API / 服务拦截点 | 用户提示 | 审计动作 | 验收标准 |
| --- | --- | --- | --- | --- | --- | --- |
| 公告中心 | 发布顶部公告 | 全站已登录页面 | `GET /api/announcements`、layout banner | 公告标题和正文 | `announcement.publish` | 目标语言和人群可见，非目标不可见 |
| 公告中心 | 暂停公告 | 全站公告展示 | `GET /api/announcements` | 公告消失 | `announcement.pause` | 暂停后刷新不可见 |
| 功能开关 | 关闭注册 | 注册页提交 | `POST /api/auth/register` | 注册暂不可用 | `feature_flag.update` | 不创建 User 和 UserBalance |
| 功能开关 | 关闭创建作品 | 首页创建作品、工作区新建作品 | `POST /api/projects`、首页创建链路 | 创建作品暂不可用 | `feature_flag.update` | 不创建 Project、NovelPromotionProject 或首集 |
| 功能开关 | 关闭文本生成 | 故事扩写、分析、剧本、分镜文本 | `submitTask`、文本类同步 API | 文本生成维护中 | `feature_flag.update` | 不创建文本类任务，不冻结余额 |
| 功能开关 | 关闭图片生成 | 项目图片、资产中心图片 | `submitTask`、`/api/assets/**`、`/api/asset-hub/**` | 图片生成维护中 | `feature_flag.update` | 不创建图片任务，不冻结余额 |
| 功能开关 | 关闭视频生成 | 视频生成、剪辑、口型同步 | `submitTask`、视频类 API | 视频生成维护中 | `feature_flag.update` | 不创建视频任务，不冻结余额 |
| 功能开关 | 关闭语音生成 | 配音、音色设计、语音分析 | `submitTask`、语音类 API | 语音生成维护中 | `feature_flag.update` | 不创建语音任务，不冻结余额 |
| 功能开关 | 开启维护模式 | 全站用户端 | `requireUserAuth()` 后策略层、页面公告 | 系统维护中 | `feature_flag.update` | 普通用户写操作被拒绝，admin/owner 可进后台 |
| 用户运营 | 禁用用户 | 登录、全部普通用户 API | `requireUserAuth()`、NextAuth 登录 | 账号已停用 | `user.access.disable` | 旧 session 调 API 返回 403 |
| 用户运营 | 恢复用户 | 登录、全部普通用户 API | `requireUserAuth()` | 账号已恢复 | `user.access.enable` | 用户可以重新登录和使用 |
| 用户运营 | 调整角色 | 后台入口、后台 API | `/[locale]/admin`、`/api/admin/**` | 无前台提示 | `user.role.update` | 角色变更后权限立即生效 |
| 用户组与权益 | 设置每日任务上限 | 所有任务提交 | `assertUserEntitlement()`、`submitTask` | 今日任务已达上限 | `user_group.update` | 超限不创建任务 |
| 用户组与权益 | 设置并发上限 | 所有任务提交 | `submitTask` 查询 active task/run | 当前并发已达上限 | `user_group.update` | 超限不创建任务、不冻结余额 |
| 用户组与权益 | 禁止视频能力 | 视频生成入口和 API | 模型列表、`submitTask` | 当前账号不支持视频生成 | `user_group.update` | UI 隐藏或禁用，API 直接拒绝 |
| 用户组与权益 | 限制高级模型 | 模型选择和任务提交 | `/api/user/models`、`submitTask` | 当前账号不可使用该模型 | `user_group.update` | 模型不可见，强行提交被拒绝 |
| 计费与余额 | 人工加款 | 个人中心余额 | `UserBalance`、`BalanceTransaction` | 余额已更新 | `billing.balance.credit` | 余额增加且流水为 recharge/manual_credit |
| 计费与余额 | 人工扣款 | 个人中心余额 | `UserBalance`、`BalanceTransaction` | 余额已更新 | `billing.balance.debit` | 余额减少且流水为 manual_debit |
| 计费与余额 | 释放冻结 | 个人中心余额和冻结金额 | `BalanceFreeze`、`UserBalance` | 冻结金额已释放 | `billing.freeze.release` | freeze 终态、余额回补、流水一致 |
| 计费与余额 | 退款或补单 | 余额和交易流水 | 支付订单、`BalanceTransaction` | 订单已处理 | `billing.order.adjust` | 幂等、金额一致、不可重复处理 |
| 套餐与兑换码 | 上下架套餐 | 用户购买页 | 套餐列表 API、支付创建 API | 套餐不可购买 | `commercial_package.update` | 下架套餐不可创建订单 |
| 套餐与兑换码 | 创建兑换码 | 用户兑换入口 | 兑换 API | 兑换成功或失败原因 | `redeem_code.create` | 成功后余额入账，次数递增 |
| 套餐与兑换码 | 暂停兑换码 | 用户兑换入口 | 兑换 API | 兑换码不可用 | `redeem_code.update` | 暂停、过期、超限均不可兑换 |
| 模型与渠道 | 禁用模型 | 模型选择和任务提交 | `/api/user/models`、`submitTask`、worker 前置校验 | 模型暂不可用 | `model_channel.disable` | 新任务不可使用该模型 |
| 模型与渠道 | 切换默认模型 | 模型选择默认值 | 用户偏好和模型列表 API | 无或模型已调整 | `model_default.update` | 新用户/未选择用户使用新默认 |
| 模型与渠道 | 渠道连接测试 | 后台模型页 | Provider test API | 测试成功/失败 | `model_channel.test` | 不影响用户任务，只记录结果 |
| 任务事故 | 取消任务 | 用户任务状态 | `/api/admin/tasks/[taskId]`、BullMQ remove、TaskEvent | 任务已取消 | `task.cancel` | 任务终态、事件可见、必要时回滚冻结 |
| 任务事故 | 重试任务 | 用户任务状态 | Task clone/requeue、BullMQ add | 任务已重新提交 | `task.retry` | 新任务入队，旧任务关系可追溯 |
| 任务事故 | 批量处理卡死任务 | 用户任务状态、余额冻结 | task reconcile、billing rollback | 任务已处理 | `task.incident.batch_resolve` | 队列、任务、冻结一致 |
| 系统健康 | 标记维护建议 | 运营总览和维护模式 | health checks | 管理员可见 | `system_health.check` | 后台显示影响范围和建议动作 |
| 管理员审计 | 查看审计 | 后台审计页 | `/api/admin/audit-logs` | 无前台提示 | `audit_log.read` | owner 可查，普通 admin 按策略受限 |

## 后台信息架构

V3 后台采用左侧固定导航和右侧工作区。模块顺序：

1. 运营总览
2. 公告中心
3. 功能开关
4. 用户运营
5. 用户组与权益
6. 计费与余额
7. 套餐与兑换码
8. 模型与渠道
9. 任务事故
10. 系统健康
11. 管理员审计

## 模块设计

### 运营总览

目的：让管理员 30 秒内知道网站能不能正常运行，并能从异常直接进入处理页面。

展示内容：

- 当前线上状态：正常、维护、降级、事故。
- 关键开关：注册、创建作品、文本、图片、视频、语音、支付、维护模式。
- 今日新增用户、活跃用户、创建作品数、任务数、失败任务、卡死任务、排队任务。
- 今日收入、今日消耗、平台余额、冻结金额、异常冻结。
- 模型渠道健康：正常、维护、禁用、失败率高。
- 待处理事项：任务事故、账单异常、渠道异常、未发布公告、系统依赖异常。

后台操作：

- 跳转到对应模块处理异常。
- 刷新健康检查。
- owner 可从总览开启维护模式。
- owner 可从总览关闭高风险入口，例如视频生成或支付。

用户端生效路径：

- 维护模式影响全站写操作。
- 功能开关影响对应用户端入口和 API。

验收标准：

- 总览中的每个异常必须有可点击处理入口。
- 总览显示的关闭开关数量和功能开关模块一致。
- 维护模式从总览开启后，普通用户写操作被拒绝。

### 公告中心

目的：管理员无需发版即可通知用户。

字段：

- 标题、正文。
- 类型：普通、维护、故障、计费、更新、活动。
- 级别：info、warning、critical。
- 状态：draft、scheduled、published、paused、archived。
- 语言：zh、en、all。
- 展示位：top_banner、modal、workspace_notice、profile_message。
- 人群：all、admins、test_users、vip、restricted、指定用户组。
- 开始时间、结束时间。
- 是否可关闭。
- CTA 文案和链接。

后台操作：

- 创建、编辑、预览、发布、暂停、归档。
- 复制公告。
- 查看投放范围和命中人数。

用户端生效路径：

- `top_banner`：全站 layout。
- `modal`：登录后首屏或指定页面。
- `workspace_notice`：工作区。
- `profile_message`：个人中心。

API 拦截点：

- `GET /api/announcements` 只返回当前用户可见公告。
- 后台写操作使用 `/api/admin/announcements/**`。

错误提示：

- 公告创建失败：提示字段原因。
- 发布失败：提示时间窗口、人群或权限错误。

审计：

- `announcement.create`
- `announcement.update`
- `announcement.publish`
- `announcement.pause`
- `announcement.archive`

验收标准：

- 发布后目标用户刷新页面可见。
- 暂停后目标用户刷新不可见。
- 非目标语言、人群、用户组不可见。
- 公告 API 不返回后台审计字段。

### 功能开关

目的：线上故障或运营活动时快速控制入口，保护用户体验和平台成本。

默认开关：

- `registration`：注册。
- `create_work`：创建作品。
- `text_generation`：文本生成。
- `image_generation`：图片生成。
- `video_generation`：视频生成。
- `voice_generation`：语音生成。
- `lip_sync`：口型同步。
- `payment`：充值支付。
- `redeem_code`：兑换码。
- `advanced_models`：高级模型。
- `maintenance_mode`：维护模式。

后台操作：

- 启用或关闭。
- 设置生效人群、用户组、灰度比例。
- 设置开始和结束时间。
- 设置关闭原因和用户提示文案。
- 查看此开关影响的 API 和页面。

用户端生效路径和 API 拦截点：

- `registration`：`POST /api/auth/register`。
- `create_work`：`POST /api/projects`、首页快速创建作品链路。
- `text_generation`：故事扩写、分析、剧本、分镜文本任务，统一经 `submitTask`。
- `image_generation`：项目图片、资产中心图片生成和图片修改 API，统一经 `submitTask`。
- `video_generation`：视频生成、剪辑和视频类任务，统一经 `submitTask`。
- `voice_generation`：配音、音色设计、语音分析，统一经 `submitTask`。
- `lip_sync`：口型同步 API 和任务。
- `payment`：支付创建、支付回调、购买套餐。
- `redeem_code`：兑换码兑换 API。
- `advanced_models`：`/api/user/models` 和 `submitTask`。
- `maintenance_mode`：普通用户写操作统一拒绝，读操作显示维护公告。

错误提示：

- 使用功能开关上的 `userMessage`。
- 默认提示为“该功能维护中，请稍后再试”。

审计：

- `feature_flag.update`
- `feature_flag.schedule`

验收标准：

- 关闭后 UI 入口显示不可用。
- 直接请求 API 也被拒绝。
- 任务类功能关闭后不创建任务、不入队、不冻结余额。
- 开关影响范围在后台可见。

### 用户运营

目的：管理账号访问和运营属性，不管理用户作品内容。

展示字段：

- 用户 ID、用户名、邮箱、注册时间、最近登录。
- 角色、账号状态、用户组。
- 余额、冻结金额、累计消费。
- 作品数、任务数、失败任务数。
- 最近登录 IP 摘要和客服备注。

后台操作：

- 搜索和筛选用户。
- 禁用账号。
- 恢复账号。
- 调整角色。
- 调整用户组。
- 添加客服备注。
- 踢出登录。
- 查看余额和任务元数据。

用户端生效路径：

- 登录。
- 所有 `requireUserAuth()` API。
- 后台入口。

API 拦截点：

- NextAuth credentials 登录拒绝 disabled 用户。
- `requireUserAuth()` 实时读取用户状态。
- `/api/admin/users/[userId]` owner-only 修改角色和状态。

错误提示：

- 登录：账号已停用，请联系管理员。
- API：账号已停用。

审计：

- `user.access.disable`
- `user.access.enable`
- `user.role.update`
- `user.group.update`
- `user.note.create`
- `user.session.revoke`

验收标准：

- 禁用后用户旧 session 调普通 API 返回 403。
- 恢复后用户可重新登录。
- admin 不能把自己提为 owner。
- 用户详情不展示作品正文和媒体内容。

### 用户组与权益

目的：用运营规则控制不同用户能使用什么能力和多少资源。

默认用户组：

- 普通用户。
- 测试用户。
- VIP 用户。
- 内部用户。
- 受限用户。
- 封禁用户。

配置字段：

- key、名称、状态、优先级。
- 注册赠送额度。
- 每日任务上限。
- 并发任务上限。
- 每月额度。
- 最大单次任务成本。
- 最大冻结金额。
- 可用模型等级。
- 是否允许文本、图片、视频、语音、口型同步、高级模型。

后台操作：

- 创建、编辑、暂停、复制用户组。
- 设置权益。
- 查看当前绑定用户数。
- 将用户迁入或迁出用户组。

用户端生效路径：

- 注册后默认用户组和赠送额度。
- `/api/user/models` 模型列表过滤。
- `submitTask` 任务提交前校验。
- `prepareTaskBilling()` 冻结前校验。

错误提示：

- 当前账号暂不支持该能力。
- 今日任务已达上限。
- 当前并发任务已达上限。
- 当前模型不在账号权益范围内。

审计：

- `user_group.create`
- `user_group.update`
- `user_group.pause`
- `user.group.assign`

验收标准：

- 超出每日上限不创建任务。
- 超出并发上限不创建任务。
- 被禁止能力对应 UI 禁用，API 直接拒绝。
- 用户组变更后新任务立即按新规则校验。

### 计费与余额

目的：保证余额、冻结、扣费、充值、退款、补单可查且可纠正。

展示内容：

- 平台总余额、总冻结、总消费。
- 用户余额列表。
- 交易流水。
- 冻结记录。
- 使用成本。
- 充值订单。
- 退款记录。
- 异常账单。

异常账单类型：

- 支付成功但余额未到账。
- 任务失败但冻结未释放。
- 任务成功但未扣费。
- 重复扣费。
- 余额为负。
- 冻结金额长期 pending。

后台操作：

- 人工加款。
- 人工扣款。
- 解冻余额。
- 退款。
- 补单。
- 重新查询支付状态。
- 导出账单。

用户端生效路径：

- `/api/user/balance`。
- `/api/user/transactions`。
- 任务计费冻结和结算。

API / 服务拦截点：

- `UserBalance`。
- `BalanceFreeze`。
- `BalanceTransaction`。
- `prepareTaskBilling()`。
- `rollbackTaskBillingForTask()`。

错误提示：

- 财务动作失败时后台必须显示明确原因。
- 用户端显示余额不足、冻结释放或订单处理状态。

审计：

- `billing.balance.credit`
- `billing.balance.debit`
- `billing.freeze.release`
- `billing.order.refund`
- `billing.order.reconcile`

验收标准：

- 所有人工财务动作 owner-only。
- 所有人工财务动作必须填写原因。
- 高危财务动作必须二次确认。
- 余额、冻结、流水三者一致。
- 财务审计不记录用户创作内容。

### 套餐与兑换码

目的：支撑商业化和运营活动，并真正接入用户购买和兑换路径。

套餐字段：

- key、名称、描述、状态。
- 价格、币种、额度、赠送额度。
- 有效天数。
- 可购买用户组。
- 排序。

兑换码字段：

- code、状态、额度。
- 最大兑换次数、已兑换次数。
- 开始时间、结束时间。
- 可兑换用户组。
- 单用户兑换限制。

后台操作：

- 创建、编辑、上架、下架套餐。
- 创建、编辑、暂停、作废兑换码。
- 批量生成兑换码。
- 查看兑换记录。

用户端生效路径：

- 用户购买页。
- 支付创建 API。
- 支付回调。
- 兑换码入口。
- 余额入账和交易流水。

API 拦截点：

- 套餐列表 API。
- 支付订单创建 API。
- 支付回调处理。
- 兑换码兑换 API。

错误提示：

- 套餐已下架。
- 兑换码不存在、已暂停、已过期、已达上限、当前用户不可用。

审计：

- `commercial_package.create`
- `commercial_package.update`
- `commercial_package.publish`
- `commercial_package.archive`
- `redeem_code.create`
- `redeem_code.update`
- `redeem_code.redeem`

验收标准：

- 下架套餐不能购买。
- 暂停或过期兑换码不能兑换。
- 兑换成功后余额增加，流水存在，兑换次数递增。
- 兑换接口幂等，不能重复入账。

### 模型与渠道

目的：管理 AI 供应链可用性、成本和用户可见范围。

管理对象：

- 文本模型。
- 图片模型。
- 视频模型。
- 语音模型。
- 口型同步模型。
- 供应商渠道。

配置字段：

- 模型 key、供应商、模型类型、状态。
- 可见用户组。
- 是否高级模型。
- 默认模型。
- 成本倍率或价格策略。
- 连接测试结果。
- 维护提示。

后台操作：

- 启用、禁用、维护中。
- 设置默认模型。
- 设置可见用户组。
- 测试连接。
- 查看成功率、失败率、成本和任务量。

用户端生效路径：

- `/api/user/models`。
- 创作引擎配置。
- 模型选择 UI。
- `submitTask`。
- worker 执行前校验。

错误提示：

- 模型暂不可用。
- 当前账号不可使用该模型。
- 模型渠道维护中。

审计：

- `model_channel.create`
- `model_channel.update`
- `model_channel.disable`
- `model_default.update`
- `model_channel.test`

验收标准：

- 禁用模型不出现在新模型列表中。
- 强行提交禁用模型任务被拒绝。
- 渠道维护中不接收新任务。
- 连接测试不影响用户任务。
- 已排队任务处理策略必须明确：继续、取消、等待或迁移。

### 任务事故

目的：处理队列和任务故障，不查看用户内容。

展示字段：

- Task ID、Run ID、用户 ID、作品 ID、剧集 ID。
- 任务类型、状态、进度。
- 创建、入队、开始、心跳、完成时间。
- 脱敏错误码和错误摘要。
- 是否有 payload、是否有 result。
- 计费状态摘要：是否冻结、是否结算、是否回滚。

后台操作：

- 查看失败、排队、运行、卡死任务。
- 取消任务。
- 重试任务。
- 释放冻结。
- 批量取消。
- 批量重试。
- 标记事故已处理。

用户端生效路径：

- 任务状态查询。
- 工作区任务进度。
- Run 事件。
- 余额冻结和流水。

API / 服务拦截点：

- `Task`。
- BullMQ job。
- `TaskEvent`。
- `Run`。
- `BalanceFreeze`。
- `rollbackTaskBillingForTask()`。

错误提示：

- 后台显示脱敏错误原因和建议动作。
- 用户端显示任务已取消、任务失败或任务已重试。

审计：

- `task.cancel`
- `task.retry`
- `task.freeze.release`
- `task.incident.batch_resolve`

验收标准：

- 取消任务后 DB 和队列状态一致。
- 需要回滚余额时冻结被释放。
- 用户端能看到任务终态事件。
- 重试任务保留旧任务关系。
- 后台不展示 payload/result 原文。

### 系统健康

目的：判断基础设施和关键外部依赖是否能支撑网站运行。

检查项：

- MySQL。
- Redis。
- BullMQ 队列。
- worker 心跳。
- MinIO 或对象存储。
- 日志可读性。
- 支付服务。
- 模型供应商连接。
- 最近错误峰值。

后台操作：

- 手动刷新健康检查。
- 查看影响范围。
- 跳转到任务事故、模型渠道或功能开关。
- owner 可根据健康检查开启维护模式。

用户端生效路径：

- 维护模式。
- 功能降级。
- 公告中心。
- 任务提交拦截。

错误提示：

- 管理员看到依赖异常、影响功能和建议动作。
- 用户端只看到维护或功能暂不可用，不暴露内部错误。

审计：

- `system_health.check`
- `system.maintenance.enable`
- `system.maintenance.disable`

验收标准：

- 任一核心依赖异常时后台显示影响范围。
- 维护模式开启后普通用户写操作被拒绝。
- 健康检查失败不会泄露密钥、连接串或内部堆栈。

### 管理员审计

目的：让所有后台动作可追溯。

审计字段：

- 操作者 ID、角色。
- 动作名。
- 目标类型和目标 ID。
- 操作前摘要。
- 操作后摘要。
- 原因。
- IP。
- User-Agent。
- 时间。
- 是否高危。

必须覆盖：

- 公告创建、编辑、发布、暂停、归档。
- 功能开关修改。
- 用户角色、状态、用户组修改。
- 用户组权益修改。
- 财务人工动作。
- 套餐和兑换码修改。
- 模型渠道修改。
- 任务取消、重试、批量处理。
- 维护模式修改。

隐私要求：

- 不记录用户创作正文。
- 不记录任务 payload/result 原文。
- 不记录 API key、密钥、连接串。
- before/after 只保留运营字段摘要。

验收标准：

- 所有后台写操作都有审计。
- owner 能按动作、操作者、目标、时间筛选。
- admin 是否能看审计由产品策略控制，但默认只能 owner 看完整审计。

## UI 规格

管理后台是工具型界面，不是营销页。

布局：

- 左侧固定导航。
- 右侧为模块工作区。
- 顶部显示当前环境、维护状态、待处理事故、关闭开关数量、最后刷新时间。
- 移动端可以降级为模块选择器，但下拉框必须可读。

交互：

- 每个模块首页必须有可执行动作。
- 列表行必须有操作区。
- 表格必须支持搜索、筛选、分页。
- 高危动作必须二次确认。
- 写操作必须填写原因。
- 表单必须有字段错误、保存中、保存成功、保存失败状态。
- 暗色主题下 input、select、textarea、option 必须可读。

视觉：

- 信息密度应接近 SaaS 管理后台。
- 避免大面积装饰卡片。
- 使用表格、筛选器、状态 pill、操作按钮、抽屉详情、确认弹窗。
- 状态颜色必须一致：正常、警告、危险、禁用、草稿、维护中。

## 错误码和用户提示

运营策略层需要统一错误码。

| 错误码 | 场景 | 用户提示 |
| --- | --- | --- |
| `FEATURE_DISABLED` | 功能开关关闭 | 该功能暂不可用，请稍后再试 |
| `MAINTENANCE_MODE` | 维护模式 | 系统维护中，请稍后再试 |
| `ACCOUNT_DISABLED` | 账号禁用 | 账号已停用，请联系管理员 |
| `ENTITLEMENT_DENIED` | 用户组无能力 | 当前账号暂不支持该功能 |
| `TASK_DAILY_LIMIT_EXCEEDED` | 每日任务上限 | 今日任务次数已达上限 |
| `TASK_CONCURRENCY_LIMIT_EXCEEDED` | 并发上限 | 当前并发任务已达上限 |
| `MODEL_DISABLED` | 模型禁用 | 模型暂不可用 |
| `MODEL_NOT_ALLOWED` | 模型不在权益范围 | 当前账号不可使用该模型 |
| `BILLING_FREEZE_LIMIT_EXCEEDED` | 冻结金额上限 | 当前冻结金额已达上限 |
| `PACKAGE_UNAVAILABLE` | 套餐不可购买 | 套餐暂不可购买 |
| `REDEEM_CODE_UNAVAILABLE` | 兑换码不可用 | 兑换码不可用或已过期 |

## 数据和隐私边界

后台 DTO 必须白名单输出。

允许返回：

- 用户 ID、用户名、邮箱、角色、状态、用户组。
- 余额、冻结、消费、交易流水摘要。
- 任务 ID、类型、状态、进度、脱敏错误码、时间、是否有 payload/result。
- 模型、渠道、成功率、失败率、成本汇总。
- 公告、开关、用户组、套餐、兑换码运营字段。
- 审计摘要。

禁止返回：

- 用户小说正文。
- prompt。
- 分镜文本。
- 图片、视频、音频真实内容或私有 URL。
- 任务 `payload`、`result`、`dedupeKey`、`billingInfo` 原始 JSON。
- API key、供应商密钥、连接串。
- 审计内部敏感 JSON。

## 实施分阶段建议

V3 是完整闭环规格，实施可以分阶段。

### P0：必须先完成的运营闭环

- 功能开关真实接入注册、创建作品、任务提交、维护模式。
- 用户禁用和恢复对旧 session 生效。
- 公告中心真实展示到用户端。
- 任务事故支持取消和余额回滚。
- 统一运营策略层和错误码。
- 修复后台 UI 可读性和操作反馈。

### P1：资源和财务闭环

- 用户组权益接入模型列表、任务提交、并发和每日上限。
- 计费人工加款、扣款、解冻、补单。
- 套餐和兑换码接入购买、兑换和余额流水。

### P2：供应链和高级运营

- 模型渠道管理接入模型列表、任务提交和 worker 前置校验。
- 系统健康扩展到 Redis、BullMQ、worker、MinIO、支付、模型渠道。
- 批量任务事故处理。
- 更细的人群、灰度和用户组投放。

## 总体验收标准

- 任一后台开关关闭后，用户端 UI 和直接 API 调用都被拦截。
- 任一用户禁用后，旧 session 不能继续使用普通用户 API。
- 任一任务类限制失败时，不创建 task，不入队，不冻结余额。
- 任一财务纠错后，余额、冻结、流水三者一致。
- 任一套餐或兑换码状态变更后，用户端购买或兑换路径立即生效。
- 任一模型禁用后，模型列表和任务提交都不可使用该模型。
- 任一后台写操作都有审计。
- 后台所有 DTO 均脱敏，不暴露创作内容。
- 管理员看到的是可执行运营工作台，不是只有数字的报表。
