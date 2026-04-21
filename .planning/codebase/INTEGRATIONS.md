# External Integrations

**Analysis Date:** 2026-04-17

## APIs & External Services

**LLM / 文本生成:**
- OpenAI 兼容服务 - 通过用户配置的 provider、base URL、模型键路由到 OpenAI Chat Completions 或 Responses 协议。
  - SDK/Client: `openai`
  - Auth: 用户在配置中心保存的 provider API Key，经 `src/lib/crypto-utils.ts` 加密后存入 `prisma/schema.prisma` 的 `UserPreference.customProviders`
  - Implementation: `src/lib/api-config.ts`、`src/lib/model-gateway/router.ts`、`src/lib/model-gateway/openai-compat/chat.ts`、`src/lib/model-gateway/openai-compat/responses.ts`
- Google Gemini - 文本/视觉相关解析与 Google provider 支持。
  - SDK/Client: `@google/genai`
  - Auth: 用户配置中心 provider API Key
  - Implementation: `src/lib/llm/providers/google.ts`、`src/lib/generators/image/google.ts`
- 阿里百炼 DashScope 兼容模式 - 官方 provider，LLM 使用 OpenAI 兼容接口。
  - SDK/Client: `openai`
  - Auth: 用户配置中心 provider API Key
  - Implementation: `src/lib/providers/bailian/llm.ts`、`src/lib/providers/bailian/catalog.ts`
- 火山引擎 Ark - Seedream/Seedance 与 Ark LLM provider。
  - SDK/Client: 自定义 HTTP/运行时代码
  - Auth: 用户配置中心 provider API Key
  - Implementation: `src/lib/ark-api.ts`、`src/lib/ark-llm.ts`、`src/lib/generators/ark.ts`
- SiliconFlow - 官方 provider 已注册部分音频/图像/视频能力，LLM 实现当前抛出未实现错误。
  - SDK/Client: 自定义 provider 模块
  - Auth: 用户配置中心 provider API Key
  - Implementation: `src/lib/providers/siliconflow/index.ts`、`src/lib/providers/siliconflow/llm.ts`

**图像生成 / 编辑:**
- FAL - Banana / Nano Banana 系列图像生成与编辑，使用 FAL queue HTTP API。
  - SDK/Client: `@fal-ai/client` 依赖存在；图像/视频提交主要通过 `fetch`
  - Auth: 用户配置中心 provider API Key
  - Implementation: `src/lib/generators/fal.ts`、`src/lib/async-submit.ts`、`src/lib/providers/fal/base-url.ts`
- Google Gemini Image / Imagen - Gemini 图片与 Imagen 生成。
  - SDK/Client: `@google/genai`
  - Auth: 用户配置中心 provider API Key
  - Implementation: `src/lib/generators/image/google.ts`
- OpenAI 兼容图片 provider - 自定义 provider 通过 OpenAI 兼容模板或图像接口生成。
  - SDK/Client: `openai` / OpenAI-compatible HTTP
  - Auth: 用户配置中心 provider API Key
  - Implementation: `src/lib/generators/image/openai-compatible.ts`、`src/lib/model-gateway/openai-compat/image.ts`、`src/lib/model-gateway/openai-compat/template-image.ts`
- Gemini-compatible provider - 自定义 Gemini 兼容 provider。
  - SDK/Client: `@google/genai` 兼容路径
  - Auth: 用户配置中心 provider API Key
  - Implementation: `src/lib/generators/image/gemini-compatible.ts`
- 阿里百炼 / SiliconFlow 图片 provider - 官方 provider 图片能力。
  - SDK/Client: 自定义 provider 模块
  - Auth: 用户配置中心 provider API Key
  - Implementation: `src/lib/providers/bailian/image.ts`、`src/lib/providers/siliconflow/image.ts`

**视频生成 / 口型同步:**
- FAL - Wan、Veo、Sora、Kling 视频任务与 FAL lipsync。
  - SDK/Client: `fetch` 到 FAL queue API
  - Auth: 用户配置中心 provider API Key
  - Implementation: `src/lib/generators/fal.ts`、`src/lib/async-submit.ts`、`src/lib/lipsync/providers/fal.ts`
- Google Veo - Google/Gemini-compatible 视频生成。
  - SDK/Client: `@google/genai`
  - Auth: 用户配置中心 provider API Key
  - Implementation: `src/lib/generators/video/google.ts`
