# waoowaoo AI 影视 Studio

## What This Is

waoowaoo AI 影视 Studio 是一个面向短剧、漫画视频和小说推文创作者的 AI 创作工作台。它把小说文本拆解为剧本、角色、场景、分镜、配音和视频，并通过素材库、模型配置、异步生成任务和工作区阶段流程支撑完整创作链路。

当前项目是已有代码基础上的产品能力迭代：把“画面风格”从一次性的项目配置和硬编码预设，提升为资产中心中的一类可复用资产，让用户能自定义、管理、选择并在生成流程中持续复用风格。

## Core Value

用户可以把画面风格作为可管理资产沉淀下来，并稳定地复用于角色、场景、分镜和视频生成，减少反复填写风格提示词带来的不一致。

## Requirements

### Validated

- ✓ 用户可以注册、登录并保存个人模型/API 配置 — existing
- ✓ 用户可以创建小说推文项目，并在工作区中推进小说输入、剧本、素材、分镜、配音和视频阶段 — existing
- ✓ 用户可以在项目配置中选择画面比例、画面风格、图片模型、视频模型、语音模型和生成分辨率 — existing
- ✓ 用户可以在全局资产中心管理角色、场景、道具和音色资产 — existing
- ✓ 用户可以从全局资产中心复制角色、场景、道具和音色到项目流程中复用 — existing
- ✓ 用户可以通过异步任务生成/编辑角色图、场景图、分镜图、视频和配音，并通过任务状态与 run stream 观察进度 — existing
- ✓ 画面生成 prompt 已经把 `artStyle` / `style` 注入到角色、场景、分镜和变体生成链路 — existing
- ✓ 项目已具备 Prisma/MySQL、BullMQ/Redis、MinIO/S3、NextAuth、next-intl 和 React Query 体系 — existing

### Active

- [ ] 画面风格成为资产中心中的一类资产，和角色、场景、道具、音色并列管理。
- [ ] 用户可以在资产中心新建、编辑、删除、复制和查看自定义画面风格。
- [ ] 画面风格资产至少包含名称、描述、正向风格提示词、可选负向约束、可选预览图、可选标签/分类、创建者和系统/用户来源。
- [ ] 项目可以选择一个风格资产作为默认画面风格，替代仅保存字符串 `artStyle` 的使用方式。
- [ ] 角色、场景、道具、分镜和视频相关生成流程优先使用项目选中的风格资产，并保持与旧 `artStyle` 字符串兼容。
- [ ] 资产中心和项目工作区都能让用户清楚看到当前使用的画面风格，并能切换到已有风格资产。
- [ ] 旧项目和现有硬编码风格选项可以无损迁移或兼容，不阻断已有用户继续生成。
- [ ] 风格资产进入测试覆盖和守卫范围，避免 provider prompt、媒体引用、资产类型注册和项目配置出现分叉。

### Out of Scope

- 训练专属 LoRA / DreamBooth / 模型微调 — 当前目标是提示词和参考资产管理，不引入训练管线。
- 风格版权检测或自动合规审核 — 先建立用户可管理的风格资产能力，合规审核另起阶段。
- 社区风格市场、公开分享和付费售卖 — 先完成个人资产库和项目复用。
- 全量重构资产中心 UI — 本轮只扩展风格资产所需的管理、选择和生成接入。
- 一次性解决所有安全/计费/媒体权限问题 — 这些风险已记录在 codebase map，可在后续稳定性里程碑处理。

## Context

- 当前风格能力分散在项目配置、用户偏好、硬编码预设和 prompt 参数中，例如 `NovelPromotionProject.artStyle`、`NovelPromotionProject.artStylePrompt`、`UserPreference.artStyle`、`src/lib/style-presets.ts`、`src/components/story-input/StoryInputComposer.tsx`。
- 全局资产中心已经支持角色、场景、道具和音色，资产类型定义在 `src/lib/assets/contracts.ts` 和 `src/lib/assets/kinds/registry.ts`，页面入口是 `src/app/[locale]/workspace/asset-hub/page.tsx`。
- 全局资产 API 位于 `src/app/api/asset-hub`，已有角色、场景、道具和音色的创建、编辑、生成、上传、选择和复制模式可复用。
- 画面生成 prompt 已经有风格占位，例如 `lib/prompts/novel-promotion/single_panel_image.zh.txt`、`lib/prompts/novel-promotion/agent_shot_variant_generate.zh.txt`。
- 项目数据模型中已有 `artStyle` 和 `artStylePrompt` 字段，但没有独立 StyleAsset / GlobalStyle 模型，也没有风格预览图或风格级复用记录。
- 资产中心 UI 目前有全局素材过滤、文件夹、卡片网格和资产动作，需要新增风格资产的卡片、表单和选择入口。
- 这次初始化基于 `.planning/codebase/` 的 brownfield 映射，后续规划必须尊重已有 task、media、asset、billing、run-runtime 和 query mutation 边界。

## Constraints

- **Tech stack**: 保持 Next.js 15 + React 19 + Prisma + MySQL + BullMQ + Redis + MinIO/S3 的既有架构，不引入新框架。
- **Backward compatibility**: 已有项目的 `artStyle` 字符串和 `artStylePrompt` 必须继续可用，迁移不能让旧项目失去生成能力。
- **Asset boundary**: 风格应进入资产中心的统一资产抽象，而不是只增加新的本地状态或独立页面。
- **Prompt consistency**: 角色、场景、道具、分镜、变体和视频相关 prompt 使用同一风格解析来源，避免多套风格文案互相漂移。
- **Media handling**: 风格预览图如果存在，必须使用现有 `MediaObject` / `MediaRef` / `/m/{publicId}` 路径，不新增直写 URL 模式。
- **Security**: 新增风格 API 必须显式走 `requireUserAuth` 或项目权限检查，避免重复已有 storage/admin 权限风险。
- **Testing**: 任何资产类型、Prisma schema、query mutation、prompt assembler 和迁移兼容变更都要配套单元或集成测试。

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 将画面风格建模为资产中心资产 | 用户明确认为画面风格属于资产，并希望能自定义增加；这也符合角色/场景/道具/音色的复用心智 | — Pending |
| 优先做产品能力而非稳定性专项 | 当前用户目标是调整风格管理体验，先围绕创作能力建立路线图 | — Pending |
| 保留旧 `artStyle` 字符串兼容层 | 现有项目、用户偏好和 prompt 链路都依赖该字段，直接替换风险高 | — Pending |
| 风格资产预览图走现有媒体系统 | 避免扩大媒体迁移债务，保持 `MediaObject` 和 `MediaRef` 单一路径 | — Pending |
| 工作流使用 YOLO + standard + parallel + research/check/verifier | 这是跨数据模型、API、UI、生成链路和迁移的中等复杂度迭代，需要完整规划与验证 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-17 after initialization*
