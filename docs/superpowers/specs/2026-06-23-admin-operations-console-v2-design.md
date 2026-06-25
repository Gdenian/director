# 管理者运营控制台 V2 设计

## 背景

当前管理端已经有角色校验、基础审计、用户列表、计费摘要、任务列表、模型用量、系统健康和审计日志。但现有页面主要是只读报表，管理员可以发现问题，却无法完成网站日常运营动作。

`director` 是 AI 视频创作平台。管理后台的第一原则是运营网站，而不是管理用户创作内容。后台只能处理账号、资源、计费、模型、任务、公告、功能开关和系统健康等运营元数据，不查看或编辑用户作品正文、prompt、图片、视频、音频。

## 目标

- 把 `/[locale]/admin` 从只读报表升级为运营控制台。
- 管理员登录后可以发公告、控制功能开放、维护用户资源规则、配置商业活动、处理任务事故、观察模型渠道和系统健康。
- 普通用户没有入口，即使手动请求 `/api/admin/**` 也会被服务端拒绝。
- 所有后台 DTO 使用白名单和脱敏输出。
- 所有高风险操作写入 `AdminAuditLog`。

## 非目标

- 不做用户作品 CMS。
- 不展示用户小说正文、prompt、分镜描述、媒体 URL、任务 payload、任务 result、dedupeKey、billingInfo 原始 JSON。
- 不在第一轮接入所有用户端消费链路。套餐、用户组和功能开关先成为可配置运营对象；后续再按业务路径逐步接入执行逻辑。
- 不做复杂 RBAC。继续使用 `user / admin / owner` 三角色。

## 推荐信息架构

管理后台采用左侧主导航和右侧工作区，而不是顶部 tab：

```text
运营总览
公告中心
功能开关
用户运营
用户组与权益
计费与余额
套餐与兑换码
模型与渠道
任务事故
系统健康
管理员审计
```

### 运营总览

目的：让管理员 30 秒内判断网站是否能正常运营。

展示：

- 今日新增用户、任务量、失败任务、排队任务、运行任务。
- 今日成本、总余额、冻结金额、累计消费。
- 当前公告数量、已发布公告数量。
- 已关闭功能开关数量。
- 任务事故列表：失败、卡死、长期排队。
- 模型/任务健康摘要。

### 公告中心

目的：管理员无需发版即可通知用户。

对象字段：

- `title`：标题。
- `body`：正文，支持普通文本或 Markdown。
- `type`：`general / maintenance / incident / billing / release / campaign`。
- `severity`：`info / warning / critical`。
- `status`：`draft / scheduled / published / paused / archived`。
- `locale`：`zh / en / all`。
- `surface`：`top_banner / modal / workspace_notice / profile_message`。
- `audience`：`all / admins / test_users / vip / restricted`。
- `startsAt`、`endsAt`。
- `dismissible`。
- `ctaLabel`、`ctaHref`。
- 创建人、更新人、创建时间、更新时间。

后台能力：

- 创建公告。
- 修改公告。
- 发布、暂停、归档公告。
- 查看公告状态和时间窗口。
- 审计所有创建和状态变更。

### 功能开关

目的：线上故障或运营活动时快速控制入口。

默认开关：

- `registration`：注册。
- `create_work`：创建作品。
- `text_generation`：文本生成。
- `image_generation`：图片生成。
- `video_generation`：视频生成。
- `voice_generation`：语音生成。
- `payment`：充值支付。
- `advanced_models`：高级模型。
- `maintenance_mode`：维护模式。

对象字段：

- key、name、description。
- enabled。
- category：`access / generation / billing / system / experiment`。
- audience。
- rolloutPercent。
- startsAt、endsAt。

后台能力：

- 查看全部开关。
- 启用/禁用。
- 修改目标人群和灰度比例。
- 写入审计。

### 用户运营

目的：管理账号和资源，不管理创作内容。

保留现有用户列表，并增强为运营视角：

- 账号状态、角色、余额、冻结金额、消费、作品数、任务数。
- 搜索、角色筛选、状态筛选。
- owner 可禁用/恢复账号、调整角色。
- 后续接入用户组、权益、客服备注、并发限制。

### 用户组与权益

目的：用运营规则管理不同用户能用什么资源。

默认用户组：

- 普通用户。
- 测试用户。
- VIP 用户。
- 内部用户。
- 受限用户。

对象字段：

