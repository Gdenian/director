# 风格资产实现陷阱研究

**项目:** waoowaoo 风格资产化  
**维度:** Pitfalls  
**研究日期:** 2026-04-17  
**总体置信度:** HIGH  

## 结论

风格资产不是一个单点 UI 功能。它会同时穿过 Prisma schema、资产中心统一类型、全局资产 API、项目配置、生成任务 payload、worker prompt 组装、媒体系统、React Query 缓存和 guard/test contract。最危险的做法是只新增一个 `GlobalStyle` 表和几个页面入口，却继续让旧 `artStyle` 字符串、`artStylePrompt`、`ART_STYLES`、`STYLE_PRESETS` 和 worker 内部解析各自为政。

推荐阶段验证顺序：

1. **阶段 1：数据模型与兼容契约** - 先确定 `StyleAsset` / `GlobalStyle`、项目默认风格引用、旧字段 fallback 和迁移策略。
2. **阶段 2：资产中心契约与 API** - 再把 `style` 纳入 `AssetKind`、registry、mapper、read service、query key、CRUD route 和权限测试。
3. **阶段 3：项目配置与选择体验** - 然后让项目默认风格从资产引用解析，同时保留旧 `artStyle` 字符串。
4. **阶段 4：生成任务与 prompt 单一路径** - 最后接入角色、场景、道具、分镜、变体、视频 prompt，补齐任务 payload、worker 和 prompt guard。
5. **阶段 5：迁移、回归与守卫** - 做旧项目、旧预设、旧媒体、缓存、任务恢复、全量 guard 和系统回归。

## Critical Pitfalls

### 1. 风格来源分叉，生成结果互相漂移

**What goes wrong:** 项目配置读 `NovelPromotionProject.artStyle`，资产中心读 `GlobalCharacterAppearance.artStyle` / `GlobalLocation.artStyle`，首页读 `src/lib/style-presets.ts`，worker 读 `getArtStylePrompt()`，新增风格资产又读新表，最终角色、场景、分镜和变体使用不同风格文本。  
**Why it happens:** 现有风格已分散在 `prisma/schema.prisma`、`src/lib/constants.ts`、`src/lib/style-presets.ts`、`src/app/api/user-preference/route.ts`、`src/app/api/novel-promotion/[projectId]/generate-character-image/route.ts`、`src/lib/workers/handlers/panel-image-task-handler.ts`。  
**Consequences:** 同一项目下角色像美漫、场景像写实、分镜又按旧默认值生成；用户无法判断当前风格到底来自哪里；旧测试只验证 `artStyle` 枚举，不会发现自定义风格没有进入 prompt。  
**Prevention:** 建立单一解析函数，例如 `resolveProjectStyleInstruction(projectId | payload)`，输出 `{ styleAssetId, positivePrompt, negativePrompt, legacyArtStyle, source }`；所有 API 和 worker 只消费解析结果，不直接查 `ART_STYLES` 或 `styleAsset` 表。旧 `artStyle` 只能作为 fallback。  
**Detection:** 搜索新增代码中直接调用 `getArtStylePrompt()`、`ART_STYLES.find()`、手写 `artStylePrompt` 拼接、直接读 `style.prompt` 的位置。  
**阶段验证:** 阶段 1 定义解析契约；阶段 4 用角色、场景、分镜、变体生成任务 payload 测试验证同一风格文本。  
**关联路径:** `prisma/schema.prisma`, `src/lib/constants.ts`, `src/lib/style-presets.ts`, `src/lib/workers/handlers/panel-image-task-handler.ts`, `lib/prompts/novel-promotion/single_panel_image.zh.txt`, `lib/prompts/novel-promotion/agent_shot_variant_generate.zh.txt`

### 2. 破坏旧项目兼容，导致已有项目不能生成

