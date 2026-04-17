# Codebase Structure

**Analysis Date:** 2026-04-17

## Directory Layout

```text
director/
├── src/
│   ├── app/                         # Next.js App Router 页面、API routes、公开媒体 route
│   │   ├── [locale]/                # 国际化 UI 路由
│   │   ├── api/                     # 后端 API Route handlers
│   │   └── m/[publicId]/            # 媒体 publicId 访问入口
│   ├── components/                  # 跨页面复用 React 组件
│   ├── contexts/                    # React context
│   ├── features/                    # 独立前端功能模块，例如 video editor
│   ├── hooks/                       # 通用 client hooks
│   ├── i18n/                        # next-intl routing/navigation 配置
│   ├── lib/                         # 服务端/客户端共享业务库与领域服务
│   ├── pages/                       # Pages Router 残留入口，仅 _document
│   ├── styles/                      # 全局样式与动画
│   └── types/                       # 共享 TypeScript 类型
├── prisma/                          # Prisma schema 与 migrations
├── tests/                           # Vitest 单元、集成、系统、回归测试
├── scripts/                         # 运维、迁移、guard、watchdog、bull-board 脚本
├── public/                          # 静态资源
├── messages/                        # next-intl 文案
├── lib/prompts/                     # Prompt 模板与技能 prompt
├── standards/                       # 能力、定价、prompt canary 标准数据
├── images/                          # 项目图片资料
├── .github/workflows/               # GitHub Actions
├── package.json                     # npm scripts 与依赖
├── next.config.ts                   # Next.js 配置
├── tsconfig.json                    # TypeScript 配置与 @/* alias
├── middleware.ts                    # next-intl locale middleware
├── vitest.config.ts                 # Vitest 配置
└── Dockerfile                       # 容器构建
```

## Directory Purposes

**`src/app`:**
- Purpose: Next.js App Router 的页面、API 和 route handlers。
- Contains: `src/app/[locale]` UI routes、`src/app/api` 后端 routes、`src/app/m/[publicId]/route.ts` 媒体 route。
- Key files: `src/app/[locale]/layout.tsx`、`src/app/[locale]/workspace/page.tsx`、`src/app/[locale]/workspace/[projectId]/page.tsx`、`src/app/api/sse/route.ts`。

**`src/app/[locale]`:**
- Purpose: 带 locale 前缀的用户页面。
- Contains: auth、home、profile、workspace、dev 页面，以及 locale-scoped providers。
- Key files: `src/app/[locale]/providers.tsx`、`src/app/[locale]/auth/signin/page.tsx`、`src/app/[locale]/profile/page.tsx`、`src/app/[locale]/workspace/asset-hub/page.tsx`。

**`src/app/[locale]/workspace`:**
- Purpose: 主工作区入口与全局素材库 UI。
- Contains: 项目列表页、项目详情页、asset hub 页面。
- Key files: `src/app/[locale]/workspace/page.tsx`、`src/app/[locale]/workspace/asset-hub/page.tsx`、`src/app/[locale]/workspace/[projectId]/page.tsx`。

