# 项目研究摘要

**Project:** waoowaoo AI 影视 Studio  
**Domain:** AI 影视创作工作台 / 画面风格资产化  
**Researched:** 2026-04-17  
**Confidence:** HIGH  

## Executive Summary

本轮目标不是新增一个风格下拉框，而是把“画面风格”提升为资产中心的一等资产。专家实现路径应沿用当前 brownfield 架构：Next.js API Route、Prisma/MySQL、React Query、统一资产合约、MediaObject/MediaRef 和 BullMQ worker，而不是引入新框架、新存储、新训练管线或旁路风格系统。

推荐做法是新增 `GlobalStyle` 数据模型和 `NovelPromotionProject.styleAssetId`，同时保留 `NovelPromotionProject.artStyle`、`NovelPromotionProject.artStylePrompt`、`UserPreference.artStyle` 和 `src/lib/constants.ts` 的 `ART_STYLES` 作为兼容 fallback。风格资产必须进入 `src/lib/assets/contracts.ts`、`src/lib/assets/kinds/registry.ts`、`src/lib/assets/mappers.ts`、`src/lib/assets/services/read-assets.ts` 和 `/api/assets` 统一链路，然后再接入资产中心 UI、项目配置和生成 worker。

最大风险是风格来源分叉：资产中心、项目配置、旧枚举、用户偏好和 worker 各自解析风格，导致角色、场景、分镜和视频使用不同风格文本。防护策略是先建立单一风格解析服务与兼容契约，再做 CRUD/UI，最后把所有生成链路迁到同一 resolver，并用任务 payload snapshot、权限测试、媒体归一化 guard 和旧项目回归守住稳定性。

## Key Findings

### Recommended Stack

风格资产化应完全复用既有技术栈，不新增数据库、队列、对象存储、GraphQL/tRPC、训练系统或前端本地风格库。核心是一次资产类型扩展和生成链路收敛：把 `style` 作为第五类资产加入统一资产域，并通过风格解析服务输出稳定 prompt。

**Core technologies:**
- Next.js 15 API Route：继续使用 `src/app/api/**/route.ts`、`apiHandler()` 和现有鉴权模式，避免旁路 API。
- React 19 + React Query：复用 `src/lib/query/hooks/useAssets.ts`、`src/lib/query/keys.ts` 和 mutation invalidation 管理资产列表、项目配置和缓存回滚。
- Prisma + MySQL：新增 `GlobalStyle`、`NovelPromotionProject.styleAssetId` 和必要关系，保留旧字段兼容。
- BullMQ + Redis：不为风格 CRUD 新增任务；只有未来自动生成预览图时才复用现有 task/worker。
- MinIO/S3 + MediaObject/MediaRef：风格预览图必须走 `MediaObject`、`MediaRef`、`/m/{publicId}` 和 `src/lib/media/attach.ts`，不直写签名 URL 或 storage key。
- next-intl：新增资产中心、项目配置、选择器和错误提示文案需要同步 `messages/zh` 与 `messages/en`。

**Critical version/stack requirements:**
- 保持 Next.js 15 + React 19 + Prisma/MySQL + BullMQ/Redis + MinIO/S3 现状。
- 保持 NextAuth/`requireUserAuth()` 与项目权限检查体系。
- `ART_STYLES` 和 `getArtStylePrompt()` 降级为系统种子与 legacy fallback，不再作为唯一主数据源。

### Expected Features

v1 的用户价值是“用户能在资产中心自定义、管理、选择并复用画面风格，并且旧项目不坏”。所有 table stakes 都应围绕这个闭环，不扩展到训练、市场或复杂实验室。

