# 参考图生成风格提示词设计

## 背景

风格管理功能已经把风格升级为全局资产。风格资产包含名称、中文提示词、英文提示词、参考图、预览图、默认状态，以及项目和视觉资产生成时使用的风格快照。

当前资产中心风格弹窗支持手动填写提示词和上传参考图，但还不能根据参考图自动生成风格提示词。用户需要一个能力：让系统分析参考图的整体视觉风格，并回填 `promptZh` 和 `promptEn`，再由用户决定是否保存。

本设计只覆盖“参考图生成风格提示词”这条补充链路。

## 已确认决策

- 请求走现有任务系统。
- 新增资产中心风格 AI 设计 API，但复用现有 `handleAssetHubAIDesignTask` worker 处理器。
- 调用用户配置的 `analysisModel`。
- 不调用图片生成模型。该功能是视觉理解和文本生成，不是生成图片。
- 新建风格和编辑风格都支持。
- API 接收当前表单里的 `referenceImageUrl`，不要求风格已经保存，也不依赖 `styleId`。
- 生成结果只回填表单，不自动保存风格资产。
- 风格分析指令放入现有 `prompt-i18n` 提示词模板体系，不写成 worker 内部常量。

## 目标

- 用户可以在风格弹窗中点击按钮，根据当前参考图生成风格提示词。
- 同时返回中文提示词 `promptZh` 和英文提示词 `promptEn`。
- 生成内容必须是后续图片和视频生成可复用的视觉风格说明。
- 避免把参考图里的具体人物、场景、道具、剧情内容混入风格提示词。
- 不影响现有风格 CRUD、项目风格快照和生成注入链路。
- 补齐 API、worker、提示词模板、解析和前端交互测试。

## 非目标

- 本次不做生成后自动保存。
- 本次不改数据库结构。
- 本次不做风格预览图生成。
- 本次不把风格参考图注入后续图片或视频生成。
- 本次不支持多张风格参考图。
- 本次不改项目风格快照刷新逻辑。

## 架构设计

### API

新增接口：

```text
POST /api/asset-hub/ai-design-style
```

请求体：

```json
{
  "referenceImageUrl": "https://example.com/style-reference.jpg"
}
```

响应沿用资产中心 AI 设计类接口的异步任务响应协议，前端通过 `resolveTaskResponse` 获取最终任务结果。

接口行为：

- 使用 `requireUserAuth` 校验登录。
- 读取并 trim `referenceImageUrl`。
- `referenceImageUrl` 为空时返回 `INVALID_PARAMS`。
- 读取 `getUserModelConfig`。
- 用户未配置 `analysisModel` 时返回 `MISSING_CONFIG`。
- 通过 `maybeSubmitLLMTask` 提交 `TASK_TYPE.ASSET_HUB_AI_DESIGN_STYLE`。
- 使用 `projectId: "global-asset-hub"`。
- dedupe key 基于用户 id 和参考图 URL 生成。

### 任务类型

新增任务类型：

```ts
ASSET_HUB_AI_DESIGN_STYLE: 'asset_hub_ai_design_style'
```

该任务进入 text worker，与 `ASSET_HUB_AI_DESIGN_CHARACTER` 和 `ASSET_HUB_AI_DESIGN_LOCATION` 同属资产中心 AI 设计任务。

任务 intent 使用 `generate`，保持和现有资产中心 AI 设计任务一致。

### Worker

复用 `handleAssetHubAIDesignTask`，但在处理器内部保持清晰分支：

- `character` 和 `location` 继续走现有 `aiDesign` helper。
- `style` 走 `executeAiVisionStep`。

风格任务处理流程：

- 校验 `referenceImageUrl`。
- 优先从 payload 读取 `analysisModel`，否则读取用户配置，保持现有 handler 行为。
- 使用 `buildPrompt({ promptId: PROMPT_IDS.ASSET_HUB_STYLE_PROMPT_GENERATE, locale })` 构建提示词。
- 调用 `executeAiVisionStep`，传入提示词和 `[referenceImageUrl]`。
- 严格解析模型输出 JSON。
- 返回：

```json
{
  "promptZh": "中文风格提示词",
  "promptEn": "English style prompt"
}
```

worker 不写数据库，不更新 `global_styles`。

## 提示词模板

新增提示词 ID：

```ts
ASSET_HUB_STYLE_PROMPT_GENERATE: 'asset_hub_style_prompt_generate'
```

新增 catalog 配置：

```ts
{
  pathStem: 'asset-hub/style_prompt_generate',
  variableKeys: []
}
```

新增模板文件：

```text
lib/prompts/asset-hub/style_prompt_generate.zh.txt
lib/prompts/asset-hub/style_prompt_generate.en.txt
```

模板必须明确：参考图是后续拍摄、图片生成、视频生成过程中的“风格参考”，不是内容参考。

允许生成的内容：

- 影像媒介和美术风格。
- 摄影语言。
- 构图倾向。
- 光线和色彩处理。
- 材质、颗粒、锐度、渲染和后期质感。
- 可被视频生成复用的整体画面观感。

禁止生成的内容：

