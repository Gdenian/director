# Phase 1: 数据模型与兼容契约 - Research

**Researched:** 2026-04-17  
**Domain:** Prisma 数据模型、旧风格兼容、统一风格解析服务、任务快照契约  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Style Asset Model

- Add a dedicated Prisma model for global style assets rather than overloading `GlobalLocation`, `GlobalCharacterAppearance`, or `UserPreference`.
- The model should support at least: `id`, `userId`, `folderId`, `name`, `description`, `positivePrompt`, `negativePrompt`, `tags`, `source`, `legacyKey`, `previewMediaId`, `createdAt`, and `updatedAt`.
- User-created styles belong to one user. Built-in styles must be representable as read-only system styles or seed records with stable `legacyKey` values.
- Preview media must reference `MediaObject`; do not persist signed URLs, arbitrary storage keys, or external preview URLs as the main preview source.

### Project Compatibility

- Add `styleAssetId` to `NovelPromotionProject` as an optional project default style reference.
- Keep `NovelPromotionProject.artStyle`, `NovelPromotionProject.artStylePrompt`, and `UserPreference.artStyle` intact for backward compatibility.
- Existing projects with only `artStyle` or `artStylePrompt` must continue to resolve a style without requiring migration.
- Missing, deleted, or inaccessible `styleAssetId` must not break generation; resolver should fall back deterministically and expose enough state for later UI to show the fallback.

### Resolver Contract

- Create one style resolver service and make it the canonical contract for all later phases.
- Resolver priority is:
  1. Explicit task payload snapshot when present.
  2. Project `styleAssetId` if accessible.
  3. Project `artStylePrompt`.
  4. Project `artStyle` resolved through legacy `ART_STYLES` / `getArtStylePrompt`.
  5. `UserPreference.artStyle`.
  6. Default `american-comic` or empty fallback text meaning "与参考图风格一致".
- Resolver output must separate positive style text from negative prompt text so later non-image prompts are not accidentally polluted.
- Resolver output should include source metadata, such as `source`, `styleAssetId`, `legacyKey`, `label`, and fallback reason.

### Task Snapshot Contract

- Define a serializable style snapshot shape for generation task payloads.
- Snapshot should include `styleAssetId`, `legacyKey`, style display label/name, positive prompt, negative prompt, source, and enough metadata to debug whether fallback occurred.
- Phase 1 can define and test this snapshot contract without migrating every worker call site.

### Migration Strategy

- Prefer additive schema changes and compatibility services in this phase.
- Do not remove or rename existing style fields.
- Seed or expose legacy system styles from existing `ART_STYLES`; avoid manually duplicating style text in multiple files.
- If SQLite schema parity exists in `prisma/schema.sqlit.prisma`, update it consistently with `prisma/schema.prisma`.

### Claude's Discretion

- Exact model name may be `GlobalStyle` unless local naming patterns strongly suggest a better name.
- Exact enum/string representation for `source` can be string-based first if that matches existing schema conventions.
- The resolver may live under `src/lib/style/` or `src/lib/assets/services/` as long as imports make it clearly canonical and future phases can use it.
- Migration file strategy should follow the repo's existing Prisma workflow; if migration generation is unsafe locally, the plan must include a blocking schema push/generation task for execution.

### Deferred Ideas (OUT OF SCOPE)

