# Technology Stack

**Analysis Date:** 2026-04-17

## Languages

**Primary:**
- TypeScript 5 - 全栈应用、Next.js App Router、Worker、脚本均使用 TypeScript；配置见 `tsconfig.json`，源码集中在 `src/`，运行脚本集中在 `scripts/`。
- TSX/React 19 - 前端 UI 与 App Router 页面使用 React 19；入口与 API 路由位于 `src/app/`。

**Secondary:**
- JavaScript / ESM - 配置和守卫脚本使用 JS/MJS，例如 `eslint.config.mjs`、`postcss.config.mjs`、`scripts/guards/no-api-direct-llm-call.mjs`。
- Prisma Schema - 数据模型定义在 `prisma/schema.prisma`，SQLite 备用/测试 schema 在 `prisma/schema.sqlit.prisma`。
- SQL - 数据库迁移位于 `prisma/migrations/*/migration.sql`。
- Shell - 回归和迁移脚本位于 `scripts/test-regression-runner.sh`、`scripts/migrate-to-minio.sh`。

## Runtime

**Environment:**
- Node.js >=18.18.0 - `package.json` 的 `engines.node` 要求；Docker 生产镜像使用 `node:20-alpine`，见 `Dockerfile`。
- npm >=9.0.0 - `package.json` 的 `engines.npm` 要求。
- Next.js Node runtime - `src/instrumentation.ts` 在 `NEXT_RUNTIME === 'nodejs'` 时启动任务恢复和 Watchdog，Edge runtime 会跳过 Prisma 相关启动逻辑。

**Package Manager:**
- npm - `package.json` 使用 npm scripts。
- Lockfile: present，`package-lock.json` 存在。

## Frameworks

**Core:**
- Next.js 15.5.x - Web 应用与 API 路由框架；配置在 `next.config.ts`，API 路由位于 `src/app/api/`。
- React 19.1.x / React DOM 19.1.x - UI 运行时；依赖声明在 `package.json`。
- next-intl 4.7.x - 国际化中间件与路由；配置在 `next.config.ts`、`middleware.ts`、`src/i18n.ts`、`src/i18n/routing.ts`。
- Prisma 6.19.x - ORM 与迁移；客户端封装在 `src/lib/prisma.ts`，schema 在 `prisma/schema.prisma`。
- NextAuth 4.24.x - 用户认证；配置在 `src/lib/auth.ts`，路由在 `src/app/api/auth/[...nextauth]/route.ts`。
- BullMQ 5.67.x + ioredis 5.9.x - 异步任务队列；队列定义在 `src/lib/task/queues.ts`，Redis 连接在 `src/lib/redis.ts`，Worker 入口在 `src/lib/workers/index.ts`。

**Testing:**
- Vitest 2.1.x - 单元、集成、系统和回归测试；配置在 `vitest.config.ts`、`vitest.core-coverage.config.ts`。
- @vitest/coverage-v8 - 覆盖率；配置在 `vitest.config.ts`、`vitest.core-coverage.config.ts`。

**Build/Dev:**
- Next Turbopack - `npm run dev:next` 使用 `next dev --turbopack`，`npm run build:turbo` 使用 `next build --turbopack`，见 `package.json`。
- tsx 4.20.x - 运行 Worker、Watchdog、Bull Board、迁移和运维脚本；入口包括 `src/lib/workers/index.ts`、`scripts/watchdog.ts`、`scripts/bull-board.ts`。
- ESLint 9 + eslint-config-next - lint 配置在 `eslint.config.mjs`，旧式配置仍存在于 `.eslintrc.json`。
- Tailwind CSS 4 + @tailwindcss/postcss - PostCSS 配置在 `postcss.config.mjs`。
- Husky 9 - `package.json` 的 `prepare` 脚本执行 `husky`。
- concurrently - 开发和生产启动同时运行 Next、Worker、Watchdog、Bull Board，见 `package.json` 的 `dev` 与 `start`。
- Docker Buildx / GHCR - 多架构镜像构建和推送在 `.github/workflows/docker-publish.yml`，运行镜像定义在 `Dockerfile`。

## Key Dependencies

**Critical:**
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

**Infrastructure:**
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

**Environment:**
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

**Build:**
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

**Development:**
- Node.js >=18.18.0 与 npm >=9.0.0，见 `package.json`。
- MySQL 8.0、Redis 7、MinIO/S3 兼容存储可通过 `docker-compose.yml` 启动。
- `npm run dev` 会先运行 `src/lib/storage/init.ts`，再并行运行 `next dev`、`src/lib/workers/index.ts`、`scripts/watchdog.ts`、`scripts/bull-board.ts`。
- Prisma 客户端通过 `postinstall` 和 `build` 中的 `prisma generate` 生成。

**Production:**
- Docker 镜像基于 `node:20-alpine`，暴露 3000 和 3010，见 `Dockerfile`。
- 生产部署预期包含 MySQL、Redis、MinIO/S3 兼容存储，以及可选的 GHCR 镜像发布流程。
- 运行命令 `npm run start` 依赖 `concurrently` 与 `tsx`，因此生产镜像保留包含 devDeps 的 `node_modules`，见 `Dockerfile` 注释。

---

*Stack analysis: 2026-04-17*