**What goes wrong:** 新字段 `styleAssetId` 上线后，把 `artStyle` 改成 nullable 或不再写旧字段，旧项目、用户偏好和测试 fixture 仍只有字符串风格，生成接口开始报 `INVALID_ART_STYLE` 或空 prompt。  
**Why it happens:** 现有 schema 中 `NovelPromotionProject.artStyle` 和 `UserPreference.artStyle` 都有默认值；多个 API 明确验证 `isArtStyleValue()`。  
**Consequences:** 老项目打开配置页显示空风格；项目复制或重新生成时缺少风格；历史测试如 `tests/integration/api/specific/novel-promotion-project-art-style-validation.test.ts`、`tests/integration/api/specific/user-preference-art-style-validation.test.ts` 失效。  
**Prevention:** 不删除 `artStyle` / `artStylePrompt`；新增 `styleAssetId` 时保持旧字段写入与读取 fallback。迁移可以把内置 `ART_STYLES` 生成系统风格资产，但不能要求所有旧项目立即回填成功。  
**Detection:** 用三类 fixture 验证：只有旧 `artStyle`、只有新 `styleAssetId`、两者都有但新资产不可访问。  
**阶段验证:** 阶段 1 做 schema migration 和兼容测试；阶段 5 跑旧项目回归矩阵。  
**关联路径:** `prisma/schema.prisma`, `src/app/api/projects/route.ts`, `src/app/api/user-preference/route.ts`, `src/lib/config-service.ts`, `tests/integration/api/specific/novel-promotion-project-art-style-validation.test.ts`

### 3. 把风格资产做成旁路页面，绕过统一资产抽象

**What goes wrong:** 新增 `/api/styles`、`useStyles`、`StyleCard`，但不把 `style` 纳入 `AssetKind`、`AssetSummary`、`assetKindRegistry` 和 `readAssets()`；资产中心过滤、文件夹、复制、任务状态和未来统一操作都无法识别风格。  
**Why it happens:** 当前资产抽象只支持 `'character' | 'location' | 'prop' | 'voice'`，并且 mapper、read service、registry 都是穷举类型。  
**Consequences:** UI 上看似有风格管理，但项目工作区、统一资产读取、缓存失效、folder filter 和资产动作无法复用；后续还要二次重构。  
**Prevention:** 在阶段 2 一次性扩展 `AssetKind = 'style'`、`AssetFamily = 'visual'`、`StyleAssetSummary`、`assetKindRegistryMap`、`readGlobalAssets()`、`filterAssetsByKind()` 和 query hooks。风格如果没有多变体渲染，应明确 `supportsMultipleVariants: false`，不要假装成 location-like asset。  
**Detection:** TypeScript 应强制所有 `AssetSummary` switch / union 处理 `style`；新增 `style` 后不允许用 `as unknown` 掩盖 mapper 缺口。  
**阶段验证:** 阶段 2 用 `readAssets({ scope: 'global', kind: 'style' })` 单元/集成测试验证。  
**关联路径:** `src/lib/assets/contracts.ts`, `src/lib/assets/kinds/registry.ts`, `src/lib/assets/services/read-assets.ts`, `src/lib/assets/mappers.ts`, `src/lib/query/hooks/useAssets.ts`, `src/lib/query/hooks/useGlobalAssets.ts`

### 4. API 权限只做登录校验，没有做资源归属校验

**What goes wrong:** 风格 CRUD route 只调用 `requireUserAuth()`，但更新、删除、复制、选择时没有校验 `style.userId === session.user.id` 或项目归属，导致用户能通过 ID 操作他人风格资产或把他人风格绑定到项目。  
**Why it happens:** 代码库已有公开媒体、storage sign、admin logs 权限不统一风险；`api-route-contract-guard.mjs` 只能检查是否存在认证调用，不能证明资源归属正确。  
**Consequences:** 风格 prompt、预览图和创作策略泄露；项目可引用不可见资产；删除他人资产会造成生成 fallback 混乱。  
**Prevention:** 所有 style route 使用 `apiHandler`；全局资产写操作先按 `id + userId` 查询；项目绑定风格必须用 `requireProjectAuth` 或 `requireProjectAuthLight` 验证 `projectId`，再验证风格属于同一用户或是系统风格。  
**Detection:** API contract 测试覆盖 401、403/404、跨用户 ID、系统风格只读、项目绑定他人风格。  
**阶段验证:** 阶段 2 验证资产 CRUD 权限；阶段 3 验证项目选择风格权限。  
**关联路径:** `src/lib/api-auth.ts`, `src/lib/api-errors.ts`, `src/app/api/asset-hub/**/route.ts`, `scripts/guards/api-route-contract-guard.mjs`, `tests/integration/api/contract`