**Must have (table stakes):**
- 资产中心出现“画面风格”类型：扩展 `src/lib/assets/contracts.ts`、`src/lib/assets/kinds/registry.ts`、`src/lib/assets/grouping.ts`、`src/app/[locale]/workspace/asset-hub/components/AssetGrid.tsx`。
- 风格资产列表和卡片：展示名称、描述/提示词摘要、来源、可选预览图和标签。
- 新建/编辑/删除用户风格：字段至少包含名称、描述、正向提示词、负向约束、标签、预览图和来源。
- 系统风格复制为用户风格：从 `src/lib/constants.ts` 的 `ART_STYLES` 种子化，系统项只读但可复制。
- 文件夹/筛选支持风格：`GlobalAssetFolder` 和资产中心筛选应识别 `style`。
- 首页快速创建可选择风格资产：接入 `src/app/[locale]/home/page.tsx` 和 `src/components/story-input/StoryInputComposer.tsx`。
- 项目故事输入/配置阶段可选择风格资产：接入 `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/NovelInputStage.tsx`、`ConfigStage.tsx`。
- 项目保存默认风格资产引用：新增 `styleAssetId`，同时保留旧 `artStyle` 和 `artStylePrompt`。
- 生成链路使用同一 resolved style prompt：角色、场景、道具、分镜、变体和分析流程必须走同一 resolver。
- 旧项目兼容：只有旧 `artStyle` 的项目仍显示、保存和生成正常。
- 国际化文案：资产中心 tab、表单、空状态、确认弹窗和错误提示都进入 next-intl。

**Should have (competitive, v1 后半或 v1.1):**
- 手动上传/引用风格预览图：用现有媒体系统降低纯文本风格选择成本。
- 风格使用快照：任务 payload 和项目展示能说明生成时使用的风格文本。
- 最近使用/基础排序：资产增多后提高选择效率，但不阻塞 v1。

**Defer (v2+):**
- 自动生成风格预览图：涉及图片任务、计费、媒体归档、失败状态和 provider 能力。
- 从参考图提取风格：涉及多模态理解、版权边界和 prompt 质量评估。
- 风格强度滑杆/风格对比试生成：会放大 provider 成本、并发和 UI 复杂度。
- 风格版本历史/漂移检测/按模型适配 prompt：有价值但需要单独设计版本、provider matrix 和 canary。
- 社区市场、公开分享、付费售卖、LoRA/DreamBooth/模型微调：明确不属于当前 v1。
- 风格包/完整视觉系统包：当前只做画面风格 prompt/预览资产，不扩展到字幕、字体、剪辑节奏。

### Architecture Approach

架构上应把风格做成轻量视觉资产：全局可管理、项目可引用、生成时可解析、任务可快照。不要把风格塞进 `GlobalLocation`，也不要把它作为项目资产复制；角色/场景/道具复制到项目是图片编辑语义，风格默认是项目配置引用语义。

**Major components:**
1. `prisma/schema.prisma` — 新增 `GlobalStyle`、`NovelPromotionProject.styleAssetId`，关联 `User`、`GlobalAssetFolder`、`MediaObject` 和项目。
2. `src/lib/assets/contracts.ts` — 增加 `AssetKind = 'style'` 与 `StyleAssetSummary`。
3. `src/lib/assets/kinds/registry.ts` — 注册 `style`，`family: 'visual'`，关闭多变体生成/选择/修改能力，保留 CRUD、复制和可选预览上传。
4. `src/lib/assets/mappers.ts` — 新增 `mapGlobalStyleToAsset()`，不要构造空 `variants`。
5. `src/lib/assets/services/read-assets.ts` — 支持 `readGlobalAssets({ kind: 'style' })` 和 folder 筛选。
6. `src/app/api/assets/route.ts` / `src/app/api/assets/[assetId]/route.ts` — 支持风格 GET/POST/PATCH/DELETE，并复用 style service。
7. `src/app/api/asset-hub/picker/route.ts` — 支持 `type=style`，供项目配置选择器读取轻量选项。
8. `src/lib/query/keys.ts`、`src/lib/query/hooks/useAssets.ts`、`src/lib/query/mutations/*` — 支持 style 缓存、CRUD mutation、项目风格 mutation 和 invalidation。
9. `src/app/[locale]/workspace/asset-hub/page.tsx`、`StyleCard.tsx`、`StyleEditorModal.tsx` — 实现资产中心管理体验。
10. `src/app/api/novel-promotion/[projectId]/route.ts` — PATCH `styleAssetId`，校验项目权限和风格归属。
11. `src/lib/assets/services/resolve-style-context.ts` 或 `src/lib/style/resolve-style-context.ts` — 唯一风格解析边界。
12. `src/lib/workers/handlers/*` — 角色、场景、分镜、变体、参考图转角色和小说分析统一消费 resolver 输出。

