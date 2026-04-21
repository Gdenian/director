# 技术栈研究：waoowaoo 风格资产化

**项目：** waoowaoo AI 影视 Studio  
**研究日期：** 2026-04-17  
**研究维度：** Stack / 既有模块、数据模型和边界  
**总体置信度：** HIGH  

## 结论

风格资产化应沿用当前 Next.js 15 + React 19 + Prisma/MySQL + BullMQ/Redis + MinIO/S3 + React Query 的既有架构，不需要新增框架、数据库、队列、存储或 AI 训练管线。核心实现应是一次资产中心类型扩展：把 `style` 加入 `src/lib/assets/contracts.ts` 和 `src/lib/assets/kinds/registry.ts`，新增 Prisma 风格资产模型，并让项目配置通过风格资产引用解析出统一 prompt。

当前系统已经有完整资产中心边界：统一资产合约在 `src/lib/assets/contracts.ts`，类型注册在 `src/lib/assets/kinds/registry.ts`，统一读取在 `src/lib/assets/services/read-assets.ts`，映射在 `src/lib/assets/mappers.ts`，统一 API 在 `src/app/api/assets/route.ts`，全局资产 UI 在 `src/app/[locale]/workspace/asset-hub/page.tsx`，客户端缓存在 `src/lib/query/hooks/useAssets.ts` 和 `src/lib/query/keys.ts`。风格应该进入这条链路，而不是只在配置页增加一个自定义下拉。

数据层应新增 `GlobalStyle`，并把它挂到 `User`、`GlobalAssetFolder`、`MediaObject` 和 `NovelPromotionProject` 上；同时保留 `NovelPromotionProject.artStyle`、`NovelPromotionProject.artStylePrompt` 和 `UserPreference.artStyle` 作为兼容字段。现有硬编码风格源 `src/lib/constants.ts` 的 `ART_STYLES` 和 `getArtStylePrompt()` 应变成兼容兜底，不再是唯一来源；`src/lib/style-presets.ts` 目前只有禁用预设，不应继续扩展为真实资产系统。

## 推荐栈内方案

### 资产合约与注册

| 文件 | 应使用方式 | 原因 |
|------|------------|------|
| `src/lib/assets/contracts.ts` | 扩展 `AssetKind = 'character' | 'location' | 'prop' | 'voice' | 'style'`，新增 `StyleAssetSummary` | 当前统一资产读取、过滤、任务状态、UI 卡片都依赖这个合约；风格资产必须与角色/场景/道具/音色并列 |
| `src/lib/assets/kinds/registry.ts` | 注册 `style`，建议 `family: 'visual'`，关闭图片生成/修图/选图能力，只保留 CRUD、复制、预览图上传能力 | 风格是 prompt/参考资产，不是生成任务目标；不要复用角色/场景的多变体生成语义 |
| `src/lib/assets/mappers.ts` | 新增 `mapGlobalStyleToAsset()` | 保持 API 返回 `AssetSummary[]`，避免为风格新建一套列表协议 |
| `src/lib/assets/services/read-assets.ts` | `readGlobalAssets()` 并行读取 `prisma.globalStyle.findMany()`，支持 `kind=style` | 统一 `/api/assets?scope=global&kind=style` 查询入口 |
| `src/lib/query/hooks/useAssets.ts` | 扩展 task flatten 和类型分支，让 `style` 无任务状态或仅支持轻量上传状态 | React Query 统一缓存可以复用；风格 CRUD 后失效 `queryKeys.assets.all('global')` |
| `src/lib/query/keys.ts` | 将 `kind` 类型扩展到 `'style'`；可新增 `queryKeys.globalAssets.styles()` 仅用于旧页面局部兼容 | 避免风格列表缓存与统一资产列表分叉 |

### Prisma 数据模型

推荐新增独立模型，而不是塞进 `GlobalLocation.assetKind` 或复用 `GlobalVoice`：