### 5. 风格预览图绕过 MediaObject，重新写入 URL/key

**What goes wrong:** 风格资产预览图字段直接保存签名 URL、storage key 或任意外链，而不是 `previewMediaId` + `/m/{publicId}` / `MediaRef`。  
**Why it happens:** 当前媒体仍处于迁移兼容期，很多旧字段还叫 `imageUrl`、`customVoiceUrl`；新功能容易照抄 URL 写法。  
**Consequences:** 预览图过期、泄漏 storage key、无法引用计数、无法统一备份/迁移；`/api/storage/sign` 和 `/m/{publicId}` 的既有风险被扩大。  
**Prevention:** 风格 schema 只允许新写 `previewMediaId`；API 入参如果接受 legacy URL，必须先走 `resolveMediaRefFromLegacyValue()` 或上传接口归一化；响应只返回 `MediaRef`。  
**Detection:** 搜索 style route/service 中是否写入 `previewUrl`、`storageKey`、`signedUrl`；扩展 `image-reference-normalization-guard.mjs` 或新增 style media guard。  
**阶段验证:** 阶段 1 定义 schema；阶段 2 验证上传/更新；阶段 5 跑 media normalization guard。  
**关联路径:** `prisma/schema.prisma`, `src/lib/media/service.ts`, `src/lib/media/attach.ts`, `src/app/api/asset-hub/upload-image/route.ts`, `scripts/guards/image-reference-normalization-guard.mjs`

### 6. 任务 payload 捕获旧风格，任务恢复后使用过期或失效资产

**What goes wrong:** 任务提交时只保存 `styleAssetId`，worker 恢复时重新读取资产；用户中途编辑或删除风格后，排队任务和重试任务使用了不同 prompt。反过来，如果只保存 prompt 文本，则任务详情无法追踪来源。  
**Why it happens:** 任务系统有 DB 状态、BullMQ 状态、watchdog 恢复和 `externalId` 恢复多路径；风格资产会影响外部 provider 请求，不应在重试时漂移。  
**Consequences:** 同一个任务第一次提交和重试结果不一致；watchdog requeue 后可能复用旧 `externalId` 但 prompt 已变化；用户难以审计生成结果使用哪个风格版本。  
**Prevention:** 任务 payload 同时保存不可变快照和来源引用：`styleAssetId`、`styleVersion` 或 `styleUpdatedAt`、`positivePromptSnapshot`、`negativePromptSnapshot`、`legacyArtStyleSnapshot`。worker 只用 snapshot 生成，UI 可显示来源已变更。  
**Detection:** 人工构造任务排队后编辑/删除风格，再执行 worker，断言 provider payload 仍使用提交时 snapshot。  
**阶段验证:** 阶段 4 做任务 payload 和 worker 测试；阶段 5 做 watchdog/retry 回归。  
**关联路径:** `src/lib/task/service.ts`, `scripts/watchdog.ts`, `src/lib/workers/shared.ts`, `src/lib/workers/handlers/panel-image-task-handler.ts`, `tests/integration/task`, `tests/regression`

### 7. prompt 负向约束没有统一进入 provider，或污染非图像任务

**What goes wrong:** 风格资产包含 `negativePrompt`，但只有部分图像模型支持负向 prompt；实现者把它拼进所有 prompt，导致文本分析、分镜 JSON、视频 prompt 或不支持负向参数的 provider 输出异常。  
**Why it happens:** 当前 prompt i18n 和 provider payload 是两套边界；`lib/prompts/**` 使用 `{style}` 占位，provider 层还有模型能力和媒体模板限制。  
**Consequences:** JSON canary 失败、英文 prompt 混入中文风格、视频模型收到无效字段、OpenAI-compatible 自定义模板无法解析。  
**Prevention:** 风格解析结果分为 `styleInstructionText` 和 `negativePrompt`；prompt 模板只注入正向风格文本；provider adapter 根据能力决定是否传负向字段，不支持时合并为安全的自然语言约束或忽略并记录。  
**Detection:** 更新 prompt catalog 变量后跑 `prompt-i18n-guard.mjs`、`prompt-ab-regression.mjs`、`prompt-semantic-regression.mjs`、`prompt-json-canary-guard.mjs`；provider contract 测试断言不同 provider payload。  
**阶段验证:** 阶段 4 验证 prompt 和 provider payload。  
**关联路径:** `src/lib/prompt-i18n/catalog.ts`, `lib/prompts/novel-promotion/single_panel_image.en.txt`, `lib/prompts/novel-promotion/agent_shot_variant_generate.en.txt`, `src/lib/generator-api.ts`, `scripts/guards/prompt-json-canary-guard.mjs`

