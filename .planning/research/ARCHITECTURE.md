# Architecture Patterns: waoowaoo 风格资产化

**Domain:** AI 影视创作工作台的可复用画面风格资产  
**Researched:** 2026-04-17  
**Overall confidence:** HIGH（基于本仓库 Prisma、API、React Query、资产中心与 worker/prompt 链路阅读）

## 结论

风格资产应该进入现有统一资产域，而不是另建一个孤立配置页。当前系统已经有全局资产中心、项目资产快照、`/api/assets` 统一读写、React Query 缓存、媒体 `MediaRef`、任务目标态和 worker 生成链路；风格应沿这些边界扩展为第五类资产：`style`。但风格与角色/场景/道具不同，它的核心产物是 prompt 文本和可选预览图，不是必须生成多候选图片。因此推荐把风格建模为轻量视觉资产，具备 `canCopyFromGlobal` 和可选 `canUploadRender`，先不接入图像生成/修改任务，避免把风格管理和图像生成任务耦合过早。

最关键的架构点是新增一个“风格解析服务”，让所有生成链路都通过同一个入口得到最终 `stylePrompt`。现在角色图、场景图、分镜图和变体图分别在 `src/lib/workers/handlers/character-image-task-handler.ts`、`src/lib/workers/handlers/location-image-task-handler.ts`、`src/lib/workers/handlers/panel-image-task-handler.ts`、`src/lib/workers/handlers/panel-variant-task-handler.ts` 内调用 `getArtStylePrompt(modelConfig.artStyle, locale)`。这个分散点必须收敛到 `src/lib/assets/services/resolve-style-asset.ts` 或 `src/lib/style/resolve-style-context.ts`，否则后续一定出现项目默认风格、资产中心风格和旧枚举风格互相漂移。

推荐保留 `NovelPromotionProject.artStyle` 和 `UserPreference.artStyle` 作为兼容字段，同时新增 `styleAssetId` 外键。读取顺序应为：运行时显式 `styleAssetId` / `stylePrompt` > 项目 `styleAssetId` > 项目旧 `artStyle` / `artStylePrompt` > 用户偏好旧 `artStyle` > 默认 `american-comic`。这样旧项目不需要一次性迁移即可继续生成，新项目可以逐步转向资产化风格。

## 推荐架构

```text
Prisma GlobalStyle / Project selected style
        ↓
src/lib/assets/contracts.ts: AssetKind += 'style'
        ↓
src/lib/assets/mappers.ts + read-assets.ts
        ↓
/api/assets?kind=style 和 /api/asset-hub/styles
        ↓
src/lib/query/hooks/useAssets.ts + style mutations
        ↓
资产中心风格卡片 / 项目配置风格选择器
        ↓
src/lib/style/resolve-style-context.ts
        ↓
worker handlers + prompt templates
```

## 数据模型

### 新增全局风格表

在 `prisma/schema.prisma` 新增 `GlobalStyle`，不要复用 `GlobalLocation.assetKind='style'`。`GlobalLocation` 当前承载场景/道具图片槽位、`GlobalLocationImage`、可选位置 slot 和图片生成语义，把风格塞进去会让无图文本资产继承不相关约束。

推荐字段：

```prisma
model GlobalStyle {
  id             String   @id @default(uuid())
  userId         String
  folderId       String?
  name           String
  description    String?  @db.Text
  positivePrompt String   @db.Text
  negativePrompt String?  @db.Text
  tags           String?  @db.Text
  source         String   @default("user") // user | system | migrated
  previewImageUrl String? @db.Text
  previewMediaId String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user         User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  folder       GlobalAssetFolder? @relation(fields: [folderId], references: [id], onDelete: SetNull)
  previewMedia MediaObject?       @relation(fields: [previewMediaId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([folderId])
  @@index([previewMediaId])
  @@map("global_styles")
}
```

在 `NovelPromotionProject` 增加 `styleAssetId String?`，可选关联到 `GlobalStyle`。如果产品需要“项目内快照”，再加 `stylePositivePromptSnapshot` / `styleNegativePromptSnapshot`，但 MVP 先不要复制快照；直接引用全局风格能降低数据同步复杂度。保留现有 `artStyle` 和 `artStylePrompt`，因为它们已经被项目创建、配置页和 worker 依赖。