**`src/app/[locale]/workspace/[projectId]/modes/novel-promotion`:**
- Purpose: 小说推文工作台的主 UI 模式。
- Contains: Workspace provider、stage runtime context、controller hooks、阶段组件、storyboard/video/voice/assets 子组件。
- Key files: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/NovelPromotionWorkspace.tsx`、`src/app/[locale]/workspace/[projectId]/modes/novel-promotion/WorkspaceProvider.tsx`、`src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useNovelPromotionWorkspaceController.ts`、`src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/WorkspaceStageContent.tsx`。

**`src/app/api`:**
- Purpose: 后端 HTTP API。
- Contains: admin、asset-hub、assets、auth、files、novel-promotion、projects、runs、sse、storage、tasks、user、user-preference 等 route groups。
- Key files: `src/app/api/projects/route.ts`、`src/app/api/novel-promotion/[projectId]/story-to-script-stream/route.ts`、`src/app/api/runs/route.ts`、`src/app/api/tasks/route.ts`、`src/app/api/sse/route.ts`。

**`src/app/api/novel-promotion`:**
- Purpose: 项目内小说推文业务 API。
- Contains: 角色/场景/分镜/视频/语音/剧集 CRUD，AI 分析与生成任务提交。
- Key files: `src/app/api/novel-promotion/[projectId]/generate-image/route.ts`、`src/app/api/novel-promotion/[projectId]/generate-video/route.ts`、`src/app/api/novel-promotion/[projectId]/voice-generate/route.ts`、`src/app/api/novel-promotion/[projectId]/script-to-storyboard-stream/route.ts`。

**`src/app/api/asset-hub`:**
- Purpose: 全局素材库 API。
- Contains: 全局角色、场景、语音、文件夹、AI 设计/修改、上传/选择/撤回接口。
- Key files: `src/app/api/asset-hub/characters/route.ts`、`src/app/api/asset-hub/locations/route.ts`、`src/app/api/asset-hub/generate-image/route.ts`、`src/app/api/asset-hub/voice-design/route.ts`。

**`src/app/api/assets`:**
- Purpose: 通用素材资源 API，覆盖 copy/generate/modify/select/revert/update/variant 等操作。
- Contains: asset-level route handlers。
- Key files: `src/app/api/assets/route.ts`、`src/app/api/assets/[assetId]/generate/route.ts`、`src/app/api/assets/[assetId]/modify-render/route.ts`。

**`src/app/api/runs`:**
- Purpose: Run runtime HTTP API。
- Contains: run 创建/列表、详情、事件读取、取消、步骤重试。
- Key files: `src/app/api/runs/route.ts`、`src/app/api/runs/[runId]/route.ts`、`src/app/api/runs/[runId]/events/route.ts`、`src/app/api/runs/[runId]/steps/[stepKey]/retry/route.ts`。

**`src/app/api/tasks`:**
- Purpose: Task 查询、取消/状态和事件 replay API。
- Contains: task 列表、task 详情、failed dismiss。
- Key files: `src/app/api/tasks/route.ts`、`src/app/api/tasks/[taskId]/route.ts`、`src/app/api/tasks/dismiss/route.ts`。

**`src/app/api/user`:**
- Purpose: 用户级配置、模型、余额、费用、助手与故事扩展 API。
- Contains: `api-config`、`models`、`balance`、`costs`、`assistant`、`ai-story-expand`。
- Key files: `src/app/api/user/api-config/route.ts`、`src/app/api/user/models/route.ts`、`src/app/api/user/balance/route.ts`。

**`src/components`:**
- Purpose: 跨页面 UI 组件。
- Contains: navbar、dialog、task status、assistant、media、voice、selectors、shared assets、UI primitives/patterns。
- Key files: `src/components/Navbar.tsx`、`src/components/task/TaskStatusInline.tsx`、`src/components/media/MediaImage.tsx`、`src/components/ui/config-modals/ModelCapabilityDropdown.tsx`。

**`src/components/ui`:**
- Purpose: 通用 UI primitives、icons、patterns、配置弹窗。
- Contains: `primitives`、`icons`、`patterns`、`config-modals`。
- Key files: `src/components/ui/primitives/GlassButton.tsx`、`src/components/ui/icons/registry.ts`、`src/components/ui/patterns/PanelCardV2.tsx`。

**`src/features/video-editor`:**
- Purpose: 独立视频编辑器功能。
- Contains: Remotion composition、editor state/actions、stage component、transition picker。
- Key files: `src/features/video-editor/remotion/VideoComposition.tsx`、`src/features/video-editor/components/VideoEditorStage.tsx`、`src/features/video-editor/hooks/useEditorState.ts`。

**`src/i18n`:**
- Purpose: 国际化路由与导航封装。
- Contains: `routing.ts`、`navigation.ts`。
- Key files: `src/i18n/routing.ts`、`src/i18n/navigation.ts`。

**`src/lib`:**
- Purpose: 领域服务、基础设施、数据访问、运行时、客户端 query/mutation、AI/provider 适配。
- Contains: `api-auth`、`api-errors`、`task`、`run-runtime`、`workers`、`billing`、`media`、`storage`、`model-gateway`、`providers`、`novel-promotion`、`query` 等。
- Key files: `src/lib/prisma.ts`、`src/lib/api-auth.ts`、`src/lib/api-errors.ts`、`src/lib/redis.ts`。

**`src/lib/task`:**
- Purpose: BullMQ task 抽象与持久化状态。
- Contains: queue 定义、submitter、service、publisher、reconcile、presentation、target state。
- Key files: `src/lib/task/submitter.ts`、`src/lib/task/service.ts`、`src/lib/task/queues.ts`、`src/lib/task/publisher.ts`、`src/lib/task/types.ts`。

**`src/lib/run-runtime`:**
- Purpose: run/step/event/checkpoint/artifact 工作流运行时。
- Contains: service、publisher、task bridge、recovery、lease、reconcile、types。
- Key files: `src/lib/run-runtime/service.ts`、`src/lib/run-runtime/publisher.ts`、`src/lib/run-runtime/task-bridge.ts`、`src/lib/run-runtime/recovery.ts`。

**`src/lib/workers`:**
- Purpose: BullMQ worker 进程与任务 handler。
- Contains: worker entry、queue workers、shared lifecycle、user concurrency gate、handlers。
- Key files: `src/lib/workers/index.ts`、`src/lib/workers/shared.ts`、`src/lib/workers/text.worker.ts`、`src/lib/workers/image.worker.ts`、`src/lib/workers/handlers/story-to-script.ts`。

**`src/lib/workers/handlers`:**
- Purpose: 每个任务类型的业务实现。
- Contains: story-to-script、script-to-storyboard、image/video/voice、asset hub、shot AI、profile、screenplay、reference 等 handlers。
- Key files: `src/lib/workers/handlers/script-to-storyboard.ts`、`src/lib/workers/handlers/panel-image-task-handler.ts`、`src/lib/workers/handlers/voice-design.ts`、`src/lib/workers/handlers/llm-proxy.ts`。

**`src/lib/billing`:**
- Purpose: 余额、冻结、费用、定价、结算与报表。
- Contains: service、ledger、task policy、cost calculators、runtime usage、reporting、money/currency/errors。
- Key files: `src/lib/billing/service.ts`、`src/lib/billing/ledger.ts`、`src/lib/billing/task-policy.ts`、`src/lib/billing/cost.ts`。

**`src/lib/media`:**
- Purpose: 媒体对象归一化、MediaRef 附加、图片 URL 处理、生成出站图片规范化。
- Contains: service、attach、outbound-image、image-url、hash、types。
- Key files: `src/lib/media/service.ts`、`src/lib/media/attach.ts`、`src/lib/media/outbound-image.ts`、`src/lib/media/image-url.ts`。

**`src/lib/storage`:**
- Purpose: 存储 provider 抽象。
- Contains: local/minio/cos providers、factory、signed URL、bootstrap/init、utils。
- Key files: `src/lib/storage/factory.ts`、`src/lib/storage/index.ts`、`src/lib/storage/providers/local.ts`、`src/lib/storage/providers/minio.ts`。

**`src/lib/model-gateway`:**
- Purpose: OpenAI-compatible gateway 与模型路由。
- Contains: router、LLM gateway、OpenAI-compatible chat/image/video/responses/template adapters。
- Key files: `src/lib/model-gateway/router.ts`、`src/lib/model-gateway/llm.ts`、`src/lib/model-gateway/openai-compat/image.ts`、`src/lib/model-gateway/openai-compat/video.ts`。

**`src/lib/providers`:**
- Purpose: 官方 provider SDK/协议实现。
- Contains: `bailian`、`fal`、`official`、`siliconflow`。
- Key files: `src/lib/providers/bailian/image.ts`、`src/lib/providers/bailian/video.ts`、`src/lib/providers/fal`、`src/lib/providers/siliconflow`。

**`src/lib/generators`:**
- Purpose: 文本外的媒体生成器封装。
- Contains: audio/image/video generators。
- Key files: `src/lib/generators/image/openai-compatible.ts`、`src/lib/generators/video`、`src/lib/generators/audio`。

**`src/lib/ai-runtime`:**
- Purpose: AI text/vision step execution facade。
- Contains: client、errors、types、index。
- Key files: `src/lib/ai-runtime/client.ts`、`src/lib/ai-runtime/index.ts`。

**`src/lib/llm`:**
- Purpose: LLM chat/stream/runtime 基础封装。
- Contains: chat completion、vision、stream helpers、runtime shared、types。
- Key files: `src/lib/llm/chat-completion.ts`、`src/lib/llm/chat-stream.ts`、`src/lib/llm/runtime.ts`。

**`src/lib/llm-observe`:**
- Purpose: LLM 任务化、阶段管线、内部 stream callback、任务 policy。
- Contains: route-task、stage pipeline、internal stream context、task policy/config。
- Key files: `src/lib/llm-observe/route-task.ts`、`src/lib/llm-observe/stage-pipeline.ts`。

**`src/lib/novel-promotion`:**
- Purpose: 小说推文业务服务、orchestrator、stage runtime。
- Contains: story-to-script、script-to-storyboard、run-stream types、stage readiness、video/voice runtime。
- Key files: `src/lib/novel-promotion/story-to-script/orchestrator.ts`、`src/lib/novel-promotion/script-to-storyboard/orchestrator.ts`、`src/lib/novel-promotion/stage-readiness.ts`。

**`src/lib/assets`:**
- Purpose: 素材 contracts、mappers、grouping、kinds registry 与服务。
- Contains: asset actions、read assets、location-backed selection、prompt context。
- Key files: `src/lib/assets/contracts.ts`、`src/lib/assets/mappers.ts`、`src/lib/assets/services/asset-actions.ts`。

**`src/lib/query`:**
- Purpose: React Query client hooks、keys、mutations 和 run stream 状态机。
- Contains: query client、hooks、mutations、run-stream runtime。
- Key files: `src/lib/query/keys.ts`、`src/lib/query/hooks/useProjectData.ts`、`src/lib/query/hooks/run-stream/run-request-executor.ts`、`src/lib/query/mutations/useStoryboardMutations.ts`。

**`src/lib/workflow-engine`:**
- Purpose: 工作流步骤与 retry invalidation 定义。
- Contains: registry、dependencies。
- Key files: `src/lib/workflow-engine/registry.ts`、`src/lib/workflow-engine/dependencies.ts`。

**`src/lib/logging`:**
- Purpose: 日志核心、上下文、语义日志、文件写入、脱敏。
- Contains: core、context、semantic、file-writer、redact、types。
- Key files: `src/lib/logging/core.ts`、`src/lib/logging/context.ts`。

**`src/types`:**
- Purpose: 跨前后端共享类型。
- Contains: project 等业务类型。
- Key files: `src/types/project.ts`。

**`prisma`:**
- Purpose: 数据库 schema 与迁移。
- Contains: `schema.prisma`、`migrations`。
- Key files: `prisma/schema.prisma`。

**`tests`:**
- Purpose: 单元、集成、契约、并发、系统、回归测试。
- Contains: `tests/unit`、`tests/integration`、`tests/concurrency`、`tests/contracts`、`tests/system`、`tests/regression`。
- Key files: `tests/contracts/requirements-matrix.test.ts`、`tests/integration/api`、`tests/unit/run-runtime`。

**`scripts`:**
- Purpose: 开发守护、队列面板、迁移、guard、验证工具。
- Contains: `scripts/watchdog.ts`、`scripts/bull-board.ts`、`scripts/guards`、`scripts/migrations`。
- Key files: `scripts/guards/no-api-direct-llm-call.mjs`、`scripts/guards/no-media-provider-bypass.mjs`、`scripts/watchdog.ts`。

**`messages`:**
- Purpose: 国际化文案。
- Contains: `messages/zh`、`messages/en`。
- Key files: `messages/zh`、`messages/en`。

**`standards`:**
- Purpose: 模型能力、定价、prompt canary 标准文件。
- Contains: `standards/capabilities`、`standards/pricing`、`standards/prompt-canary`。
- Key files: `standards/capabilities`、`standards/pricing`。

## Key File Locations

**Entry Points:**
- `src/app/[locale]/layout.tsx`: Locale app layout。
- `src/app/[locale]/page.tsx`: Locale 根页面。
- `src/app/[locale]/workspace/page.tsx`: 项目列表与创建入口。
- `src/app/[locale]/workspace/[projectId]/page.tsx`: 项目详情与 workspace shell。
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/NovelPromotionWorkspace.tsx`: 小说推文 workspace 主组件。
- `src/lib/workers/index.ts`: worker 进程入口。
- `middleware.ts`: locale middleware。

