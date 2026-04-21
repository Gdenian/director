# 画面风格资产化设计

日期：2026-04-20

状态：设计已收敛，待用户审阅

## 背景

当前项目里与画面风格相关的基础设施已经部分存在：

- Prisma 已有 `GlobalStyle` 模型，用于存储全局风格资产。
- `NovelPromotionProject` 已有 `styleAssetId`、`artStyle`、`artStylePrompt`。
- 资产层已经支持 `kind: 'style'`，并有 style asset 的读写服务。
- `resolveStyleContext()` 已能按 `styleAssetId -> artStylePrompt -> artStyle -> userPreference -> default` 做兼容回退。
- `createStylePromptSnapshot()` 已存在，但尚未系统接入真实任务流。

问题在于，当前项目并没有把“风格资产”真正作为生成链路中的唯一事实来源：

- 前端项目配置仍主要使用 `ART_STYLES` 枚举选择器。
- 多个项目作用域的生成入口和 worker 仍直接消费 `artStyle` 或 `getArtStylePrompt()`。
- style asset、项目配置、任务执行之间还没有形成稳定闭环。

## 目标

将画面风格提升为资产中心中的一等资产，并在项目作用域内形成唯一主路径：

- 项目只选择一个默认风格资产。
- 角色、场景、分镜、视频相关生成默认继承该项目风格。
- 所有项目作用域的生成链路统一解析风格资产。
- 旧 `artStyle` / `artStylePrompt` 仅作为兼容回退，不再是新编辑行为的主来源。
- 用户可以手动创建自定义风格资产。
- 系统内置风格继续保留，并以只读风格资产形式显示。

## 已确认的产品决策

- 第一阶段只做“项目默认风格资产”，不做角色级、场景级、分镜级单独覆写。
- 用户创建风格资产的方式仅支持手动新建。
- 系统内置老风格继续保留，并显示为只读风格资产；用户能选，但不能直接编辑。
- 老项目没有 `styleAssetId` 时，界面直接按兼容解析结果正常显示，不做额外迁移提示。

## 非目标

第一阶段明确不做以下内容：

- 角色、场景、分镜、视频阶段的局部风格覆写。
- 独立的风格管理页面。
- 从系统风格复制一份后新建。
- 从旧项目的 `artStyle` / `artStylePrompt` 一键沉淀为风格资产。
- 删除 `artStyle` / `artStylePrompt` 字段。
- 全局资产中心中所有旧视觉生成链路的同步重构。
- 让 `negativePrompt` 在所有 provider 协议中一次性完整生效。

## 方案选择

采用“兼容桥接式收口”方案。

核心原则：

- 新主路径：`styleAssetId`。
- 兼容回退：`artStylePrompt`、`artStyle`、`userPreference.artStyle`、默认系统风格。
- 运行时稳定性：任务提交时冻结风格快照，worker 和重试优先使用快照。

不采用“双轨长期共存”方案，因为那会导致用户看到已选风格资产，但生成结果仍受旧字段影响。

不采用“强迁移式切换”方案，因为当前需求要求老项目静默兼容，不做强制迁移提示。

## 信息架构与状态模型

### 资产层

继续使用现有 `GlobalStyle` 作为风格资产模型。

第一阶段使用的核心字段：

- `id`
- `name`
- `description`
- `positivePrompt`
- `negativePrompt`
- `tags`
- `source`
- `legacyKey`
- `previewMediaId`

语义约束：

- `source = 'system'`：系统内置只读风格。
- `source = 'user'`：用户自定义风格。
- 系统风格可被选择，但不能编辑和删除。
- 用户风格可查看、编辑、删除。

### 项目层

`NovelPromotionProject` 中字段职责调整如下：

- `styleAssetId`：项目默认风格的唯一主字段。
- `artStylePrompt`：兼容旧项目的次级回退来源。
- `artStyle`：兼容旧项目和用户偏好的枚举风格回退来源。

新编辑行为只应写入 `styleAssetId`。  
`artStyle` / `artStylePrompt` 不再作为新主路径写入目标。

### 运行时风格解析

