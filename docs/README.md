# 开发总览

这份文档给第一次接手 `director` 的开发者一个快速入口，重点覆盖运行方式、主模块分工、测试/构建入口，以及当前最容易踩坑的区域。

## 项目定位

`director` 是一个 AI 视频创作平台：用户从首页或工作区创建项目，再围绕剧集完成故事输入、剧本分析、角色/场景/道具资产生成、分镜、成片、配音和后续编辑。

## 技术栈

- 前端：Next.js 15、React 19、Tailwind CSS v4、next-intl
- 数据获取：TanStack React Query
- 后端：Next.js Route Handlers
- 数据库：MySQL + Prisma
- 队列与异步任务：Redis + BullMQ
- 资源存储：MinIO / S3 兼容对象存储
- 渲染与媒体：OGL、Remotion、Sharp

## 运行方式

### 1. Docker 一体化

- 入口：`http://localhost:13000`
- 命令：`docker compose up -d`
- 适合想快速跑通整套系统的人。

### 2. 本地开发模式

```bash
cp .env.example .env
npm install
docker compose up mysql redis minio -d
npx prisma db push
npm run dev
```

关键事实：

- `npm run dev` 会同时拉起 Next.js、worker、watchdog 和 bull-board。
- 本地开发默认入口是 `http://localhost:3000`。
- 本地开发依赖的基础设施端口是：
  - MySQL：`13306`
  - Redis：`16379`
  - MinIO：`19000`

如果只启动前端而没启动 worker，很多生成链路会表现为“请求成功但任务不推进”。

## 主模块地图

### 页面与路由

- `src/app/[locale]/home/page.tsx`：登录后的首页创作入口和最近项目画廊。
- `src/app/[locale]/workspace/page.tsx`：项目列表、创建、编辑、删除。
- `src/app/[locale]/workspace/[projectId]/page.tsx`：项目工作区容器，按 `stage` 和 `episode` URL 参数切换视图。
- `src/app/[locale]/workspace/asset-hub/page.tsx`：资产中心。
- `src/app/api/**`：服务端接口。

### 前端共享层

- `src/components/**`：页面组件与交互部件。
- `src/components/providers/QueryProvider.tsx`：React Query Provider 入口。
- `src/lib/query/**`：query keys、hooks、mutation 和刷新逻辑。
- `src/i18n/navigation.ts`：本地化导航封装，站内路由应统一从这里取 `Link` / `useRouter`。

### 业务与任务层

- `src/lib/home/**`：首页创建项目、最近项目、快速跳转逻辑。
- `src/lib/styles/**`：风格资产、默认风格、风格快照。
- `src/lib/task/**`：任务提交、状态、发布与对账。
- `src/lib/run-runtime/**`：运行时桥接、任务目标状态和事件发布。
- `src/lib/workers/**`：四类 worker 入口与处理器：
  - `image.worker.ts`
  - `video.worker.ts`
  - `voice.worker.ts`
  - `text.worker.ts`

### 数据层

- `prisma/schema.prisma`：MySQL 主 schema。
- `src/lib/storage/**`：对象存储初始化与访问。

## 关键业务事实

- 首页快速创建项目不是单次 API；当前链路是“创建项目 -> 保存项目配置 -> 创建第一集 -> 带 `episode` 参数跳转工作区”。
- 工作区的阶段和剧集选择以 URL 为单一真相源，`/workspace/[projectId]` 主要依赖 `stage`、`episode` 查询参数。
- 风格相关能力采用快照模式：项目、角色/外观、场景等会持有风格快照，worker 应读取快照而不是在执行时回查全局风格。
- `editor` 阶段仍会在工作区容器中回退到 `videos`，说明 AI 剪辑流程还不是完全开放状态。

## 测试与构建入口

最常用的入口：

- `npm run typecheck`
- `npm run build`
- `npm run test:unit:all`
- `npm run test:integration:api`
- `npm run test:behavior:full`

如果改动涉及更大范围，再看 `package.json` 中这些聚合脚本：

- `npm run test:all`
- `npm run verify:commit`
- `npm run verify:push`

## 当前高风险点

### 1. 任务链路跨进程

很多功能不是单纯的页面 + API，而是前端 -> API -> 任务提交 -> worker -> Query invalidation / SSE 联动。任何一环漏掉，页面上都可能看起来像“静默失败”。

### 2. 风格快照容易被误改成“实时读取”

`styles` 已经是一个明显的业务边界。若直接让 worker 在执行时读取全局风格，会破坏任务提交时的确定性。

### 3. 本地化导航不能乱混

站内路由要通过 `@/i18n/navigation`，否则容易出现 locale 丢失、跳到默认语言、或者参数拼装不一致。

### 4. 首页项目画廊是 canvas，不是 DOM 卡片

最近项目画廊由 `src/components/home/CircularGallery.tsx` 用 OGL 渲染。点击不同项目卡片依赖组件内部的命中检测，不是普通 `<Link>` 列表。改动画、拖拽或点击逻辑时，要一起验证命中、拖拽阈值和跳转结果。

### 5. 开发环境对基础设施依赖强

少了 MySQL / Redis / MinIO，或者跳过 `npx prisma db push`，很多错误会在运行时才暴露，看起来像前端 bug，实际是底层环境没齐。

## 现有设计文档

- `docs/superpowers/specs/2026-05-28-style-management-design.md`
- `docs/superpowers/specs/2026-05-28-style-prompt-generation-design.md`