**Configuration:**
- `package.json`: npm scripts、运行方式、依赖。
- `next.config.ts`: Next.js 与 next-intl 配置。
- `tsconfig.json`: TypeScript strict、`@/*` alias。
- `vitest.config.ts`: Vitest 测试配置。
- `eslint.config.mjs`: ESLint 配置。
- `prisma/schema.prisma`: MySQL/Prisma 数据模型。
- `.env.example`: 环境变量样例；不要读取 `.env` 或 `.env.*` 的内容。

**Core Logic:**
- `src/lib/api-errors.ts`: API wrapper、统一错误、日志、内部 stream callbacks。
- `src/lib/api-auth.ts`: 用户与项目鉴权。
- `src/lib/prisma.ts`: Prisma client。
- `src/lib/redis.ts`: Redis app/queue/subscriber client。
- `src/lib/task/submitter.ts`: 任务提交、run 创建/复用、计费准备、入队。
- `src/lib/task/service.ts`: task DB 状态机。
- `src/lib/task/queues.ts`: BullMQ 队列与 task type 到 queue 映射。
- `src/lib/task/publisher.ts`: task event 持久化与 Redis 发布。
- `src/lib/workers/shared.ts`: worker lifecycle、事件、计费 terminal 处理。
- `src/lib/run-runtime/service.ts`: graph run/step/event/checkpoint/artifact runtime。
- `src/lib/run-runtime/publisher.ts`: run event 发布。
- `src/lib/workflow-engine/registry.ts`: workflow step 定义。
- `src/lib/billing/service.ts`: 计费服务。
- `src/lib/billing/ledger.ts`: 余额/冻结 ledger。
- `src/lib/media/service.ts`: MediaObject/MediaRef 归一化。
- `src/lib/storage/index.ts`: 存储 facade。
- `src/lib/model-gateway/router.ts`: provider gateway route 选择。