项目作用域统一通过 `resolveStyleContext()` 获取当前生效风格。

解析优先级：

1. `taskSnapshot`
2. `project.styleAssetId`
3. `project.artStylePrompt`
4. `project.artStyle`
5. `userPreference.artStyle`
6. 默认系统风格

### 任务快照

项目作用域任务在提交时创建 `StylePromptSnapshot`，写入 task payload 或 task meta。

快照至少包含：

- `source`
- `fallbackReason`
- `styleAssetId`
- `legacyKey`
- `label`
- `positivePrompt`
- `negativePrompt`
- `sourceUpdatedAt`
- `capturedAt`

运行时原则：

- worker 优先读取快照。
- 重试、恢复、异步执行优先读取快照。
- 快照缺失时，才进行实时解析或旧链路兼容。

## 用户入口与交互设计

### 资产中心

不新增独立风格页面，直接补强现有资产中心。

设计要求：

- 顶部筛选增加 `style`。
- “新增资产”入口增加“新建风格”。
- 新增 `StyleCard` 用于展示风格资产。
- 风格卡片展示：
  - 预览图
  - 名称
  - 标签
  - 正向 prompt 摘要
  - 反向 prompt 摘要
  - 来源标识：系统 / 用户
- 卡片动作：
  - 用户风格：查看 / 编辑 / 删除
  - 系统风格：查看

第一阶段风格资产仍然是全局资产，不支持项目私有风格。

### 项目配置

项目配置中的“画面风格”从枚举选择器切换为风格资产选择器。

界面表现：

- 显示“当前生效风格摘要”，包括名称、来源、预览图和 prompt 摘要。
- 提供风格资产选择器，用于从用户可读的 style assets 中选择默认风格。
- 项目内不直接编辑风格内容；风格内容维护在资产中心完成。

老项目打开时：

- 即使没有 `styleAssetId`，也正常显示当前生效风格摘要。
- 该摘要来自兼容解析结果。
- 不弹迁移提示，不要求用户立即绑定风格资产。

### 项目故事输入页

项目故事输入页和项目配置弹窗中的风格入口都应改成风格资产选择逻辑。

设计要求：

- 不再把 `ART_STYLES` 作为项目风格的主选择源。
- 项目故事输入页中的旧枚举选择器在第一阶段应移除主写入职责，改为风格资产选择器或指向项目配置中的同一选择入口。
- 如果为了兼容展示仍保留旧枚举文案，也只能作为只读展示，不允许继续提交枚举值作为项目风格主字段。

## 后端与接口设计

### 资产接口

继续复用统一资产接口：

- `GET /api/assets?scope=global&kind=style`
- `POST /api/assets` 创建全局风格资产
- `PATCH /api/assets/[assetId]` 更新用户风格资产
- `DELETE /api/assets/[assetId]` 删除用户风格资产

接口行为要求：

- `style` 只允许全局 scope。
- 继续使用 `requireUserAuth`。
- 预览图继续使用现有 `MediaObject` / `MediaRef` 体系，不引入直写 URL 模式。

### 项目配置接口

`/api/novel-promotion/[projectId]` 需要扩展支持 `styleAssetId` 的读写。

PATCH 行为要求：

- 允许提交 `styleAssetId`。
- 校验该 style asset 对当前用户可读，且来源必须为：
  - 当前用户的 user style
  - 系统 style
- 对非法、缺失、不可访问的 `styleAssetId` 返回通用参数错误。
- 不泄露其他用户资产是否存在。

GET 行为要求：

- 返回项目配置时，保留现有兼容字段。
- 直接附带一个“当前生效风格摘要”对象，供前端直接渲染。
- 第一阶段不新增单独的 style resolver 页面接口给前端二次拼装。

### 生成链路设计

第一阶段只收口项目作用域生成链路：

- 项目角色图生成
- 项目场景图生成
- 分镜图生成
- 视频相关 prompt 生成或下游视频生成入口

收口要求：

1. 提交任务前统一调用 `resolveStyleContext({ userId, projectId })`
2. 创建 `StylePromptSnapshot`
3. 将 snapshot 写入任务数据
4. worker / prompt assembler 优先消费 snapshot
5. 去掉项目主链路对 `ART_STYLES` 的直接依赖