- OpenAI 兼容视频 provider - 自定义 provider 通过 OpenAI 兼容视频或模板接口生成。
  - SDK/Client: OpenAI-compatible HTTP
  - Auth: 用户配置中心 provider API Key
  - Implementation: `src/lib/generators/video/openai-compatible.ts`、`src/lib/model-gateway/openai-compat/video.ts`、`src/lib/model-gateway/openai-compat/template-video.ts`
- Minimax / Vidu / Ark / 百炼 / SiliconFlow - 视频 provider 按模型 provider 分发。
  - SDK/Client: 自定义 provider 模块
  - Auth: 用户配置中心 provider API Key
  - Implementation: `src/lib/generators/minimax.ts`、`src/lib/generators/vidu.ts`、`src/lib/generators/ark.ts`、`src/lib/providers/bailian/video.ts`、`src/lib/providers/siliconflow/video.ts`

**音频 / 语音:**
- FAL 语音生成 - 语音行生成使用 FAL 订阅接口。
  - SDK/Client: `@fal-ai/client`
  - Auth: 用户配置中心 provider API Key
  - Implementation: `src/lib/voice/generate-voice-line.ts`
- 阿里百炼音频与音色设计 - TTS、音色管理、音色设计。
  - SDK/Client: 自定义 provider 模块
  - Auth: 用户配置中心 provider API Key
  - Implementation: `src/lib/providers/bailian/audio.ts`、`src/lib/providers/bailian/tts.ts`、`src/lib/providers/bailian/voice-design.ts`、`src/lib/providers/bailian/voice-manage.ts`
- SiliconFlow 音频 - 官方音频 provider。
  - SDK/Client: 自定义 provider 模块
  - Auth: 用户配置中心 provider API Key
  - Implementation: `src/lib/providers/siliconflow/audio.ts`

**内部服务:**
- Internal Task API - Worker/内部任务可通过请求头 token 以内部用户身份访问 API。
  - SDK/Client: HTTP fetch
  - Auth: `INTERNAL_TASK_TOKEN`
  - Implementation: `src/lib/api-auth.ts`、`src/lib/api-errors.ts`、`src/lib/llm-observe/internal-task.ts`
- Bull Board - BullMQ 管理面板作为独立 Express 服务运行。
  - SDK/Client: `express`、`@bull-board/api`、`@bull-board/express`
  - Auth: `BULL_BOARD_USER`、`BULL_BOARD_PASSWORD`
  - Implementation: `scripts/bull-board.ts`

## Data Storage

**Databases:**
- MySQL - 主数据库。
  - Connection: `DATABASE_URL`
  - Client: Prisma Client
  - Schema: `prisma/schema.prisma`
  - Runtime client: `src/lib/prisma.ts`
  - Local service: `docker-compose.yml` 的 `mysql` 服务；测试服务在 `docker-compose.test.yml`
- SQLite schema - 备用/测试 schema 文件存在。
  - Connection: `DATABASE_URL`
  - Client: Prisma Client
  - Schema: `prisma/schema.sqlit.prisma`

**Queues / Redis:**
- Redis - 应用 Pub/Sub、SSE 事件分发、BullMQ backend。
  - Connection: `REDIS_HOST`、`REDIS_PORT`、`REDIS_USERNAME`、`REDIS_PASSWORD`、`REDIS_TLS`
  - Client: `ioredis`
  - Implementation: `src/lib/redis.ts`、`src/lib/task/queues.ts`、`src/lib/task/publisher.ts`
  - Local service: `docker-compose.yml` 的 `redis` 服务；测试服务在 `docker-compose.test.yml`
- BullMQ queues - 图片、视频、语音、文本四类队列。
  - Queues: `waoowaoo-image`、`waoowaoo-video`、`waoowaoo-voice`、`waoowaoo-text`
  - Implementation: `src/lib/task/queues.ts`、`src/lib/workers/image.worker.ts`、`src/lib/workers/video.worker.ts`、`src/lib/workers/voice.worker.ts`、`src/lib/workers/text.worker.ts`

**File Storage:**
- MinIO / S3-compatible - 默认对象存储。
  - Connection: `MINIO_ENDPOINT`、`MINIO_ACCESS_KEY`、`MINIO_SECRET_KEY`、`MINIO_BUCKET`、`MINIO_REGION`、`MINIO_FORCE_PATH_STYLE`
  - Client: `@aws-sdk/client-s3`、`@aws-sdk/s3-request-presigner`
  - Implementation: `src/lib/storage/providers/minio.ts`、`src/lib/storage/bootstrap.ts`、`src/lib/storage/init.ts`
  - Signed URLs: `src/app/api/storage/sign/route.ts`
  - Local service: `docker-compose.yml` 的 `minio` 服务