- key、name、description、status。
- priority。
- signupCredits。
- dailyTaskLimit。
- concurrentTaskLimit。
- monthlyCredits。
- allowedModelTiers。
- allowVideo、allowVoice、allowAdvancedModels。

后台能力：

- 创建和修改用户组。
- 暂停用户组。
- 后续把用户绑定到用户组。

### 计费与余额

目的：保证余额、冻结、扣费、充值可查且可纠正。

保留现有能力：

- 总余额、冻结金额、累计消费。
- 最近交易。
- 冻结状态汇总。

后续增强：

- 异常账单。
- owner-only 人工加款、扣款、退款、解冻、补单。

### 套餐与兑换码

目的：支撑商业化和运营活动。

套餐字段：

- key、name、description、status。
- price、currency、credits。
- bonusCredits。
- durationDays。
- userGroupKey。
- sortOrder。

兑换码字段：

- code、status。
- credits。
- maxRedemptions、redeemedCount。
- startsAt、endsAt。
- userGroupKey。

后台能力：

- 创建/修改套餐。
- 创建/修改兑换码。
- 后续接入购买、兑换和支付回调。

### 模型与渠道

目的：管理 AI 供应链可用性和成本。

保留现有模型用量和任务健康摘要，新增运营提示：

- 按文本、图片、视频、语音、口型同步分类。
- 查看成功/失败任务分布。
- 后续增加模型启停、维护中、可用用户组、连接测试。

### 任务事故

目的：处理队列事故而不查看用户内容。

保留现有任务列表和 owner 取消任务能力，增强页面表现：

- 失败任务、排队任务、运行任务、卡死任务视图。
- 显示脱敏错误码和状态。
- 允许 owner 取消任务。
- 后续加入批量重试、清理卡死任务、重新入队。

### 系统健康

目的：判断基础设施是否可用。

保留数据库和日志检查，后续增加：

- Redis、MinIO、BullMQ 队列、worker 在线状态。
- 日志下载。
- 最近部署信息。

### 管理员审计

目的：所有后台动作可追溯。

审计必须覆盖：

- 公告创建、修改、发布、暂停、归档。
- 功能开关修改。
- 用户角色和状态修改。
- 用户组和权益配置修改。
- 套餐和兑换码配置修改。
- 任务取消。
- 财务高危操作。

## API 设计

新增接口：

```text
GET  /api/admin/operations
GET  /api/admin/announcements
POST /api/admin/announcements
PATCH /api/admin/announcements/[announcementId]
GET  /api/admin/feature-flags
PATCH /api/admin/feature-flags/[flagKey]
GET  /api/admin/user-groups
POST /api/admin/user-groups
PATCH /api/admin/user-groups/[groupKey]
GET  /api/admin/commercial
POST /api/admin/commercial/packages
PATCH /api/admin/commercial/packages/[packageKey]
POST /api/admin/commercial/redeem-codes
PATCH /api/admin/commercial/redeem-codes/[code]
```

权限：

- `GET`：admin 和 owner 可访问。
- 创建/修改公告、功能开关、用户组、套餐、兑换码：owner 可执行。
- 后续如需放宽给 admin，必须为高危操作增加金额/范围限制。

## 数据模型

新增 Prisma 模型：

- `AdminAnnouncement`
- `AdminFeatureFlag`
- `AdminUserGroup`
- `AdminCommercialPackage`
- `AdminRedeemCode`

这些模型只存运营配置，不存用户创作内容。

## 页面设计

管理后台采用高密度工具型界面：

- 顶部：标题、刷新按钮、最后更新时间、风险摘要。
- 左侧：模块导航。
- 主区域：当前模块的指标、表格、表单和操作按钮。
- 右侧或顶部：紧急状态条，显示维护模式、关闭功能、已发布公告、失败任务。

视觉原则：

- 不使用营销落地页式 hero。
- 不使用装饰性大卡片堆叠。
- 信息密度高，表格和状态标签清楚。
- 高危按钮必须文案明确。
- 页面文本不描述“如何使用页面”，只呈现运营对象和操作。

## 验收标准

- 普通用户无法访问新增后台 API。
- admin 可以读取新增后台数据。
- owner 可以创建/修改公告、功能开关、用户组、套餐、兑换码。
- 这些写操作都记录审计日志。
- 新增后台 API 不返回用户创作内容、任务 payload/result、密钥或内部计费 JSON。
- `/[locale]/admin` 展示完整运营后台布局，不再只是只读 tab 报表。
- 现有 admin API 测试继续通过。

