# Feature Landscape

**领域：** AI 影视 Studio 的画面风格资产化  
**研究日期：** 2026-04-17  
**研究维度：** Features  
**总体判断：** v1 应把“画面风格”做成资产中心中的轻量可复用资产，而不是做成复杂风格训练、市场或生成实验室。用户明确要“画面风格也属于一种资产，放到资产中心用户可以自己自定义的增加”，因此第一优先级是让用户能创建、管理、选择、复用，并让旧的 `artStyle` 字符串继续工作。

## 当前产品事实

- 资产中心入口是 `src/app/[locale]/workspace/asset-hub/page.tsx`，当前已有角色、场景、道具、音色的新增、编辑、删除、筛选、文件夹、下载和弹窗管理能力。
- 资产网格在 `src/app/[locale]/workspace/asset-hub/components/AssetGrid.tsx` 中只支持 `all | character | location | prop | voice` 过滤和新增菜单。
- 资产类型合同在 `src/lib/assets/contracts.ts`，`AssetKind` 当前只有 `character | location | prop | voice`；资产注册在 `src/lib/assets/kinds/registry.ts`，没有 `style`。
- 首页快速创建在 `src/app/[locale]/home/page.tsx` 使用 `ART_STYLES`，项目故事输入阶段在 `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/NovelInputStage.tsx` 也使用 `ART_STYLES`。
- 公共输入组件 `src/components/story-input/StoryInputComposer.tsx` 只接收 `artStyle: string` 和 `styleOptions`；实际下拉 UI 在 `src/components/selectors/RatioStyleSelectors.tsx` 的 `StyleSelector` 中，只显示硬编码选项。
- 现有硬编码风格源在 `src/lib/constants.ts` 的 `ART_STYLES` 和 `getArtStylePrompt()`；项目表 `prisma/schema.prisma` 已有 `NovelPromotionProject.artStyle`、`NovelPromotionProject.artStylePrompt`，用户偏好也有 `UserPreference.artStyle`。
- 现有风格预设 `src/lib/style-presets.ts` 当前没有启用项，且更像“题材/氛围预设”，不应和资产中心里的画面风格资产混为一体。

## Table Stakes

v1 必须具备。缺失会让“风格资产化”在用户眼里不成立。

| 功能 | 为什么必须有 | 复杂度 | 落点/备注 |
|---|---|---:|---|
| 资产中心新增“画面风格”类型 | 用户明确要求风格属于资产中心能力，必须和角色、场景、道具、音色并列出现 | 中 | 扩展 `src/lib/assets/contracts.ts` 的 `AssetKind`，扩展 `src/lib/assets/kinds/registry.ts`，扩展 `src/lib/assets/grouping.ts`，扩展 `src/app/[locale]/workspace/asset-hub/components/AssetGrid.tsx` 的筛选和新增菜单 |
| 风格资产列表和卡片 | 用户要能看到已经沉淀的风格，区分系统风格和自己新增的风格 | 中 | 新增类似 `StyleCard` 的卡片组件，展示名称、描述/提示词摘要、来源、预览图、标签；接入 `src/app/[locale]/workspace/asset-hub/page.tsx` |
| 新建风格资产 | “自己自定义的增加”是本轮核心用户价值 | 中 | 表单字段建议：名称、描述、正向风格提示词、可选负向约束、可选标签/分类、可选预览图；新增 API 建议走 `src/app/api/asset-hub/styles/route.ts` |
| 编辑风格资产 | 风格提示词通常需要迭代，不可编辑会迫使用户删除重建 | 中 | 支持编辑名称、描述、正向提示词、负向约束、标签、预览图；系统内置风格可复制但不直接编辑 |
| 删除/归档用户风格 | 资产中心已有管理心智，用户会期望能清理不用的风格 | 低-中 | 删除前提示“已被项目使用则不会影响旧项目生成，项目保留快照/兼容字符串”；避免硬删除导致旧项目空引用 |
| 复制/从系统风格另存为 | 现有 `ART_STYLES` 是迁移起点，用户常见路径是基于“漫画风/真人风格”等微调 | 低-中 | 将 `src/lib/constants.ts` 中的现有风格作为系统来源种子；卡片提供“复制为我的风格” |
| 资产中心文件夹/筛选支持风格 | 当前资产中心有文件夹和类型筛选，风格必须进入同一管理体验 | 中 | `GlobalAssetFolder` 当前关联角色、场景、音色，风格资产也应支持 `folderId`；AssetGrid 增加 `style` tab |
| 首页快速创建可选择风格资产 | 首页是创建项目入口；如果只能选硬编码风格，新资产无法进入项目 | 中 | `src/app/[locale]/home/page.tsx` 从资产 API 或专用 hook 获取风格资产，传给 `StoryInputComposer`；保留默认系统风格 |
| 项目故事输入阶段可选择风格资产 | 项目内继续创作时必须能切换到已保存风格 | 中 | `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/NovelInputStage.tsx` 需要支持风格资产选项，而不是只 map `ART_STYLES` |
| 风格选择器显示资产语义 | 现有 `StyleSelector` 只显示 label，资产化后需要显示来源、摘要或预览，否则用户无法分辨自定义风格 | 低-中 | 改造 `src/components/selectors/RatioStyleSelectors.tsx` 或新增 `StyleAssetSelector`；v1 不需要复杂图库，但至少要显示名称、来源和摘要 |
| 项目保存默认风格资产 | 风格资产必须影响后续角色、场景、分镜、视频生成，而不是只影响首页创建瞬间 | 中-高 | 在 `prisma/schema.prisma` 保留 `artStyle`/`artStylePrompt` 兼容，同时新增风格资产引用或保存风格快照；项目数据 API 要返回当前风格 |
| 生成链路使用同一风格解析结果 | 角色、场景、道具、分镜都已使用 `artStyle`/`style`，v1 必须避免不同链路读不同提示词 | 高 | 建议新增统一 resolver，例如 `src/lib/style-assets/resolve-style.ts`，供 prompt assembler、asset generate 和 project config 共用 |
| 旧项目兼容 | 直接替换 `artStyle` 会破坏已有项目和用户偏好 | 中 | `NovelPromotionProject.artStyle`、`NovelPromotionProject.artStylePrompt` 继续有效；找不到风格资产时回退 `getArtStylePrompt()` |
| 内置风格种子迁移 | 当前 `ART_STYLES` 代表用户已熟悉的选项，不能消失 | 中 | 系统风格作为 `source=system` 资产展示；用户可以复制但不能破坏全局默认 |
| 国际化文案 | 项目使用 `next-intl`，资产中心新增类型、表单、空状态、确认文案必须进入 messages | 低 | 更新 `messages/zh` 和 `messages/en`，尤其是 `assetHub`、`home`、`novelPromotion` 相关 key |