### 8. 风格资产删除策略破坏项目默认风格

**What goes wrong:** 用户删除某个风格资产后，引用它的项目 `styleAssetId` 变成悬空；下一次生成找不到风格，或者自动回退到错误默认值。  
**Why it happens:** 全局资产删除已有角色/场景/音色路径，但风格资产会被项目配置长期引用，不像普通资产只复制到项目。  
**Consequences:** 历史项目配置页报错；生成时 silently fallback，用户不知道风格变化；DB 留下无效外键或无法删除。  
**Prevention:** 推荐 `onDelete: SetNull` + 保留 `legacyArtStyleSnapshot` / `stylePromptSnapshot`；删除前返回引用项目数量；UI 明确提示“项目会保留当前风格文本快照”。系统风格资产禁止删除，只允许隐藏/禁用。  
**Detection:** 删除被项目引用的用户风格，断言项目仍能生成且 UI 显示“来源已删除，使用快照”。  
**阶段验证:** 阶段 1 定义删除语义；阶段 2/3 做 API 与 UI 回归。  
**关联路径:** `prisma/schema.prisma`, `src/app/api/asset-hub/**/route.ts`, `src/app/api/novel-promotion/[projectId]/route.ts`, `src/lib/config-service.ts`

### 9. 系统风格与用户风格的命名/来源混淆

**What goes wrong:** 把 `ART_STYLES` 迁成普通用户风格，但没有 `source` / `isSystem` / stable key；用户可编辑或删除系统默认风格，旧 `american-comic`、`realistic` 等 key 无法稳定 fallback。  
**Why it happens:** `src/lib/constants.ts` 和 `src/lib/style-presets.ts` 现在承担默认值和展示选项，后续如果直接导入数据库会丢失 stable enum 语义。  
**Consequences:** 新用户默认风格为空；旧项目 key 找不到；多语言 label 与 prompt 不一致。  
**Prevention:** 风格资产需要区分 `source: 'system' | 'user'`、`legacyKey`、`locale labels`、`isEnabled`；系统风格用 seed/migration 管理，不能通过普通 CRUD 修改 prompt。  
**Detection:** 空库启动或 seed 后，默认项目能解析 `american-comic`；禁用某系统风格后旧项目仍能 fallback。  
**阶段验证:** 阶段 1 做 seed/migration；阶段 5 做空库和旧库回归。  
**关联路径:** `src/lib/constants.ts`, `src/lib/style-presets.ts`, `src/app/[locale]/home/page.tsx`, `src/components/selectors/RatioStyleSelectors.tsx`

### 10. React Query 缓存与乐观更新没有覆盖 style，UI 显示陈旧风格

**What goes wrong:** 创建/编辑/删除风格后只 invalidate `globalCharacters`、`globalLocations`、`globalVoices`，资产中心统一列表或项目配置仍显示旧风格。  
**Why it happens:** 现有 invalidation helper 没有 `invalidateGlobalStyles()`；`useAssets`、`useGlobalAssets`、`queryKeys` 都需要新增 kind。  
**Consequences:** 用户切换风格后生成任务实际使用新风格，但 header/config/stage 仍显示旧风格；乐观回滚覆盖用户后续选择。  
**Prevention:** 新增 `queryKeys.assets.globalStyles` 或统一 assets key；style mutations 使用 `invalidateQueryTemplates`；涉及项目默认风格的 mutation 同时 invalidate project config 和 asset list。  
**Detection:** mutation 单测直接调用 `onMutate` / `onError` 验证缓存、回滚和 stale rollback。  
**阶段验证:** 阶段 2 验证资产中心缓存；阶段 3 验证项目默认风格缓存。  
**关联路径:** `src/lib/query/keys.ts`, `src/lib/query/hooks/useGlobalAssets.ts`, `src/lib/query/hooks/useAssets.ts`, `src/lib/query/mutations/asset-hub-mutations-shared.ts`, `tests/unit/optimistic/project-asset-mutations.test.ts`