`UserPreference` 可暂不加 `styleAssetId`。用户级默认风格资产会引入另一个优先级维度，本轮目标是“项目默认配置和生成 prompt”接通，先让项目选风格资产。

## 资产契约和映射

在 `src/lib/assets/contracts.ts`：

- `AssetKind` 扩展为 `'character' | 'location' | 'prop' | 'voice' | 'style'`。
- `AssetFamily` 可以保持 `'visual' | 'audio'`，风格归入 `visual`。
- 新增 `StyleAssetSummary`，字段包含 `description`、`positivePrompt`、`negativePrompt`、`tags`、`source`、`previewImageUrl`、`previewMedia`、`isProjectDefault?: boolean`。
- `VisualAssetSummary` 包含 `StyleAssetSummary`，但 UI 不应假设所有 visual 资产都有 `variants`。

在 `src/lib/assets/kinds/registry.ts` 注册：

```ts
style: {
  kind: 'style',
  family: 'visual',
  supportsMultipleVariants: false,
  supportsVoiceBinding: false,
  editorSchema: 'style',
  promptAssembler: 'style',
  capabilities: {
    canGenerate: false,
    canSelectRender: false,
    canRevertRender: false,
    canModifyRender: false,
    canUploadRender: true,
    canBindVoice: false,
    canCopyFromGlobal: false,
  },
}
```

`canCopyFromGlobal` 不建议用于风格，因为项目默认配置只需要引用风格资产，不需要复制到项目资产表。若后续要支持项目级风格快照，再单独设计 `ProjectStyleSnapshot`。

在 `src/lib/assets/mappers.ts` 新增 `mapGlobalStyleToAsset()`。它应该只读取 `GlobalStyle` 和 `MediaRef`，不要构造空 `variants`。这会迫使 UI 明确处理 `style`，避免把风格卡片伪装成位置/道具卡片。

在 `src/lib/assets/services/read-assets.ts` 的 `readGlobalAssets()` 增加 `prisma.globalStyle.findMany()`，并通过新 attach 函数附加 preview media。`readProjectAssets()` 不建议返回项目风格为项目资产；项目默认风格应随 project data 返回，避免在“项目资产列表”里混入一个配置项。

## API 边界

### 统一资产 API

`src/app/api/assets/route.ts` 和 `src/app/api/assets/[assetId]/route.ts` 目前只接受四类资产，并且 POST/DELETE 只允许 location/prop。需要：

- `isAssetKind()` 增加 `style`。
- GET 支持 `/api/assets?scope=global&kind=style`。
- POST 支持 `kind: 'style'` 且仅 `scope: 'global'`。
- PATCH 支持更新风格字段。
- DELETE 支持删除风格，但删除前检查项目引用，或采用“允许删除并把项目回退到 legacy artStyle”的策略。推荐第一期禁止删除被任何项目引用的风格，返回明确错误。

### 资产中心专用 API

现有 `src/app/api/asset-hub/characters/route.ts`、`src/app/api/asset-hub/locations/route.ts`、`src/app/api/asset-hub/voices/route.ts` 是旧版资产中心接口；统一 API 已经在 `src/app/api/assets/route.ts` 上抽象了大部分能力。风格可以新增 `src/app/api/asset-hub/styles/route.ts` 用于旧 UI 快速接入，但内部应调用同一个 `src/lib/assets/services/style-actions.ts`，不要把写逻辑散在 route。

`src/app/api/asset-hub/picker/route.ts` 应支持 `type=style`，返回 `id/name/description/previewUrl/positivePrompt/tags/source`，供项目配置选择器使用。

所有新 route 继续使用 `requireUserAuth()`；项目默认风格 PATCH 使用 `requireProjectAuthLight()` 并校验 `GlobalStyle.userId === session.user.id`。

## React Query

在 `src/lib/query/keys.ts`：

- `queryKeys.assets.list().kind` 联合类型加入 `'style'`。
- `queryKeys.globalAssets.styles(folderId?)` 新增独立 key。

在 `src/lib/query/hooks/useAssets.ts`：