**Resolver priority:**
1. 任务 payload 中的 `stylePromptSnapshot` / `styleAssetId`。
2. `NovelPromotionProject.styleAssetId` 指向的 `GlobalStyle`。
3. `NovelPromotionProject.artStylePrompt`。
4. `NovelPromotionProject.artStyle` 经 `getArtStylePrompt()` 解析。
5. `UserPreference.artStyle` 或默认 `american-comic`。
6. 空风格 fallback：“与参考图风格一致”。

### Critical Pitfalls

1. **风格来源分叉** — 建单一 resolver；禁止 worker、API 和 UI 各自调用 `getArtStylePrompt()` 或直接查 `GlobalStyle` 拼 prompt。
2. **旧项目兼容破坏** — 不删除、不重命名旧 `artStyle` / `artStylePrompt`；用 fixture 覆盖旧字段、新字段、双字段和不可访问资产。
3. **旁路资产系统** — `style` 必须进入 `AssetKind`、registry、mapper、read service、query hooks 和资产中心筛选；不要只做 `/api/styles` + `useStyles`。
4. **权限只校验登录不校验归属** — 风格 CRUD 用 `id + userId` 查询；项目绑定先校验项目权限，再校验风格属于用户或系统只读。
5. **预览图绕过媒体系统** — schema 和 API 优先 `previewMediaId` / `MediaRef`；不保存签名 URL、storage key 或任意外链。
6. **任务恢复后风格漂移** — payload 同时保存 `styleAssetId`、`styleUpdatedAt`/version、正向/负向 prompt snapshot 和 legacy key。
7. **负向 prompt 污染非图像任务** — resolver 输出分离 `styleInstructionText` 与 `negativePrompt`；provider adapter 按能力处理，不把负向约束无脑注入 JSON/文本分析 prompt。
8. **删除风格导致项目断链** — 推荐 `onDelete: SetNull` + prompt snapshot，或第一版禁止删除被项目引用的风格；系统风格只允许复制/隐藏。

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: 数据模型与兼容契约
**Rationale:** 所有后续 UI/API/worker 都依赖 schema、旧字段 fallback 和删除语义；先定契约能避免返工。  
**Delivers:** `GlobalStyle`、`NovelPromotionProject.styleAssetId`、系统风格 seed/legacy key、风格解析服务骨架、旧项目 fallback fixture。  
**Addresses:** 项目保存默认风格资产、旧项目兼容、系统风格种子迁移。  
**Avoids:** 旧项目不能生成、系统风格 key 混乱、删除策略不清、默认风格为空。  
**Concrete paths:** `prisma/schema.prisma`、`src/lib/constants.ts`、`src/lib/config-service.ts`、`src/lib/assets/services/resolve-style-context.ts`。

### Phase 2: 资产合约、读取 API 与权限
**Rationale:** 先让 `style` 成为统一资产类型，再做管理 UI；否则会形成旁路页面和二次重构。  
**Delivers:** `AssetKind='style'`、`StyleAssetSummary`、registry、mapper、read-assets、`/api/assets?kind=style`、style CRUD service、权限和媒体预览写入规则。  
**Addresses:** 资产中心新增风格类型、列表基础、文件夹/筛选基础、系统风格只读/复制语义。  
**Avoids:** 绕过统一资产抽象、跨用户风格操作、预览图绕过 `MediaObject`、React Query union 漏处理。  
**Concrete paths:** `src/lib/assets/contracts.ts`、`src/lib/assets/kinds/registry.ts`、`src/lib/assets/mappers.ts`、`src/lib/assets/services/read-assets.ts`、`src/app/api/assets/route.ts`、`src/app/api/assets/[assetId]/route.ts`、`src/lib/media/attach.ts`。