## Differentiators

有价值，但不应挤进 v1，除非 v1 基础已经稳定。

| 功能 | 价值 | 复杂度 | 后置原因 |
|---|---|---:|---|
| 风格预览图生成 | 用户能直观看出风格差异，降低纯 prompt 选择成本 | 中-高 | 需要图片任务、计费、媒体归档和失败状态；v1 可先支持上传/手动预览图，自动生成放后置 |
| 一键从参考图提取风格 | 把用户图片转成风格 prompt，差异化强 | 高 | 涉及视觉理解、版权/相似度边界、prompt 质量评估；适合风格资产基础完成后单独做 |
| 风格强度滑杆 | 允许“轻微国漫/强烈赛博”等控制 | 中 | 生成模型对强度语义不一定稳定；v1 用清晰提示词更可靠 |
| 风格对比试生成 | 同一文本用多个风格小样对比 | 高 | 会放大图片生成成本、任务并发和 UI 复杂度；可在后续做成实验功能 |
| 项目内风格版本历史 | 追踪风格提示词变化，方便回滚 | 中 | v1 只要保存项目快照和资产更新时间即可；完整版本管理后置 |
| 风格包/系列 | 一组风格包含画面、色彩、镜头、字体、字幕等 | 高 | 当前需求是画面风格资产，不应扩展到完整视觉系统包 |
| 团队/社区风格分享 | 提升资产复用和增长 | 高 | 权限、审核、版权、市场排序都会扩大范围；当前项目只有个人资产中心心智 |
| 自动检测项目风格漂移 | 检查角色/场景/分镜是否偏离目标风格 | 高 | 需要视觉评估或多模态审查，属于质量控制高级能力 |
| 按模型适配风格 prompt | 同一风格对 Seedream、Banana、Imagen 输出不同 prompt | 中-高 | 有潜在价值，但需要模型能力矩阵和 canary；v1 先统一正向/负向提示词 |
| 风格收藏/最近使用/使用次数排序 | 资产多了以后能提高效率 | 低-中 | v1 用户资产数量有限；可先用创建时间、文件夹和搜索解决 |

## Anti-Features

v1 不该做。做了会拖慢交付或制造错误心智。

