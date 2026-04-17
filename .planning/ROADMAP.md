# Roadmap: 画面风格资产化

## Overview

本里程碑把画面风格从项目内字符串和硬编码预设，升级为资产中心中的一等资产。路线从数据模型、兼容契约和统一解析服务开始，随后接入统一资产 API、资产中心管理界面、项目默认风格选择、生成任务快照和全链路测试守卫，确保新风格资产可复用且旧项目不中断。

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: 数据模型与兼容契约** - 风格资产具备持久化模型、项目引用、系统风格来源和统一解析 fallback。
- [ ] **Phase 2: 资产后端与权限边界** - style 进入统一资产合约、读取服务、CRUD API、媒体响应和权限规则。
- [ ] **Phase 3: 资产中心风格管理 UI** - 用户可以在资产中心查看、创建、编辑、删除、复制和整理画面风格。
- [ ] **Phase 4: 项目默认风格选择与展示** - 用户可以在项目创建和工作区配置中选择风格资产并看到当前解析结果。
- [ ] **Phase 5: 生成链路统一接入与任务快照** - 角色、场景、道具、分镜、变体和视频相关生成统一使用风格解析结果。
- [ ] **Phase 6: 回归测试与发布守卫** - 风格资产能力进入单元、API、契约、生成、兼容和 guard 覆盖范围。

## Phase Details

### Phase 1: 数据模型与兼容契约
**Goal**: 系统可以保存、引用、解析和回退画面风格资产，同时旧项目和系统预设继续可用。
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, MIG-01, MIG-02, MIG-03, MIG-04
**Success Criteria** (what must be TRUE):
  1. 系统可以保存包含名称、描述、正向提示词、可选负向提示词、标签、来源、预览媒体、创建者、文件夹和时间戳的全局风格资产。
  2. 项目可以绑定默认风格资产，同时仅包含旧 `artStyle` 或 `artStylePrompt` 的项目仍能得到明确风格结果。
  3. 系统内置旧风格选项可以作为只读系统风格或稳定 legacy key 被解析和展示。
  4. 风格解析服务可以按风格资产、项目旧提示词、旧风格 key、用户偏好和默认值的顺序给出确定结果。
  5. 生成任务可以保存风格身份和提示词快照，使重试、恢复或风格编辑后不会漂移。
**Plans**: TBD
**UI hint**: no

### Phase 2: 资产后端与权限边界
**Goal**: style 成为统一资产后端中的合法资产类型，并通过受权限保护的 API 暴露给前端。
**Depends on**: Phase 1
**Requirements**: API-01, API-03, API-04
**Success Criteria** (what must be TRUE):
  1. 已登录用户可以通过统一资产接口读取自己可见的风格资产，未登录请求不能访问风格 CRUD。
  2. 用户只能创建、编辑、删除自己的自定义风格资产，系统风格保持只读可见。
  3. 风格资产响应中的预览图以 `MediaRef` 形式返回，不暴露原始 storage key 或长期签名 URL。
  4. React Query 查询和 mutation 可以获取、创建、更新、删除并失效 style 资产缓存，且不破坏现有角色、场景、道具和音色资产类型。
**Plans**: TBD
**UI hint**: no

### Phase 3: 资产中心风格管理 UI
**Goal**: 用户可以把画面风格作为资产中心资产完整管理。
**Depends on**: Phase 2
**Requirements**: ASSET-01, ASSET-02, ASSET-03, ASSET-04, ASSET-05, ASSET-06, ASSET-07, ASSET-08
**Success Criteria** (what must be TRUE):
  1. 用户可以在资产中心看到“画面风格”与角色、场景、道具、音色并列出现。
  2. 用户可以浏览风格卡片，并看到名称、提示词摘要、来源、标签、文件夹和可选预览图。
  3. 用户可以创建、编辑、删除自己的自定义风格资产，删除不会让活跃项目引用失效。
  4. 用户可以把只读系统风格复制成自己的自定义风格资产。
  5. 用户可以使用现有文件夹、筛选和媒体系统整理风格，并上传或更换风格预览图。
**Plans**: TBD
**UI hint**: yes

