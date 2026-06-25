# 平台兜底 AI 服务设计

## 背景

当前 API 配置模块把用户自己的创作引擎配置、模型模板助手、创作引擎识别器和运行时模型选择混在一条链路里。新用户第一次进入网站时，如果还没有配置任何 API Key，就无法稳定使用“帮我识别服务 / 帮我生成模板 / 诊断为什么不可用”等辅助能力。

本设计引入平台级 `system-ai` 兜底服务，让网站自带的配置助手、识别和诊断能力先可用。用户实际创作任务仍然必须使用用户自己配置并选择的创作模型。

## 目标

- 新用户无需先配置个人 API，也能使用 API 配置助手、创作引擎自动识别和诊断能力。
- 平台兜底服务由后端持有密钥，不暴露给前端，也不写入用户个人 API 配置。
- API 配置模块形成可理解闭环：连接服务、探测服务、失败后手动添加模型、保存模型状态、解释模型为什么不可用。
- 后续可以把兜底服务的 API 管理迁移到管理模块，而不是继续塞进用户个人设置。

## 非目标

- 不把平台兜底服务作为用户的默认创作模型。
- 不允许平台兜底服务执行用户的图片、视频、配音、口型同步等真实创作任务。
- 第一版不做完整后台密钥 CRUD；后台只预留状态展示和后续管理入口。
- 不重写整个创作引擎系统，只修复当前 API 配置可用性断点。

## 硬边界

`system-ai` 只可用于站内辅助能力：

- API 配置模板助手。
- 创作引擎自动识别 / inspector。
- 配置诊断和错误解释。

`system-ai` 禁止用于：

- 工作区文本生成、剧本转换、分镜生成等创作流程。
- 图片生成、视频生成、配音生成、口型同步。
- 资产中心真实生成或修改任务。
- 自动替用户写入默认模型选择。

所有创作任务继续通过用户配置的 `CreativeEngineConfig` / `CreativeModelConfig` 和模型选择解析。

## 架构

新增 `src/lib/system-ai/` 作为平台兜底 AI 的唯一入口。

建议接口：

```ts
type SystemAiUseCase = 'api-config-assistant' | 'creative-engine-detection' | 'config-diagnostics'

interface SystemAiChatConfig {
  provider: 'openai-compatible'
  model: string
  apiKey: string
  baseURL?: string
}

function getSystemAiChatConfig(useCase: SystemAiUseCase): SystemAiChatConfig | null
function createSystemAiOpenAIClient(useCase: SystemAiUseCase): OpenAI | null
```

第一版配置来源使用环境变量：

- `SYSTEM_AI_PROVIDER`
- `SYSTEM_AI_MODEL`
- `SYSTEM_AI_API_KEY`
- `SYSTEM_AI_BASE_URL`

兼容现有识别器变量：

- `CREATIVE_ENGINE_INSPECTOR_PROVIDER`
- `CREATIVE_ENGINE_INSPECTOR_MODEL`
- `CREATIVE_ENGINE_INSPECTOR_API_KEY`
- `CREATIVE_ENGINE_INSPECTOR_BASE_URL`

优先级：

1. `SYSTEM_AI_*`
2. 现有 `CREATIVE_ENGINE_INSPECTOR_*`
3. 未配置时返回 `null`，调用方进入非 AI 兜底路径

## 调用接入

### 创作引擎识别

`src/lib/user-api/creative-engine-detection/llm-inspector.ts` 改为通过 `system-ai` 获取客户端配置。现有探测顺序保留：

1. OpenAI-compatible `/models` 探测。
2. Gemini-compatible 探测。
3. 官方 provider 探测。
4. `system-ai` inspector 读取用户提供的文档和探测日志生成配置草稿。
5. 仍失败时返回 `requiresManualModelEntry: true`。

### API 配置模板助手

`src/lib/assistant-platform/runtime.ts` 对 `api-config-template` 使用 `system-ai`。用户未配置 LLM 时，助手仍可启动；用户配置不完整时，助手负责解释缺失项并生成模型草稿。

