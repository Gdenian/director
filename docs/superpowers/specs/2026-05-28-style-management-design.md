# 风格管理功能设计

## 背景

当前系统的画面风格来自硬编码枚举 `ART_STYLES`，并通过 `artStyle` 字段在用户偏好、项目配置、资产创建、任务提交和 worker 生成提示词时流转。这导致用户无法自定义画面风格，也让风格能力分散在 UI、API、任务和 worker 多处逻辑中。

本设计将画面风格升级为资产中心的一等资产。风格资产由用户管理，可被项目和视觉资产使用。生成链路只使用风格提示词快照，参考图和预览图第一版只用于展示，不注入生成模型。

## 目标

- 在资产中心新增第五类资产：风格。
- 用户可创建、编辑、删除风格资产。
- 风格资产支持名称、中文提示词、英文提示词、参考图、预览图。
- 系统为每个用户自动初始化默认风格资产，并设置默认风格。
- 项目必须选择风格，项目使用风格快照驱动后续生成。
- 全局角色、场景、道具创建时必须选择风格。
- 项目内角色、场景、道具默认继承项目风格，也允许覆盖为其他风格。
- 视觉生成任务提交时固化风格快照，worker 只读取任务快照。
- 移除旧硬编码风格枚举作为业务真相源。

## 非目标

- 第一版不做多张参考图。
- 第一版不把风格参考图注入生成模型。
- 第一版不自动生成风格预览图。
- 第一版不做风格版本历史或一键同步按钮。
- 第一版不保留旧项目兼容逻辑；当前处于开发系统阶段，可以直接替换旧风格技术债。

## 产品行为

### 资产中心

资产中心新增风格类型，与角色、场景、道具、音色并列。筛选项变为：

- 全部
- 角色
- 场景
- 道具
- 音色
- 风格

新增资产菜单增加“新建风格”。风格卡片展示：

- 风格名称
- 预览图
- 中文提示词摘要
- 英文提示词状态
- 参考图缩略图
- 更新时间

风格卡片支持编辑、删除、设为默认风格。删除已被项目或资产快照使用的风格不会影响既有快照；删除当前默认风格时，如果用户还有其他风格，后端自动选择创建时间最早的其他风格作为默认风格。用户不能删除最后一个风格。

### 风格编辑

风格编辑弹窗包含：

- 名称，必填。
- 中文提示词，必填。
- 英文提示词，可选。
- 参考图，可选，只展示。
- 预览图，可选，只展示。

生成时按当前 locale 选择提示词：中文使用 `promptZh`，英文优先使用 `promptEn`，为空则回退 `promptZh`。

### 默认风格

用户首次进入风格库、首页创建项目或资产创建流程时，后端执行 `ensureDefaultStyles(userId)`。如果用户没有任何风格资产，系统创建默认风格资产，并写入 `UserPreference.defaultStyleId`。

默认风格是普通用户资产记录，不再作为硬编码枚举参与业务流程。用户可以编辑默认风格，也可以设置其他风格为默认。

### 项目配置

项目配置页的“画面风格”替换为风格资产选择器。项目必须有风格快照；没有风格快照时，不能启动分析、分镜和视觉生成流程。

项目选择风格时，后端读取 `GlobalStyle` 并写入项目快照：

- `styleAssetId`
- `styleSnapshotName`
- `stylePromptZh`
- `stylePromptEn`
- `styleSnapshotUpdatedAt`

项目后续生成读取项目快照，不实时读取全局风格。若全局风格 `updatedAt` 晚于项目 `styleSnapshotUpdatedAt`，项目配置页显示：“该风格已有更新，可重新选择刷新状态”。第一版不提供一键同步按钮；用户重新选择该风格即可刷新快照。

### 视觉资产

全局角色、场景、道具创建时必须选择风格，默认选 `UserPreference.defaultStyleId`。后端读取风格资产并保存资产级快照。

项目内角色、场景、道具创建时默认继承项目风格。用户可以选择覆盖风格；覆盖时保存资产级快照。后续生成优先使用资产级快照，没有资产级快照时继承项目快照。

从全局资产复制到项目时，默认复制源资产的风格快照作为项目资产的资产级覆盖。这样可避免复制来的图片是源风格，但后续重新生成时变成项目风格。

## 数据模型

### GlobalStyle