```prisma
model GlobalStyle {
  id              String   @id @default(uuid())
  userId          String
  folderId        String?
  name            String
  description     String?  @db.Text
  prompt          String   @db.Text
  negativePrompt  String?  @db.Text
  previewImageUrl String?  @db.Text
  previewMediaId  String?
  tags            Json?
  source          String   @default("user") // user | system | migrated
  legacyValue     String?  @db.VarChar(128)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user         User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  folder       GlobalAssetFolder? @relation(fields: [folderId], references: [id], onDelete: SetNull)
  previewMedia MediaObject?       @relation("GlobalStylePreviewMedia", fields: [previewMediaId], references: [id], onDelete: SetNull)
  projects     NovelPromotionProject[]

  @@index([userId])
  @@index([folderId])
  @@index([previewMediaId])
  @@index([legacyValue])
  @@map("global_styles")
}
```

还应扩展现有模型：

```prisma
model User {
  globalStyles GlobalStyle[]
}

model GlobalAssetFolder {
  styles GlobalStyle[]
}

model MediaObject {
  globalStylePreviews GlobalStyle[] @relation("GlobalStylePreviewMedia")
}

model NovelPromotionProject {
  styleAssetId String?
  styleAsset   GlobalStyle? @relation(fields: [styleAssetId], references: [id], onDelete: SetNull)
}
```

`NovelPromotionProject.artStyle` 仍保留为旧项目 fallback；`artStylePrompt` 当前注释已经说明通过实时查询获取，不应重新变成主数据源。`UserPreference.artStyle` 可继续作为新建项目默认兼容值，后续可加 `defaultStyleAssetId`，但第一阶段不必阻断风格资产化。

### API 边界

| 边界 | 推荐做法 | 不推荐做法 |
|------|----------|------------|
| 全局资产列表 | 复用 `src/app/api/assets/route.ts` 的 `GET`，让 `kind=style` 返回统一 `StyleAssetSummary` | 新建完全独立 `/api/styles` 列表协议并让资产中心绕开 `useAssets()` |
| 风格 CRUD | 可以在 `src/app/api/assets/route.ts` / `src/app/api/assets/[assetId]/route.ts` 扩展 `style` 的 create/update/delete，也可以新增 `src/app/api/asset-hub/styles/route.ts` 作为旧 asset-hub 风格入口，但内部应调用同一服务 | 在页面组件里直接拼多个 API，或在项目配置 API 中顺手创建全局风格 |
| 鉴权 | 全局风格用 `requireUserAuth()`；项目选择风格用 `requireProjectAuthLight()`；跨项目使用时校验 `style.userId === session.user.id` | 依赖前端传 `userId`，或只校验风格 id 存在 |
| 项目配置 | 扩展 `src/app/api/novel-promotion/[projectId]/route.ts`，允许 PATCH `styleAssetId`，同时继续允许旧 `artStyle` | 直接删除 `artStyle` 校验，导致旧客户端和旧项目生成失败 |
| 媒体预览图 | 使用 `MediaObject` / `MediaRef`，在 `src/lib/media/attach.ts` 增加 `attachMediaFieldsToGlobalStyle()` | 在 `GlobalStyle.previewImageUrl` 写外部 URL 后前端直接展示 |

### 风格解析与生成流程

现有生成链路主要从 `getProjectModelConfig()` 读 `artStyle`，再调用 `getArtStylePrompt()` 注入 prompt：

- `src/lib/config-service.ts`
- `src/lib/workers/handlers/character-image-task-handler.ts`
- `src/lib/workers/handlers/location-image-task-handler.ts`
- `src/lib/workers/handlers/panel-image-task-handler.ts`
- `src/lib/workers/handlers/panel-variant-task-handler.ts`
- `src/lib/workers/handlers/analyze-novel.ts`
- `src/lib/workers/handlers/reference-to-character.ts`
- `src/lib/workers/handlers/asset-hub-image-task-handler.ts`

推荐新增一个服务作为唯一解析边界，例如 `src/lib/assets/services/style-resolver.ts`：

```ts
type ResolvedVisualStyle = {
  id: string | null
  name: string
  prompt: string
  negativePrompt: string | null
  source: 'asset' | 'legacy'
  legacyValue: string | null
}
```

解析优先级应为：