模板助手输出仍只能是草稿：

- 可以生成 `compatMediaTemplate`。
- 可以生成 `mediaContract`，但测试状态只能是 `unchecked`。
- 不能标记能力为已通过。
- 不能自动设置默认模型。

### 配置诊断

后续诊断入口复用 `system-ai`，输入为脱敏后的 provider、model、错误码、过滤原因。诊断只解释问题，不直接修改用户配置。

## API 配置可用性修复

本次功能完成时需要同时修复以下断点。

### 新增服务后必须进入模型闭环

当自动探测成功：

- 展示探测到的模型。
- 允许保存服务和模型。
- 保存后在模型列表里能看到这些模型。

当自动探测失败或用户跳过探测：

- 不只保存空服务。
- 进入手动添加模型步骤。
- 用户至少填写模型调用名和用途后才能完成“可用服务”保存。

### 模型不可用原因要可见

项目模型下拉框过滤模型时，需要能反馈原因。第一版可以在 API 配置页展示诊断状态：

- 服务缺少 API Key。
- 模型被禁用。
- 模型状态为 failed。
- purpose 和 type 不匹配。
- 视频模型缺少可用于工作流的媒体能力。
- provider 不存在或已隐藏。

### 禁用模型不能等同删除

保存时保留 disabled 模型，不再只提交 enabled 模型。运行时继续过滤 disabled/failed，但配置页可以重新启用。

### 手动视频模型必须能补模板和能力

OpenAI-compatible 图片模型可使用标准图片契约。视频模型必须满足以下之一才进入工作流候选：

- inspector 或模板助手生成 `compatMediaTemplate` 和 `mediaContract`。
- 用户手动补充模板并通过保存校验。
- 后续媒体测试标记具体能力状态。

## 管理模块

后台第一版只需要展示平台兜底服务状态：

- 是否配置 `SYSTEM_AI_MODEL`。
- 是否配置 `SYSTEM_AI_API_KEY`，只显示已配置/未配置。
- `SYSTEM_AI_BASE_URL` 的脱敏展示。
- 最近一次健康检查状态可后续补充。

后续版本再增加数据库配置、密钥加密存储、更新审计和健康检查。管理模块只管理平台服务，不操作用户个人 API。

## 安全和审计

- `system-ai` API Key 只在服务端读取。
- 前端不返回密钥明文。
- 发送给 `system-ai` 的用户 API Key 默认脱敏；只有用户显式允许 inspector 使用密钥时，才允许传入真实 Key。
- AI 输出必须经过现有 schema 校验和模板校验。
- 后续后台修改密钥时必须写入 `AdminAuditLog`。

## 测试策略

单元测试：

- `system-ai` 配置读取优先级。
- 未配置时返回 `null`。
- inspector 优先使用 `system-ai`，并兼容旧 `CREATIVE_ENGINE_INSPECTOR_*`。
- API 配置助手在用户无 LLM 时能使用 `system-ai`。
- 禁用模型保存后仍保留为 disabled。
- 探测失败时不保存空服务为完成态。

集成测试：

- `/api/user/creative-engines/detect` 在 `system-ai` 配置存在时能调用 inspector。
- `/api/user/assistant/chat` 的 `api-config-template` 不依赖用户个人 LLM。
- `/api/user/models` 继续不返回 disabled/failed/能力不匹配的模型。

回归验证：

- 工作区真实创作任务不会调用 `system-ai`。
- 用户模型选择仍使用用户配置。
- 平台兜底服务不会出现在用户创作引擎列表或项目模型下拉框里。

## 验收标准

- 新用户无个人 API 配置时，可以打开 API 配置助手。
- 新用户无个人 API 配置时，可以用创作引擎识别器分析服务文档并生成草稿。
- 自动探测失败后，界面引导手动添加模型，而不是保存空服务后结束。
- 禁用模型刷新后仍存在，并可重新启用。
- 项目模型下拉框不出现平台兜底服务。
- 平台兜底服务只在后台辅助链路使用，不进入 worker 创作链路。