| 反功能 | 为什么避免 | 应该怎么做 |
|---|---|---|
| LoRA/DreamBooth/模型微调 | 这不是资产中心轻量管理能力，会引入训练数据、GPU、版权、成本和排队系统 | 只管理提示词、负向约束和预览图；训练能力另立里程碑 |
| 风格市场/公开售卖 | 会引入审核、版权、分成、举报、公开权限和搜索排序 | v1 只做个人资产库和系统内置风格 |
| 直接删除已被项目使用的风格并让项目断链 | 会让旧项目无法稳定复现，破坏创作链路 | 项目保存风格快照；删除资产只影响未来选择 |
| 把风格预设 `STYLE_PRESETS` 当成风格资产 | `src/lib/style-presets.ts` 当前更像题材/氛围预设，不是画面风格资产 | 保持“画面风格资产”和“题材/氛围预设”概念分离 |
| 只在首页支持自定义风格 | 用户进入项目后还会继续调整和生成素材，只在入口支持会形成断层 | 首页和项目故事输入阶段都必须接入同一风格资产选择器 |
| 只保存风格名称，不保存提示词快照 | 用户后续编辑风格会改变历史项目生成结果，难以复现 | 项目保存 `styleAssetId` 加 resolved snapshot，旧字段继续兼容 |
| 让每个生成入口各自解析风格 | 角色、场景、道具、分镜 prompt 会漂移，测试也难覆盖 | 建统一风格 resolver，所有 prompt assembler 和生成 API 复用 |
| 风格资产必须绑定预览图才能创建 | 初始用户可能只有文字风格要求，强制图片会提高门槛 | 预览图可选；没有图时用文本卡片和系统图标 |
| 把自定义风格混进 `ART_STYLES` 常量 | 常量无法表达用户归属、文件夹、预览图、编辑、删除、权限 | `ART_STYLES` 只做系统种子和兼容 fallback，用户风格走数据库资产 |
| v1 做复杂标签体系和多级分类 | 会重复文件夹能力，增加表单负担 | v1 支持可选简单标签；主要组织方式仍用资产中心文件夹和类型筛选 |
| 让风格资产承担视频运镜/剪辑节奏 | 用户说的是画面风格，扩大到导演语言会污染边界 | v1 仅影响画面生成 prompt；视频运镜单独建能力 |

## Feature Dependencies

```text
新增 style 资产类型合同
  -> 资产中心列表/筛选/新增菜单支持 style
  -> 风格创建/编辑/删除 API
  -> 首页和项目输入阶段可选择风格资产
  -> 项目保存风格资产引用与快照
  -> 生成链路统一解析风格 prompt

系统风格种子/兼容层
  -> 旧项目 artStyle 字符串继续可用
  -> 内置风格可复制为用户风格

可选预览图
  -> 需要复用 MediaObject / MediaRef
  -> 资产卡片展示预览
  -> 后续自动生成预览图
```

## MVP Recommendation

优先级建议：

1. 在资产中心建立 `style` 类型：列表、筛选、新增、编辑、删除、复制系统风格。
2. 风格表单支持名称、描述、正向提示词、负向约束、可选预览图、可选标签、来源。
3. 首页 `src/app/[locale]/home/page.tsx` 和项目输入 `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/NovelInputStage.tsx` 都改为选择风格资产，同时保留现有 `ART_STYLES` fallback。
4. 项目保存默认风格资产引用和 resolved prompt 快照；旧项目继续通过 `NovelPromotionProject.artStyle` / `artStylePrompt` 生成。
5. 生成链路统一使用风格 resolver，避免角色、场景、道具、分镜各自拼 prompt。

明确后置：

- 自动生成风格预览图：等资产 CRUD 和生成链路稳定后做。
- 参考图提取风格：等风格资产数据模型和媒体引用稳定后做。
- 风格市场、分享、模型微调：不属于当前 v1。

## Suggested User-Visible v1 Acceptance Criteria

- 用户在资产中心能看到“画面风格”筛选 tab，并能从“新增资产”菜单创建画面风格。
- 用户能创建一个包含名称、描述、正向提示词、负向约束的自定义风格；预览图和标签可以为空。
- 用户能编辑和删除自己创建的风格；系统内置风格只能复制，不能直接改坏。
- 用户能在首页快速创建项目时选择自己创建的风格。
- 用户能在项目故事输入阶段看到当前风格，并切换到资产中心里的风格。
- 旧项目仍显示原来的风格名称，并且生成不报错。
- 当项目使用某个风格后，即使该风格资产之后被编辑或删除，项目仍有可用的风格快照。
- 角色、场景、道具、分镜生成用到同一个 resolved style prompt。

## Sources

- `.planning/PROJECT.md`
- `.planning/codebase/ARCHITECTURE.md`
- `.planning/codebase/STRUCTURE.md`
- `src/app/[locale]/workspace/asset-hub/page.tsx`
- `src/app/[locale]/workspace/asset-hub/components/AssetGrid.tsx`
- `src/lib/assets/contracts.ts`
- `src/lib/assets/kinds/registry.ts`
- `src/lib/assets/grouping.ts`
- `src/components/selectors/RatioStyleSelectors.tsx`
- `src/components/story-input/StoryInputComposer.tsx`
- `src/app/[locale]/home/page.tsx`
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/NovelInputStage.tsx`
- `src/lib/constants.ts`
- `src/lib/style-presets.ts`
- `prisma/schema.prisma`