- Asset center CRUD API and UI belong to Phases 2 and 3.
- Project picker and workspace display belong to Phase 4.
- Worker migration and task payload write-through belong to Phase 5.
- Guard scripts and broad compatibility matrix belong to Phase 6, though Phase 1 should include focused resolver/schema tests.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | System can store global style assets with name, description, positive prompt, optional negative prompt, tags, source type, preview media, owner, folder, and timestamps. | 新增 `GlobalStyle`，沿用 `GlobalCharacter`、`GlobalLocation`、`GlobalVoice` 的 `userId`、`folderId`、时间戳和 `MediaObject` relation 模式。[VERIFIED: codebase grep `prisma/schema.prisma`] |
| DATA-02 | System can link a project to a default style asset while preserving existing `artStyle` and `artStylePrompt` fields for legacy projects. | `NovelPromotionProject` 已有 `artStyle` 和 `artStylePrompt`，Phase 1 只新增 nullable `styleAssetId` 和 relation。[VERIFIED: codebase grep `prisma/schema.prisma`] |
| DATA-03 | System can represent built-in system styles as read-only style assets or seed records with stable legacy keys. | `ART_STYLES` 当前包含 `value`、`label`、`promptZh`、`promptEn`，可作为系统风格 legacy key 的唯一来源。[VERIFIED: codebase grep `src/lib/constants.ts`] |
| DATA-04 | System can resolve style context through a single service that supports style asset, legacy project prompt, legacy style key, user preference, and default fallback. | 当前 `getArtStylePrompt()` 被 worker、API 和 UI 多处直接使用，必须收敛到 resolver。[VERIFIED: codebase grep `rg ART_STYLES|getArtStylePrompt|artStyle`] |
| DATA-05 | System can preserve a style prompt snapshot for generation tasks so retries and recovery do not drift after a style is edited. | `TaskJobData.payload` 是 `Record<string, unknown>`，可先定义 `ResolvedStyleSnapshot` 类型并允许 payload 携带，Phase 1 不需要迁移所有 worker。[VERIFIED: codebase grep `src/lib/task/types.ts`] |
| MIG-01 | Existing projects continue to generate without data migration by falling back from `styleAssetId` to legacy style fields. | resolver 优先级保留 `artStylePrompt` 和 `artStyle`，因此旧项目可不迁移数据。[VERIFIED: `.planning/phases/01-data-model-contract/01-CONTEXT.md`] |
| MIG-02 | Built-in legacy style options remain available as system styles or fallback options. | 系统风格应从 `ART_STYLES` 派生，避免复制 prompt 文案。[VERIFIED: `.planning/phases/01-data-model-contract/01-CONTEXT.md`] |
| MIG-03 | User preference default style remains compatible with the new style asset selection flow. | `UserPreference.artStyle` 已存在并默认 `american-comic`，resolver 应在项目字段之后读取它。[VERIFIED: codebase grep `prisma/schema.prisma`] |
| MIG-04 | The application can handle missing, deleted, or inaccessible style assets with a deterministic fallback and user-visible state. | `styleAssetId` relation 推荐 `onDelete: SetNull`，resolver 输出 `fallbackReason`，且不可泄漏他人私有资产是否存在。[VERIFIED: `.planning/phases/01-data-model-contract/01-CONTEXT.md`] |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- 全部用户沟通和研究文档使用中文。[VERIFIED: `AGENTS.md`]
- 保持 Next.js 15 + React 19 + Prisma + MySQL + BullMQ + Redis + MinIO/S3 架构，不引入新框架。[VERIFIED: `AGENTS.md`]
- 已有 `artStyle` 字符串和 `artStylePrompt` 必须继续可用。[VERIFIED: `AGENTS.md`]
- 风格必须进入统一资产抽象，不能只新增本地状态或独立页面。[VERIFIED: `AGENTS.md`]
- 角色、场景、道具、分镜、变体和视频相关 prompt 必须使用同一风格解析来源。[VERIFIED: `AGENTS.md`]
- 风格预览图必须使用 `MediaObject`、`MediaRef` 和 `/m/{publicId}` 路径。[VERIFIED: `AGENTS.md`]
- 新增风格 API 后续必须显式走 `requireUserAuth` 或项目权限检查。[VERIFIED: `AGENTS.md`]
- 资产类型、Prisma schema、query mutation、prompt assembler 和迁移兼容变更必须配套测试。[VERIFIED: `AGENTS.md`]
- 未发现 `CLAUDE.md`，也未发现本项目内 `.claude/skills/` 或 `.agents/skills/` 目录。[VERIFIED: shell `ls/find`]

## Summary

Phase 1 应以 additive schema 和纯领域契约为主：新增 `GlobalStyle`、`NovelPromotionProject.styleAssetId`、系统风格 legacy key 映射、统一 resolver 和任务快照类型，不做完整 CRUD、资产中心 UI、项目选择器或 worker 大迁移。[VERIFIED: `.planning/ROADMAP.md`][VERIFIED: `.planning/phases/01-data-model-contract/01-CONTEXT.md`]

最关键的规划点是不要让风格来源继续分叉。当前 `getArtStylePrompt()` 被 `character-image-task-handler`、`location-image-task-handler`、`panel-image-task-handler`、`panel-variant-task-handler`、`asset-hub-image-task-handler` 和 `analyze-novel` 等路径直接调用，后续会导致角色、场景、分镜和分析 prompt 不一致。[VERIFIED: codebase grep `rg getArtStylePrompt src tests`]

**Primary recommendation:** 使用 `src/lib/style/resolve-style-context.ts` 作为 canonical resolver，使用 `src/lib/style/types.ts` 放置 `ResolvedStyleContext` 和 `StylePromptSnapshot`，并让 Phase 1 的测试先锁定 fallback 优先级、系统风格映射、不可访问资产 fallback 和快照稳定性。[VERIFIED: codebase architecture][ASSUMED]

## Standard Stack

### Core

| Library | Project Version | Registry Latest Checked | Purpose | Why Standard |
|---------|-----------------|-------------------------|---------|--------------|
| Next.js | `^15.5.7` | `16.2.4`, modified 2026-04-16 | API Route 和 App Router | 项目已使用 `src/app/api/**/route.ts` 和 `apiHandler()`，Phase 1 不需要换栈。[VERIFIED: `package.json`][VERIFIED: npm registry] |
| React | `^19.1.2` | `19.2.5`, modified 2026-04-15 | 后续 UI 资产中心和选择器 | Phase 1 不做 UI，但契约需兼容现有 React Query 数据层。[VERIFIED: `package.json`][VERIFIED: npm registry] |
| Prisma / @prisma/client | `^6.19.2` | `7.7.0`, modified 2026-04-14 | MySQL schema、migration、relation | 现有 schema 和测试 global setup 都以 Prisma 为数据层。[VERIFIED: `package.json`][VERIFIED: `tests/setup/global-setup.ts`][VERIFIED: npm registry] |
| BullMQ | `^5.67.3` | `5.74.1`, modified 2026-04-15 | 任务 payload 和 worker runtime | Phase 1 只定义 payload snapshot，不改队列模型。[VERIFIED: `package.json`][VERIFIED: `src/lib/task/types.ts`][VERIFIED: npm registry] |
| Vitest | `^2.1.8` | `4.1.4`, modified 2026-04-09 | resolver、schema contract 和 legacy compatibility 测试 | 仓库测试文件统一 `.test.ts`，配置包含 `@` alias。[VERIFIED: `vitest.config.ts`][VERIFIED: npm registry] |
| Zod | `^3.25.76` | `4.3.6`, modified 2026-01-25 | 后续 API 输入校验可选 | Phase 1 resolver 可用普通 TypeScript guard，不强制引入新校验层。[VERIFIED: `package.json`][VERIFIED: npm registry][ASSUMED] |