新增全局风格资产表：

```text
GlobalStyle
- id
- userId
- folderId
- name
- promptZh
- promptEn
- referenceImageUrl
- referenceImageMediaId
- previewImageUrl
- previewImageMediaId
- isSystemSeed
- createdAt
- updatedAt
```

`referenceImageUrl` / `previewImageUrl` 可保留为兼容媒体字段的旧值，主链路应优先使用 `MediaObject` 关系。

### UserPreference

新增：

```text
defaultStyleId
```

用户默认风格由 `UserPreference.defaultStyleId` 指向 `GlobalStyle`。不在 `GlobalStyle` 上使用 `isDefault`，避免每个用户唯一默认值的约束复杂化。

### NovelPromotionProject

旧 `artStyle` / `artStylePrompt` 不再作为业务真相源。项目使用风格快照字段：

```text
styleAssetId
styleSnapshotName
stylePromptZh
stylePromptEn
styleSnapshotUpdatedAt
```

### 资产级风格覆盖

全局视觉资产必须保存风格快照。项目视觉资产仅在覆盖项目风格时保存资产级快照。

角色快照放在 appearance 上：

```text
GlobalCharacterAppearance
CharacterAppearance
- styleAssetId
- styleSnapshotName
- stylePromptZh
- stylePromptEn
- styleSnapshotUpdatedAt
```

场景和道具快照放在 location-like asset 上：

```text
GlobalLocation
NovelPromotionLocation
- styleAssetId
- styleSnapshotName
- stylePromptZh
- stylePromptEn
- styleSnapshotUpdatedAt
```

## 服务层

新增 `src/lib/styles/service.ts`，所有风格逻辑集中在这里：

- `ensureDefaultStyles(userId)`
- `listGlobalStyles(userId, folderId?)`
- `createGlobalStyle(input)`
- `updateGlobalStyle(input)`
- `deleteGlobalStyle(input)`
- `setDefaultStyle(userId, styleId)`
- `buildStyleSnapshot(style)`
- `applyProjectStyleSnapshot(projectId, userId, styleId)`
- `resolveProjectStyleSnapshot(projectId)`
- `resolveAssetStyleSnapshot(input)`
- `resolveEffectiveStyleSnapshot(input)`
- `resolveStylePrompt(snapshot, locale)`
- `isGlobalStyleStale(snapshot, styleUpdatedAt)`

所有 API 和 worker 禁止直接读取旧 `ART_STYLES` 或调用旧 `getArtStylePrompt()`。视觉任务必须通过统一服务解析最终风格快照。

## API 设计

新增 API：

```text
GET    /api/asset-hub/styles
POST   /api/asset-hub/styles
PATCH  /api/asset-hub/styles/[styleId]
DELETE /api/asset-hub/styles/[styleId]
POST   /api/asset-hub/styles/[styleId]/default
```

已有 API 调整：

- `GET /api/assets` 返回风格资产摘要。
- 项目配置 `PATCH /api/novel-promotion/[projectId]` 支持 `styleAssetId`，并写入项目快照。
- 首页快速创建项目使用 `styleAssetId` 替代 `artStyle`。
- 全局角色、场景、道具创建 API 接收 `styleAssetId`。
- 项目内角色、场景、道具创建 API 接收 `inheritProjectStyle` 或 `styleAssetId`。
- 视觉生成 API 在提交任务前解析并写入最终 `styleSnapshot`。

错误码：

- `STYLE_REQUIRED`：项目或全局视觉资产创建/生成缺少风格。
- `STYLE_NOT_FOUND`：风格不存在或不属于当前用户。
- `STYLE_DELETE_LAST_FORBIDDEN`：禁止删除用户最后一个风格。

删除默认风格不是错误场景；只要用户还有其他风格，后端自动切换默认风格。

## 任务与 Worker

视觉任务提交时必须写入快照：

```ts
styleSnapshot: {
  styleAssetId: string | null
  name: string
  promptZh: string
  promptEn: string | null
  snapshotUpdatedAt: string
}
```

Worker 不再查硬编码风格，也不在执行时重新读取全局风格。Worker 只调用：

```ts
resolveStylePrompt(styleSnapshot, locale)
```

这样保证任务在提交时风格已经确定，不会因为排队期间用户修改项目或风格资产而漂移。

需要改造的 worker 包括：

