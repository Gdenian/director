# AGENTS.md

始终使用中文回复用户。

## 项目概览

- `director` 是一个基于 Next.js 15、React 19、Prisma、BullMQ 的 AI 视频创作平台。
- 主流程是：首页创建项目 -> `/workspace` 管理项目 -> `/workspace/[projectId]` 按剧集推进故事、剧本、资产、分镜、成片、配音等阶段 -> worker 异步执行生成任务。

## 本地开发

1. `cp .env.example .env`
2. `npm install`
3. `docker compose up mysql redis minio -d`
4. `npx prisma db push`
5. `npm run dev`

补充说明：

- `npm run dev` 会同时启动 Next.js、worker、watchdog 和 bull-board；只跑 `next dev` 无法覆盖完整任务链路。
- Docker 模式默认入口是 `http://localhost:13000`；本地开发模式默认入口是 `http://localhost:3000`。
- MySQL、Redis、MinIO 在本地开发模式下分别映射到宿主机 `13306`、`16379`、`19000`。

## 常用校验命令

- `npm run typecheck`
- `npm run build`
- `npm run test:unit:all`
- `npm run test:integration:api`
- `npm run test:behavior:full`

## 关键目录

- `src/app/[locale]`：面向用户的页面路由。
- `src/app/api`：后端 API 路由。
- `src/lib/query`：React Query hooks、keys 和数据刷新逻辑。
- `src/lib/workers`：图片、视频、配音、文本四类 worker 入口与处理器。
- `src/lib/task`、`src/lib/run-runtime`：任务状态、提交、回放和运行时桥接。
- `src/lib/home`：首页快速创建项目、最近项目和工作区跳转逻辑。
- `src/lib/styles`：风格资产、默认风格和风格快照逻辑。
- `prisma/schema.prisma`：MySQL 主 schema。
- `tests`：单元、集成、系统、回归测试。

## 协作时的硬规则

- 站内本地化导航统一使用 `@/i18n/navigation` 导出的 `Link`、`useRouter`、`usePathname`，不要直接混用 `next/link` 处理业务路由。
- 工作区的当前阶段和当前剧集以 URL 参数为单一真相源，`/workspace/[projectId]` 依赖 `stage`、`episode` 查询参数驱动。
- 风格能力以快照字段为真相源；提交任务后不要在 worker 执行阶段重新读取全局风格来替代任务快照。
- 首页快速创建项目通过 `src/lib/home/create-project-launch.ts` 串联“创建项目 -> 保存项目配置 -> 创建第一集 -> 带 `episode` 参数跳转工作区”。
- 首页最近项目画廊不是 DOM 卡片列表，而是 `src/components/home/CircularGallery.tsx` 的 OGL canvas。点击、拖拽和卡片命中检测都在这个组件里，改交互时要一起考虑。
- `editor` 阶段在 `src/app/[locale]/workspace/[projectId]/page.tsx` 中仍会回退到 `videos`，不要把 AI 剪辑当成已完全开放的稳定流程。

## 深入文档

- `docs/README.md`：开发总览、入口命令、模块地图、测试入口、风险点。
- `docs/superpowers/specs/2026-05-28-style-management-design.md`：风格资产与风格快照设计。
- `docs/superpowers/specs/2026-05-28-style-prompt-generation-design.md`：参考图生成风格提示词设计。