- `flattenTaskRefs()` 对 `style` 直接跳过 variants/profile。
- `withTaskStateAsset()` 新增 style 分支，只解析 `asset.taskRefs`。
- `useAssetActions()` 的 `generate/selectRender/revertRender/modifyRender` 不应暴露给 style，或者 UI 层根据 capabilities 隐藏。

新增 `src/lib/query/mutations/asset-hub-style-mutations.ts`：

- `useCreateStyleAsset()`
- `useUpdateStyleAsset()`
- `useDeleteStyleAsset()`
- `useUploadStylePreview()`（复用 `/api/asset-hub/upload-temp` 或更好地走现有媒体上传服务）
- `useSetProjectStyleAsset(projectId)`

`src/lib/query/mutations/asset-hub-mutations-runtime.ts` 导出 style mutations；`asset-hub-mutations-shared.ts` 新增 `invalidateGlobalStyles()`。

## 资产中心 UI

入口在 `src/app/[locale]/workspace/asset-hub/page.tsx`。当前页面和 `CharacterCard.tsx`、`LocationCard.tsx` 已经围绕 `ART_STYLES` 和角色/场景图片生成存在局部状态。风格资产化后应做三件事：

- 在资产类型过滤中加入“风格”。
- 新增 `src/app/[locale]/workspace/asset-hub/components/StyleCard.tsx`，展示名称、描述、预览图、正向 prompt 摘要、负向约束、标签和来源。
- 新增 `StyleEditorModal.tsx`，支持创建/编辑/删除/上传预览图。

不要把风格塞进 `LocationCard.tsx`。风格没有 `images`、`availableSlots`、`selectedVariantId`，复用场景卡会引入大量空字段和条件分支。

## 项目默认配置

当前项目配置 PATCH 在 `src/app/api/novel-promotion/[projectId]/route.ts` 只允许 `artStyle`，且 `validateArtStyleField()` 强制它是 `ART_STYLES` 枚举。应新增：

- `styleAssetId` 允许字段。
- `validateStyleAssetField(userId, styleAssetId)`，校验资产存在且属于当前用户。
- PATCH `styleAssetId` 时不要强制清空 `artStyle`。保留旧字段用于 UI 回退和旧 worker payload。

前端配置入口包括：

- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/ConfigStage.tsx`
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/WorkspaceHeaderShell.tsx`
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageRuntime.ts`
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/NovelInputStage.tsx`

这些位置应从“枚举风格按钮”改为“风格资产选择器 + legacy preset fallback”。选择器可以使用 `/api/asset-hub/picker?type=style` 或 `useAssets({ scope: 'global', kind: 'style' })`。

项目 data snapshot 需要返回 `styleAsset` 摘要。具体接入点应查 `src/lib/query/hooks/useProjectData.ts` 和项目 data API；不要让前端为了显示项目当前风格再额外 N+1 请求。

## Prompt 和生成任务

新增风格解析服务：

```ts
type ResolvedStyleContext = {
  styleAssetId: string | null
  label: string
  positivePrompt: string
  negativePrompt: string | null
  legacyArtStyle: string | null
  source: 'asset' | 'legacy-project' | 'legacy-user' | 'default'
}
```

推荐文件：`src/lib/style/resolve-style-context.ts` 或 `src/lib/assets/services/resolve-style-context.ts`。服务函数：

- `resolveProjectStyleContext({ projectId, userId, locale })`
- `resolvePayloadStyleContext({ projectId, userId, locale, payload })`
- `formatStyleForPrompt(context)`，输出给 `{style}` 或拼接到资产图 prompt 的最终文本。

所有 worker 迁移到该服务：

- `src/lib/workers/handlers/character-image-task-handler.ts`
- `src/lib/workers/handlers/location-image-task-handler.ts`
- `src/lib/workers/handlers/asset-hub-image-task-handler.ts`
- `src/lib/workers/handlers/panel-image-task-handler.ts`
- `src/lib/workers/handlers/panel-variant-task-handler.ts`
- `src/lib/workers/handlers/reference-to-character.ts`
- `src/lib/workers/handlers/analyze-novel.ts`

`lib/prompts/novel-promotion/single_panel_image.zh.txt` 已有 `{style}` 占位，保持模板不变。变化应在构建变量前完成：把风格资产的 `positivePrompt` 写入 `{style}`，如果有 `negativePrompt`，追加为“负向约束：...”。不要把负向约束散落到模板里，避免中英文模板和不同生成路径不一致。