1. `NovelPromotionProject.styleAssetId` 指向的 `GlobalStyle.prompt`
2. `NovelPromotionProject.artStylePrompt`，仅作为历史项目兼容
3. `NovelPromotionProject.artStyle` 通过 `src/lib/constants.ts#getArtStylePrompt()` 解析
4. 空字符串，生成时 fallback 为“与参考图风格一致”

`getProjectModelConfig()` 可以继续返回模型、比例、并发和 capability 配置；风格 prompt 不应继续藏在普通 model config 里无限扩展。生成 handler 应调用风格解析服务，或由上层任务 payload 在提交时携带 `styleAssetId` / resolved prompt snapshot，避免同一任务重试时风格资产被用户修改造成结果不一致。更稳妥的任务 payload 是同时记录：

- `styleAssetId`
- `stylePromptSnapshot`
- `negativePromptSnapshot`
- `legacyArtStyle`

### UI 与客户端复用

| 位置 | 应扩展点 |
|------|----------|
| `src/app/[locale]/workspace/asset-hub/page.tsx` | 增加“风格”创建/编辑/删除入口，继续使用 `useAssets({ scope: 'global' })` |
| `src/app/[locale]/workspace/asset-hub/components/AssetGrid.tsx` | 增加 `style` 卡片渲染分支 |
| `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/ConfigStage.tsx` | 配置阶段从硬编码风格下拉切到风格资产选择器，保留旧 `artStyle` 兜底显示 |
| `src/components/story-input/StoryInputComposer.tsx` | 不继续承担风格资产业务；它可以接收选中风格 label/value，但不应直接查询资产 |
| `src/lib/query/mutations/useProjectConfigMutations.ts` | 增加 `styleAssetId` 更新，保持 `artStyle` 更新兼容 |

## 不应新增的技术

| 不新增 | 原因 |
|--------|------|
| 新数据库或文档库 | Prisma/MySQL 已覆盖用户资产、项目引用、媒体关系和迁移需求 |
| 向量数据库/embedding 检索 | 本阶段是用户自定义管理和选择风格，不是语义搜索或推荐系统 |
| 新对象存储或 CDN 直连方案 | 预览图应走现有 `MediaObject`、`MediaRef`、`/m/{publicId}` 和 MinIO/S3 provider |
| 新队列类型或专用 worker | 风格 CRUD 不需要 BullMQ；只有未来自动生成预览图时才复用现有 image task |
| LoRA/DreamBooth/训练管线 | 项目要求明确排除模型微调；当前目标是 prompt/参考资产管理 |
| GraphQL、tRPC、Server Actions 替换 API Route | 现有系统标准是 Next.js API Route + `apiHandler()` + React Query |
| 独立 CMS/Headless 配置系统 | 风格是用户资产，应该受用户鉴权、文件夹、资产中心和项目引用约束 |
| 前端 localStorage 风格库 | 无法支持跨设备、项目默认风格、权限和生成任务一致性 |
| 继续扩展 `src/lib/style-presets.ts` 作为主方案 | 该文件当前只有禁用预设，适合作为迁移/推荐兜底，不是资产中心主数据 |

## 迁移建议

1. 新增 `GlobalStyle` 和 `NovelPromotionProject.styleAssetId`，保留旧字段。
2. 用 `src/lib/constants.ts` 的 `ART_STYLES` 生成系统/迁移风格资产，设置 `source = "system"` 或 `"migrated"`，并记录 `legacyValue`。
3. 对已有项目先不强制回填 `styleAssetId`；生成解析时通过 `artStyle` fallback 保证无损兼容。
4. 新建项目可继续从 `UserPreference.artStyle` 设置旧默认，同时在项目配置 UI 引导选择风格资产。
5. 后续阶段再考虑把用户偏好升级为 `defaultStyleAssetId`。

## 测试与守卫范围

必须覆盖以下边界：