- Local filesystem storage - 本地开发/备用存储。
  - Connection: `UPLOAD_DIR`
  - Client: Node `fs/promises`
  - Implementation: `src/lib/storage/providers/local.ts`、`src/app/api/files/[...path]/route.ts`
- Tencent COS - 运行时 provider stub 存在但当前未实现；运维脚本仍可访问 COS。
  - Connection: `COS_SECRET_ID`、`COS_SECRET_KEY`、`COS_BUCKET`、`COS_REGION`
  - Client: `cos-nodejs-sdk-v5`
  - Runtime stub: `src/lib/storage/providers/cos.ts`
  - Scripts: `scripts/media-safety-backup.ts`、`scripts/media-build-unreferenced-index.ts`
  - Compatibility redirect: `src/app/api/cos/image/route.ts`

**Caching:**
- Redis - 应用级连接和 BullMQ 队列复用，见 `src/lib/redis.ts`。
- In-process cache - `lru-cache` 依赖存在；图片缓存相关路径包括 `src/lib/image-cache.ts`。

## Authentication & Identity

**Auth Provider:**
- Custom Credentials auth via NextAuth。
  - Implementation: `src/lib/auth.ts`
  - Route: `src/app/api/auth/[...nextauth]/route.ts`
  - Adapter: `@next-auth/prisma-adapter`
  - Password hashing: `bcryptjs`
  - Session: JWT strategy
  - Required env vars: `NEXTAUTH_URL`、`NEXTAUTH_SECRET`

**Authorization:**
- 用户登录要求通过 `requireAuth`，项目访问要求通过 `requireProjectAuth`。
  - Implementation: `src/lib/api-auth.ts`
- 内部 Worker 可用 `x-internal-task-token` 与 `x-internal-user-id` 通过内部认证。
  - Implementation: `src/lib/api-auth.ts`
  - Secret env var: `INTERNAL_TASK_TOKEN`
- 登录回调带 IP 限流。
  - Implementation: `src/app/api/auth/[...nextauth]/route.ts`、`src/lib/rate-limit.ts`

**API Key Storage:**
- 用户 provider API Key 通过 AES-256-GCM 加密后保存。
  - Encryption: `src/lib/crypto-utils.ts`
  - Key source: `API_ENCRYPTION_KEY`，后备 `NEXTAUTH_SECRET`
  - DB fields: `prisma/schema.prisma` 的 `UserPreference.customProviders`，旧字段包括 `llmApiKey`、`falApiKey`、`googleAiKey`、`arkApiKey`、`qwenApiKey`
  - Management API: `src/app/api/user/api-config/route.ts`

## Monitoring & Observability

**Error Tracking:**
- 外部错误追踪服务未检测到。

**Logs:**
- 自定义统一日志系统。
  - Configuration: `src/lib/logging/config.ts`
  - Semantic auth logging: `src/lib/auth.ts`、`src/app/api/auth/[...nextauth]/route.ts`
  - Env vars: `LOG_UNIFIED_ENABLED`、`LOG_LEVEL`、`LOG_FORMAT`、`LOG_DEBUG_ENABLED`、`LOG_AUDIT_ENABLED`、`LOG_SERVICE`、`LOG_REDACT_KEYS`
- LLM observe 配置存在，支持服务端和 `NEXT_PUBLIC_*` 开关。
  - Configuration: `src/lib/llm-observe/config.ts`
  - Env vars: `LLM_OBSERVE_ENABLED`、`LLM_OBSERVE_DEFAULT_MODE`、`LLM_OBSERVE_LONG_TASK_THRESHOLD_MS`、`LLM_OBSERVE_REASONING_VISIBLE`

## CI/CD & Deployment

**Hosting:**
- Docker / GHCR 镜像交付。
  - Image build: `Dockerfile`
  - Local composition: `docker-compose.yml`
  - Test dependencies: `docker-compose.test.yml`
  - Registry workflow: `.github/workflows/docker-publish.yml`

**CI Pipeline:**
- GitHub Actions - main 分支和 `v*` tag 构建并推送 Docker 镜像。
  - Workflow: `.github/workflows/docker-publish.yml`
  - Registry: `ghcr.io`
  - Platforms: `linux/amd64`、`linux/arm64`