### Phase 4: 项目默认风格选择与展示
**Goal**: 用户可以在项目创建和工作区中选择、切换并理解当前项目使用的默认风格资产。
**Depends on**: Phase 3
**Requirements**: PROJ-01, PROJ-02, PROJ-03, PROJ-04, PROJ-05, API-02
**Success Criteria** (what must be TRUE):
  1. 用户可以在首页/故事输入的快速项目创建流程中选择一个可访问的风格资产。
  2. 用户可以在项目工作区配置流程中选择或更换项目默认风格资产。
  3. 用户在影响生成的工作区区域可以清楚看到当前解析出的项目风格。
  4. 只有旧 `artStyle` 或 `artStylePrompt` 的项目仍显示有意义的风格标签，并且保持可编辑。
  5. 系统拒绝把项目绑定到其他用户的私有风格资产。
**Plans**: TBD
**UI hint**: yes

### Phase 5: 生成链路统一接入与任务快照
**Goal**: 所有视觉生成流程都使用同一个风格解析结果，并在任务中保留可复现快照。
**Depends on**: Phase 4
**Requirements**: GEN-01, GEN-02, GEN-03, GEN-04, GEN-05, GEN-06
**Success Criteria** (what must be TRUE):
  1. 用户生成角色图片时，结果使用与项目其他视觉生成一致的风格上下文。
  2. 用户生成场景、道具和分镜图片时，结果使用同一风格解析来源。
  3. 用户生成分镜变体或执行图片编辑时，风格连续性由解析服务或任务快照保持。
  4. 非图片文本/分析提示词不会收到未声明支持的原始负向提示词。
  5. 生成任务记录风格资产身份和提示词快照，便于调试、重试和恢复。
**Plans**: TBD
**UI hint**: no

### Phase 6: 回归测试与发布守卫
**Goal**: 风格资产能力有足够测试和 guard 覆盖，避免资产类型、权限、媒体、prompt 和旧项目兼容出现分叉。
**Depends on**: Phase 5
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06
**Success Criteria** (what must be TRUE):
  1. 风格解析优先级、fallback、任务快照、删除和不可访问资产行为都有单元测试覆盖。
  2. 风格 CRUD、跨用户拒绝、项目绑定权限和媒体预览响应形状都有 API 测试覆盖。
  3. `AssetKind='style'`、registry、mapper、read-assets 筛选和 React Query 失效都有契约测试覆盖。
  4. 角色、场景/道具、分镜和变体生成都能在测试中证明风格被正确传播。
  5. 旧项目、新项目和混合字段项目的兼容矩阵通过测试，guard 会阻止生成代码绕过风格解析服务直接拼接风格提示词。
**Plans**: TBD
**UI hint**: no

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. 数据模型与兼容契约 | 0/TBD | Not started | - |
| 2. 资产后端与权限边界 | 0/TBD | Not started | - |
| 3. 资产中心风格管理 UI | 0/TBD | Not started | - |
| 4. 项目默认风格选择与展示 | 0/TBD | Not started | - |
| 5. 生成链路统一接入与任务快照 | 0/TBD | Not started | - |
| 6. 回归测试与发布守卫 | 0/TBD | Not started | - |

## Coverage

| Requirement | Phase |
|-------------|-------|
| DATA-01 | Phase 1 |
| DATA-02 | Phase 1 |
| DATA-03 | Phase 1 |
| DATA-04 | Phase 1 |
| DATA-05 | Phase 1 |
| ASSET-01 | Phase 3 |
| ASSET-02 | Phase 3 |
| ASSET-03 | Phase 3 |
| ASSET-04 | Phase 3 |
| ASSET-05 | Phase 3 |
| ASSET-06 | Phase 3 |
| ASSET-07 | Phase 3 |
| ASSET-08 | Phase 3 |
| PROJ-01 | Phase 4 |
| PROJ-02 | Phase 4 |
| PROJ-03 | Phase 4 |
| PROJ-04 | Phase 4 |
| PROJ-05 | Phase 4 |
| GEN-01 | Phase 5 |
| GEN-02 | Phase 5 |
| GEN-03 | Phase 5 |
| GEN-04 | Phase 5 |
| GEN-05 | Phase 5 |
| GEN-06 | Phase 5 |
| API-01 | Phase 2 |
| API-02 | Phase 4 |
| API-03 | Phase 2 |
| API-04 | Phase 2 |
| MIG-01 | Phase 1 |
| MIG-02 | Phase 1 |
| MIG-03 | Phase 1 |
| MIG-04 | Phase 1 |
| TEST-01 | Phase 6 |
| TEST-02 | Phase 6 |
| TEST-03 | Phase 6 |
| TEST-04 | Phase 6 |
| TEST-05 | Phase 6 |
| TEST-06 | Phase 6 |

**Coverage Summary:**
- v1 requirements: 38 total
- Mapped to phases: 38
- Unmapped: 0
- Duplicate mappings: 0

