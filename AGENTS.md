## 语言

- 始终使用中文回复用户，包括所有问答、解释、选项文字、注释说明。

<!-- GSD:project-start source:PROJECT.md -->
## Project

**waoowaoo AI 影视 Studio**

waoowaoo AI 影视 Studio 是一个面向短剧、漫画视频和小说推文创作者的 AI 创作工作台。它把小说文本拆解为剧本、角色、场景、分镜、配音和视频，并通过素材库、模型配置、异步生成任务和工作区阶段流程支撑完整创作链路。

当前项目是已有代码基础上的产品能力迭代：把“画面风格”从一次性的项目配置和硬编码预设，提升为资产中心中的一类可复用资产，让用户能自定义、管理、选择并在生成流程中持续复用风格。

**Core Value:** 用户可以把画面风格作为可管理资产沉淀下来，并稳定地复用于角色、场景、分镜和视频生成，减少反复填写风格提示词带来的不一致。

### Constraints

- **Tech stack**: 保持 Next.js 15 + React 19 + Prisma + MySQL + BullMQ + Redis + MinIO/S3 的既有架构，不引入新框架。
- **Backward compatibility**: 已有项目的 `artStyle` 字符串和 `artStylePrompt` 必须继续可用，迁移不能让旧项目失去生成能力。
- **Asset boundary**: 风格应进入资产中心的统一资产抽象，而不是只增加新的本地状态或独立页面。
- **Prompt consistency**: 角色、场景、道具、分镜、变体和视频相关 prompt 使用同一风格解析来源，避免多套风格文案互相漂移。
- **Media handling**: 风格预览图如果存在，必须使用现有 `MediaObject` / `MediaRef` / `/m/{publicId}` 路径，不新增直写 URL 模式。
- **Security**: 新增风格 API 必须显式走 `requireUserAuth` 或项目权限检查，避免重复已有 storage/admin 权限风险。
- **Testing**: 任何资产类型、Prisma schema、query mutation、prompt assembler 和迁移兼容变更都要配套单元或集成测试。
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5 - 全栈应用、Next.js App Router、Worker、脚本均使用 TypeScript；配置见 `tsconfig.json`，源码集中在 `src/`，运行脚本集中在 `scripts/`。
- TSX/React 19 - 前端 UI 与 App Router 页面使用 React 19；入口与 API 路由位于 `src/app/`。
- JavaScript / ESM - 配置和守卫脚本使用 JS/MJS，例如 `eslint.config.mjs`、`postcss.config.mjs`、`scripts/guards/no-api-direct-llm-call.mjs`。
- Prisma Schema - 数据模型定义在 `prisma/schema.prisma`，SQLite 备用/测试 schema 在 `prisma/schema.sqlit.prisma`。
- SQL - 数据库迁移位于 `prisma/migrations/*/migration.sql`。
- Shell - 回归和迁移脚本位于 `scripts/test-regression-runner.sh`、`scripts/migrate-to-minio.sh`。
## Runtime
- Node.js >=18.18.0 - `package.json` 的 `engines.node` 要求；Docker 生产镜像使用 `node:20-alpine`，见 `Dockerfile`。
- npm >=9.0.0 - `package.json` 的 `engines.npm` 要求。
- Next.js Node runtime - `src/instrumentation.ts` 在 `NEXT_RUNTIME === 'nodejs'` 时启动任务恢复和 Watchdog，Edge runtime 会跳过 Prisma 相关启动逻辑。
- npm - `package.json` 使用 npm scripts。
- Lockfile: present，`package-lock.json` 存在。
## Frameworks
- Next.js 15.5.x - Web 应用与 API 路由框架；配置在 `next.config.ts`，API 路由位于 `src/app/api/`。
- React 19.1.x / React DOM 19.1.x - UI 运行时；依赖声明在 `package.json`。
- next-intl 4.7.x - 国际化中间件与路由；配置在 `next.config.ts`、`middleware.ts`、`src/i18n.ts`、`src/i18n/routing.ts`。
- Prisma 6.19.x - ORM 与迁移；客户端封装在 `src/lib/prisma.ts`，schema 在 `prisma/schema.prisma`。
- NextAuth 4.24.x - 用户认证；配置在 `src/lib/auth.ts`，路由在 `src/app/api/auth/[...nextauth]/route.ts`。
- BullMQ 5.67.x + ioredis 5.9.x - 异步任务队列；队列定义在 `src/lib/task/queues.ts`，Redis 连接在 `src/lib/redis.ts`，Worker 入口在 `src/lib/workers/index.ts`。
- Vitest 2.1.x - 单元、集成、系统和回归测试；配置在 `vitest.config.ts`、`vitest.core-coverage.config.ts`。
- @vitest/coverage-v8 - 覆盖率；配置在 `vitest.config.ts`、`vitest.core-coverage.config.ts`。
- Next Turbopack - `npm run dev:next` 使用 `next dev --turbopack`，`npm run build:turbo` 使用 `next build --turbopack`，见 `package.json`。
- tsx 4.20.x - 运行 Worker、Watchdog、Bull Board、迁移和运维脚本；入口包括 `src/lib/workers/index.ts`、`scripts/watchdog.ts`、`scripts/bull-board.ts`。
- ESLint 9 + eslint-config-next - lint 配置在 `eslint.config.mjs`，旧式配置仍存在于 `.eslintrc.json`。
- Tailwind CSS 4 + @tailwindcss/postcss - PostCSS 配置在 `postcss.config.mjs`。
- Husky 9 - `package.json` 的 `prepare` 脚本执行 `husky`。
- concurrently - 开发和生产启动同时运行 Next、Worker、Watchdog、Bull Board，见 `package.json` 的 `dev` 与 `start`。
- Docker Buildx / GHCR - 多架构镜像构建和推送在 `.github/workflows/docker-publish.yml`，运行镜像定义在 `Dockerfile`。
## Key Dependencies
- `next` - 应用框架、API Routes、App Router，配置在 `next.config.ts`。
- `react` / `react-dom` - 前端组件运行时，页面位于 `src/app/`。
- `@prisma/client` / `prisma` - MySQL 数据访问、schema 生成、迁移，见 `src/lib/prisma.ts`、`prisma/schema.prisma`。
- `next-auth` / `@next-auth/prisma-adapter` - Credentials 登录、Prisma Adapter、JWT session，见 `src/lib/auth.ts`。
- `bullmq` / `ioredis` - 图片、视频、语音、文本队列，见 `src/lib/task/queues.ts`、`src/lib/workers/*.worker.ts`。
- `openai` - OpenAI 兼容 chat/image/video 客户端和百炼兼容模式客户端，见 `src/lib/providers/bailian/llm.ts`、`src/lib/model-gateway/openai-compat/*`。
- `@google/genai` - Gemini / Imagen 图片生成，见 `src/lib/generators/image/google.ts`。
- `@fal-ai/client` - FAL 语音/媒体能力，见 `src/lib/voice/generate-voice-line.ts`；FAL 队列 HTTP 也在 `src/lib/generators/fal.ts`、`src/lib/async-submit.ts`。
- `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner` - MinIO/S3 兼容对象存储和签名 URL，见 `src/lib/storage/providers/minio.ts`、`src/lib/storage/bootstrap.ts`。
- `zod` - 结构化校验依赖；模型模板校验相关代码在 `src/lib/user-api/model-template/validator.ts`。
- `mysql2` - Prisma MySQL 连接底层驱动；数据库 datasource 在 `prisma/schema.prisma`。
- `express` + `@bull-board/api` + `@bull-board/express` - BullMQ 管理面板，入口 `scripts/bull-board.ts`。
- `bcryptjs` - Credentials 密码校验，见 `src/lib/auth.ts`。
- `archiver` / `jszip` / `file-saver` - 下载打包和浏览器保存能力，相关 API 包括 `src/app/api/novel-promotion/[projectId]/download-images/route.ts`、`src/app/api/novel-promotion/[projectId]/download-videos/route.ts`。
- `remotion` / `@remotion/*` - 视频编辑/播放依赖；视频编辑数据模型见 `prisma/schema.prisma` 的 `VideoEditorProject`。
- `sharp` - 图像处理依赖；用于媒体相关处理。
- `undici` - HTTP 客户端基础依赖。
- `lru-cache` / `jsonrepair` / `mammoth` - 缓存、JSON 修复、文档解析辅助依赖。
- `cos-nodejs-sdk-v5` - 腾讯云 COS 运维脚本依赖；脚本位于 `scripts/media-safety-backup.ts`、`scripts/media-build-unreferenced-index.ts`，运行时 `src/lib/storage/providers/cos.ts` 当前未实现。
## Configuration
- `.env.example` 存在，用于环境变量示例；按安全要求未读取其内容。
- `DATABASE_URL` - Prisma MySQL 连接，引用于 `prisma/schema.prisma`。
- `NEXTAUTH_URL`、`NEXTAUTH_SECRET`、`API_ENCRYPTION_KEY` - NextAuth 与 API Key 加密，见 `src/lib/auth.ts`、`src/lib/crypto-utils.ts`。
- `REDIS_HOST`、`REDIS_PORT`、`REDIS_USERNAME`、`REDIS_PASSWORD`、`REDIS_TLS` - Redis/BullMQ 连接，见 `src/lib/redis.ts`。
- `STORAGE_TYPE` - 存储类型选择，支持 `minio`、`local`、`cos`，见 `src/lib/storage/factory.ts`。
- `MINIO_ENDPOINT`、`MINIO_ACCESS_KEY`、`MINIO_SECRET_KEY`、`MINIO_BUCKET`、`MINIO_REGION`、`MINIO_FORCE_PATH_STYLE` - MinIO/S3 存储，见 `src/lib/storage/providers/minio.ts`、`src/lib/storage/bootstrap.ts`。
- `UPLOAD_DIR` - 本地文件存储目录，见 `src/lib/storage/providers/local.ts`、`src/app/api/files/[...path]/route.ts`。
- `INTERNAL_TASK_TOKEN`、`INTERNAL_APP_URL`、`INTERNAL_TASK_API_BASE_URL` - Worker/内部任务鉴权和回调基址，见 `src/lib/api-auth.ts`、`src/lib/llm-observe/config.ts`。
- `QUEUE_CONCURRENCY_IMAGE`、`QUEUE_CONCURRENCY_VIDEO`、`QUEUE_CONCURRENCY_VOICE`、`QUEUE_CONCURRENCY_TEXT` - Worker 并发配置，见 `src/lib/workers/image.worker.ts`、`src/lib/workers/video.worker.ts`、`src/lib/workers/voice.worker.ts`、`src/lib/workers/text.worker.ts`。
- `WATCHDOG_INTERVAL_MS`、`TASK_HEARTBEAT_TIMEOUT_MS` - Task Watchdog 配置，见 `scripts/watchdog.ts`。
- `BULL_BOARD_HOST`、`BULL_BOARD_PORT`、`BULL_BOARD_BASE_PATH`、`BULL_BOARD_USER`、`BULL_BOARD_PASSWORD` - Bull Board 配置，见 `scripts/bull-board.ts`。
- `LOG_*` - 统一日志、审计和脱敏配置，见 `src/lib/logging/config.ts`。
- `BILLING_MODE` - 计费模式开关，见 `src/lib/billing/mode.ts`。
- `next.config.ts` - Next.js 与 next-intl 配置，保留严格构建门禁。
- `tsconfig.json` - TypeScript strict、bundler module resolution、`@/*` 指向 `./src/*`。
- `eslint.config.mjs` - Next core web vitals/typescript lint、限制直接引入 `lucide-react` 和内联 SVG。
- `.eslintrc.json` - 旧式 ESLint 规则仍存在。
- `postcss.config.mjs` - Tailwind CSS 4 PostCSS 插件。
- `vitest.config.ts`、`vitest.core-coverage.config.ts` - Vitest 测试与覆盖率配置。
- `Dockerfile` - 三阶段镜像：deps、builder、runner；生产进程通过 `npm run start` 同时启动 Next、Worker、Watchdog、Bull Board。
- `docker-compose.yml`、`docker-compose.test.yml` - 本地/测试依赖编排，包含 MySQL、Redis、MinIO、App 服务；文档不记录其中任何密钥值。
- `.github/workflows/docker-publish.yml` - main/tag 推送时构建 linux/amd64 与 linux/arm64 镜像并推送 GHCR。
## Platform Requirements
- Node.js >=18.18.0 与 npm >=9.0.0，见 `package.json`。
- MySQL 8.0、Redis 7、MinIO/S3 兼容存储可通过 `docker-compose.yml` 启动。
- `npm run dev` 会先运行 `src/lib/storage/init.ts`，再并行运行 `next dev`、`src/lib/workers/index.ts`、`scripts/watchdog.ts`、`scripts/bull-board.ts`。
- Prisma 客户端通过 `postinstall` 和 `build` 中的 `prisma generate` 生成。
- Docker 镜像基于 `node:20-alpine`，暴露 3000 和 3010，见 `Dockerfile`。
- 生产部署预期包含 MySQL、Redis、MinIO/S3 兼容存储，以及可选的 GHCR 镜像发布流程。
- 运行命令 `npm run start` 依赖 `concurrently` 与 `tsx`，因此生产镜像保留包含 devDeps 的 `node_modules`，见 `Dockerfile` 注释。
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- 使用 kebab-case 或领域短语命名模块文件：`src/lib/query/mutations/character-base-mutations.ts`、`src/lib/query/task-target-overlay.ts`、`scripts/guards/changed-file-test-impact-guard.mjs`。
- React 组件文件使用 PascalCase：`src/components/ui/SegmentedControl.tsx`、`src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/AIDataModal.tsx`。
- Hook 文件使用 `useXxx.ts` 或组件目录内 `hooks/useXxx.ts`：`src/lib/query/hooks/useProjectAssets.ts`、`src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceExecution.ts`。
- 测试文件统一使用 `.test.ts`，Vitest 配置只匹配 `**/*.test.ts`：`vitest.config.ts`、`tests/unit/billing/service.test.ts`、`src/lib/media/outbound-image.test.ts`。
- 普通函数和 hook 使用 camelCase；hook 必须以 `use` 开头：`useProjectAssets`、`useSelectProjectCharacterImage` in `src/lib/query/mutations/character-base-mutations.ts`。
- API route handler 使用 Next.js 方法名常量导出：`export const GET = apiHandler(...)`、`export const POST = apiHandler(...)` in `src/app/api/runs/route.ts`。
- 领域转换函数使用动词开头并写清输入输出：`mapAssetGroupsToProjectAssetsData`、`applyCharacterSelectionToProject` in `src/lib/query/hooks/useProjectAssets.ts` and `src/lib/query/mutations/character-base-mutations.ts`。
- Guard 脚本导出可测试的纯函数，再提供 CLI main：`inspectChangedFiles` in `scripts/guards/changed-file-test-impact-guard.mjs`、`inspectRouteContract` in `scripts/guards/api-route-contract-guard.mjs`。
- 常量使用 UPPER_SNAKE_CASE：`ERROR_CODES` in `src/lib/error-handler.ts`、`RUN_STATUS` in `src/app/api/runs/route.ts`。
- Mock 对象使用 `xxxMock` 后缀，并通过 `vi.hoisted` 提前声明：`ledgerMock`、`modeMock` in `tests/unit/billing/service.test.ts`。
- Query key 变量使用具体领域名：`assetsQueryKey`、`projectQueryKey` in `src/lib/query/mutations/character-base-mutations.ts`。
- 布尔变量使用 `is/has/should` 前缀：`isActiveRunStatus`、`shouldAuditUserOperation` in `src/app/api/runs/route.ts` and `src/lib/api-errors.ts`。
- 领域类型使用 PascalCase，并靠近实现文件导出：`ProjectAssetsData` in `src/lib/query/hooks/useProjectAssets.ts`。
- Mutation 上下文类型使用操作名 + `Context`：`SelectProjectCharacterImageContext`、`DeleteProjectCharacterContext` in `src/lib/query/mutations/character-base-mutations.ts`。
- 测试局部类型用于 mock 状态和 route context：`AuthState`、`RouteContext` in `tests/integration/api/contract/crud-routes.test.ts`。
- 错误码类型从统一 catalog 推导：`UnifiedErrorCode` in `src/lib/errors/codes.ts`、`ApiErrorCode` in `src/lib/api-errors.ts`。
## Code Style
- 未检测到 Prettier 配置；按现有 TypeScript 风格写无分号代码，字符串优先单引号，缩进在多数源码中为 2 空格，部分旧文件使用 4 空格。
- 新增代码应优先匹配相邻文件格式。例如 `src/lib/query/mutations/mutation-shared.ts` 使用 2 空格，`src/lib/query/keys.ts` 当前使用 4 空格。
- JSX 组件保持显式 props interface/type，并优先用函数组件：`src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/StoryboardGroupDialogs.tsx`。
- 服务端 route 保持小型输入解析 helper + `apiHandler` 包装的形状：`src/app/api/runs/route.ts`。
- ESLint 使用 flat config：`eslint.config.mjs` 扩展 `next/core-web-vitals` 和 `next/typescript`。
- 旧 `.eslintrc.json` 仍存在，规则允许 `any`、将未使用变量和 `next/no-img-element` 降为 warn；实际 lint 命令为 `npm run lint -- .` in `package.json`。
- `src/**/*.{ts,tsx}` 禁止直接从 `lucide-react` 导入图标；统一从 `@/components/ui/icons` 使用：`eslint.config.mjs`。
- `src/**/*.{ts,tsx}` 禁止内联 `<svg>`，使用 `AppIcon` 或 icons 模块：`eslint.config.mjs`、`src/components/ui/icons/AppIcon.tsx`。
- 控制台输出由 guard 限制；业务代码使用日志封装，不直接使用 `console.*`：`scripts/check-no-console.ts`、`src/lib/logging/core.ts`。
## Import Organization
- TypeScript 和 Vitest 都配置 `@` 指向 `src`：`tsconfig.json`、`vitest.config.ts`。
- 测试可以直接 mock `@/lib/...` 模块：`tests/unit/billing/service.test.ts`、`tests/system/text-workflow.system.test.ts`。
- scripts 通过 `tsx` 或 Node 运行时也使用 `@/`，例如 `scripts/check-api-handler.ts`、`scripts/check-image-urls-contract.ts`。
## Error Handling
- API routes 必须使用 `apiHandler` 包装，并通过 `ApiError` 抛统一错误码：`src/lib/api-errors.ts`、`src/app/api/runs/route.ts`。
- API route 必须先调用 `requireUserAuth`、`requireProjectAuth` 或 `requireProjectAuthLight`，公开 route 只能加入 allowlist：`scripts/guards/api-route-contract-guard.mjs`。
- `ApiError` 从 `src/lib/errors/codes.ts` 取 HTTP 状态、retryable、category 和 userMessageKey；不要手写分散的错误响应。
- 任意未知错误通过 `normalizeAnyError` 映射为统一错误：`src/lib/errors/normalize.ts`、`src/lib/api-errors.ts`。
- Fetch/mutation 错误统一用 `requestJsonWithError`、`requestVoidWithError`、`requestTaskResponseWithError` 或 `requestBlobWithError` 包装：`src/lib/query/mutations/mutation-shared.ts`。
- 前端 API response 检查使用 `checkApiResponse` 或 `handleApiError`，不要只判断 `res.ok` 后丢失服务端错误码：`src/lib/error-handler.ts`。
- Worker/底层领域逻辑可以抛 `Error`，但面向 API 或任务状态前要通过统一 normalizer：`src/lib/workers/handlers/script-to-storyboard.ts`、`src/lib/errors/normalize.ts`。
## Logging
- 使用 `logInfo`、`logWarn`、`logError` 或 `createScopedLogger`，来源为 `src/lib/logging/core.ts`。
- 需要 requestId、projectId、taskId、provider 等上下文时使用 `createScopedLogger` 或 `withLogContext`：`src/lib/api-errors.ts`、`scripts/watchdog.ts`。
- 日志事件会 JSON 序列化、脱敏并写全局/项目日志；脱敏逻辑在 `src/lib/logging/redact.ts`，配置在 `src/lib/logging/config.ts`。
- 直接 `console.*` 只允许在日志核心和少数 guard allowlist 中出现；新增业务代码不得直接使用 `console.*`：`scripts/check-no-console.ts`。
- API 请求开始、结束、错误和用户生成类操作审计由 `apiHandler` 统一记录：`src/lib/api-errors.ts`。
- 测试中 mock 日志模块以降低噪声：`tests/unit/novel-promotion/use-tts-generation.test.ts`、`tests/unit/worker/shared.direct-run-events.test.ts`。
## Comments
- 注释用于解释领域规则、缓存一致性或 guard 意图，而不是重复代码动作：`src/lib/query/keys.ts`、`src/lib/query/client.ts`。
- API 和 auth helper 中允许中文段落注释说明安全边界和用法：`src/lib/api-auth.ts`。
- 复杂异步行为和乐观更新中的注释应解释为什么等待或回滚：`src/lib/query/mutations/location-management-mutations.ts`、`src/lib/query/mutations/character-base-mutations.ts`。
- 公共 helper 和 auth API 使用 TSDoc 描述参数、返回和示例：`src/lib/api-auth.ts`。
- Query hooks 使用短注释区分查询、刷新、缓存用途：`src/lib/query/hooks/useProjectAssets.ts`。
- 大多数内部纯函数不使用 JSDoc；保持函数名和类型足够清晰。
## Function Design
- 新增函数优先拆成输入读取、校验、转换、执行四类小函数；参考 `readString`、`normalizeStatuses`、`isActiveRunStatus` in `src/app/api/runs/route.ts`。
- 大型 route 或 UI 文件存在，但新增逻辑应放入领域 helper 或 hooks，避免继续膨胀 `src/app/api/user/api-config/route.ts` 这类长文件。
- 参数对象用于多字段调用，尤其是 mutations 和服务函数：`requestJsonWithError(input, init, fallbackMessage)` in `src/lib/query/mutations/mutation-shared.ts`、`createRun({...})` in `src/app/api/runs/route.ts`。
- 输入参数使用 `unknown` 后显式解析，不直接信任 request body：`readProjectDraftBody` in `src/app/api/projects/route.ts`、`POST` in `src/app/api/runs/route.ts`。
- API route 返回 `NextResponse.json(...)`，错误通过 throw 交给 `apiHandler`：`src/app/api/runs/route.ts`。
- Hooks 返回 React Query 原始结果加领域化 `data` 投影：`src/lib/query/hooks/useProjectAssets.ts`。
- Guard inspection 函数返回 violations 数组，CLI main 再决定 `process.exit`：`scripts/guards/api-route-contract-guard.mjs`、`scripts/guards/changed-file-test-impact-guard.mjs`。
## Module Design
- 领域模块优先命名导出；默认导出主要用于 Next/Vitest 配置或 global setup：`vitest.config.ts`、`tests/setup/global-setup.ts`。
- `src/lib/query/keys.ts` 集中导出 `queryKeys`，新增 React Query key 必须加到这里，不要在组件内手写分散 key。
- `src/lib/query/mutations/index.ts` 和 `src/lib/query/hooks/index.ts` 作为 query 层 barrel 文件；新增 hooks/mutations 时同步考虑导出。
- API 错误统一从 `src/lib/api-errors.ts` 导出 `apiHandler`、`ApiError`、`throwApiError`。
- Query hooks/mutations 使用 barrel 文件：`src/lib/query/hooks/index.ts`、`src/lib/query/mutations/index.ts`。
- UI primitives 使用 barrel 文件：`src/components/ui/primitives/index.ts`。
- 图标使用统一入口：`src/components/ui/icons/index.ts`，配合 `eslint.config.mjs` 的 restricted import。
## React and Query Conventions
- 使用 React hooks 或浏览器 API 的文件必须保留 `'use client'`：`src/lib/query/hooks/useProjectAssets.ts`、`src/app/[locale]/workspace/[projectId]/page.tsx`。
- UI 状态放在组件目录内 hooks 中，领域数据访问放在 `src/lib/query/hooks` 和 `src/lib/query/mutations`。
- 查询 key 必须来自 `queryKeys`：`src/lib/query/keys.ts`。
- QueryClient 默认配置在 `src/lib/query/client.ts`，新增 query 不要局部重写 retry/staleTime，除非有明确领域原因。
- 项目资产统一经过 `useAssets` + `groupAssetsByKind` 投影到旧结构：`src/lib/query/hooks/useProjectAssets.ts`。
- mutation 文件按领域拆分在 `src/lib/query/mutations/`，使用 `useMutation` 和 `useQueryClient`。
- 需要缓存一致性时使用 `invalidateQueryTemplates`：`src/lib/query/mutations/mutation-shared.ts`。
- 乐观更新必须保存 previous cache，并在 `onError` 回滚：`src/lib/query/mutations/character-base-mutations.ts`、`src/lib/query/mutations/location-image-mutations.ts`。
- 异步任务类 mutation 使用 task target overlay 反映运行中状态：`upsertTaskTargetOverlay`、`clearTaskTargetOverlay` in `src/lib/query/task-target-overlay.ts`。
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- 页面入口集中在 `src/app/[locale]`，所有面向用户的路由都经过 `middleware.ts` 和 `next-intl` locale 前缀处理。
- API Route 位于 `src/app/api`，路由文件保持薄层：鉴权、参数解析、调用 `src/lib/**` 领域服务、返回 JSON 或 SSE。
- 长耗时 AI/媒体生成工作通过 `src/lib/task/submitter.ts` 写入 `Task` 数据并投递到 BullMQ 队列，由 `src/lib/workers/index.ts` 启动的独立 worker 进程执行。
- `Task` 层负责队列生命周期、计费冻结/结算、SSE 任务事件；`Run Runtime` 层负责可恢复的工作流运行、步骤事件、checkpoint/artifact 和前端 run console。
- 媒体以 `src/lib/storage` 的对象存储 provider 为底座，`src/lib/media` 把 legacy URL/storage key 归一化为 `/m/{publicId}` 可访问媒体引用。
- 模型访问被分为用户/项目配置、provider SDK、`src/lib/model-gateway` 兼容路由、`src/lib/generators` 生成器、worker handler 五层，API Route 不直接调用底层 LLM/provider。
## Layers
- Purpose: 渲染登录、首页、profile、workspace、asset hub 和项目详情体验。
- Location: `src/app/[locale]`
- Contains: `page.tsx`、`layout.tsx`、局部组件、workspace mode、stage controller hooks。
- Depends on: `src/components`、`src/lib/query`、`src/lib/api-fetch.ts`、`src/i18n`、`next-auth/react`、`@tanstack/react-query`。
- Used by: 浏览器用户入口，经 `middleware.ts` 自动加 locale。
- Purpose: 提供项目、素材、任务、run、用户配置、存储签名、SSE、鉴权接口。
- Location: `src/app/api`
- Contains: Next.js `route.ts` 文件，例如 `src/app/api/projects/route.ts`、`src/app/api/runs/route.ts`、`src/app/api/sse/route.ts`、`src/app/api/novel-promotion/[projectId]/story-to-script-stream/route.ts`。
- Depends on: `src/lib/api-errors.ts`、`src/lib/api-auth.ts`、`src/lib/task/submitter.ts`、`src/lib/llm-observe/route-task.ts`、`src/lib/assets/services`、`src/lib/prisma.ts`。
- Used by: Workspace UI、React Query hooks、worker 内部 sync fallback 请求、SSE 客户端。
- Purpose: 统一 request id、结构化日志、错误规范化、用户操作审计、内部 LLM stream callback。
- Location: `src/lib/api-errors.ts`
- Contains: `apiHandler()`、`ApiError`、`getRequestId()`、`getIdempotencyKey()`。
- Depends on: `src/lib/errors`、`src/lib/logging`、`src/lib/task/publisher.ts`、`src/lib/llm-observe/internal-stream-context.ts`。
- Used by: 几乎所有 `src/app/api/**/route.ts`。
- Purpose: NextAuth credentials 登录、session 解析、项目所有权检查、内部 task token 身份。
- Location: `src/lib/auth.ts`、`src/lib/api-auth.ts`、`src/app/api/auth/[...nextauth]/route.ts`、`src/app/api/auth/register/route.ts`
- Contains: `authOptions`、`requireUserAuth()`、`requireProjectAuth()`、`requireProjectAuthLight()`。
- Depends on: `@next-auth/prisma-adapter`、`bcryptjs`、`src/lib/prisma.ts`。
- Used by: UI 登录页 `src/app/[locale]/auth/*/page.tsx` 与所有需要用户/项目权限的 API Route。
- Purpose: 项目列表、项目详情、阶段导航、剧集选择、模型设置、导入向导、run console、素材库入口。
- Location: `src/app/[locale]/workspace`
- Contains: 列表页 `src/app/[locale]/workspace/page.tsx`、详情页 `src/app/[locale]/workspace/[projectId]/page.tsx`、workspace mode `src/app/[locale]/workspace/[projectId]/modes/novel-promotion`。
- Depends on: `src/lib/query/hooks/useProjectData.ts`、`src/lib/query/mutations`、`src/lib/workspace/model-setup.ts`、`src/lib/novel-promotion/stage-readiness.ts`。
- Used by: 主产品工作台。
- Purpose: 将 workspace 的 config/script/assets/storyboard/videos/voice 阶段拆成可组合 runtime 与页面组件。
- Location: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion`
- Contains: `NovelPromotionWorkspace.tsx`、`WorkspaceProvider.tsx`、`WorkspaceStageRuntimeContext.tsx`、`hooks/useNovelPromotionWorkspaceController.ts`、`components/WorkspaceStageContent.tsx`。
- Depends on: `src/lib/novel-promotion/stages`、`src/lib/query/hooks/run-stream`、`src/components/ui`、`src/components/task`。
- Used by: `src/app/[locale]/workspace/[projectId]/page.tsx`。
- Purpose: 浏览器侧数据获取、缓存、失效、SSE/run stream 状态机。
- Location: `src/lib/query`
- Contains: `src/lib/query/client.ts`、`src/lib/query/keys.ts`、`src/lib/query/hooks`、`src/lib/query/mutations`、`src/lib/query/hooks/run-stream`。
- Depends on: `@tanstack/react-query`、`src/lib/api-fetch.ts`、`src/lib/task/client.ts`。
- Used by: workspace 页面、asset hub 页面、storyboard/video/voice 阶段组件。
- Purpose: 小说推文项目、剧集、角色、场景、分镜、视频、语音、剪辑等业务数据与流程。
- Location: `src/lib/novel-promotion`、`src/app/api/novel-promotion`、`src/app/[locale]/workspace/[projectId]/modes/novel-promotion`
- Contains: story-to-script orchestrator `src/lib/novel-promotion/story-to-script/orchestrator.ts`、script-to-storyboard orchestrator `src/lib/novel-promotion/script-to-storyboard/orchestrator.ts`、stage runtime `src/lib/novel-promotion/stages`、大量 route handlers。
- Depends on: Prisma models in `prisma/schema.prisma`、`src/lib/task`、`src/lib/workers/handlers`、`src/lib/assets`、`src/lib/media`。
- Used by: workspace 主流程和 worker 任务。
- Purpose: 持久化异步任务、去重、入队、任务心跳、取消、重试、状态查询。
- Location: `src/lib/task`
- Contains: `submitter.ts`、`service.ts`、`queues.ts`、`publisher.ts`、`reconcile.ts`、`state-service.ts`、`types.ts`。
- Depends on: `bullmq`、`src/lib/redis.ts`、`src/lib/prisma.ts`、`src/lib/billing`、`src/lib/run-runtime`。
- Used by: API Route、worker lifecycle、watchdog、前端 task status 查询。
- Purpose: 独立进程消费 BullMQ 队列，执行业务 handler，发布任务事件，处理计费结算/回滚。
- Location: `src/lib/workers`
- Contains: worker 入口 `src/lib/workers/index.ts`，队列 worker `image.worker.ts`、`video.worker.ts`、`voice.worker.ts`、`text.worker.ts`，公共 lifecycle `shared.ts`，任务 handlers `src/lib/workers/handlers`。
- Depends on: `src/lib/task/service.ts`、`src/lib/task/publisher.ts`、`src/lib/billing`、`src/lib/generators`、`src/lib/model-gateway`、`src/lib/storage`。
- Used by: `npm run dev:worker`、`npm run start:worker`。
- Purpose: 对 AI 工作流提供 run/step/event/checkpoint/artifact 抽象，支持 active run 恢复、步骤重试、run console 和 terminal reconciliation。
- Location: `src/lib/run-runtime`
- Contains: `service.ts`、`publisher.ts`、`task-bridge.ts`、`recovery.ts`、`workflow.ts`、`workflow-lease.ts`、`reconcile.ts`、`types.ts`。
- Depends on: Prisma graph runtime tables、`src/lib/redis.ts`、`src/lib/workflow-engine`、`src/lib/task/types.ts`。
- Used by: `src/app/api/runs/**`、`src/lib/task/submitter.ts`、`src/lib/task/publisher.ts`、`src/lib/workers/shared.ts`、`src/lib/query/hooks/run-stream`。
- Purpose: 定义 story-to-script 与 script-to-storyboard 的步骤、依赖、artifact 类型、重试失效范围。
- Location: `src/lib/workflow-engine`
- Contains: `registry.ts`、`dependencies.ts`。
- Depends on: `src/lib/task/types.ts`。
- Used by: `src/lib/run-runtime/service.ts` 的 step retry 与 artifact/checkpoint 管理。
- Purpose: 余额、冻结、计费模式、模型成本估算、任务预扣、任务结算/回滚、费用报表。
- Location: `src/lib/billing`
- Contains: `service.ts`、`ledger.ts`、`task-policy.ts`、`cost.ts`、`runtime-usage.ts`、`reporting.ts`。
- Depends on: `src/lib/prisma.ts`、`src/lib/model-pricing`、`src/lib/model-config-contract.ts`。
- Used by: `src/lib/task/submitter.ts`、`src/lib/workers/shared.ts`、用户费用 API `src/app/api/user/costs/route.ts`、项目费用 API `src/app/api/projects/[projectId]/costs/route.ts`。
- Purpose: 统一存储 key、legacy URL、`MediaObject`、`MediaRef`、展示 URL 与 outbound generation image 格式。
- Location: `src/lib/media`
- Contains: `service.ts`、`attach.ts`、`image-url.ts`、`outbound-image.ts`、`hash.ts`、`types.ts`。
- Depends on: `src/lib/storage`、Prisma `MediaObject` model。
- Used by: asset/project API、worker handler、UI 图片组件 `src/components/media`、公开媒体路由 `src/app/m/[publicId]/route.ts`。
- Purpose: 抽象 local、MinIO、COS 存储 provider，提供上传、删除、签名 URL、对象读取、下载后转存。
- Location: `src/lib/storage`
- Contains: `factory.ts`、`index.ts`、`providers/local.ts`、`providers/minio.ts`、`providers/cos.ts`、`signed-urls.ts`、`bootstrap.ts`。
- Depends on: `@aws-sdk/client-s3`、`@aws-sdk/s3-request-presigner`、本地文件系统、环境变量。
- Used by: `src/lib/media`、上传 API、worker utils、`src/app/api/files/[...path]/route.ts`、`src/app/api/storage/sign/route.ts`。
- Purpose: 根据 provider 类型路由 official SDK 或 OpenAI-compatible 协议，封装文本、视觉、图片、视频生成。
- Location: `src/lib/model-gateway`、`src/lib/generators`、`src/lib/providers`
- Contains: `src/lib/model-gateway/router.ts`、`src/lib/model-gateway/llm.ts`、`src/lib/model-gateway/openai-compat/*`、`src/lib/generators/image/openai-compatible.ts`、provider 目录 `src/lib/providers/bailian`、`src/lib/providers/fal`、`src/lib/providers/official`、`src/lib/providers/siliconflow`。
- Depends on: `src/lib/api-config`、`src/lib/llm-client.ts`、provider SDK、用户 API 配置。
- Used by: `src/lib/ai-runtime/client.ts`、`src/lib/generator-api.ts`、worker handlers。
- Purpose: 全局素材库和项目素材的角色、场景、道具、语音、图片生成/修改/选择。
- Location: `src/lib/assets`、`src/app/api/asset-hub`、`src/app/api/assets`、`src/app/[locale]/workspace/asset-hub`
- Contains: contracts/mappers/services、asset hub 页面和 API、project-backed asset actions。
- Depends on: `src/lib/task/submitter.ts`、`src/lib/media`、`src/lib/storage`、Prisma asset models。
- Used by: workspace asset stage、global asset hub、storyboard image references。
- Purpose: 结构化日志、语义日志、文件写入、request/task/project/user context、敏感信息脱敏。
- Location: `src/lib/logging`
- Contains: `core.ts`、`context.ts`、`semantic.ts`、`file-writer.ts`、`redact.ts`。
- Depends on: runtime context and filesystem。
- Used by: API wrapper、worker lifecycle、auth、storage、workspace client logs。
## Data Flow
- Server state: Prisma/MySQL，核心 schema 在 `prisma/schema.prisma`。
- Queue state: BullMQ jobs + Redis，队列定义在 `src/lib/task/queues.ts`。
- Realtime state: Redis pub/sub + persisted `TaskEvent`/`GraphEvent`。
- Client cache: TanStack Query keys 在 `src/lib/query/keys.ts`。
- UI state: workspace 内局部 React state 与 URL query 参数；stage/episode 以 URL 为主要单源。
- Run state: `GraphRun`、`GraphStep`、`GraphEvent`、`GraphCheckpoint`、`GraphArtifact` 由 `src/lib/run-runtime/service.ts` 访问。
## Key Abstractions
- Purpose: 每个 API Route 应用统一错误、日志、request id、内部 LLM stream 上下文。
- Examples: `src/lib/api-errors.ts`、`src/app/api/projects/route.ts`、`src/app/api/runs/route.ts`
- Pattern: `export const GET/POST = apiHandler(async (request, context) => { ... })`。
- Purpose: 统一用户 session、项目存在性、项目所有权、NovelPromotionData 关联数据加载。
- Examples: `src/lib/api-auth.ts`、`src/app/api/novel-promotion/[projectId]/generate-image/route.ts`
- Pattern: API Route 先调用 `requireUserAuth()`、`requireProjectAuth()` 或 `requireProjectAuthLight()`，再执行业务。
- Purpose: 队列任务的持久化、状态、payload、计费信息、去重 key、进度和错误。
- Examples: `src/lib/task/types.ts`、`src/lib/task/service.ts`、`src/lib/task/submitter.ts`
- Pattern: API 调 `submitTask()`，worker 调 `tryMarkTaskProcessing()`、`tryUpdateTaskProgress()`、`tryMarkTaskCompleted()`、`tryMarkTaskFailed()`。
- Purpose: 比 Task 更适合前端工作流展示和恢复的运行记录，包含 steps、events、artifacts、checkpoints。
- Examples: `src/lib/run-runtime/types.ts`、`src/lib/run-runtime/service.ts`、`src/lib/run-runtime/publisher.ts`
- Pattern: run-centric task 由 `submitTask()` 创建/复用 run，event 由 `publishRunEvent()` 追加并按 `seq` 消费。
- Purpose: 声明 workflow step 顺序、依赖、artifact 类型、重试影响范围。
- Examples: `src/lib/workflow-engine/registry.ts`
- Pattern: 新 workflow 应在 registry 中定义 `WorkflowDefinition`，并接入 `WORKFLOW_DEFINITIONS`。
- Purpose: 对单个 `TASK_TYPE` 实现实际 AI/媒体/DB 持久化工作。
- Examples: `src/lib/workers/handlers/story-to-script.ts`、`src/lib/workers/handlers/script-to-storyboard.ts`、`src/lib/workers/handlers/panel-image-task-handler.ts`、`src/lib/workers/handlers/voice-design.ts`
- Pattern: worker 文件按队列分发，handler 接收 `Job<TaskJobData>`，公共 lifecycle 由 `withTaskLifecycle()` 包裹。
- Purpose: 在任务 payload 外独立记录预估、冻结、计费模式、定价版本和结算状态。
- Examples: `src/lib/billing/types.ts`、`src/lib/billing/task-policy.ts`、`src/lib/billing/service.ts`
- Pattern: submit 时 prepare/freeze，worker terminal 时 settle/rollback。
- Purpose: 对外暴露稳定媒体 URL、publicId、storageKey、mime/dimension/duration metadata。
- Examples: `src/lib/media/types.ts`、`src/lib/media/service.ts`、`src/lib/media/attach.ts`
- Pattern: 服务端写路径保存 storage key/media id；响应阶段附加 `MediaRef`；展示阶段使用 `/m/{publicId}`。
- Purpose: 屏蔽 local、MinIO、COS 存储差异。
- Examples: `src/lib/storage/types.ts`、`src/lib/storage/factory.ts`、`src/lib/storage/providers/local.ts`、`src/lib/storage/providers/minio.ts`
- Pattern: 业务只调用 `src/lib/storage/index.ts` 导出的函数，不直接使用 provider SDK。
- Purpose: 根据 provider id 选择 official provider 或 OpenAI-compatible 实现。
- Examples: `src/lib/model-gateway/router.ts`、`src/lib/model-gateway/openai-compat`、`src/lib/ai-runtime/client.ts`
- Pattern: 生成器和 AI runtime 通过 gateway/llm-client 调模型，API Route 不直接调 provider。
- Purpose: 把 workspace 的项目数据、UI 状态、stage navigation、execution、video actions 聚合为组件可消费 VM。
- Examples: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useNovelPromotionWorkspaceController.ts`、`src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/workspace-controller-view-model.ts`
- Pattern: 页面组件保持展示逻辑，复杂状态组合放到 hooks。
## Entry Points
- Location: `src/app/[locale]/layout.tsx`
- Triggers: 用户访问 locale 路由。
- Responsibilities: locale layout、provider 包装、全局页面结构。
- Location: `middleware.ts`
- Triggers: 所有非 API、非静态资源、非 `/m` 请求。
- Responsibilities: `next-intl` locale routing。
- Location: `src/app/[locale]/workspace/page.tsx`
- Triggers: 用户访问 `/workspace`。
- Responsibilities: 登录检查、项目分页/搜索、创建/编辑/删除项目入口。
- Location: `src/app/[locale]/workspace/[projectId]/page.tsx`
- Triggers: 用户访问 `/workspace/{projectId}`。
- Responsibilities: 读取 URL stage/episode、加载项目/剧集、自动建第一集、模型配置检查、挂载 `NovelPromotionWorkspace`。
- Location: `src/app/[locale]/workspace/asset-hub/page.tsx`
- Triggers: 用户访问 `/workspace/asset-hub`。
- Responsibilities: 全局素材库 UI、角色/场景/语音素材管理。
- Location: `src/app/[locale]/profile/page.tsx`
- Triggers: 用户访问 `/profile`。
- Responsibilities: 用户 API 配置、默认模型、provider 配置。
- Location: `src/app/api/projects/route.ts`、`src/app/api/projects/[projectId]/data/route.ts`
- Triggers: React Query 项目列表与项目详情请求。
- Responsibilities: 项目 CRUD、统计、费用聚合、项目数据快照。
- Location: `src/app/api/novel-promotion/[projectId]`
- Triggers: workspace 各阶段操作。
- Responsibilities: 剧集、角色、场景、分镜、视频、语音、分析/生成任务提交。
- Location: `src/app/api/runs/route.ts`、`src/app/api/runs/[runId]/route.ts`、`src/app/api/runs/[runId]/events/route.ts`
- Triggers: run console、run stream 状态恢复、步骤重试、取消。
- Responsibilities: 创建/查询/取消 run，读取 run events，retry step。
- Location: `src/app/api/tasks/route.ts`、`src/app/api/tasks/[taskId]/route.ts`、`src/app/api/task-target-states/route.ts`
- Triggers: 任务状态组件、目标状态 overlay、失败任务 dismiss。
- Responsibilities: 查询任务、事件 replay、取消/状态派生。
- Location: `src/app/api/sse/route.ts`
- Triggers: 浏览器实时订阅项目任务事件。
- Responsibilities: active snapshot、event replay、Redis pub/sub 转 SSE、heartbeat。
- Location: `src/lib/workers/index.ts`
- Triggers: `npm run dev:worker`、`npm run start:worker`。
- Responsibilities: 启动 image/video/voice/text worker，监听 ready/error/failed，优雅关闭。
- Location: `src/lib/storage/init.ts`
- Triggers: `npm run storage:init`。
- Responsibilities: 初始化 MinIO bucket 或跳过非 MinIO provider。
- Location: `scripts/watchdog.ts`
- Triggers: `npm run dev:watchdog`、`npm run start:watchdog`。
- Responsibilities: 周期性 reconcile 任务/运行状态。
- Location: `scripts/bull-board.ts`
- Triggers: `npm run dev:board`、`npm run start:board`。
- Responsibilities: BullMQ 队列可视化管理。
## Error Handling
- API Route 使用 `throw new ApiError('INVALID_PARAMS')` 等错误码，统一由 `apiHandler()` 转换响应。
- 项目鉴权失败返回 `NextResponse`，调用点使用 `isErrorResponse()` 提前返回。
- Worker handler 由 `withTaskLifecycle()` 包裹，异常会触发 task failed、billing rollback、失败事件发布。
- `src/lib/errors/normalize.ts` 与 `src/lib/errors/codes.ts` 负责 provider/API/任务错误规范化。
- Run terminal reconciliation 在 `src/lib/query/hooks/run-stream/run-request-executor.ts` 处理 event stream 空洞或 terminal event 缺失。
- Prisma 并发冲突部分使用 upsert/re-fetch，例如 `src/lib/media/service.ts` 处理 `P2002`。
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