- `src/lib/assets/contracts.ts` 和 `src/lib/assets/kinds/registry.ts`：`style` 注册、能力开关和类型收窄。
- `src/lib/assets/services/read-assets.ts`：`kind=style`、folder 筛选、用户隔离。
- `src/lib/assets/mappers.ts`：`GlobalStyle` 到 `StyleAssetSummary` 的映射和 `MediaRef` 附加。
- `src/app/api/assets/route.ts` / `src/app/api/assets/[assetId]/route.ts`：全局风格 CRUD 鉴权。
- `src/app/api/novel-promotion/[projectId]/route.ts`：项目选择 `styleAssetId` 时校验归属，旧 `artStyle` 仍可 PATCH。
- 风格解析服务：资产优先、旧字段 fallback、任务 payload snapshot。
- 生成 handler：角色、场景/道具、分镜、变体、小说分析仍使用同一解析来源。

## 置信度评估

| 领域 | 置信度 | 依据 |
|------|--------|------|
| 现有技术栈边界 | HIGH | `.planning/codebase/STACK.md`、`.planning/codebase/ARCHITECTURE.md`、`.planning/codebase/STRUCTURE.md` 已明确 Next.js/Prisma/BullMQ/Media/Asset 分层 |
| 资产中心扩展点 | HIGH | `src/lib/assets/contracts.ts`、`src/lib/assets/kinds/registry.ts`、`src/lib/assets/services/read-assets.ts`、`src/lib/assets/mappers.ts` 形成清晰统一资产抽象 |
| Prisma 模型建议 | HIGH | `prisma/schema.prisma` 已有 `GlobalCharacter`、`GlobalLocation`、`GlobalVoice`、`GlobalAssetFolder`、`MediaObject` 模式可直接照搬 |
| 生成链路接入点 | MEDIUM | 已确认主要 handler 使用 `getArtStylePrompt()`；最终实施前仍需全量 grep `artStyle`，避免遗漏 UI 或 prompt canary |
| UI 工作量 | MEDIUM | 已确认 asset hub 和 config stage 入口；具体卡片/表单组件需要阶段设计时再拆分 |

## 路线图含义

推荐阶段顺序：

1. **数据与资产合约**：新增 Prisma 模型、`AssetKind='style'`、mapper/read-assets/query key。先让风格能作为资产被列出。
2. **资产中心 CRUD**：新增风格卡片、表单、预览图上传、文件夹筛选和用户鉴权。
3. **项目默认风格选择**：给项目配置加 `styleAssetId`，保留旧 `artStyle` 下拉/显示兼容。
4. **生成链路统一解析**：把角色、场景、道具、分镜、变体和分析流程切到风格解析服务，并记录任务 snapshot。
5. **迁移与回归测试**：旧项目、硬编码 `ART_STYLES`、用户偏好和 prompt 注入路径全部回归。

## 来源

- `.planning/PROJECT.md`
- `.planning/codebase/STACK.md`
- `.planning/codebase/ARCHITECTURE.md`
- `.planning/codebase/STRUCTURE.md`
- `src/lib/assets/contracts.ts`
- `src/lib/assets/kinds/registry.ts`
- `src/lib/assets/mappers.ts`
- `src/lib/assets/services/read-assets.ts`
- `src/lib/assets/services/asset-actions.ts`
- `src/lib/assets/services/location-backed-assets.ts`
- `src/lib/style-presets.ts`
- `src/lib/constants.ts`
- `src/lib/config-service.ts`
- `src/lib/media/attach.ts`
- `src/app/api/assets/route.ts`
- `src/app/api/asset-hub/characters/route.ts`
- `src/app/api/asset-hub/locations/route.ts`
- `src/app/api/asset-hub/appearances/route.ts`
- `src/app/api/novel-promotion/[projectId]/route.ts`
- `src/app/api/projects/route.ts`
- `src/app/[locale]/workspace/asset-hub/page.tsx`
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/ConfigStage.tsx`
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/NovelInputStage.tsx`
- `src/components/story-input/StoryInputComposer.tsx`
- `src/lib/workers/handlers/character-image-task-handler.ts`
- `src/lib/workers/handlers/location-image-task-handler.ts`
- `src/lib/workers/handlers/panel-variant-task-handler.ts`
- `prisma/schema.prisma`