### Phase 3: 资产中心风格管理 UI
**Rationale:** API 可用后再做可见管理闭环，确保用户能创建、编辑、删除、复制和上传预览。  
**Delivers:** 风格 tab/filter、新增菜单、`StyleCard.tsx`、`StyleEditorModal.tsx`、创建/编辑/删除/复制系统风格、可选预览图和标签、i18n 文案。  
**Addresses:** 自定义新增、编辑迭代、删除/清理、风格列表卡片、文件夹/筛选、系统风格复制。  
**Avoids:** 把风格塞进 `LocationCard.tsx`、系统风格误编辑删除、搜索/筛选遗漏 `style`、空白/超长 prompt 保存。  
**Concrete paths:** `src/app/[locale]/workspace/asset-hub/page.tsx`、`src/app/[locale]/workspace/asset-hub/components/AssetGrid.tsx`、`src/app/[locale]/workspace/asset-hub/components/StyleCard.tsx`、`src/app/[locale]/workspace/asset-hub/components/StyleEditorModal.tsx`、`messages/zh`、`messages/en`。

### Phase 4: 项目默认风格选择与展示
**Rationale:** 风格资产必须进入项目创建和项目内继续创作，才能影响后续生成，而不只是资产中心孤岛。  
**Delivers:** 首页和项目阶段风格资产选择器、`styleAssetId` PATCH、项目 data 返回 `styleAsset` 摘要、header/config/prompt stage 统一显示 resolved style、React Query invalidation。  
**Addresses:** 首页快速创建选择风格、项目故事输入选择风格、项目保存默认风格、旧 `artStyle` fallback 显示。  
**Avoids:** 项目绑定他人风格、缓存陈旧、UI 仍显示旧枚举 label、`artStyle` 和 `styleAssetId` 双写冲突。  
**Concrete paths:** `src/app/[locale]/home/page.tsx`、`src/components/story-input/StoryInputComposer.tsx`、`src/components/selectors/RatioStyleSelectors.tsx`、`src/app/api/novel-promotion/[projectId]/route.ts`、`src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/ConfigStage.tsx`、`src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/NovelInputStage.tsx`、`src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/WorkspaceHeaderShell.tsx`。

### Phase 5: 生成链路统一接入与任务快照
**Rationale:** 这是最容易产生行为漂移的阶段，必须在项目选择稳定后再收敛所有 worker 和 prompt assembler。  
**Delivers:** worker 调用统一 resolver、任务 payload 保存 style snapshot、负向 prompt 处理策略、角色/场景/道具/分镜/变体/分析路径一致、provider payload contract。  
**Addresses:** 生成链路使用同一风格解析结果、旧项目继续生成、风格编辑/删除后任务可复现。  
**Avoids:** worker 各自拼风格、任务 retry 漂移、负向 prompt 污染 JSON/非图像 prompt、provider/计费旁路。  
**Concrete paths:** `src/lib/workers/handlers/character-image-task-handler.ts`、`src/lib/workers/handlers/location-image-task-handler.ts`、`src/lib/workers/handlers/panel-image-task-handler.ts`、`src/lib/workers/handlers/panel-variant-task-handler.ts`、`src/lib/workers/handlers/asset-hub-image-task-handler.ts`、`src/lib/workers/handlers/reference-to-character.ts`、`src/lib/workers/handlers/analyze-novel.ts`、`src/lib/assets/services/asset-actions.ts`、`lib/prompts/novel-promotion/single_panel_image.zh.txt`、`lib/prompts/novel-promotion/agent_shot_variant_generate.zh.txt`。