**Frontend State/Data:**
- `src/lib/query/client.ts`: React Query client。
- `src/lib/query/keys.ts`: query key 规范。
- `src/lib/query/hooks/useProjectData.ts`: project/episode 数据 hook。
- `src/lib/query/hooks/useSSE.ts`: SSE hook。
- `src/lib/query/hooks/run-stream/run-request-executor.ts`: run request + async task event polling。
- `src/lib/query/mutations`: workspace mutation hooks。

**Workspace UI:**
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useNovelPromotionWorkspaceController.ts`: workspace VM 聚合。
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/WorkspaceStageContent.tsx`: stage route component。
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard`: storyboard UI。
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage`: video stage shell。
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/voice-stage`: voice stage shell。
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/assets`: asset stage UI。

**API Routes:**
- `src/app/api/projects/route.ts`: 项目列表/创建。
- `src/app/api/projects/[projectId]/data/route.ts`: 项目详情数据。
- `src/app/api/novel-promotion/[projectId]/story-to-script-stream/route.ts`: story-to-script run 任务提交。
- `src/app/api/novel-promotion/[projectId]/script-to-storyboard-stream/route.ts`: script-to-storyboard run 任务提交。
- `src/app/api/novel-promotion/[projectId]/generate-image/route.ts`: 项目素材图片生成任务提交。
- `src/app/api/novel-promotion/[projectId]/generate-video/route.ts`: 分镜视频生成任务提交。
- `src/app/api/runs/[runId]/events/route.ts`: run events 查询。
- `src/app/api/sse/route.ts`: task SSE stream。