### Supporting

| Library / System | Version | Purpose | When to Use |
|------------------|---------|---------|-------------|
| MySQL | 通过 `DATABASE_URL` | 主 schema 迁移和集成测试 | Prisma migration 和 `db push` 使用主 `prisma/schema.prisma`。[VERIFIED: `prisma/schema.prisma`][VERIFIED: `tests/setup/env.ts`] |
| SQLite schema | `prisma/schema.sqlit.prisma` | 备用/测试 schema parity | Phase 1 必须同步新增 `GlobalStyle`、relation 和索引，否则 parity 断裂。[VERIFIED: codebase grep `schema.sqlit.prisma`] |
| MediaObject / MediaRef | 本地类型 | 风格预览媒体引用 | `previewMediaId` 应关联 `MediaObject`，响应层以后用 `MediaRef`。[VERIFIED: `prisma/schema.prisma`][VERIFIED: `src/lib/media/types.ts`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `GlobalStyle` 独立模型 | 复用 `GlobalLocation.assetKind='style'` | 不推荐；`GlobalLocation` 绑定图片槽位、`GlobalLocationImage` 和 location/prop 语义，风格会继承错误行为。[VERIFIED: `prisma/schema.prisma`][VERIFIED: `.planning/research/SUMMARY.md`] |
| string `source` | Prisma enum | Phase 1 推荐 string，以匹配既有 `assetKind`、`voiceType` 等字符串字段并降低迁移复杂度。[VERIFIED: `prisma/schema.prisma`][ASSUMED] |
| seed DB system styles | 运行时从 `ART_STYLES` 投影系统风格 | Phase 1 推荐先提供运行时投影和 legacy key，是否落库可留给执行计划按迁移安全性决定。[VERIFIED: `.planning/phases/01-data-model-contract/01-CONTEXT.md`][ASSUMED] |

**Installation:** 不安装新包；复用现有依赖。[VERIFIED: `package.json`]

## Architecture Patterns

### Recommended Project Structure

```text
src/lib/style/
├── types.ts                  # ResolvedStyleContext, StylePromptSnapshot, fallback reason 类型
├── legacy-system-styles.ts   # 从 ART_STYLES 投影系统风格，不复制 prompt 文案
├── resolve-style-context.ts  # 唯一 resolver，接收 projectId/userId/task snapshot/locale
└── snapshot.ts               # createStylePromptSnapshot 纯函数

tests/unit/style/
├── legacy-system-styles.test.ts
├── resolve-style-context.test.ts
└── snapshot.test.ts
```

该目录把风格解析从 `src/lib/assets/services` 中分离出来，更适合作为 worker、API、资产服务共同依赖的低层领域模块。[VERIFIED: codebase layered architecture][ASSUMED]

### Pattern 1: Prisma Relation Shape

**What:** `GlobalStyle` 应复制全局资产模型的 owner/folder/media relation 形状。[VERIFIED: `prisma/schema.prisma`]

**Recommended schema sketch:**

```prisma
model GlobalStyle {
  id             String   @id @default(uuid())
  userId         String?
  folderId       String?
  name           String
  description    String?  @db.Text
  positivePrompt String   @db.Text
  negativePrompt String?  @db.Text
  tags           String?  @db.Text
  source         String   @default("user")
  legacyKey      String?
  previewMediaId String?
  previewMedia   MediaObject? @relation("GlobalStylePreviewMedia", fields: [previewMediaId], references: [id], onDelete: SetNull)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user     User?              @relation(fields: [userId], references: [id], onDelete: Cascade)
  folder   GlobalAssetFolder? @relation(fields: [folderId], references: [id], onDelete: SetNull)
  projects NovelPromotionProject[]

  @@index([userId])
  @@index([folderId])
  @@index([previewMediaId])
  @@unique([source, legacyKey])
  @@map("global_styles")
}
```

`userId` 是否 nullable 取决于系统风格策略；若系统风格不落库，则只需用户风格 rows，系统风格由 `legacy-system-styles.ts` 投影。[VERIFIED: `.planning/STATE.md`][ASSUMED]

### Pattern 2: Project Default Style Reference

**What:** `NovelPromotionProject` 增加 nullable `styleAssetId` 和 relation，保留现有 `artStyle`、`artStylePrompt`。[VERIFIED: `prisma/schema.prisma`]

**Recommended schema sketch:**

```prisma
model NovelPromotionProject {
  styleAssetId String?
  styleAsset   GlobalStyle? @relation(fields: [styleAssetId], references: [id], onDelete: SetNull)

  @@index([styleAssetId])
}
```

`onDelete: SetNull` 能让被删风格不破坏项目读取，resolver 再通过旧字段 deterministic fallback。[VERIFIED: `.planning/phases/01-data-model-contract/01-CONTEXT.md`][ASSUMED]

### Pattern 3: Canonical Resolver Contract

**What:** resolver 输出正向 prompt、负向 prompt 和来源元数据，不直接返回拼好的 image prompt。[VERIFIED: `.planning/phases/01-data-model-contract/01-CONTEXT.md`]

```ts
export type StyleResolutionSource =
  | 'task-snapshot'
  | 'style-asset'
  | 'project-art-style-prompt'
  | 'project-art-style'
  | 'user-preference'
  | 'default'

export type StyleFallbackReason =
  | 'none'
  | 'style-asset-missing-or-inaccessible'
  | 'legacy-key-missing'
  | 'empty-style'

export type ResolvedStyleContext = {
  source: StyleResolutionSource
  fallbackReason: StyleFallbackReason
  styleAssetId: string | null
  legacyKey: string | null
  label: string
  positivePrompt: string
  negativePrompt: string | null
  sourceUpdatedAt: string | null
}
```

该 contract 能防止负向 prompt 污染非图像任务，并让后续 UI 显示 fallback 状态。[VERIFIED: `.planning/phases/01-data-model-contract/01-CONTEXT.md`]

### Pattern 4: Task Snapshot Type Without Worker Migration

**What:** 在 `src/lib/style/types.ts` 定义 serializable `StylePromptSnapshot`，并允许 `TaskJobData.payload` 后续携带 `stylePromptSnapshot`。[VERIFIED: `src/lib/task/types.ts`]

```ts
export type StylePromptSnapshot = {
  version: 1
  source: StyleResolutionSource
  fallbackReason: StyleFallbackReason
  styleAssetId: string | null
  legacyKey: string | null
  label: string
  positivePrompt: string
  negativePrompt: string | null
  capturedAt: string
  sourceUpdatedAt: string | null
}
```

Phase 1 应测试 `createStylePromptSnapshot()` 的稳定输出，但不要求修改所有 `submitTask()` call site。[VERIFIED: `.planning/phases/01-data-model-contract/01-CONTEXT.md`]

### Anti-Patterns to Avoid

- **复制 `ART_STYLES` 文案到 seed 文件:** 以后 legacy prompt 改动会产生双源漂移；应从 `ART_STYLES` 派生系统风格。[VERIFIED: `src/lib/constants.ts`][VERIFIED: `.planning/phases/01-data-model-contract/01-CONTEXT.md`]
- **resolver 内暴露跨用户资产存在性:** 不可访问和不存在都应统一为泛化 fallback reason。[VERIFIED: `.planning/phases/01-data-model-contract/01-CONTEXT.md`]
- **把 negative prompt 拼进所有 prompt:** 非图像文本/分析任务不一定支持负向 prompt，resolver 必须拆字段。[VERIFIED: `.planning/REQUIREMENTS.md`]
- **只改主 Prisma schema:** 本仓库存在 `prisma/schema.sqlit.prisma`，Phase 1 必须同步 parity。[VERIFIED: codebase grep `schema.sqlit.prisma`]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 数据访问 | 手写 SQL 读写 style/project/user preference | Prisma model + relation | 现有数据层统一在 Prisma schema 和 client。[VERIFIED: `prisma/schema.prisma`] |
| 媒体预览 | 保存 signed URL、storage key 或外链 URL | `previewMediaId` → `MediaObject` → `MediaRef` | 项目已有媒体归一化层，且 storage/sign route 存在权限风险。[VERIFIED: `src/lib/media/attach.ts`][VERIFIED: `.planning/codebase/CONCERNS.md`] |
| legacy style prompt | 新建一份硬编码系统风格表 | 从 `ART_STYLES` 和 `getArtStylePrompt()` 派生 | 现有 legacy 测试和 UI 都依赖该常量。[VERIFIED: `src/lib/constants.ts`][VERIFIED: tests grep] |
| fallback priority | 每个 worker 各自判断 | `resolveStyleContext()` | 当前多 worker 已直接调用 `getArtStylePrompt()`，继续分散会扩大漂移。[VERIFIED: codebase grep] |
| task snapshot | 把 style prompt 临时塞在若干 payload 字段 | `StylePromptSnapshot` v1 类型 | `TaskJobData.payload` 已支持结构化对象，可先加类型契约。[VERIFIED: `src/lib/task/types.ts`] |

**Key insight:** Phase 1 的价值是锁定数据和解析契约，而不是把风格立即接入所有使用点；过早改 worker 会把 schema、权限、prompt 和任务恢复风险混在一起。[VERIFIED: `.planning/ROADMAP.md`][ASSUMED]

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `NovelPromotionProject.artStyle`、`NovelPromotionProject.artStylePrompt`、`UserPreference.artStyle` 已存储 legacy 风格；`GlobalCharacterAppearance.artStyle` 和 `GlobalLocation.artStyle` 也存储资产生成风格。[VERIFIED: `prisma/schema.prisma`] | 不做破坏性迁移；新增 `styleAssetId` 后 resolver 读取旧字段；Phase 5 前再迁移生成入口。 |
| Live service config | 未发现外部服务配置直接存储本 phase 新字段；任务、worker 和 provider 配置仍通过 DB/env 运行。[VERIFIED: `.planning/codebase/ARCHITECTURE.md`] | Phase 1 无外部服务配置迁移。 |
| OS-registered state | 未发现与风格字段相关的 systemd/launchd/pm2 注册状态；本地开发通过 npm scripts 启动。[VERIFIED: `package.json`] | 无需 OS state 迁移。 |
| Secrets/env vars | 风格资产模型不需要新增 secret；现有 `DATABASE_URL`、storage、Redis env 不改变。[VERIFIED: `.planning/codebase/STACK.md`] | 无需 secret/env rename。 |
| Build artifacts | Prisma Client 由 `postinstall` 和 `build` 生成；本机当前缺少 `node_modules/.bin/prisma`，`npx prisma` 会拉取 registry 最新版本。[VERIFIED: `package.json`][VERIFIED: shell `test -x node_modules/.bin/prisma`] | 执行计划必须包含 `npm install` 或使用项目锁定依赖后再 `npx prisma generate`，避免误用 Prisma 7 CLI。 |

## Common Pitfalls

### Pitfall 1: SQLite Schema Parity 漏改

**What goes wrong:** MySQL schema 编译通过，但 SQLite 备用 schema 缺少 `GlobalStyle` 或 relation。[VERIFIED: codebase grep `prisma/schema.sqlit.prisma`]  
**Why it happens:** 仓库维护两份 Prisma schema，但主要命令默认使用 `prisma/schema.prisma`。[VERIFIED: `package.json`][VERIFIED: `tests/setup/global-setup.ts`]  
**How to avoid:** plan 中明确同时修改 `prisma/schema.prisma` 与 `prisma/schema.sqlit.prisma`，并加 schema grep 或 Prisma validate 步骤。[ASSUMED]  
**Warning signs:** 只有主 schema 出现 `global_styles`，SQLite schema 没有对应 model 或 relation。[ASSUMED]

### Pitfall 2: 系统风格落库策略不清

**What goes wrong:** `GlobalStyle.userId` 是否 nullable、系统 row 是否属于某个用户、唯一索引如何定义都会影响权限和 seed。[VERIFIED: `.planning/STATE.md`]  
**Why it happens:** 当前 `User` 只有用户资产 relations，没有 system owner 模型。[VERIFIED: `prisma/schema.prisma`]  
**How to avoid:** Phase plan 要先锁定策略：推荐运行时投影系统风格，用户复制时再创建用户 row；若必须 seed，则 `userId String?` + `source='system'` + `legacyKey` 唯一。[ASSUMED]  
**Warning signs:** 计划要求创建“系统用户”但没有用户生命周期、权限和登录排除策略。[ASSUMED]

### Pitfall 3: Resolver 泄漏私有资产

**What goes wrong:** 项目绑定他人 `styleAssetId` 时，错误信息暴露“该风格存在但无权访问”。[VERIFIED: `.planning/phases/01-data-model-contract/01-CONTEXT.md`]  
**Why it happens:** 先按 `id` 查 style，再检查 `userId` 会产生可区分错误。[ASSUMED]  
**How to avoid:** 查询条件使用 `(id AND (userId = currentUser OR source = system))`，查不到统一 fallback。[ASSUMED]  
**Warning signs:** resolver 输出 `forbidden`、`other-user-style` 或日志记录 style 名称。[ASSUMED]

### Pitfall 4: 任务快照定义太晚

**What goes wrong:** 后续 worker 接入时只保存 `styleAssetId`，重试时读取最新 prompt，风格编辑后漂移。[VERIFIED: `.planning/REQUIREMENTS.md`]  
**Why it happens:** `TaskJobData.payload` 是自由对象，容易临时塞字段而没有稳定 contract。[VERIFIED: `src/lib/task/types.ts`]  
**How to avoid:** Phase 1 定义 `StylePromptSnapshot` v1 和 `createStylePromptSnapshot()`，Phase 5 再写入所有生成任务。[VERIFIED: `.planning/phases/01-data-model-contract/01-CONTEXT.md`]  
**Warning signs:** payload 中只有 `styleAssetId` 或 `artStyle`，没有 prompt snapshot。[ASSUMED]

## Code Examples

### Legacy System Style Projection

```ts
import { ART_STYLES } from '@/lib/constants'

export function listLegacySystemStyles(locale: 'zh' | 'en') {
  return ART_STYLES.map((style) => ({
    id: `system:${style.value}`,
    source: 'system' as const,
    legacyKey: style.value,
    name: style.label,
    positivePrompt: locale === 'en' ? style.promptEn : style.promptZh,
    negativePrompt: null,
    readOnly: true,
  }))
}
```

该模式使用现有 `ART_STYLES` 作为唯一文案源。[VERIFIED: `src/lib/constants.ts`]

### Resolver Priority Skeleton

```ts
export async function resolveStyleContext(input: ResolveStyleContextInput): Promise<ResolvedStyleContext> {
  const snapshot = normalizeStylePromptSnapshot(input.taskSnapshot)
  if (snapshot) return fromSnapshot(snapshot)

  const project = await loadProjectStyleFields(input.projectId, input.userId)
  const asset = await loadAccessibleStyleAsset(project?.styleAssetId, input.userId)
  if (asset) return fromStyleAsset(asset)

  if (project?.artStylePrompt?.trim()) return fromProjectPrompt(project.artStylePrompt)

  const projectLegacy = resolveLegacyStyle(project?.artStyle, input.locale)
  if (projectLegacy) return projectLegacy

  const userLegacy = resolveLegacyStyle(project?.userPreferenceArtStyle, input.locale)
  if (userLegacy) return userLegacy

  return defaultStyleContext(input.locale)
}
```

该 skeleton 对应已锁定的 fallback 顺序。[VERIFIED: `.planning/phases/01-data-model-contract/01-CONTEXT.md`]

## State of the Art

| Old Approach | Current Approach for Phase 1 | When Changed | Impact |
|--------------|------------------------------|--------------|--------|
| 直接在 worker 中调用 `getArtStylePrompt(modelConfig.artStyle)` | 新建 resolver，worker 后续消费 `ResolvedStyleContext` 或 snapshot | Phase 1 定 contract，Phase 5 迁移 worker | 减少 prompt 来源分叉。[VERIFIED: codebase grep][VERIFIED: `.planning/ROADMAP.md`] |
| 项目只保存 `artStyle` / `artStylePrompt` | 项目新增 nullable `styleAssetId`，旧字段继续 fallback | Phase 1 | 旧项目无需数据迁移即可生成。[VERIFIED: `.planning/REQUIREMENTS.md`] |
| 系统风格只存在硬编码下拉选项 | 系统风格以 stable `legacyKey` 表示，可投影成只读 style | Phase 1 | 后续资产中心可展示或复制系统风格。[VERIFIED: `.planning/phases/01-data-model-contract/01-CONTEXT.md`] |

**Deprecated/outdated:**
- 把 `getArtStylePrompt()` 视为生成链路唯一入口已经不适合风格资产化；它应降级为 legacy/system style prompt provider。[VERIFIED: `src/lib/constants.ts`][VERIFIED: `.planning/research/SUMMARY.md`]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 推荐 resolver 放在 `src/lib/style/` 而不是 `src/lib/assets/services/`。 | Summary / Architecture Patterns | 如果团队更偏好资产服务目录，需要移动文件但 contract 不变。 |
| A2 | `source` 第一版用 string 而不是 Prisma enum。 | Standard Stack | 如果需要 DB enum，迁移要额外处理 MySQL enum 和 SQLite parity。 |
| A3 | 系统风格推荐运行时投影，不强制落库。 | Architecture / Pitfalls | 如果产品要求系统风格有 DB id，需设计 nullable `userId` 或 system owner。 |
| A4 | `onDelete: SetNull` 是项目引用删除的推荐 relation 行为。 | Architecture Patterns | 如果 Phase 3 选择禁止删除被引用风格，relation 仍可 SetNull，但删除服务会更严格。 |

## Open Questions

1. **系统风格是否必须落库？**  
   - What we know: legacy 系统风格目前在 `ART_STYLES` 中，Phase 1 要 stable `legacyKey`。[VERIFIED: `src/lib/constants.ts`][VERIFIED: `.planning/STATE.md`]  
   - What's unclear: 是否需要真实 `GlobalStyle.id` 供项目绑定系统风格。[ASSUMED]  
   - Recommendation: Phase 1 先支持 `styleAssetId` 用户风格 + `legacyKey` 系统 fallback；如果要项目绑定系统风格，计划中加入 seed/migration 决策。[ASSUMED]

2. **是否在 Phase 1 生成 migration 文件？**  
   - What we know: package scripts 使用 Prisma generate/build，测试 global setup 使用 `npx prisma db push --schema prisma/schema.prisma`。[VERIFIED: `package.json`][VERIFIED: `tests/setup/global-setup.ts`]  
   - What's unclear: 当前本机未安装 node_modules，本地 `npx prisma` 会临时下载 Prisma 7.7.0，而项目依赖是 Prisma 6.19.2。[VERIFIED: shell][VERIFIED: `package.json`]  
   - Recommendation: 计划中先执行 `npm install`，再用项目版本执行 Prisma validate/generate；migration 文件可由执行阶段在依赖恢复后生成。[ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | TypeScript/Vitest/Prisma commands | ✓ | `v25.5.0` | 项目 engines 要求 `>=18.18.0`，Node 25 满足范围但高于 Docker Node 20。[VERIFIED: shell][VERIFIED: `package.json`] |
| npm | package scripts | ✓ | `11.8.0` | 项目 engines 要求 `>=9.0.0`。[VERIFIED: shell][VERIFIED: `package.json`] |
| local node_modules Prisma CLI | schema validate/generate | ✗ | 本地 `node_modules/.bin/prisma` 缺失 | 先 `npm install`；不要依赖临时 `npx prisma@7.7.0`。[VERIFIED: shell] |
| Docker | MySQL/Redis/MinIO compose | ✓ | `29.2.1` | 可用 docker compose 启动测试依赖。[VERIFIED: shell][VERIFIED: `.planning/codebase/STACK.md`] |
| mysql CLI | DB manual probe | ✗ | - | 使用 Docker 容器或 Prisma 命令替代。[VERIFIED: shell] |
| redis-cli | Redis manual probe | ✗ | - | 使用 Docker 容器或 BullMQ/Redis app 连接替代。[VERIFIED: shell] |

**Missing dependencies with no fallback:** 本地项目依赖未安装会阻塞直接运行 Vitest、Prisma generate 和 typecheck。[VERIFIED: shell]

**Missing dependencies with fallback:** mysql/redis CLI 缺失可用 Docker 服务和 Prisma/BullMQ app 路径替代。[VERIFIED: shell][ASSUMED]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `^2.1.8` in project, latest registry `4.1.4` checked 2026-04-17。[VERIFIED: `package.json`][VERIFIED: npm registry] |
| Config file | `vitest.config.ts`，node environment，`@` alias 指向 `src`。[VERIFIED: `vitest.config.ts`] |
| Quick run command | `cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/style tests/unit/assets/registry.test.ts tests/unit/assets/mappers.test.ts`。[VERIFIED: `package.json`][ASSUMED] |
| Full suite command | `npm run test:unit:all && npm run test:integration:api && npm run typecheck`。[VERIFIED: `package.json`][ASSUMED] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| DATA-01 | `GlobalStyle` schema fields、owner/folder/media relation、indexes | schema contract | `rg "model GlobalStyle|globalStyles|previewMediaId|styleAssetId" prisma/schema.prisma prisma/schema.sqlit.prisma` | ❌ Wave 0 |
| DATA-02 | `NovelPromotionProject.styleAssetId` nullable 且旧字段保留 | schema contract | `rg "styleAssetId|artStylePrompt|artStyle" prisma/schema.prisma prisma/schema.sqlit.prisma` | ❌ Wave 0 |
| DATA-03 | `ART_STYLES` 可投影成只读系统风格和 stable legacy key | unit | `vitest run tests/unit/style/legacy-system-styles.test.ts` | ❌ Wave 0 |
| DATA-04 | resolver 按 task snapshot → style asset → project prompt → project key → user preference → default fallback | unit | `vitest run tests/unit/style/resolve-style-context.test.ts` | ❌ Wave 0 |
| DATA-05 | `StylePromptSnapshot` 包含 identity、prompt、source、fallback metadata 且 serializable | unit | `vitest run tests/unit/style/snapshot.test.ts` | ❌ Wave 0 |
| MIG-01 | 只有旧 `artStyle` 或 `artStylePrompt` 的项目可解析 | unit | `vitest run tests/unit/style/resolve-style-context.test.ts` | ❌ Wave 0 |
| MIG-02 | legacy key 缺失时默认 fallback deterministic | unit | `vitest run tests/unit/style/legacy-system-styles.test.ts tests/unit/style/resolve-style-context.test.ts` | ❌ Wave 0 |
| MIG-03 | `UserPreference.artStyle` 在项目旧字段为空后生效 | unit | `vitest run tests/unit/style/resolve-style-context.test.ts` | ❌ Wave 0 |
| MIG-04 | missing/deleted/inaccessible `styleAssetId` 不泄漏并 fallback | unit | `vitest run tests/unit/style/resolve-style-context.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `vitest run tests/unit/style/resolve-style-context.test.ts tests/unit/style/snapshot.test.ts`。[ASSUMED]
- **Per wave merge:** `npm run typecheck && vitest run tests/unit/style tests/integration/api/specific/novel-promotion-project-art-style-validation.test.ts tests/integration/api/specific/user-preference-art-style-validation.test.ts`。[VERIFIED: existing tests grep][ASSUMED]
- **Phase gate:** `npm run typecheck && npm run test:unit:all && npm run test:integration:api`，若依赖服务未启动则记录 blocked 并至少跑 unit/style + typecheck。[VERIFIED: `package.json`][ASSUMED]

### Wave 0 Gaps

- [ ] `tests/unit/style/legacy-system-styles.test.ts`，覆盖 DATA-03、MIG-02。[ASSUMED]
- [ ] `tests/unit/style/resolve-style-context.test.ts`，覆盖 DATA-04、MIG-01、MIG-03、MIG-04。[ASSUMED]
- [ ] `tests/unit/style/snapshot.test.ts`，覆盖 DATA-05。[ASSUMED]
- [ ] schema parity check，覆盖 DATA-01、DATA-02，可用 `rg` 或新增轻量 contract test。[ASSUMED]
- [ ] 依赖安装：当前缺少本地 `node_modules/.bin/prisma`，执行前需 `npm install`。[VERIFIED: shell]

### Concrete Validation Dimensions

- **Schema parity:** 主 MySQL schema 和 SQLite schema 都有 `GlobalStyle`、`styleAssetId`、`previewMediaId` relation、folder/user/media backrefs 和 indexes。[VERIFIED: codebase grep][ASSUMED]
- **Legacy compatibility:** 旧 `artStylePrompt` 优先于旧 `artStyle`，旧 `artStyle` 通过 `getArtStylePrompt()` 解析，空值 fallback 到用户偏好或默认。[VERIFIED: `.planning/phases/01-data-model-contract/01-CONTEXT.md`]
- **Access-safe fallback:** 不存在、删除、跨用户不可访问的 style asset 返回相同 fallback reason family，不暴露私有资产详情。[VERIFIED: `.planning/phases/01-data-model-contract/01-CONTEXT.md`]
- **Prompt separation:** resolver 永远分离 `positivePrompt` 和 `negativePrompt`，快照也分离保存。[VERIFIED: `.planning/REQUIREMENTS.md`]
- **Snapshot stability:** 快照创建后不再依赖 style asset 最新 row，后续编辑不会改变 task snapshot。[VERIFIED: `.planning/REQUIREMENTS.md`]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes, for later API phases | `requireUserAuth` for global style assets and `requireProjectAuth` for project binding。[VERIFIED: `AGENTS.md`][VERIFIED: `src/lib/api-auth.ts`] |
| V3 Session Management | no direct Phase 1 change | Reuse NextAuth session handling。[VERIFIED: `.planning/codebase/ARCHITECTURE.md`] |
| V4 Access Control | yes | Resolver must query accessible style by `id + userId/system visibility` and fallback generically。[VERIFIED: `.planning/phases/01-data-model-contract/01-CONTEXT.md`][ASSUMED] |
| V5 Input Validation | yes | `positivePrompt`、`negativePrompt`、`tags`、`source`、`legacyKey` need typed normalization before API phases。[ASSUMED] |
| V6 Cryptography | no | Style asset fields do not introduce new secrets or crypto.[VERIFIED: `.planning/REQUIREMENTS.md`] |

### Known Threat Patterns for Style Resolver

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-user style probing through `styleAssetId` | Information Disclosure | Query only accessible rows and return generic missing/inaccessible fallback。[VERIFIED: `.planning/phases/01-data-model-contract/01-CONTEXT.md`][ASSUMED] |
| Preview storage key leakage | Information Disclosure | Store `previewMediaId` and expose later as `MediaRef`, not signed URL/storage key。[VERIFIED: `AGENTS.md`][VERIFIED: `src/lib/media/types.ts`] |
| Prompt injection through user style prompt | Tampering | Phase 1 stores prompt text; later prompt assembler must treat it as style context, not executable control text。[ASSUMED] |
| Task retry style drift | Repudiation / Integrity | Store `StylePromptSnapshot` in task payload before generation migration。[VERIFIED: `.planning/REQUIREMENTS.md`] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/01-data-model-contract/01-CONTEXT.md`，Phase 1 locked decisions、resolver priority、task snapshot scope。[VERIFIED]
- `.planning/REQUIREMENTS.md`，DATA/MIG requirements and acceptance scope。[VERIFIED]
- `.planning/ROADMAP.md`，phase boundary and deferred work。[VERIFIED]
- `.planning/STATE.md`，current focus and unresolved system style/delete strategy concerns。[VERIFIED]
- `.planning/research/SUMMARY.md`，project-level architecture recommendation and pitfalls。[VERIFIED]
- `.planning/codebase/ARCHITECTURE.md`，API/Prisma/task/media layering。[VERIFIED]
- `.planning/codebase/CONCERNS.md`，media/security/task risk areas。[VERIFIED]
- `AGENTS.md`，project constraints and Chinese language rule。[VERIFIED]
- `prisma/schema.prisma` and `prisma/schema.sqlit.prisma`，current relation patterns and legacy fields。[VERIFIED]
- `src/lib/constants.ts`，`ART_STYLES`、`ArtStyleValue`、`getArtStylePrompt()`。[VERIFIED]
- `src/lib/task/types.ts`，`TaskJobData.payload` contract。[VERIFIED]
- `src/lib/media/types.ts` and `src/lib/media/attach.ts`，`MediaRef` and attachment patterns。[VERIFIED]
- `vitest.config.ts` and `package.json`，test framework and scripts。[VERIFIED]
- npm registry checks on 2026-04-17 for `next`、`react`、`prisma`、`@prisma/client`、`bullmq`、`ioredis`、`vitest`、`zod`。[VERIFIED: npm registry]

### Secondary (MEDIUM confidence)

- Local shell probes for Node/npm/Docker/mysql/redis/local Prisma availability。[VERIFIED: shell]
- Codebase grep for `ART_STYLES`、`getArtStylePrompt`、`artStyle` usage in worker/API/UI/tests。[VERIFIED: codebase grep]

### Tertiary (LOW confidence)

- Placement preference for `src/lib/style/` and string `source` representation are engineering recommendations, not locked project decisions。[ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH，versions verified from `package.json` and npm registry, execution availability checked locally。[VERIFIED]
- Architecture: HIGH，schema and resolver placement grounded in local Prisma/task/media patterns; directory choice is assumed but low risk。[VERIFIED][ASSUMED]
- Pitfalls: HIGH，most risks are explicitly called out by CONTEXT, REQUIREMENTS, SUMMARY and CONCERNS。[VERIFIED]

**Research date:** 2026-04-17  
**Valid until:** 2026-05-17 for codebase-local contract; npm latest version data should be rechecked after 7 days because registry versions are fast-moving。[ASSUMED]