- 本地质量门禁由 npm scripts 组合。
  - Commit verification: `package.json` 的 `verify:commit`
  - Push verification: `package.json` 的 `verify:push`
  - Full regression: `package.json` 的 `test:all`、`test:pr`

## Environment Configuration

**Required env vars:**
- App/Auth: `NEXTAUTH_URL`、`NEXTAUTH_SECRET`、`API_ENCRYPTION_KEY`
- Database: `DATABASE_URL`
- Redis/Queue: `REDIS_HOST`、`REDIS_PORT`、`REDIS_USERNAME`、`REDIS_PASSWORD`、`REDIS_TLS`
- Storage selector: `STORAGE_TYPE`
- MinIO/S3: `MINIO_ENDPOINT`、`MINIO_ACCESS_KEY`、`MINIO_SECRET_KEY`、`MINIO_BUCKET`、`MINIO_REGION`、`MINIO_FORCE_PATH_STYLE`
- Local storage: `UPLOAD_DIR`
- Internal tasks: `INTERNAL_TASK_TOKEN`、`INTERNAL_APP_URL`、`INTERNAL_TASK_API_BASE_URL`
- Worker tuning: `QUEUE_CONCURRENCY_IMAGE`、`QUEUE_CONCURRENCY_VIDEO`、`QUEUE_CONCURRENCY_VOICE`、`QUEUE_CONCURRENCY_TEXT`、`WORKER_EXTERNAL_TIMEOUT_MS`、`WORKER_EXTERNAL_POLL_MS`
- Watchdog: `WATCHDOG_INTERVAL_MS`、`TASK_HEARTBEAT_TIMEOUT_MS`
- Bull Board: `BULL_BOARD_HOST`、`BULL_BOARD_PORT`、`BULL_BOARD_BASE_PATH`、`BULL_BOARD_USER`、`BULL_BOARD_PASSWORD`
- Logging/observability: `LOG_UNIFIED_ENABLED`、`LOG_LEVEL`、`LOG_FORMAT`、`LOG_DEBUG_ENABLED`、`LOG_AUDIT_ENABLED`、`LOG_SERVICE`、`LOG_REDACT_KEYS`、`LLM_OBSERVE_ENABLED`
- Billing: `BILLING_MODE`
- Optional COS scripts: `COS_SECRET_ID`、`COS_SECRET_KEY`、`COS_BUCKET`、`COS_REGION`

**Secrets location:**
- `.env.example` 存在但未读取；实际 secrets 由本地 `.env`、Docker Compose 环境变量或部署平台环境变量提供。
- 用户的外部模型 provider API Key 由页面配置后加密存储在数据库，读写逻辑在 `src/app/api/user/api-config/route.ts`、`src/lib/api-config.ts`、`src/lib/crypto-utils.ts`。
- `docker-compose.yml` 和 `docker-compose.test.yml` 包含本地开发/测试环境变量；文档不记录其中任何 secret 值。

## Webhooks & Callbacks

**Incoming:**
- 未检测到第三方 webhook 接收端点。
- NextAuth callback 路由由 `src/app/api/auth/[...nextauth]/route.ts` 处理。
- SSE / run event endpoints:
  - `src/app/api/sse/route.ts`
  - `src/app/api/runs/[runId]/events/route.ts`
- 任务和运行状态 API:
  - `src/app/api/tasks/route.ts`
  - `src/app/api/tasks/[taskId]/route.ts`
  - `src/app/api/runs/route.ts`
  - `src/app/api/runs/[runId]/route.ts`

**Outgoing:**
- FAL queue submit/status/result requests。
  - Implementation: `src/lib/async-submit.ts`、`src/lib/generators/fal.ts`
  - Base URL override: `FAL_QUEUE_BASE_URL`
- Google GenAI requests。
  - Implementation: `src/lib/generators/image/google.ts`、`src/lib/generators/video/google.ts`
- OpenAI-compatible / provider-specific model API requests。
  - Implementation: `src/lib/model-gateway/openai-compat/*`、`src/lib/providers/bailian/llm.ts`
- MinIO/S3 signed URL redirects and object operations。
  - Implementation: `src/app/api/storage/sign/route.ts`、`src/lib/storage/providers/minio.ts`
- Internal task calls。
  - Implementation: `src/lib/llm-observe/internal-task.ts`
  - Base URL: `INTERNAL_TASK_API_BASE_URL`、`INTERNAL_APP_URL`、`NEXTAUTH_URL`

---

*Integration audit: 2026-04-17*