**Workers:**
- `src/lib/workers/text.worker.ts`: 文本/LLM 队列 worker。
- `src/lib/workers/image.worker.ts`: 图片队列 worker。
- `src/lib/workers/video.worker.ts`: 视频队列 worker。
- `src/lib/workers/voice.worker.ts`: 语音队列 worker。
- `src/lib/workers/handlers/story-to-script.ts`: story-to-script handler。
- `src/lib/workers/handlers/script-to-storyboard.ts`: script-to-storyboard handler。
- `src/lib/workers/handlers/image-task-handlers.ts`: 图片任务分发。
- `src/lib/workers/handlers/panel-image-task-handler.ts`: 分镜图片生成。
- `src/lib/workers/handlers/asset-hub-image-task-handler.ts`: asset hub 图片生成。

**Testing:**
- `tests/unit`: 单元测试。
- `tests/integration/api`: API 集成测试。
- `tests/integration/task`: task 集成测试。
- `tests/integration/run-runtime`: run runtime 集成测试。
- `tests/concurrency/billing`: 计费并发测试。
- `tests/contracts`: 契约/需求矩阵测试。

## Naming Conventions

**Files:**
- App Router 页面使用 `page.tsx`，布局使用 `layout.tsx`，API 使用 `route.ts`，例如 `src/app/api/runs/route.ts`。
- 动态路由目录使用方括号，例如 `src/app/[locale]`、`src/app/api/runs/[runId]`、`src/app/api/files/[...path]`。
- React 组件使用 PascalCase 文件名，例如 `NovelPromotionWorkspace.tsx`、`WorkspaceStageContent.tsx`。
- React hooks 使用 `use*.ts` 或 `use*.tsx`，例如 `useWorkspaceExecution.ts`、`useVideoStageRuntime.tsx`。
- 领域 service 使用功能名小写短横线或通用名，例如 `task-policy.ts`、`runtime-usage.ts`、`state-service.ts`。
- Barrel files 使用 `index.ts`，例如 `src/lib/model-gateway/index.ts`、`src/components/ui/primitives/index.ts`。
- 测试文件使用 `*.test.ts` 或 `*.test.tsx`，例如 `src/lib/media/image-url.test.ts`。

