# Architecture

**Analysis Date:** 2026-04-17

## Pattern Overview

**Overall:** Next.js App Router + API Route 后端 + Prisma 数据层 + BullMQ 异步任务层 + Redis/SSE 实时事件层 + 领域服务模块化架构。

**Key Characteristics:**
- 页面入口集中在 `src/app/[locale]`，所有面向用户的路由都经过 `middleware.ts` 和 `next-intl` locale 前缀处理。
- API Route 位于 `src/app/api`，路由文件保持薄层：鉴权、参数解析、调用 `src/lib/**` 领域服务、返回 JSON 或 SSE。
- 长耗时 AI/媒体生成工作通过 `src/lib/task/submitter.ts` 写入 `Task` 数据并投递到 BullMQ 队列，由 `src/lib/workers/index.ts` 启动的独立 worker 进程执行。
- `Task` 层负责队列生命周期、计费冻结/结算、SSE 任务事件；`Run Runtime` 层负责可恢复的工作流运行、步骤事件、checkpoint/artifact 和前端 run console。
- 媒体以 `src/lib/storage` 的对象存储 provider 为底座，`src/lib/media` 把 legacy URL/storage key 归一化为 `/m/{publicId}` 可访问媒体引用。
- 模型访问被分为用户/项目配置、provider SDK、`src/lib/model-gateway` 兼容路由、`src/lib/generators` 生成器、worker handler 五层，API Route 不直接调用底层 LLM/provider。

## Layers

**Internationalized App Router UI:**
- Purpose: 渲染登录、首页、profile、workspace、asset hub 和项目详情体验。
- Location: `src/app/[locale]`
- Contains: `page.tsx`、`layout.tsx`、局部组件、workspace mode、stage controller hooks。
- Depends on: `src/components`、`src/lib/query`、`src/lib/api-fetch.ts`、`src/i18n`、`next-auth/react`、`@tanstack/react-query`。
- Used by: 浏览器用户入口，经 `middleware.ts` 自动加 locale。

**API Route 层:**
- Purpose: 提供项目、素材、任务、run、用户配置、存储签名、SSE、鉴权接口。
- Location: `src/app/api`
- Contains: Next.js `route.ts` 文件，例如 `src/app/api/projects/route.ts`、`src/app/api/runs/route.ts`、`src/app/api/sse/route.ts`、`src/app/api/novel-promotion/[projectId]/story-to-script-stream/route.ts`。
- Depends on: `src/lib/api-errors.ts`、`src/lib/api-auth.ts`、`src/lib/task/submitter.ts`、`src/lib/llm-observe/route-task.ts`、`src/lib/assets/services`、`src/lib/prisma.ts`。
- Used by: Workspace UI、React Query hooks、worker 内部 sync fallback 请求、SSE 客户端。

**API Cross-Cutting Wrapper:**
- Purpose: 统一 request id、结构化日志、错误规范化、用户操作审计、内部 LLM stream callback。
- Location: `src/lib/api-errors.ts`
- Contains: `apiHandler()`、`ApiError`、`getRequestId()`、`getIdempotencyKey()`。
- Depends on: `src/lib/errors`、`src/lib/logging`、`src/lib/task/publisher.ts`、`src/lib/llm-observe/internal-stream-context.ts`。
- Used by: 几乎所有 `src/app/api/**/route.ts`。

**Auth/Authorization 层:**
- Purpose: NextAuth credentials 登录、session 解析、项目所有权检查、内部 task token 身份。
- Location: `src/lib/auth.ts`、`src/lib/api-auth.ts`、`src/app/api/auth/[...nextauth]/route.ts`、`src/app/api/auth/register/route.ts`
- Contains: `authOptions`、`requireUserAuth()`、`requireProjectAuth()`、`requireProjectAuthLight()`。
- Depends on: `@next-auth/prisma-adapter`、`bcryptjs`、`src/lib/prisma.ts`。
- Used by: UI 登录页 `src/app/[locale]/auth/*/page.tsx` 与所有需要用户/项目权限的 API Route。