### Phase 6: 迁移、回归测试与守卫
**Rationale:** 风格资产跨 schema、API、UI、prompt、媒体、任务和缓存；最后必须用旧库/空库/真实生成链路回归确认没有隐性断裂。  
**Delivers:** 系统风格 seed/迁移、旧项目矩阵、API 权限矩阵、媒体归一化 guard、prompt guard、task retry/watchdog 回归、route/task catalog 更新。  
**Addresses:** v1 发布稳定性、旧项目兼容、系统风格 fallback、任务恢复。  
**Avoids:** route catalog 遗漏、task type 遗漏、prompt canary 失败、媒体 URL 债务扩大、文件膨胀。  
**Concrete paths:** `tests/contracts/route-catalog.ts`、`tests/contracts/task-type-catalog.ts`、`scripts/guards/test-route-coverage-guard.mjs`、`scripts/guards/test-tasktype-coverage-guard.mjs`、`scripts/guards/image-reference-normalization-guard.mjs`、`scripts/guards/prompt-json-canary-guard.mjs`、`scripts/watchdog.ts`。

### Phase Ordering Rationale

- 数据模型和 resolver 优先，因为 UI、API 和 worker 都依赖字段、fallback 顺序、删除语义和系统风格 key。
- 资产合约/API 早于 UI，因为 `style` 必须进入统一资产 union，才能复用文件夹、筛选、权限、媒体、缓存和未来动作。
- 项目选择晚于资产中心 CRUD，因为项目默认风格需要可选资产源和 picker 数据。
- 生成链路晚于项目配置，因为 worker 应消费最终 resolved style，而不是先按旧枚举扩展更多分叉。
- 迁移与 guard 收尾是必需阶段，不应压缩到实现阶段中；风险横跨 schema、provider、prompt、任务恢复和旧项目。

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** 需要确认 `GlobalStyle` 是否支持系统级共享 owner，还是按用户懒创建系统风格副本。
- **Phase 4:** 需要查项目 data API 与 `useProjectData` 的具体返回结构，避免前端为当前风格产生 N+1 请求。
- **Phase 5:** 需要 `/gsd-research-phase` 或至少专项 grep，确认所有 `artStyle`、`getArtStylePrompt()`、`style` prompt 注入点和 provider negative prompt 能力。
- **Phase 6:** 需要结合 `.planning/codebase/TESTING.md` 和现有 scripts 确认最小必跑测试矩阵。

Phases with standard patterns (skip research-phase unless implementation发现漂移):
- **Phase 2:** 资产合约、mapper、read service、API route 和权限测试已有清晰本地模式。
- **Phase 3:** 资产中心卡片、弹窗、文件夹和 mutation 模式已有角色/场景/音色可参考。
- **Phase 6:** guard/catal​​og 更新是仓库既有流程，但测试矩阵需要执行确认。

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | 研究直接基于 `.planning/PROJECT.md`、`.planning/codebase/*` 和现有 Next.js/Prisma/React Query/worker/Media 路径；结论是不引入新栈。 |
| Features | HIGH | 用户目标明确，FEATURES.md 已拆分 table stakes、differentiators 和 anti-features；v1 范围清晰。 |
| Architecture | HIGH | 资产合约、registry、mapper、read service、API、query、worker/prompt 链路都有具体文件依据。 |
| Pitfalls | HIGH | PITFALLS.md 覆盖 schema、权限、媒体、任务、prompt、缓存、guard 和旧项目兼容，且每项有检测路径。 |

**Overall confidence:** HIGH

### Gaps to Address