任务 payload 应支持：

- `styleAssetId?: string`
- `stylePrompt?: string`（只用于迁移/显式覆盖，普通 UI 不直接写）
- 继续接受 `artStyle?: string`

`src/lib/assets/services/asset-actions.ts` 当前 `resolveOptionalArtStyle()` 强制枚举，应改为 `resolveOptionalStyleInput()`，同时兼容 `artStyle` 和 `styleAssetId`。全局角色/场景资产创建时可以保存 `styleAssetId` 作为未来追溯字段，但第一期最小可行是：生成时解析风格，不要求每个角色/场景资产记录风格引用。

## 数据流

### 创建风格资产

1. 资产中心 UI 调用 `useCreateStyleAsset()`。
2. mutation POST `/api/assets` 或 `/api/asset-hub/styles`，body 包含 `kind: 'style'`、`name`、`positivePrompt`、可选 `negativePrompt/tags/previewImageUrl/folderId`。
3. API 使用 `requireUserAuth()`，调用 `createStyleAsset()`。
4. 服务校验 folder 所属用户、把预览图解析为 `MediaRef` / `MediaObject`，写入 `GlobalStyle`。
5. React Query 失效 `queryKeys.globalAssets.styles()` 和 `queryKeys.assets.all('global')`。

### 设置项目默认风格

1. 项目配置选择器从 `useAssets({ scope: 'global', kind: 'style' })` 读取风格。
2. 用户选择风格后 PATCH `src/app/api/novel-promotion/[projectId]/route.ts`，body `{ styleAssetId }`。
3. API 校验项目权限和风格归属，更新 `NovelPromotionProject.styleAssetId`。
4. 失效 `queryKeys.projectData(projectId)`、`queryKeys.project.detail(projectId)` 和项目配置相关 key。

### 生成图片

1. UI 提交角色/场景/分镜生成请求，可不传风格。
2. API 通过 `buildImageBillingPayload()` 保留 `styleAssetId/artStyle` 到 task payload，或完全不传，由 worker 读项目默认。
3. Worker 调 `resolvePayloadStyleContext()`。
4. `formatStyleForPrompt()` 返回最终文本。
5. 角色/场景/道具生成将风格文本拼接到 `addCharacterPromptSuffix()` / `addLocationPromptSuffix()` / `addPropPromptSuffix()` 后；分镜生成写入 `NP_SINGLE_PANEL_IMAGE` 的 `{style}`。

## 反模式

### 反模式 1：只把 `ART_STYLES` 改成可编辑数组

这会绕过资产中心、权限、媒体、React Query 和项目选择器。用户能编辑风格名称，但无法像角色/场景/道具/音色一样管理、筛选和复用。

### 反模式 2：直接删除 `artStyle`

`NovelPromotionProject.artStyle`、`UserPreference.artStyle`、`GlobalCharacterAppearance.artStyle`、`GlobalLocation.artStyle` 和多个 API/worker 已经依赖旧枚举。直接删除会破坏旧项目和正在排队的任务。

### 反模式 3：每个 worker 自己查 `GlobalStyle`

这会形成新的分叉。必须用一个 resolver 统一处理项目默认、payload 覆盖、旧枚举 fallback、locale 和负向 prompt 格式。

### 反模式 4：把风格作为项目资产复制

角色/场景/道具复制到项目是因为项目内会改图和选择渲染。风格默认是文本配置，复制会带来同步和删除语义问题。第一期引用全局风格资产即可。

## 构建顺序

1. **数据模型和兼容层**
   - 修改 `prisma/schema.prisma`：新增 `GlobalStyle`、`NovelPromotionProject.styleAssetId`。
   - 写 migration。
   - 新增 resolver，确保旧 `artStyle` 仍能解析。

2. **资产契约和读 API**
   - 扩展 `src/lib/assets/contracts.ts`、`src/lib/assets/kinds/registry.ts`、`src/lib/assets/mappers.ts`、`src/lib/assets/services/read-assets.ts`。
   - 扩展 `src/app/api/assets/route.ts` 的 GET。
   - 先让 `useAssets({ kind: 'style' })` 能读出空列表/真实列表。