### 11. 新增 route 和 task type 没有进入 contract catalog

**What goes wrong:** 新增 style CRUD、style preview generation 或 style copy route 后，route catalog、behavior matrix、task type catalog 没更新，guard 或 CI 才发现；更糟的是未进入 guard 范围。  
**Why it happens:** 仓库依赖 `tests/contracts/route-catalog.ts`、`tests/contracts/task-type-catalog.ts` 和多个 guard 做覆盖约束。  
**Consequences:** API 权限、行为测试和 task 行为没有路线图级可见性；后续回归不触发。  
**Prevention:** 每新增 `src/app/api/**/route.ts` 必须同步 route catalog 和 behavior matrix；如果新增 `TASK_TYPE.STYLE_PREVIEW`，同步 task type catalog、behavior matrix、worker handler 测试和 direct-submit contract。  
**Detection:** 必跑 `npm run test:guards`；不要只跑相关单测。  
**阶段验证:** 阶段 2 对 CRUD route；阶段 4 对生成任务 route/task type。  
**关联路径:** `scripts/guards/test-route-coverage-guard.mjs`, `scripts/guards/test-behavior-route-coverage-guard.mjs`, `scripts/guards/test-tasktype-coverage-guard.mjs`, `tests/contracts/route-catalog.ts`, `tests/contracts/task-type-catalog.ts`

### 12. 风格预览生成绕过统一 provider gateway 和计费

**What goes wrong:** 为了快速生成风格预览图，在 style API route 里直接调用 provider SDK 或 `createImageGeneratorByModel()`，绕过 `generator-api`、模型解析、计费冻结和能力检查。  
**Why it happens:** 资产中心已有直接发起生成任务的 route，新增 style preview 很容易复制旧模式；guard 主要依赖字符串扫描。  
**Consequences:** 未配置价格的模型零冻结执行；provider key 获取绕过统一配置；模型能力猜测导致请求失败或成本不可控。  
**Prevention:** 风格预览也必须走 `submitTask()` + worker + `src/lib/generator-api.ts`；不要在 route 中直接 provider call。若只是保存上传图，不创建生成任务。  
**Detection:** 跑 `no-media-provider-bypass.mjs`、`no-provider-guessing.mjs`、`no-hardcoded-model-capabilities.mjs`、`task-submit-compensation-guard.mjs`。  
**阶段验证:** 阶段 4。  
**关联路径:** `src/lib/generator-api.ts`, `src/lib/billing/task-policy.ts`, `src/lib/task/service.ts`, `scripts/guards/no-media-provider-bypass.mjs`, `scripts/guards/task-submit-compensation-guard.mjs`

## Moderate Pitfalls

### 13. 用现有 `GlobalLocation.assetKind = 'prop'` 模式复用 style，造成语义债务

**What goes wrong:** 为避免新增表，把 style 存进 `GlobalLocation`，用 `assetKind = 'style'` 区分。  
**Prevention:** 不推荐。风格没有 location images、availableSlots、selected image 等语义；应建独立模型或明确 style-specific 表，再通过 mapper 统一到 `AssetSummary`。  
**阶段验证:** 阶段 1 schema review。  
**关联路径:** `prisma/schema.prisma`, `src/lib/assets/services/location-backed-assets.ts`

### 14. 风格 prompt 过长或含结构化注入，破坏模板输出

**What goes wrong:** 用户自定义 prompt 包含 JSON 指令、语言指令或超长文本，注入到分镜/角色 prompt 后改变输出格式。  
**Prevention:** 限制字段长度；保存时去除明显模板占位符和系统级指令；对 JSON 输出类 prompt 不注入用户原文到 schema 说明附近。  
**阶段验证:** 阶段 2 保存校验；阶段 4 prompt canary。  
**关联路径:** `lib/prompts/novel-promotion/*.txt`, `scripts/guards/prompt-json-canary-guard.mjs`