- `analyze-novel`
- `asset-hub-image-task-handler`
- `character-image-task-handler`
- `location-image-task-handler`
- `panel-image-task-handler`
- `panel-variant-task-handler`
- `reference-to-character`

## 业务流程影响

### 首页快速创建项目

首页加载时确保默认风格存在。创建项目时选择风格资产，默认使用用户默认风格。创建项目后写入项目风格快照，再创建第一集并进入工作区。

### 项目创建

项目创建 API 需要保证用户有默认风格，并用默认风格写入项目快照。项目创建成功后必须满足“项目有风格快照”的不变量。

### 配置阶段与 AI 流程启动

启动 story-to-script、script-to-storyboard、全局分析、分镜图生成、角色/场景/道具生成前，后端校验项目存在风格快照。缺失时返回 `STYLE_REQUIRED`。

### 全局资产

全局角色、场景、道具创建时必须选择风格并保存快照。生成任务使用资产快照。

### 项目资产

手动创建项目资产默认继承项目快照。用户覆盖风格时保存资产级快照。生成任务优先使用资产级快照，否则使用项目快照。

### 复制全局资产到项目

复制角色、场景、道具时一并复制源资产风格快照，作为项目资产的资产级覆盖。

### 提示词阶段展示

提示词阶段显示项目快照名称，不再通过 `ART_STYLES` 查 label。

## 移除旧技术债

旧风格字段和工具不再作为业务真相源：

- `ART_STYLES`
- `ArtStyleValue`
- `isArtStyleValue()`
- `getArtStylePrompt()`
- API 中基于 `artStyle` 的校验
- worker 中基于 `artStyle` 枚举的 prompt 拼接

现有默认风格文本可以作为默认风格种子数据保留，但不作为运行时枚举使用。

## 测试计划

### 单元测试

- `ensureDefaultStyles`：新用户自动创建默认风格并设置 `defaultStyleId`。
- `buildStyleSnapshot`：正确复制名称、中文提示词、英文提示词、更新时间。
- `resolveStylePrompt`：中文取中文，英文优先英文，英文为空回退中文。
- 删除风格：禁止删除最后一个风格；删除默认风格时自动切换到创建时间最早的其他风格。
- 项目风格快照：选择风格后写入快照；全局风格更新后能判断 stale。
- 资产有效风格：资产覆盖优先，否则继承项目。

### API 测试

- 风格 CRUD 和权限校验。
- 项目创建写入默认风格快照。
- 项目配置 PATCH `styleAssetId` 刷新快照。
- 全局角色、场景、道具无风格返回 `STYLE_REQUIRED`。
- 全局角色、场景、道具有风格时写入资产快照。
- 项目资产继承项目风格和覆盖风格。
- 复制全局资产到项目保留源风格快照。

### Worker 测试

- 角色图生成 prompt 包含任务快照提示词。
- 场景图和道具图生成 prompt 包含任务快照提示词。
- 分镜图和分镜变体生成 prompt 包含项目快照提示词。
- 参考图转角色生成 prompt 包含任务快照提示词。
- worker 不依赖旧 `ART_STYLES`。

### Guard 测试

新增或调整 guard，禁止业务代码继续调用旧风格枚举工具。允许默认风格种子定义文件保留风格文本。

## 实施顺序

1. 新增数据模型和风格服务层。
2. 接入默认风格初始化。
3. 接入风格资产 API 和资产中心第五类资产。
4. 改造项目创建和项目配置快照。
5. 改造全局资产和项目资产创建/复制逻辑。
6. 改造视觉任务提交，写入 `styleSnapshot`。
7. 改造 worker，只读取任务快照。
8. 移除旧 `ART_STYLES` 业务依赖。
9. 更新测试和 guard。

## 验收标准

- 新用户无需手动准备风格，也能创建项目和资产。
- 资产中心能管理风格资产。
- 项目必须有风格快照才能启动视觉相关流程。
- 全局视觉资产创建必须有风格快照。
- 项目资产默认继承项目风格，复制自全局资产时保留源风格。
- 所有视觉 worker 使用任务 `styleSnapshot` 拼接 prompt。
- 修改全局风格不会改变已提交任务和已保存项目快照。
- 项目配置能提示当前风格快照落后于全局风格。
- 业务代码不再依赖旧硬编码风格枚举。