**Directories:**
- App Router route group 按 URL 分层，例如 `src/app/api/novel-promotion/[projectId]/episodes/[episodeId]`。
- 领域库按业务域放在 `src/lib/{domain}`，例如 `src/lib/task`、`src/lib/billing`、`src/lib/media`。
- Workspace 内复杂页面按 `components`、`hooks`、`types.ts`、runtime 子目录拆分。
- Worker handler 放在 `src/lib/workers/handlers`，不要散落在 API route 中。
- Provider SDK 适配放在 `src/lib/providers/{provider}` 或 `src/lib/model-gateway/openai-compat`。

## Where to Add New Code

**New API Route:**
- Primary code: `src/app/api/{domain}/.../route.ts`
- Shared auth/errors: 使用 `src/lib/api-auth.ts` 与 `src/lib/api-errors.ts`
- Business logic: 放到 `src/lib/{domain}`，route 只做薄层转发。
- Tests: `tests/integration/api` 或 `tests/integration/api/contract`

**New Workspace Stage:**
- Primary code: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/{StageName}Stage.tsx`
- Stage routing: 更新 `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/WorkspaceStageContent.tsx`
- Stage navigation: 更新 `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageNavigation.ts`
- Runtime state/actions: 放在 `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks` 或 `src/lib/novel-promotion/stages`

**New Workspace UI Component:**
- Feature-specific: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/{area}`
- Reusable across pages: `src/components`
- Reusable UI primitive/pattern: `src/components/ui/primitives` 或 `src/components/ui/patterns`

**New React Query Hook:**
- Query hook: `src/lib/query/hooks/use{Name}.ts`
- Mutation hook: `src/lib/query/mutations/use{Name}Mutations.ts`
- Query key: 更新 `src/lib/query/keys.ts`

**New Async Task Type:**
- Type definition: `src/lib/task/types.ts`
- Queue routing: `src/lib/task/queues.ts`
- Billing policy: `src/lib/billing/task-policy.ts`
- API submission: thin route in `src/app/api/.../route.ts` calling `submitTask()` or `maybeSubmitLLMTask()`
- Worker dispatch: corresponding worker file in `src/lib/workers/{text|image|video|voice}.worker.ts`
- Handler: `src/lib/workers/handlers/{task-name}.ts`
- Tests: `tests/unit/task`、`tests/integration/task`、相关 worker/unit tests

**New Run-Centric Workflow:**
- Workflow definition: `src/lib/workflow-engine/registry.ts`
- Task type mapping: `src/lib/run-runtime/workflow.ts`
- Event bridge: extend `src/lib/run-runtime/task-bridge.ts` if task SSE events need mapping
- API: `src/app/api/runs/**` usually reusable；only add route when new behavior cannot fit existing run APIs
- Client stream handling: `src/lib/query/hooks/run-stream`