### 15. 风格标签/分类和文件夹重复建模

**What goes wrong:** 风格资产同时支持 `folderId`、`tags`、`category`、`presetGroup`，但 UI 和 API 没有明确筛选优先级。  
**Prevention:** MVP 只接入现有 `GlobalAssetFolder`，标签先作为可选 JSON/文本元数据，不参与核心过滤。  
**阶段验证:** 阶段 2。  
**关联路径:** `prisma/schema.prisma`, `src/app/[locale]/workspace/asset-hub/page.tsx`

### 16. 多语言展示与 prompt 语言混在一起

**What goes wrong:** 风格资产只存中文 label 和中文 prompt，英文模板生成时混入中文，触发 semantic guard 或 provider 行为不稳定。  
**Prevention:** 系统风格存多语言 label 和 prompt；用户自定义风格默认按用户输入原文使用，但不要在英文模板里硬编码中文语言要求。  
**阶段验证:** 阶段 1 系统风格模型；阶段 4 prompt i18n guard。  
**关联路径:** `scripts/guards/prompt-i18n-guard.mjs`, `scripts/guards/prompt-semantic-regression.mjs`, `src/lib/prompt-i18n/catalog.ts`

### 17. 配置页和工作区 header 继续只显示旧 artStyle label

**What goes wrong:** 项目实际使用风格资产，但 `WorkspaceHeaderShell`、`ConfigStage`、`PromptStage` 仍用 `ART_STYLES.find()` 找 label，自定义风格显示成“自定义”或空。  
**Prevention:** 统一提供 `styleDisplayName` / `styleSourceLabel`，项目 snapshot 中包含解析后的展示字段。  
**阶段验证:** 阶段 3 UI contract。  
**关联路径:** `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/WorkspaceHeaderShell.tsx`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/ConfigStage.tsx`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/prompts-stage/runtime/promptStageRuntimeCore.tsx`

### 18. 复制到项目和“引用全局风格”语义混淆

**What goes wrong:** 角色/场景/道具是复制到项目，风格更像项目默认引用；如果照搬 copy action，会产生项目私有风格副本，用户编辑全局风格后项目是否更新变得不清楚。  
**Prevention:** 明确 MVP 语义：项目默认风格引用全局/系统风格，同时任务提交保存快照；不做自动同步副本。需要项目私有修改时另做“复制为新风格”。  
**阶段验证:** 阶段 1 产品契约；阶段 3 选择/复制 API。  
**关联路径:** `src/lib/assets/services/asset-actions.ts`, `src/lib/config-service.ts`

### 19. 缺少风格版本或审计字段，难以解释生成差异

**What goes wrong:** 用户修改风格 prompt 后，历史图片和任务只记录资产 ID，不记录当时文本。  
**Prevention:** 任务 payload 保存 snapshot；风格资产保存 `updatedAt`，必要时保存简单 `version`；生成结果 metadata 记录 style snapshot。  
**阶段验证:** 阶段 4。  
**关联路径:** `prisma/schema.prisma`, `src/lib/task/service.ts`, `src/lib/workers/shared.ts`

### 20. 文件继续膨胀，新增逻辑塞进大 route 或大 service

**What goes wrong:** 把所有 style CRUD、解析、迁移、上传、生成都塞进已有资产 route 或 `asset-actions.ts`，超过 line guard 且难以测试。  
**Prevention:** 拆成 `src/lib/styles/*` 或 `src/lib/assets/kinds/style/*`：schema validation、resolver、mapper、service、mutation 分开。  
**阶段验证:** 每阶段 review 文件大小；阶段 5 跑 `file-line-count-guard.mjs`。  
**关联路径:** `scripts/guards/file-line-count-guard.mjs`, `src/lib/assets/services/asset-actions.ts`, `src/app/api/user/api-config/route.ts`

## Minor Pitfalls

### 21. 默认风格值为空