- 具体人物、年龄、性别、身份、服装、脸部特征。
- 具体地点、道具、建筑、文字、品牌、IP。
- 动作、剧情事件、场景专属情绪。
- “参考图中的人物”“图里的街道”这类指向性描述。
- 会改变后续资产语义的内容，例如“红衣女孩”“雨夜街道”“古堡大厅”。

长度约束：

- `promptZh`：建议 80 到 160 个中文字符。
- `promptEn`：建议 35 到 80 个英文单词。

模型必须输出严格 JSON：

```json
{
  "promptZh": "...",
  "promptEn": "..."
}
```

如果模型输出不是合法 JSON，或缺少 `promptZh` / `promptEn`，任务应失败并提示重试。worker 不做危险猜测，也不部分回填，因为错误风格文本会在后续图片和视频生成中反复复用。

## 前端交互

入口放在 `StyleAssetModal` 的参考图区域。

交互行为：

- 用户可以上传参考图，也可以粘贴参考图 URL。
- `referenceImageUrl` 为空时，“生成提示词”按钮禁用。
- 点击按钮后调用新增 hook，例如 `useAiDesignStyle(referenceImageUrl)`。
- hook 请求 `/api/asset-hub/ai-design-style` 并解析任务结果。
- 任务执行中按钮显示 loading 文案，并禁止重复点击。
- 表单其他字段仍可编辑。
- 成功后：
  - 如果 `promptZh` 和 `promptEn` 都为空，直接回填。
  - 如果任一字段已有内容，弹出确认，再覆盖两个字段。
  - 用户取消确认时，保留当前字段内容。
- 生成完成后不自动保存。
- 用户仍需点击“保存”才会持久化风格资产。
- 失败时在弹窗内显示错误，并保留所有当前输入。

建议中文文案：

- 按钮：`生成提示词`
- Loading：`生成中...`
- 无参考图提示：`请先上传或填写参考图`
- 覆盖确认：`当前提示词已有内容，是否用参考图生成结果覆盖？`
- 失败：`生成风格提示词失败`

按钮放在参考图输入行中，位于上传按钮旁边。移动端或窄宽度下允许自然换行。

## 错误处理

API 错误：

- `referenceImageUrl` 为空：`INVALID_PARAMS`。
- 未登录：沿用现有登录错误。
- 未配置 `analysisModel`：`MISSING_CONFIG`。

Worker 错误：

- 缺少 `referenceImageUrl`：任务失败，并返回明确校验错误。
- 缺少 `analysisModel`：任务失败，并提示用户先配置分析模型。
- vision 调用失败：任务失败，并把任务错误传给前端。
- 模型输出无效：任务失败，并提示无法解析风格提示词 JSON。

前端错误：

- 在风格弹窗内展示行内错误。
- 保留当前表单状态。
- 允许用户再次点击重试。

## 测试计划

### API 测试

新增 `POST /api/asset-hub/ai-design-style` 覆盖：

- 成功提交 `TASK_TYPE.ASSET_HUB_AI_DESIGN_STYLE`。
- payload 包含 trim 后的 `referenceImageUrl`、`analysisModel` 和 `displayMode`。
- 空参考图返回 `INVALID_PARAMS`。
- 未配置分析模型返回 `MISSING_CONFIG`。

### Worker 测试

扩展资产中心 AI 设计 worker 测试：

- style 任务调用 `executeAiVisionStep`。
- style 任务使用 `PROMPT_IDS.ASSET_HUB_STYLE_PROMPT_GENERATE`。
- 合法 JSON 返回 `promptZh` 和 `promptEn`。
- 非 JSON 输出抛错。
- 缺少 `promptZh` 或 `promptEn` 抛错。
- 既有 character / location 任务行为不变。

### 提示词模板测试

新增 prompt-i18n 测试：

- 新 prompt id 已注册。
- zh 和 en 模板文件都存在。
- 模板没有未声明变量。

### 前端测试

新增风格弹窗交互测试：

- 渲染“生成提示词”按钮。
- 没有参考图时按钮禁用。
- 生成成功后，空提示词字段会直接回填。
- 已有提示词内容时触发覆盖确认。
- 取消覆盖时保留当前值。
- 确认覆盖时替换 `promptZh` 和 `promptEn`。
- 生成失败时展示行内错误。

## 风险

- 用户配置的某些 `analysisModel` 可能不支持视觉输入。现有 `executeAiVisionStep` 会暴露模型或 provider 错误，前端只展示失败并保留表单。
- 模型可能仍然尝试描述参考图内容。提示词模板必须严格约束，非 JSON 输出直接失败；后续可通过模板迭代改善质量。
- 复用 `handleAssetHubAIDesignTask` 可能让处理器职责变宽。实现时必须把 style 分支和 character / location 分支分清，不改现有 `aiDesign` helper 的语义。

## 验收标准

- 用户新建风格时，可以上传或粘贴参考图，生成提示词，检查后保存。
- 用户编辑风格时，可以基于当前参考图重新生成提示词。
- 已有提示词不会在无确认的情况下被覆盖。
- 生成任务使用 `analysisModel`，不使用图片生成模型。
- 生成结果只回填表单，不自动保存。
- 测试覆盖 API 提交、worker 解析、提示词模板注册和弹窗交互。