- 系统风格存储策略：确认是否有全局 system owner；没有则采用每用户懒创建或 seed 副本，并保留 `legacyKey`。
- 项目快照深度：MVP 至少任务 payload 保存 prompt snapshot；是否在项目表也保存 `stylePositivePromptSnapshot` / `styleNegativePromptSnapshot` 需 Phase 1 定。
- 删除策略：推荐第一版禁止删除被项目引用的用户风格，或 `SetNull + snapshot`；需求阶段必须明确 UX。
- 负向 prompt provider 支持：Phase 5 前确认各 provider 能否使用 native negative prompt；不支持时只作为安全自然语言约束处理。
- 风格预览图：v1 推荐只支持上传/引用；自动生成预览图进入 v2，避免引入计费和任务复杂度。
- 项目 data 返回位置：Phase 4 需要查 `src/lib/query/hooks/useProjectData.ts` 和对应 API，确保 header/config/stage 同源显示。

## Sources

### Primary (HIGH confidence)
- `.planning/PROJECT.md` — 项目目标、约束、active requirements、既有上下文。
- `.planning/research/STACK.md` — 推荐栈内方案、Prisma/API/UI/worker 接入点、测试守卫。
- `.planning/research/FEATURES.md` — v1 table stakes、差异化功能、anti-features、验收标准。
- `.planning/research/ARCHITECTURE.md` — 数据模型、资产契约、API、React Query、项目配置、prompt/worker 数据流。
- `.planning/research/PITFALLS.md` — critical/moderate/minor pitfalls、phase-specific warnings、test/guard checklist。
- `prisma/schema.prisma` — 新增 `GlobalStyle` 和项目引用的主落点。
- `src/lib/assets/contracts.ts` — `AssetKind`、`AssetSummary` 和 style summary 扩展点。
- `src/lib/assets/kinds/registry.ts` — style 能力开关和资产行为注册。
- `src/lib/assets/mappers.ts` — `GlobalStyle` 到统一资产摘要映射。
- `src/lib/assets/services/read-assets.ts` — 全局资产读取和 `kind=style` 支持。
- `src/app/api/assets/route.ts`、`src/app/api/assets/[assetId]/route.ts` — 风格资产统一 API 入口。
- `src/app/api/novel-promotion/[projectId]/route.ts` — 项目默认风格保存入口。
- `src/app/[locale]/workspace/asset-hub/page.tsx`、`src/app/[locale]/workspace/asset-hub/components/AssetGrid.tsx` — 资产中心 UI 接入点。
- `src/app/[locale]/home/page.tsx`、`src/components/story-input/StoryInputComposer.tsx`、`src/components/selectors/RatioStyleSelectors.tsx` — 首页/输入阶段风格选择入口。
- `src/lib/workers/handlers/character-image-task-handler.ts`、`src/lib/workers/handlers/location-image-task-handler.ts`、`src/lib/workers/handlers/panel-image-task-handler.ts`、`src/lib/workers/handlers/panel-variant-task-handler.ts` — 生成链路接入点。

### Secondary (MEDIUM confidence)
- `.planning/codebase/ARCHITECTURE.md` — 既有架构背景。
- `.planning/codebase/STRUCTURE.md` — 项目结构和模块位置。
- `.planning/codebase/TESTING.md` — 测试和 guard 期望。
- `.planning/codebase/CONCERNS.md` — 权限、媒体、任务等既有风险背景。
- `src/lib/query/hooks/useAssets.ts`、`src/lib/query/keys.ts`、`src/lib/query/mutations/asset-hub-*.ts` — React Query 接入模式。
- `src/lib/media/attach.ts`、`src/lib/media/service.ts` — MediaRef/MediaObject 归一化模式。
- `src/lib/constants.ts`、`src/lib/style-presets.ts` — legacy/system style source。
- `lib/prompts/novel-promotion/single_panel_image.zh.txt`、`lib/prompts/novel-promotion/agent_shot_variant_generate.zh.txt` — prompt style 占位和注入目标。

### Tertiary (LOW confidence)
- 无外部低置信来源；本摘要主要基于仓库内研究文件和代码路径。剩余不确定性已列入 gaps。

---
*Research completed: 2026-04-17*  
*Ready for roadmap: yes*