**What goes wrong:** `STYLE_PRESETS` 当前过滤后可能为空，`DEFAULT_STYLE_PRESET_VALUE` 为 `''`；如果复用它作为资产默认，会创建空风格。  
**Prevention:** 默认项目风格继续使用稳定系统 key，例如 `american-comic`，不要用 `DEFAULT_STYLE_PRESET_VALUE` 作为数据默认。  
**阶段验证:** 阶段 1。  
**关联路径:** `src/lib/style-presets.ts`, `src/app/[locale]/home/page.tsx`

### 22. 删除/编辑系统风格没有 UI 限制

**What goes wrong:** 系统风格和用户风格用同一卡片动作，误开放编辑删除。  
**Prevention:** `capabilities` 按 source 返回不同动作；系统风格只允许复制，不允许删除和修改核心 prompt。  
**阶段验证:** 阶段 2。  
**关联路径:** `src/lib/assets/contracts.ts`, `src/lib/assets/kinds/registry.ts`

### 23. 搜索/筛选遗漏 style kind

**What goes wrong:** 资产中心 kind filter 没有 `style`，但 API 已返回风格资产，导致前端无法定位。  
**Prevention:** 统一从 `assetKindRegistry` 派生 filter，而不是在页面手写数组。  
**阶段验证:** 阶段 2 UI 测试/手测。  
**关联路径:** `src/app/[locale]/workspace/asset-hub/page.tsx`, `src/lib/assets/kinds/registry.ts`

### 24. 风格 prompt 没有空白和长度归一化

**What goes wrong:** 用户保存全空、超长或只有换行的 prompt，生成时 fallback 不可预期。  
**Prevention:** 保存时 trim；正向 prompt 必填；负向 prompt 可空；字段长度给出上限并在 API 返回统一错误。  
**阶段验证:** 阶段 2。  
**关联路径:** `src/lib/api-errors.ts`, `src/app/api/asset-hub/**/route.ts`

## Phase-Specific Warnings

| 阶段 | 主要风险 | 必须验证 |
|------|----------|----------|
| 阶段 1：数据模型与兼容契约 | 旧 `artStyle` 项目断裂、系统风格 key 不稳定、删除语义不清 | Prisma schema review；旧字段 fallback fixture；系统风格 seed；`styleAssetId` 不可访问 fallback |
| 阶段 2：资产中心契约与 API | `style` 没进入统一资产 union、API 只鉴权不验归属、媒体预览绕过 MediaObject | `AssetKind` 穷举编译；CRUD 跨用户 contract；`previewMediaId` 测试；route catalog 更新 |
| 阶段 3：项目配置与选择体验 | 项目绑定他人风格、React Query 缓存陈旧、UI 仍显示旧 label | 项目权限测试；mutation rollback 测试；header/config/prompt stage 展示同一解析结果 |
| 阶段 4：生成任务与 prompt 接入 | 任务恢复风格漂移、负向 prompt 污染、provider/计费旁路 | payload snapshot 测试；prompt guard；provider contract；task type catalog；worker retry 回归 |
| 阶段 5：迁移、回归与守卫 | 旧库迁移遗漏、guard 扫描不到新增路径、系统测试未覆盖真实链路 | `npm run test:guards`；旧项目回归；任务恢复回归；媒体归一化检查；空库 seed 检查 |

## Recommended Test/Guard Checklist

- `npm run test:guards`：覆盖 route catalog、task type catalog、prompt、provider、media、文件大小等守卫。
- `npm run test:integration:api`：覆盖 style CRUD、项目绑定、跨用户权限、旧字段兼容。
- `npm run test:integration:provider`：验证风格正向/负向 prompt 如何进入各 provider payload。
- `npm run test:integration:task`：验证任务 payload snapshot、重试和 worker 恢复。
- `npm run test:system`：至少覆盖一个从项目选择风格到生成分镜图的完整链路。

## Sources

- `.planning/PROJECT.md`
- `.planning/codebase/CONCERNS.md`
- `.planning/codebase/TESTING.md`
- `.planning/codebase/CONVENTIONS.md`
- `prisma/schema.prisma`
- `src/lib/assets/contracts.ts`
- `src/lib/assets/kinds/registry.ts`
- `src/lib/assets/services/read-assets.ts`
- `src/lib/assets/mappers.ts`
- `src/lib/style-presets.ts`
- `scripts/guards/*.mjs`