明确不在第一阶段同步收口：

- 全局资产中心里角色 / 场景 / 道具独立生成时的旧 `artStyle` 参数体系

### Worker 与 Prompt Assembler 改造原则

当前多个 worker 仍直接执行：

- 读取 payload `artStyle`
- 或读取 `models.artStyle`
- 再调用 `getArtStylePrompt()`

第一阶段项目链路应改成：

- 优先读取 `StylePromptSnapshot`
- 从快照取 `positivePrompt` 和 `negativePrompt`
- 将正向风格 prompt 拼入生成 prompt
- `negativePrompt` 仅在现有链路支持时向下传递；不为此扩展所有 provider 协议

灰度兼容顺序：

1. snapshot
2. live resolver
3. legacy `artStyle`

## 兼容策略

### 静默兼容

以下情况不打断用户：

- 老项目没有 `styleAssetId`
- 老项目的 `styleAssetId` 指向已删除资产
- 老项目的 `styleAssetId` 指向当前用户不可读资产

统一策略：

- resolver 做静默回退
- 记录 `fallbackReason`
- 前端正常显示当前生效风格摘要
- 不显示迁移警告

### 严格校验

以下情况直接拒绝：

- 用户主动保存项目时提交非法 `styleAssetId`
- 用户主动保存项目时提交不可读 `styleAssetId`
- 用户尝试编辑或删除系统风格

### 任务稳定性

以下情况不应影响已提交任务：

- 风格资产提交后被编辑
- 风格资产提交后被删除

统一策略：

- 已提交任务继续使用快照
- 不因实时资产变化导致重试结果漂移

## 测试策略

### 单元测试

最少覆盖：

- `resolveStyleContext()` 优先级链路
- `styleAssetId` 指向缺失 / 已删 / 无权限资产时的回退行为
- `createStylePromptSnapshot()` 与 `normalizeStylePromptSnapshot()`
- 项目配置接口对 `styleAssetId` 的校验
- 项目作用域 worker 优先读取 snapshot，而不是直接依赖 `ART_STYLES`

### 集成测试

最少覆盖：

- `/api/assets` 对 `kind=style` 的读取和创建
- `/api/novel-promotion/[projectId]` 对 `styleAssetId` 的读写
- 项目角色图 / 场景图 / 分镜图任务提交时附带 snapshot
- 老项目没有 `styleAssetId` 时仍能正常生成

### 组件测试

最少覆盖：

- 资产中心出现 style 分组和 `StyleCard`
- “新增资产”菜单出现“新建风格”
- 项目配置中的风格入口改成风格资产选择器
- 老项目打开时显示“当前生效风格摘要”，而不是空状态

## 实施顺序建议

推荐实现顺序如下：

1. 完成项目配置接口对 `styleAssetId` 的支持
2. 完成前端项目配置和故事输入页的风格资产选择入口
3. 补齐资产中心 `style` 展示与 CRUD 交互
4. 将项目角色图 / 场景图提交层接入 resolver + snapshot
5. 将分镜图和视频相关 prompt 生成链路切到 snapshot / resolver
6. 补齐单元、集成、组件测试

## 风险与约束

- 第一阶段新旧字段并存，但必须只允许一条主写入路径，否则会再次形成双事实来源。
- 老项目静默兼容意味着短期内无法完全删除 `artStyle` / `artStylePrompt`。
- 如果 worker 层只改一半，会出现“项目 UI 已选风格资产，但生成仍读旧枚举风格”的行为漂移，因此项目作用域链路必须成组收口。

## 最终结论

第一阶段采用兼容桥接式收口：

- 风格继续作为全局资产中心中的一等资产存在。
- 项目只选择默认风格资产。
- 项目作用域所有视觉生成统一通过 resolver 解析风格。
- 任务提交时冻结 style snapshot。
- 老项目通过兼容回退静默继续工作。

这个设计满足当前目标，同时把改动严格限制在“项目默认风格资产”这一条主线上，不把范围扩大到全站所有历史风格链路重构。