3. **风格 CRUD API 和 React Query mutation**
   - 新增 `style-actions.ts`。
   - 扩展 `/api/assets` POST/PATCH/DELETE 或新增 `/api/asset-hub/styles` 并复用服务。
   - 新增 `asset-hub-style-mutations.ts` 和 query key invalidation。

4. **资产中心 UI**
   - 加风格 tab/filter。
   - 加 `StyleCard.tsx` 和 `StyleEditorModal.tsx`。
   - 支持预览图上传、编辑、删除。

5. **项目默认配置**
   - 扩展 `src/app/api/novel-promotion/[projectId]/route.ts` PATCH。
   - 项目 data 返回 `styleAsset` 摘要。
   - `ConfigStage.tsx`、`WorkspaceHeaderShell.tsx`、`useWorkspaceStageRuntime.ts` 改为风格资产选择器，保留旧 preset 选项。

6. **生成链路接入**
   - 更新 `character-image-task-handler.ts`、`location-image-task-handler.ts`、`panel-image-task-handler.ts`、`panel-variant-task-handler.ts`、`asset-hub-image-task-handler.ts`、`reference-to-character.ts`。
   - 更新 `asset-actions.ts` 的 `resolveOptionalArtStyle()`。
   - 确保 `single_panel_image.zh.txt` 的 `{style}` 使用资产 prompt。

7. **迁移和种子**
   - 把 `src/lib/constants.ts` 的 `ART_STYLES` 作为系统风格 seed 写入每个用户或作为系统只读风格。
   - 旧项目继续保留 `artStyle`；可在后台按需为项目设置匹配的系统风格资产。

8. **测试和守卫**
   - 单测：resolver fallback 顺序。
   - API 测试：风格 CRUD 权限、项目引用校验。
   - React Query 测试：`kind=style` 不访问 variants。
   - Worker 测试：角色/场景/分镜生成 prompt 使用同一风格文本。

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Prisma migration | 风格删除后项目悬空 | 第一版禁止删除被项目引用的 `GlobalStyle` |
| 资产契约 | UI 假设 visual 都有 variants | `StyleAssetSummary` 不提供 variants，编译期逼出分支 |
| 项目配置 | `artStyle` 和 `styleAssetId` 双写冲突 | resolver 明确优先级，PATCH 不自动清空旧字段 |
| Prompt 注入 | worker 各自拼风格文本 | 所有 worker 只调用 `resolvePayloadStyleContext()` |
| 系统预设迁移 | 每个用户复制系统风格导致膨胀 | 推荐 `source='system'` 可读，只在用户编辑时 fork |

## 需要后续确认

- `GlobalStyle` 是否允许系统级共享记录。如果当前 schema 没有全局 system owner，MVP 可以为每个用户懒创建系统风格副本。
- 风格预览图是否需要 AI 生成。建议第一期只支持上传/引用，AI 生成预览另立阶段。
- 负向 prompt 是否需要传入 provider 的 native negative prompt 字段。当前项目 prompt 体系主要是文本拼接，第一期先拼入 prompt，后续按模型能力拆分。

## Sources

- `.planning/PROJECT.md`
- `.planning/codebase/ARCHITECTURE.md`
- `.planning/codebase/STRUCTURE.md`
- `prisma/schema.prisma`
- `src/lib/assets/contracts.ts`
- `src/lib/assets/kinds/registry.ts`
- `src/lib/assets/mappers.ts`
- `src/lib/assets/services/read-assets.ts`
- `src/lib/assets/services/asset-actions.ts`
- `src/lib/query/hooks/useAssets.ts`
- `src/lib/query/keys.ts`
- `src/lib/query/mutations/asset-hub-*.ts`
- `src/app/api/assets/route.ts`
- `src/app/api/assets/[assetId]/route.ts`
- `src/app/api/asset-hub/*/route.ts`
- `src/app/api/novel-promotion/[projectId]/route.ts`
- `src/lib/config-service.ts`
- `src/lib/constants.ts`
- `lib/prompts/novel-promotion/single_panel_image.zh.txt`
- `src/lib/workers/handlers/*shot*`
- `src/lib/workers/handlers/*image*`