**New Worker Handler:**
- Implementation: `src/lib/workers/handlers/{name}.ts`
- Lifecycle: call through worker dispatch wrapped by `withTaskLifecycle()` in `src/lib/workers/shared.ts`
- Progress: use `reportTaskProgress()` or `reportTaskStreamChunk()` from `src/lib/workers/shared.ts`
- Media upload helpers: use `src/lib/workers/utils.ts` and `src/lib/storage/index.ts`

**New Billing Behavior:**
- Cost calculation: `src/lib/billing/cost.ts`
- Task billable policy: `src/lib/billing/task-policy.ts`
- Ledger operation: `src/lib/billing/ledger.ts`
- Service-level flow: `src/lib/billing/service.ts`
- Reporting: `src/lib/billing/reporting.ts`
- Tests: `tests/unit/billing`、`tests/integration/billing`、`tests/concurrency/billing`

**New Media Handling:**
- Storage/provider-neutral code: `src/lib/storage/index.ts`
- Media object/ref normalization: `src/lib/media/service.ts`
- Response attachment: `src/lib/media/attach.ts`
- Display URL helpers: `src/lib/media/image-url.ts`
- Outbound generation normalization: `src/lib/media/outbound-image.ts`
- Do not place provider-specific URL parsing inside route handlers.

**New Storage Provider:**
- Provider class: `src/lib/storage/providers/{provider}.ts`
- Factory registration: `src/lib/storage/factory.ts`
- Types: `src/lib/storage/types.ts`
- Bootstrap if needed: `src/lib/storage/bootstrap.ts`

**New Model Provider or Gateway Route:**
- Official provider implementation: `src/lib/providers/{provider}`
- OpenAI-compatible behavior: `src/lib/model-gateway/openai-compat`
- Route selection: `src/lib/model-gateway/router.ts`
- User config/model template: `src/lib/user-api` and `src/lib/model-config-contract.ts`
- Guard expected: update scripts in `scripts/guards` if the new route changes model access rules.

**New Prisma Model or Schema Change:**
- Schema: `prisma/schema.prisma`
- Migration: `prisma/migrations/{timestamp}_{name}`
- Data access: keep Prisma calls inside `src/lib/{domain}` or API route only when route is simple CRUD.
- Tests: affected `tests/unit` and `tests/integration` suites.

**New Prompt Template:**
- Static prompt files: `lib/prompts`
- Prompt i18n helpers: `src/lib/prompt-i18n`
- Prompt regression/canary: `standards/prompt-canary` and prompt guard scripts.

**Utilities:**
- Shared server/client helpers: `src/lib`
- Pure UI helpers: local `utils.ts` near component area or `src/lib/ui`
- Feature-local helpers: same feature directory, e.g. `src/features/video-editor/utils`

## Special Directories

**`src/pages`:**
- Purpose: Pages Router compatibility.
- Generated: No.
- Committed: Yes.
- Notes: 当前只包含 `src/pages/_document.tsx`；新页面应放在 `src/app`。

**`src/app/m`:**
- Purpose: `/m/{publicId}` 公开媒体访问 route。
- Generated: No.
- Committed: Yes.
- Notes: `middleware.ts` 明确排除 `/m`，避免 locale middleware 干扰媒体访问。

**`prisma/migrations`:**
- Purpose: 数据库迁移历史。
- Generated: 通常由 Prisma migration 生成。
- Committed: Yes.

**`tests/fixtures`:**
- Purpose: 测试 fixtures。
- Generated: No.
- Committed: Yes.

**`scripts/guards`:**
- Purpose: 架构约束脚本，例如禁止 API 直接调用 LLM、禁止绕过 media provider。
- Generated: No.
- Committed: Yes.

**`standards`:**
- Purpose: 能力/定价/prompt 标准。
- Generated: No.
- Committed: Yes.

**`public`:**
- Purpose: Next.js 静态资源。
- Generated: No.
- Committed: Yes.

**`messages`:**
- Purpose: i18n 消息字典。
- Generated: No.
- Committed: Yes.

**`.planning/codebase`:**
- Purpose: GSD codebase mapping 文档。
- Generated: Yes, by codebase mapper.
- Committed: 通常可提交，供后续规划/执行阶段读取。

---

*Structure analysis: 2026-04-17*