**Workspace UI Shell:**
- Purpose: 项目列表、项目详情、阶段导航、剧集选择、模型设置、导入向导、run console、素材库入口。
- Location: `src/app/[locale]/workspace`
- Contains: 列表页 `src/app/[locale]/workspace/page.tsx`、详情页 `src/app/[locale]/workspace/[projectId]/page.tsx`、workspace mode `src/app/[locale]/workspace/[projectId]/modes/novel-promotion`。
- Depends on: `src/lib/query/hooks/useProjectData.ts`、`src/lib/query/mutations`、`src/lib/workspace/model-setup.ts`、`src/lib/novel-promotion/stage-readiness.ts`。
- Used by: 主产品工作台。

**Workspace Stage Runtime:**
- Purpose: 将 workspace 的 config/script/assets/storyboard/videos/voice 阶段拆成可组合 runtime 与页面组件。
- Location: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion`
- Contains: `NovelPromotionWorkspace.tsx`、`WorkspaceProvider.tsx`、`WorkspaceStageRuntimeContext.tsx`、`hooks/useNovelPromotionWorkspaceController.ts`、`components/WorkspaceStageContent.tsx`。
- Depends on: `src/lib/novel-promotion/stages`、`src/lib/query/hooks/run-stream`、`src/components/ui`、`src/components/task`。
- Used by: `src/app/[locale]/workspace/[projectId]/page.tsx`。

**Client Data Layer:**
- Purpose: 浏览器侧数据获取、缓存、失效、SSE/run stream 状态机。
- Location: `src/lib/query`
- Contains: `src/lib/query/client.ts`、`src/lib/query/keys.ts`、`src/lib/query/hooks`、`src/lib/query/mutations`、`src/lib/query/hooks/run-stream`。
- Depends on: `@tanstack/react-query`、`src/lib/api-fetch.ts`、`src/lib/task/client.ts`。
- Used by: workspace 页面、asset hub 页面、storyboard/video/voice 阶段组件。

**Project/Novel Promotion Domain:**
- Purpose: 小说推文项目、剧集、角色、场景、分镜、视频、语音、剪辑等业务数据与流程。
- Location: `src/lib/novel-promotion`、`src/app/api/novel-promotion`、`src/app/[locale]/workspace/[projectId]/modes/novel-promotion`
- Contains: story-to-script orchestrator `src/lib/novel-promotion/story-to-script/orchestrator.ts`、script-to-storyboard orchestrator `src/lib/novel-promotion/script-to-storyboard/orchestrator.ts`、stage runtime `src/lib/novel-promotion/stages`、大量 route handlers。
- Depends on: Prisma models in `prisma/schema.prisma`、`src/lib/task`、`src/lib/workers/handlers`、`src/lib/assets`、`src/lib/media`。
- Used by: workspace 主流程和 worker 任务。

**Task Queue Layer:**
- Purpose: 持久化异步任务、去重、入队、任务心跳、取消、重试、状态查询。
- Location: `src/lib/task`
- Contains: `submitter.ts`、`service.ts`、`queues.ts`、`publisher.ts`、`reconcile.ts`、`state-service.ts`、`types.ts`。
- Depends on: `bullmq`、`src/lib/redis.ts`、`src/lib/prisma.ts`、`src/lib/billing`、`src/lib/run-runtime`。
- Used by: API Route、worker lifecycle、watchdog、前端 task status 查询。

**Worker Runtime Layer:**
- Purpose: 独立进程消费 BullMQ 队列，执行业务 handler，发布任务事件，处理计费结算/回滚。
- Location: `src/lib/workers`
- Contains: worker 入口 `src/lib/workers/index.ts`，队列 worker `image.worker.ts`、`video.worker.ts`、`voice.worker.ts`、`text.worker.ts`，公共 lifecycle `shared.ts`，任务 handlers `src/lib/workers/handlers`。
- Depends on: `src/lib/task/service.ts`、`src/lib/task/publisher.ts`、`src/lib/billing`、`src/lib/generators`、`src/lib/model-gateway`、`src/lib/storage`。
- Used by: `npm run dev:worker`、`npm run start:worker`。

**Run Runtime Layer:**
- Purpose: 对 AI 工作流提供 run/step/event/checkpoint/artifact 抽象，支持 active run 恢复、步骤重试、run console 和 terminal reconciliation。
- Location: `src/lib/run-runtime`
- Contains: `service.ts`、`publisher.ts`、`task-bridge.ts`、`recovery.ts`、`workflow.ts`、`workflow-lease.ts`、`reconcile.ts`、`types.ts`。
- Depends on: Prisma graph runtime tables、`src/lib/redis.ts`、`src/lib/workflow-engine`、`src/lib/task/types.ts`。
- Used by: `src/app/api/runs/**`、`src/lib/task/submitter.ts`、`src/lib/task/publisher.ts`、`src/lib/workers/shared.ts`、`src/lib/query/hooks/run-stream`。

**Workflow Definition Layer:**
- Purpose: 定义 story-to-script 与 script-to-storyboard 的步骤、依赖、artifact 类型、重试失效范围。
- Location: `src/lib/workflow-engine`
- Contains: `registry.ts`、`dependencies.ts`。
- Depends on: `src/lib/task/types.ts`。
- Used by: `src/lib/run-runtime/service.ts` 的 step retry 与 artifact/checkpoint 管理。

**Billing Layer:**
- Purpose: 余额、冻结、计费模式、模型成本估算、任务预扣、任务结算/回滚、费用报表。
- Location: `src/lib/billing`
- Contains: `service.ts`、`ledger.ts`、`task-policy.ts`、`cost.ts`、`runtime-usage.ts`、`reporting.ts`。
- Depends on: `src/lib/prisma.ts`、`src/lib/model-pricing`、`src/lib/model-config-contract.ts`。
- Used by: `src/lib/task/submitter.ts`、`src/lib/workers/shared.ts`、用户费用 API `src/app/api/user/costs/route.ts`、项目费用 API `src/app/api/projects/[projectId]/costs/route.ts`。

**Media Layer:**
- Purpose: 统一存储 key、legacy URL、`MediaObject`、`MediaRef`、展示 URL 与 outbound generation image 格式。
- Location: `src/lib/media`
- Contains: `service.ts`、`attach.ts`、`image-url.ts`、`outbound-image.ts`、`hash.ts`、`types.ts`。
- Depends on: `src/lib/storage`、Prisma `MediaObject` model。
- Used by: asset/project API、worker handler、UI 图片组件 `src/components/media`、公开媒体路由 `src/app/m/[publicId]/route.ts`。

**Storage Layer:**
- Purpose: 抽象 local、MinIO、COS 存储 provider，提供上传、删除、签名 URL、对象读取、下载后转存。
- Location: `src/lib/storage`
- Contains: `factory.ts`、`index.ts`、`providers/local.ts`、`providers/minio.ts`、`providers/cos.ts`、`signed-urls.ts`、`bootstrap.ts`。
- Depends on: `@aws-sdk/client-s3`、`@aws-sdk/s3-request-presigner`、本地文件系统、环境变量。
- Used by: `src/lib/media`、上传 API、worker utils、`src/app/api/files/[...path]/route.ts`、`src/app/api/storage/sign/route.ts`。

**Model Gateway / Provider Layer:**
- Purpose: 根据 provider 类型路由 official SDK 或 OpenAI-compatible 协议，封装文本、视觉、图片、视频生成。
- Location: `src/lib/model-gateway`、`src/lib/generators`、`src/lib/providers`
- Contains: `src/lib/model-gateway/router.ts`、`src/lib/model-gateway/llm.ts`、`src/lib/model-gateway/openai-compat/*`、`src/lib/generators/image/openai-compatible.ts`、provider 目录 `src/lib/providers/bailian`、`src/lib/providers/fal`、`src/lib/providers/official`、`src/lib/providers/siliconflow`。
- Depends on: `src/lib/api-config`、`src/lib/llm-client.ts`、provider SDK、用户 API 配置。
- Used by: `src/lib/ai-runtime/client.ts`、`src/lib/generator-api.ts`、worker handlers。

**Asset Domain Layer:**
- Purpose: 全局素材库和项目素材的角色、场景、道具、语音、图片生成/修改/选择。
- Location: `src/lib/assets`、`src/app/api/asset-hub`、`src/app/api/assets`、`src/app/[locale]/workspace/asset-hub`
- Contains: contracts/mappers/services、asset hub 页面和 API、project-backed asset actions。
- Depends on: `src/lib/task/submitter.ts`、`src/lib/media`、`src/lib/storage`、Prisma asset models。
- Used by: workspace asset stage、global asset hub、storyboard image references。

**Logging / Observability Layer:**
- Purpose: 结构化日志、语义日志、文件写入、request/task/project/user context、敏感信息脱敏。
- Location: `src/lib/logging`
- Contains: `core.ts`、`context.ts`、`semantic.ts`、`file-writer.ts`、`redact.ts`。
- Depends on: runtime context and filesystem。
- Used by: API wrapper、worker lifecycle、auth、storage、workspace client logs。

## Data Flow

**Workspace 页面加载:**

1. 浏览器访问 `/{locale}/workspace/[projectId]`，`middleware.ts` 通过 `next-intl` 处理 locale。
2. 页面入口 `src/app/[locale]/workspace/[projectId]/page.tsx` 读取 URL 中的 `stage` 与 `episode`，使用 `useProjectData()` 和 `useEpisodeData()` 调用 `/api/projects/{projectId}/data` 与 `/api/novel-promotion/{projectId}/episodes/{episodeId}`。
3. `NovelPromotionWorkspace` 在 `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/NovelPromotionWorkspace.tsx` 创建 `WorkspaceProvider` 与 `WorkspaceStageRuntimeProvider`。
4. `useNovelPromotionWorkspaceController()` 组合 project snapshot、stage navigation、execution、video actions、config actions，并把阶段能力传给 `WorkspaceStageContent.tsx`。
5. 阶段组件通过 `src/lib/query/mutations` 调用 API，通过 `src/lib/query/keys.ts` 失效 React Query cache。

**异步任务提交与执行:**

1. UI 调用生成/分析 API，例如 `src/app/api/novel-promotion/[projectId]/story-to-script-stream/route.ts`。
2. API 使用 `apiHandler()` 包裹，调用 `requireProjectAuth()` 验证项目权限。
3. LLM 类任务调用 `maybeSubmitLLMTask()`，普通媒体任务调用 `submitTask()` 或素材服务，如 `src/lib/assets/services/asset-actions.ts`。
4. `submitTask()` 在 `src/lib/task/submitter.ts` 规范化 locale/flow meta，必要时创建或复用 `GraphRun`，调用 `prepareTaskBilling()` 冻结余额，然后 `createTask()` 写入 DB。
5. `addTaskJob()` 在 `src/lib/task/queues.ts` 按 `TASK_TYPE` 投递到 image/video/voice/text 队列。
6. `src/lib/workers/index.ts` 启动各 worker，具体 worker 如 `src/lib/workers/text.worker.ts` 分发到 `src/lib/workers/handlers/story-to-script.ts` 等 handler。
7. `withTaskLifecycle()` 在 `src/lib/workers/shared.ts` 标记 processing、发布进度、执行 handler、settle 或 rollback billing、标记 completed/failed。
8. `publishTaskEvent()` 写入 `TaskEvent` 并通过 Redis channel 广播；可映射到 run event 的事件经 `src/lib/run-runtime/task-bridge.ts` 写入 `GraphEvent`。

**Run stream / 可恢复工作流:**

1. Run-centric 任务类型 `STORY_TO_SCRIPT_RUN` 与 `SCRIPT_TO_STORYBOARD_RUN` 在 `src/lib/task/submitter.ts` 中会创建或复用 `GraphRun`。
2. Worker 内部进度经 `src/lib/workers/shared.ts` 直接或间接调用 `publishRunEvent()`。
3. `src/lib/run-runtime/service.ts` 为 run event 分配递增 `seq`，并持久化到 graph runtime tables。
4. 前端 `src/lib/query/hooks/run-stream/run-request-executor.ts` 收到 async task response 后按 `runId` 轮询 `/api/runs/{runId}/events`，遇到空轮询会读取 `/api/runs/{runId}` 做 terminal reconciliation。
5. `src/lib/run-runtime/recovery.ts` 根据 active status、lease、heartbeat 判断是否可恢复；`src/app/api/runs/route.ts` 在 scoped active query 下只返回可恢复 latest run。
6. 步骤重试通过 `src/app/api/runs/[runId]/steps/[stepKey]/retry/route.ts` 调用 `retryFailedStep()`，失效范围由 `src/lib/workflow-engine/registry.ts` 计算。

**SSE task event 流:**

1. 浏览器打开 `/api/sse?projectId=...&episodeId=...`，入口是 `src/app/api/sse/route.ts`。
2. API 验证用户或项目权限，并从 `Last-Event-ID` 读取 replay cursor。
3. 没有 cursor 时先查询 active task snapshot；有 cursor 时调用 `listEventsAfter()` 补发错过事件。
4. `getSharedSubscriber()` 在 `src/lib/sse/shared-subscriber.ts` 复用 Redis subscriber 订阅 `task-events:project:{projectId}`。
5. 每 15 秒发送 heartbeat，任务事件以 `event: lifecycle` 或 `event: stream` 格式推给浏览器。

**媒体生成与展示:**

1. API 或 worker 生成远端媒体 URL/Buffer 后，使用 `src/lib/storage/index.ts` 的 `uploadObject()`、`downloadAndUploadImage()`、`downloadAndUploadVideo()` 存储对象。
2. `ensureMediaObjectFromStorageKey()` 在 `src/lib/media/service.ts` 创建或读取 `MediaObject`，生成稳定 `publicId`。
3. 数据表保存 `mediaId` 与 legacy `imageUrl`/`videoUrl` 字段；`src/lib/media/attach.ts` 在响应中附加 `MediaRef`。
4. 前端使用 `/m/{publicId}` 或签名 URL 展示；公开路由位于 `src/app/m/[publicId]/route.ts`。

**计费数据流:**

1. `submitTask()` 根据 `src/lib/billing/task-policy.ts` 判断任务是否计费，并通过 `buildDefaultTaskBillingInfo()` 生成预估信息。
2. `prepareTaskBilling()` 在 `src/lib/billing/service.ts` 解析模型、估算 max cost，调用 `freezeBalance()`。
3. Worker 执行成功后 `settleTaskBilling()` 调用 `confirmChargeWithRecord()` 和 `recordUsageCostOnly()`；失败或 orphan task 由 `rollbackTaskBilling()` 或 `rollbackTaskBillingForTask()` 回滚冻结。
4. 报表 API 从 `src/lib/billing/reporting.ts` 与 Prisma `usageCost` 聚合项目/用户费用。

**State Management:**
- Server state: Prisma/MySQL，核心 schema 在 `prisma/schema.prisma`。
- Queue state: BullMQ jobs + Redis，队列定义在 `src/lib/task/queues.ts`。
- Realtime state: Redis pub/sub + persisted `TaskEvent`/`GraphEvent`。
- Client cache: TanStack Query keys 在 `src/lib/query/keys.ts`。
- UI state: workspace 内局部 React state 与 URL query 参数；stage/episode 以 URL 为主要单源。
- Run state: `GraphRun`、`GraphStep`、`GraphEvent`、`GraphCheckpoint`、`GraphArtifact` 由 `src/lib/run-runtime/service.ts` 访问。

## Key Abstractions

**API Handler Contract:**
- Purpose: 每个 API Route 应用统一错误、日志、request id、内部 LLM stream 上下文。
- Examples: `src/lib/api-errors.ts`、`src/app/api/projects/route.ts`、`src/app/api/runs/route.ts`
- Pattern: `export const GET/POST = apiHandler(async (request, context) => { ... })`。

**Project Auth Context:**
- Purpose: 统一用户 session、项目存在性、项目所有权、NovelPromotionData 关联数据加载。
- Examples: `src/lib/api-auth.ts`、`src/app/api/novel-promotion/[projectId]/generate-image/route.ts`
- Pattern: API Route 先调用 `requireUserAuth()`、`requireProjectAuth()` 或 `requireProjectAuthLight()`，再执行业务。

**Task:**
- Purpose: 队列任务的持久化、状态、payload、计费信息、去重 key、进度和错误。
- Examples: `src/lib/task/types.ts`、`src/lib/task/service.ts`、`src/lib/task/submitter.ts`
- Pattern: API 调 `submitTask()`，worker 调 `tryMarkTaskProcessing()`、`tryUpdateTaskProgress()`、`tryMarkTaskCompleted()`、`tryMarkTaskFailed()`。

**Run:**
- Purpose: 比 Task 更适合前端工作流展示和恢复的运行记录，包含 steps、events、artifacts、checkpoints。
- Examples: `src/lib/run-runtime/types.ts`、`src/lib/run-runtime/service.ts`、`src/lib/run-runtime/publisher.ts`
- Pattern: run-centric task 由 `submitTask()` 创建/复用 run，event 由 `publishRunEvent()` 追加并按 `seq` 消费。

**Workflow Definition:**
- Purpose: 声明 workflow step 顺序、依赖、artifact 类型、重试影响范围。
- Examples: `src/lib/workflow-engine/registry.ts`
- Pattern: 新 workflow 应在 registry 中定义 `WorkflowDefinition`，并接入 `WORKFLOW_DEFINITIONS`。

**Worker Handler:**
- Purpose: 对单个 `TASK_TYPE` 实现实际 AI/媒体/DB 持久化工作。
- Examples: `src/lib/workers/handlers/story-to-script.ts`、`src/lib/workers/handlers/script-to-storyboard.ts`、`src/lib/workers/handlers/panel-image-task-handler.ts`、`src/lib/workers/handlers/voice-design.ts`
- Pattern: worker 文件按队列分发，handler 接收 `Job<TaskJobData>`，公共 lifecycle 由 `withTaskLifecycle()` 包裹。

**Billing Info:**
- Purpose: 在任务 payload 外独立记录预估、冻结、计费模式、定价版本和结算状态。
- Examples: `src/lib/billing/types.ts`、`src/lib/billing/task-policy.ts`、`src/lib/billing/service.ts`
- Pattern: submit 时 prepare/freeze，worker terminal 时 settle/rollback。

**MediaRef:**
- Purpose: 对外暴露稳定媒体 URL、publicId、storageKey、mime/dimension/duration metadata。
- Examples: `src/lib/media/types.ts`、`src/lib/media/service.ts`、`src/lib/media/attach.ts`
- Pattern: 服务端写路径保存 storage key/media id；响应阶段附加 `MediaRef`；展示阶段使用 `/m/{publicId}`。

**StorageProvider:**
- Purpose: 屏蔽 local、MinIO、COS 存储差异。
- Examples: `src/lib/storage/types.ts`、`src/lib/storage/factory.ts`、`src/lib/storage/providers/local.ts`、`src/lib/storage/providers/minio.ts`
- Pattern: 业务只调用 `src/lib/storage/index.ts` 导出的函数，不直接使用 provider SDK。

**Model Gateway Route:**
- Purpose: 根据 provider id 选择 official provider 或 OpenAI-compatible 实现。
- Examples: `src/lib/model-gateway/router.ts`、`src/lib/model-gateway/openai-compat`、`src/lib/ai-runtime/client.ts`
- Pattern: 生成器和 AI runtime 通过 gateway/llm-client 调模型，API Route 不直接调 provider。

**Workspace Controller View Model:**
- Purpose: 把 workspace 的项目数据、UI 状态、stage navigation、execution、video actions 聚合为组件可消费 VM。
- Examples: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useNovelPromotionWorkspaceController.ts`、`src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/workspace-controller-view-model.ts`
- Pattern: 页面组件保持展示逻辑，复杂状态组合放到 hooks。

## Entry Points

**Next.js App:**
- Location: `src/app/[locale]/layout.tsx`
- Triggers: 用户访问 locale 路由。
- Responsibilities: locale layout、provider 包装、全局页面结构。

**Locale Middleware:**
- Location: `middleware.ts`
- Triggers: 所有非 API、非静态资源、非 `/m` 请求。
- Responsibilities: `next-intl` locale routing。

**Workspace List:**
- Location: `src/app/[locale]/workspace/page.tsx`
- Triggers: 用户访问 `/workspace`。
- Responsibilities: 登录检查、项目分页/搜索、创建/编辑/删除项目入口。

**Workspace Detail:**
- Location: `src/app/[locale]/workspace/[projectId]/page.tsx`
- Triggers: 用户访问 `/workspace/{projectId}`。
- Responsibilities: 读取 URL stage/episode、加载项目/剧集、自动建第一集、模型配置检查、挂载 `NovelPromotionWorkspace`。

**Asset Hub UI:**
- Location: `src/app/[locale]/workspace/asset-hub/page.tsx`
- Triggers: 用户访问 `/workspace/asset-hub`。
- Responsibilities: 全局素材库 UI、角色/场景/语音素材管理。

**Profile / Model Config UI:**
- Location: `src/app/[locale]/profile/page.tsx`
- Triggers: 用户访问 `/profile`。
- Responsibilities: 用户 API 配置、默认模型、provider 配置。

**Project API:**
- Location: `src/app/api/projects/route.ts`、`src/app/api/projects/[projectId]/data/route.ts`
- Triggers: React Query 项目列表与项目详情请求。
- Responsibilities: 项目 CRUD、统计、费用聚合、项目数据快照。

**Novel Promotion API:**
- Location: `src/app/api/novel-promotion/[projectId]`
- Triggers: workspace 各阶段操作。
- Responsibilities: 剧集、角色、场景、分镜、视频、语音、分析/生成任务提交。

**Run API:**
- Location: `src/app/api/runs/route.ts`、`src/app/api/runs/[runId]/route.ts`、`src/app/api/runs/[runId]/events/route.ts`
- Triggers: run console、run stream 状态恢复、步骤重试、取消。
- Responsibilities: 创建/查询/取消 run，读取 run events，retry step。

**Task API:**
- Location: `src/app/api/tasks/route.ts`、`src/app/api/tasks/[taskId]/route.ts`、`src/app/api/task-target-states/route.ts`
- Triggers: 任务状态组件、目标状态 overlay、失败任务 dismiss。
- Responsibilities: 查询任务、事件 replay、取消/状态派生。

**SSE API:**
- Location: `src/app/api/sse/route.ts`
- Triggers: 浏览器实时订阅项目任务事件。
- Responsibilities: active snapshot、event replay、Redis pub/sub 转 SSE、heartbeat。

**Worker Process:**
- Location: `src/lib/workers/index.ts`
- Triggers: `npm run dev:worker`、`npm run start:worker`。
- Responsibilities: 启动 image/video/voice/text worker，监听 ready/error/failed，优雅关闭。

**Storage Init:**
- Location: `src/lib/storage/init.ts`
- Triggers: `npm run storage:init`。
- Responsibilities: 初始化 MinIO bucket 或跳过非 MinIO provider。

**Watchdog:**
- Location: `scripts/watchdog.ts`
- Triggers: `npm run dev:watchdog`、`npm run start:watchdog`。
- Responsibilities: 周期性 reconcile 任务/运行状态。

**Bull Board:**
- Location: `scripts/bull-board.ts`
- Triggers: `npm run dev:board`、`npm run start:board`。
- Responsibilities: BullMQ 队列可视化管理。

## Error Handling

**Strategy:** API 统一归一化为结构化错误响应；Task/Worker 将错误写入 task/run lifecycle；Billing 在失败路径补偿回滚；前端通过 `resolveTaskErrorMessage()` 和 presentation state 展示。

**Patterns:**
- API Route 使用 `throw new ApiError('INVALID_PARAMS')` 等错误码，统一由 `apiHandler()` 转换响应。
- 项目鉴权失败返回 `NextResponse`，调用点使用 `isErrorResponse()` 提前返回。
- Worker handler 由 `withTaskLifecycle()` 包裹，异常会触发 task failed、billing rollback、失败事件发布。
- `src/lib/errors/normalize.ts` 与 `src/lib/errors/codes.ts` 负责 provider/API/任务错误规范化。
- Run terminal reconciliation 在 `src/lib/query/hooks/run-stream/run-request-executor.ts` 处理 event stream 空洞或 terminal event 缺失。
- Prisma 并发冲突部分使用 upsert/re-fetch，例如 `src/lib/media/service.ts` 处理 `P2002`。

## Cross-Cutting Concerns

**Logging:** 使用 `src/lib/logging/core.ts` 的 scoped logger 和 `src/lib/logging/context.ts` 的 request/task/project/user 上下文；API wrapper、worker、storage、auth 都会写结构化日志。

**Validation:** API Route 内部做轻量参数检查；项目表单验证集中在 `src/lib/projects/validation.ts`；模型配置契约在 `src/lib/model-config-contract.ts`；部分工具脚本在 `scripts/guards` 中约束 API/媒体/任务/模型访问模式。

**Authentication:** NextAuth credentials 配置在 `src/lib/auth.ts`；用户/项目鉴权在 `src/lib/api-auth.ts`；内部 worker sync 请求通过 `INTERNAL_TASK_TOKEN`、`x-internal-task-token`、`x-internal-user-id` 识别。

**Authorization:** 项目资源必须通过 `requireProjectAuth()` 或 `requireProjectAuthLight()` 验证 `project.userId === session.user.id`；全局 asset hub 使用用户级鉴权。

**Realtime:** Task event 使用 `src/lib/task/publisher.ts` 写 DB 和 Redis channel；SSE 使用 `src/lib/sse/shared-subscriber.ts` 复用 subscriber；Run event 使用 `src/lib/run-runtime/publisher.ts` 写 DB 和 Redis channel。

**Persistence:** Prisma Client 在 `src/lib/prisma.ts`，schema 在 `prisma/schema.prisma`，迁移在 `prisma/migrations`。

**Background Execution:** BullMQ 队列在 `src/lib/task/queues.ts`，worker 在 `src/lib/workers`，watchdog 在 `scripts/watchdog.ts`。

**Media Safety:** 服务端写路径应使用 `src/lib/media/service.ts` 和 `src/lib/storage/index.ts`，避免在业务中直接保存 provider URL；显示前应通过 `MediaRef` 或签名 URL。

**Model Access:** API Route 不应直接访问 provider SDK；使用 `src/lib/llm-observe/route-task.ts`、`src/lib/task/submitter.ts`、`src/lib/ai-runtime`、`src/lib/generators` 或 `src/lib/model-gateway`。

---

*Architecture analysis: 2026-04-17*
