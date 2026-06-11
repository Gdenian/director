# Creative Engine Redesign Design

Date: 2026-06-11
Status: Pending user review

## Goal

Refactor the current user-facing `API 配置` module into `创作引擎`.

The platform is an AI creation product, not an API platform or relay service. Users should feel that they are connecting existing AI services into a creative workflow, then choosing which models to use for text, image, video, voice, lip-sync, and voice-design tasks.

The core principle is:

> 本次改造的目标不是让平台替用户做模型决策，而是让外部 AI 服务更容易被接入、识别和选择。

The feature must make external AI services easier to add, detect, classify, and select. It must not create a new automatic creative-plan system, automatically choose models for users, or silently modify existing workflow selections.

## Product Boundaries

The platform is responsible for:

- Connecting external AI services.
- Normalizing service URLs and detecting likely service sources.
- Validating keys and distinguishing common failure classes.
- Detecting protocol type and reading model lists when possible.
- Classifying models into initial purposes.
- Adding confirmed models to the selectable model pool.
- Filtering model selectors by task purpose.
- Showing service/model status and risks.
- Warning users before deletion, disabling, or connection edits affect selected models.

The platform is not responsible for:

- Generating a default creative plan.
- Automatically choosing text, image, video, voice, lip-sync, or voice-design models.
- Automatically replacing existing workflow model selections.
- Running model routing, key-pool balancing, cost optimization, A/B testing, or relay-platform behavior.
- Running image, video, voice, or other consumption-heavy tests without explicit confirmation.
- Executing arbitrary non-standard REST APIs through a new generic executor.

## Confirmed Scope Decisions

- Use the "product shell redesign + detection orchestration service" approach.
- Work in the isolated worktree `/Users/wayen/Documents/coder/director-creative-engine-redesign` on branch `feature/creative-engine-redesign`.
- This repository is still in development and has no production historical data. Test data can be rebuilt.
- Do not design a backward-compatible online migration strategy.
- Do not create new Prisma tables for `CreativeEngine` or `CreativeModel`.
- Directly refactor the current API config JSON structures stored in `UserPreference`.
- Keep the runtime model key contract as `provider::modelId`.
- Use a platform-owned built-in text LLM for automatic service recognition.
- The built-in recognition model may receive the full API key by default, but the UI must clearly disclose this and allow users to turn it off.
- For non-standard APIs, the built-in recognition model may generate a configuration draft. The draft must be confirmed by the user and only becomes runnable when it maps to an existing supported runtime path.

## Existing Implementation Analysis

The current `API 配置` module is already a configuration center, not just an API key form.

Relevant implementation areas:

- `src/app/[locale]/profile/components/api-config*`
  - Current profile API configuration UI.
  - Contains provider cards, provider list, default model cards, and large hooks.
- `src/app/api/user/api-config/route.ts`
  - Main read/write endpoint for user provider, model, default model, capability, and workflow-concurrency config.
- `src/app/api/user/api-config/test-provider/route.ts`
  - Existing provider connection test entry.
- `src/app/api/user/api-config/probe-model-llm-protocol/route.ts`
  - Existing OpenAI-compatible LLM protocol probe.
- `src/app/api/user/models/route.ts`
  - Runtime model options API used by selector UIs.
- `src/lib/api-config.ts`
  - Runtime configuration reader. It strictly resolves models and providers from the user config center.
- `src/lib/config-service.ts`
  - Reads project/user model selections for workflow runtime.
- `src/lib/model-config-contract.ts`
  - Defines `UnifiedModelType`, model-key parsing, and capability contracts.
- `src/lib/model-capabilities/*`
  - Provides capability lookup, validation, and model option resolution.
- `src/lib/crypto-utils.ts`
  - Encrypts API keys before persistence and decrypts them for runtime use.
- `messages/*/apiConfig.json`
  - Current user-facing API configuration copy.

Current persisted structures:

- `UserPreference.customProviders`
  - Stores provider-like service configs.
  - Includes id, name, base URL, encrypted API key, API mode, gateway route, hidden state.
- `UserPreference.customModels`
  - Stores selectable models.
  - Includes model id, display name, type, provider id, model key, protocol/template metadata, pricing, enabled state.
- `UserPreference.analysisModel`, `characterModel`, `locationModel`, `storyboardModel`, `editModel`, `videoModel`, `audioModel`, `lipSyncModel`, `voiceDesignModel`
  - Store user-selected model keys.
- `UserPreference.capabilityDefaults`
  - Stores per-model capability selections.

Important current constraints:

- Runtime model selection depends on `provider::modelId`.
- Provider guessing is intentionally guarded against.
- Worker/runtime code expects selected model keys to resolve through the config center.
- Model dropdowns already filter by broad type: `llm`, `image`, `video`, `audio`, `lipsync`.
- Existing files in this area are already large; the redesign should add small modules instead of increasing the existing large hooks.

## Reusable Parts

The redesign should reuse:

- API key encryption/decryption in `src/lib/crypto-utils.ts`.
- Existing runtime model-key contract in `src/lib/model-config-contract.ts`.
- Existing runtime provider/model resolution in `src/lib/api-config.ts`.
- Existing project/user default model reading in `src/lib/config-service.ts`.
- Existing model capability lookup and validation in `src/lib/model-capabilities`.
- Existing pricing/catalog validation where billing mode requires it.
- Existing OpenAI-compatible LLM protocol probe.
- Existing OpenAI-compatible image/video media-template system.
- Existing model selector concept from `DefaultModelCards`.
- Existing `/api/user/models` style of exposing enabled models to workflow UIs.

## Parts To Adjust

The redesign should adjust:

- User-facing module name from `API 配置` to `创作引擎`.
- User-facing "provider pool" language to "已接入的服务".
- "default model config" language to "模型选择".
- Add flow from technical provider form to creative-engine detection flow.
- Add detection result confirmation before saving.
- Add model purpose status and service/model detection status.
- Add delete/disable/edit impact checks.
- Add runtime preflight copy that tells users what is missing without changing selections.
- Split detection, model classification, result mapping, and impact checks into focused modules.

## Parts Not To Change

Do not change:

- The runtime model-key shape: `provider::modelId`.
- The principle that users choose model assignments themselves.
- Project-level model override priority.
- Worker/generator runtime behavior except where needed to read the refactored config shape.
- Billing, routing, or provider execution strategy beyond mapping confirmed models into the existing runtime paths.
- The absence of a creative-plan system.

## Product Language

Primary product naming:

- `API 配置` -> `创作引擎`
- `厂商资源池` -> `已接入的服务`
- `Provider / 厂商` -> `AI 服务`
- `Base URL` -> visible only in advanced settings
- `Model ID` -> `模型调用名`
- `默认模型配置` -> `模型选择`
- `新增模型服务商` -> `添加创作引擎`
- `测试连接` -> `检测是否可用`
- `仍然添加` -> `跳过检测并保存`
- `外显名称` -> `模型名称`
- `实际调用 ID` -> `模型调用名`

Module description:

> 接入你已有的 AI 服务，并在创作流程中选择需要使用的模型。

Ordinary-user paths should avoid leading with `Provider`, `Base URL`, `Model ID`, `OpenAI Compatible`, and `Gemini Compatible`. These concepts remain available in advanced settings.

## Target Users

### Ordinary Creative User

They do not want to understand APIs. They paste a service address and key, let the platform detect what is available, then choose models in creation flows.

### Workflow Builder

They configure multiple workflows and need to understand whether a model is used by existing selections before changing, disabling, or deleting a service.

### Advanced API User

They understand OpenAI-compatible APIs, Gemini-compatible APIs, Base URLs, model IDs, and custom templates. They need manual configuration, manual model creation, and purpose correction.

## Core User Flow

1. The user copies a service address and API key from another platform.
2. The user opens `创作引擎`.
3. The user clicks `添加创作引擎`.
4. The user pastes the service address and key.
5. The platform detects the service source, protocol, key status, model list, model purposes, confidence, and risks.
6. The platform shows a confirmation page.
7. The user saves the creative engine.
8. The user goes to `模型选择`.
9. The user manually chooses text, image, video, voice, lip-sync, and voice-design models.
10. The platform filters options and displays state, source, and risk. It does not choose for the user.

## Information Architecture

### Creative Engine Home

Shows connected services.

Each service item displays:

- Service name.
- Service source.
- Status: unchecked, available, partially available, failed, disabled.
- Supported capabilities.
- Model count.
- Whether selected models currently depend on it.
- Last checked time.
- Actions: view models, re-detect, edit connection, disable, delete.

### Add Creative Engine

Primary button:

> 添加创作引擎

Modal title:

> 添加创作引擎

Description:

> 粘贴你从其他平台获得的服务地址和密钥，我们会自动识别可用模型。

Default fields:

- Service address.
- Key.
- `自动识别` button.
- Smart recognition toggle, enabled by default:
  - When enabled, full API key may be sent to the platform's built-in recognition model.
  - The user can turn it off before detection.

Advanced entry:

> 手动配置

Advanced fields:

- Interface type.
- Service address.
- Key.
- Protocol type.
- Model call name.
- Custom model.
- Existing compatible media-template assistant when relevant.

### Detection Result Confirmation

Detection must not save silently.

The result page displays:

- Service name.
- Service source.
- Interface type.
- Confidence: high, medium, low.
- Service address.
- Number of detected models.
- Model purpose distribution.
- Compatible creative tasks.
- Risk messages.

Buttons:

- `保存创作引擎`
- `查看模型列表`
- `重新识别`
- `手动调整`

Forbidden copy:

- `生成默认方案`
- `自动配置创作方案`
- `已为你选择最佳模型`
- `已自动分配模型`

### Available Model Management

For one creative engine, users can:

- Enable or disable a model.
- Rename a model.
- Edit model call name.
- Correct model purpose.
- Re-detect one model.
- Add a model manually.
- View source, confidence, and warnings.

### Model Selection

Reuse the existing default-model selection concept and rename it to `模型选择`.

Users choose:

- Text analysis model.
- Character image model.
- Location image model.
- Storyboard image model.
- Image edit model.
- Video generation model.
- Voice model.
- Lip-sync model.
- Voice-design model.

Each selector only shows matching enabled models.

Example option display:

```text
Claude Sonnet
来自 OpenRouter｜文本｜已检测
```

The platform may show state and warnings. It must not recommend or auto-select models in this redesign.

### Save Success Guidance

After saving:

> 创作引擎已添加。你可以在模型选择中使用这些模型。

Buttons:

- `去选择模型`
- `继续添加`
- `完成`

`去选择模型` navigates to the existing model selection area.

## Detection Orchestration

Add a focused backend detection module:

```text
src/lib/user-api/creative-engine-detection/
  types.ts
  url-normalizer.ts
  fingerprint.ts
  probe-openai.ts
  probe-gemini.ts
  probe-official.ts
  llm-inspector.ts
  model-classifier.ts
  result-mapper.ts
```

Add API routes:

```text
POST /api/user/creative-engines/detect
POST /api/user/creative-engines/light-test
```

Saving continues through the configuration center, refactored to creative-engine naming.

### Detection Step 1: URL Normalization

Rules:

- Trim whitespace.
- Remove trailing slashes.
- If input points to `/chat/completions`, `/responses`, `/images/generations`, `/videos`, or `/models`, roll back to base path.
- If a likely OpenAI-compatible base URL lacks `/v1`, try a `/v1` candidate.
- If the URL is a known platform homepage, suggest the known API URL.
- If the URL is a documentation page, infer platform source and suggest a likely API URL.

### Detection Step 2: Platform Fingerprint

Detect common services by domain, path, response shape, and error shape:

- OpenRouter.
- OpenAI.
- Google AI Studio.
- Volcengine Ark.
- Alibaba Bailian.
- SiliconFlow.
- MiniMax.
- Vidu.
- FAL.
- 302.AI.
- Custom OpenAI-compatible API.
- Custom Gemini-compatible API.

### Detection Step 3: Protocol Probe

Probe order:

1. OpenAI-compatible.
2. Gemini-compatible.
3. Known official provider.
4. Custom/manual configuration.

OpenAI-compatible probe should prefer free endpoints such as `GET /v1/models`.

Gemini-compatible probe should use models/list style endpoints when available.

Official provider probes should reuse current low-cost provider-test logic where possible.

### Detection Step 4: Key Validation

Return distinct failure categories:

- Key invalid.
- Service unreachable.
- Interface unsupported.
- Rate limited.
- Balance insufficient.
- Provider error.
- Partial compatibility.

### Detection Step 5: Model List Reading

Prefer free model-list endpoints.

If the model list is readable, create model drafts.

If the model list is not readable, show:

> 这个服务没有开放模型列表接口。你仍然可以手动添加模型调用名。

### Detection Step 6: Model Purpose Classification

Initial purposes:

- Text.
- Image generation.
- Image edit.
- Video generation.
- Voice generation.
- Lip-sync.
- Voice design.
- Unknown.

Heuristic examples:

- `gpt`, `claude`, `deepseek`, `qwen`, `gemini` -> text.
- `imagen`, `seedream`, `flux` -> image.
- `veo`, `kling`, `wan`, `seedance`, `sora`, `vidu` -> video.
- `tts`, `voice` -> voice.
- `lipsync`, `lip-sync` -> lip-sync.

This is only an initial guess. Users must be able to change it.

Unknown models must not be enabled for formal workflows until the user classifies them.

### Detection Step 7: Confidence

Confidence levels:

- High: known platform matched and interface response shape matched.
- Medium: unknown domain, but generic interface structure matched.
- Low: service may work, but model list is missing or response is incomplete.

### Detection Step 8: Lightweight Test

When free endpoints cannot verify availability, show:

> 这个服务不支持免费检测。继续检测可能产生极少量调用消耗。

Only after user confirmation may the system send a lightweight text request.

Image, video, voice, and lip-sync calls must not run automatically.

## Built-In Recognition LLM

The platform uses a built-in text LLM to assist recognition.

Default behavior:

- Smart recognition is on by default.
- Full API key may be sent to the built-in recognition model.
- Users can turn this off before detection.

Security requirements:

- UI must clearly disclose that the full key may be sent to the built-in recognition model.
- The detection request includes `allowKeyInInspector`.
- If `allowKeyInInspector=false`, the LLM receives only URL, domain, redacted errors, response structure, and document snippets.
- If `allowKeyInInspector=true`, the LLM may receive full URL, full API key, probe logs, document snippets, and response samples.
- Normal logs must never contain the full key.
- Recognition model requests should be auditable separately from regular app logs.

The LLM output must be structured JSON and validated before use:

```ts
{
  source: string
  recommendedProviderKey: string
  protocolType: 'openai-compatible' | 'gemini-compatible' | 'official' | 'manual-template'
  normalizedBaseUrl: string
  confidence: 'high' | 'medium' | 'low'
  models: Array<{
    name: string
    callName: string
    purpose:
      | 'llm'
      | 'image'
      | 'video'
      | 'audio'
      | 'lipsync'
      | 'voice-design'
      | 'unknown'
    confidence: 'high' | 'medium' | 'low'
  }>
  warnings: string[]
}
```

The LLM may create drafts. It cannot directly save runnable configuration.

## Non-Standard API Handling

The redesign does not add a generic REST executor.

A non-standard API can become runnable only if it maps to:

- Existing official provider runtime.
- OpenAI-compatible runtime.
- Gemini-compatible runtime.
- Existing OpenAI-compatible image/video media-template runtime.

Otherwise, it remains a manual configuration draft and does not enter the formal selectable model pool.

## Data Structure

No new Prisma tables are introduced.

Continue storing config in `UserPreference`, but directly refactor the JSON payload shape. Because the product is not live, no historical compatibility migration is required.

### CreativeEngineConfig

```ts
type CreativeEngineConfig = {
  id: string
  name: string
  source?: string
  providerKey: string
  displayProviderName?: string
  serviceUrl?: string
  apiKey?: string
  authType?: 'bearer' | 'api-key' | 'query-key' | 'custom'
  protocolType?: 'official' | 'openai-compatible' | 'gemini-compatible' | 'manual-template'
  apiMode?: 'gemini-sdk' | 'openai-official'
  gatewayRoute?: 'official' | 'openai-compat'
  status: 'unchecked' | 'available' | 'partial' | 'failed' | 'disabled'
  confidence?: 'high' | 'medium' | 'low'
  lastCheckedAt?: string
  allowKeyInInspector?: boolean
  hidden?: boolean
}
```

### CreativeModelConfig

```ts
type CreativeModelPurpose =
  | 'text'
  | 'image-generation'
  | 'image-edit'
  | 'video-generation'
  | 'voice-generation'
  | 'lip-sync'
  | 'voice-design'

type CreativeModelConfig = {
  id: string
  engineId: string
  name: string
  callName: string
  modelKey: string
  type: 'llm' | 'image' | 'video' | 'audio' | 'lipsync'
  purpose: CreativeModelPurpose
  enabled: boolean
  status: 'unchecked' | 'available' | 'failed' | 'disabled'
  confidence?: 'high' | 'medium' | 'low'
  capabilities?: ModelCapabilities
  pricing?: CustomModelPricing
  llmProtocol?: 'responses' | 'chat-completions'
  compatMediaTemplate?: OpenAICompatMediaTemplate
  lastCheckedAt?: string
  detectionSource?: 'rule' | 'provider-list' | 'llm' | 'manual'
  warningCodes?: string[]
}
```

Mapping rules:

- `engineId` is the provider id used by runtime.
- `callName` is the model id used in provider API calls.
- `modelKey = engineId::callName`.
- `serviceUrl` replaces user-facing `baseUrl`.
- `type` remains the broad runtime type.
- `purpose` is used for product display and finer UI filtering.

Unknown models are detection drafts and not persisted as enabled runnable models until classified.

## Default Model Selection

The following fields stay as user-controlled selections:

- `analysisModel`
- `characterModel`
- `locationModel`
- `storyboardModel`
- `editModel`
- `videoModel`
- `audioModel`
- `lipSyncModel`
- `voiceDesignModel`

Saving a creative engine must not write any of these fields.

When the user clicks `去选择模型`, the existing model-selection logic writes these selections.

Project-level override behavior remains unchanged.

## Runtime Preflight Checks

Before a workflow runs, the system should check required models and service availability.

Examples:

- Missing text model:
  - `当前还没有选择文本分析模型，请先选择一个文本模型。`
- Missing image model:
  - `当前流程需要图片模型，请先选择角色、场景或分镜使用的图片模型。`
- Model unavailable:
  - `当前选择的模型暂时不可用，请重新检测或更换模型。`

The platform reports the problem. It does not auto-fix or replace the user's selection.

## Impact Checks

### Delete Creative Engine

Before deletion, check whether any models under the engine are selected by user defaults or project configs.

Message:

> 这个创作引擎中的 3 个模型正在被使用。删除后，相关创作流程可能无法运行。

Show affected selections:

- 文本分析模型：xxx
- 角色生成模型：xxx
- 视频生成模型：xxx

Buttons:

- `查看使用位置`
- `替换模型`
- `仍然删除`
- `取消`

### Disable Model

Message:

> 这个模型正在被「视频生成模型」使用。停用后，视频生成将无法运行。

Buttons:

- `更换模型`
- `仍然停用`
- `取消`

### Edit Service Address Or Key

Message:

> 修改后会影响使用该创作引擎的模型。历史生成结果不受影响，之后的新任务会使用新的连接信息。

## Error Copy

- Key invalid:
  - `密钥不可用。请检查是否复制完整，或确认该密钥仍然有效。`
- Service address error:
  - `服务地址无法访问。请检查地址是否填写正确，或尝试使用平台推荐地址。`
- Unable to read models:
  - `这个服务没有开放模型列表接口。你仍然可以手动添加模型调用名。`
- Model unavailable:
  - `这个模型暂时无法调用。可能是密钥没有权限、模型名称错误，或服务暂时不可用。`
- Balance insufficient:
  - `服务余额不足，请前往对应平台充值后再试。`
- Partial compatibility:
  - `当前服务可用于文本生成，但图片或视频能力暂未验证。`

## Technical Implementation Plan

### Phase 1: Domain Naming And UI Skeleton

- Rename visible module copy from `API 配置` to `创作引擎`.
- Introduce `CreativeEngineTabContainer`, `CreativeEngineHome`, `AddCreativeEngineModal`, `DetectionResultPanel`, `CreativeModelList`, and `ModelUsageImpactDialog`.
- Keep runtime behavior unchanged.
- Use controlled mock or existing provider-test data for the initial UI path.

### Phase 2: Configuration Shape Refactor

- Replace frontend-facing `Provider` and `CustomModel` concepts with `CreativeEngineConfig` and `CreativeModelConfig`.
- Refactor server-side config parsing and saving to the new JSON shape.
- Keep `modelKey = engineId::callName`.
- Update `/api/user/models` to expose enabled models grouped by runtime type and enriched with source/status display metadata.
- Update tests to the new shape directly.

### Phase 3: Detection Orchestration

- Implement URL normalizer.
- Implement platform fingerprinting.
- Implement OpenAI-compatible probe.
- Implement Gemini-compatible probe.
- Implement official provider probe reuse.
- Implement model classifier.
- Implement detection result mapper.
- Add `POST /api/user/creative-engines/detect`.

### Phase 4: Built-In LLM Recognition

- Add platform-owned recognition model config.
- Add `llm-inspector.ts`.
- Add structured output validation.
- Add `allowKeyInInspector` behavior.
- Add failure fallback to rules/manual configuration.
- Ensure logs redact full keys.

### Phase 5: Confirmation Save And Impact Checks

- Connect detection result confirmation page to real detection API.
- Save confirmed creative engine and classified models.
- Implement impact checks for delete, disable, and connection edits.
- Add success guidance to model selection.

### Phase 6: Runtime Preflight And Copy

- Improve missing-model and unavailable-model messages.
- Ensure preflight checks report problems without modifying selections.
- Add error mapping for auth, unreachable service, unsupported interface, rate limit, insufficient balance, and partial compatibility.

### Phase 7: Test And Cleanup

- Add unit, API, component, and runtime tests.
- Remove old visible `API 配置` copy.
- Avoid adding new complexity to existing oversized files.
- Keep final implementation focused on creative-engine connection and model selection.

## Test Plan

### Product And Component Tests

- Creative engine home shows service status, capabilities, model count, usage state, and last checked time.
- Add modal default fields are only service address, key, and auto-detect.
- Advanced settings reveal technical fields.
- Smart recognition toggle is enabled by default and can be disabled.
- Detection result page requires confirmation before saving.
- Detection result page does not show forbidden automatic-decision copy.
- Unknown models require user classification or remain disabled.
- Saving an engine does not write default model selections.
- Save success offers `去选择模型`, `继续添加`, and `完成`.

### Detection Tests

- URL normalizer handles trailing slash removal, endpoint rollback, `/v1` candidate generation, homepage conversion, and documentation URL inference.
- Fingerprint detects OpenRouter, OpenAI, Google AI Studio, Volcengine Ark, Alibaba Bailian, SiliconFlow, MiniMax, Vidu, FAL, 302.AI, custom OpenAI-compatible, and custom Gemini-compatible.
- OpenAI-compatible probe handles success, auth failure, rate limit, unsupported endpoint, provider error, and network failure.
- Gemini-compatible probe handles success, key failure, and unreachable service.
- Official provider probe reuses current provider-test behavior where possible.
- LLM inspector rejects malformed JSON, invalid protocol, invalid URL, empty model list, and unknown purpose for enabled models.
- `allowKeyInInspector=true` sends full key to LLM inspector payload.
- `allowKeyInInspector=false` does not send full key to LLM inspector payload.
- Detection logs do not contain full key.
- Lightweight text test requires explicit confirmation.

### Configuration Tests

- Saving a creative engine writes `customProviders`.
- Saving creative models writes `customModels`.
- `modelKey = engineId::callName` is preserved.
- Default model fields are not automatically modified after engine save.
- `/api/user/models` only returns enabled, selectable models.
- Disabled models do not appear in selectors.
- Delete impact check reports affected user and project selections.

### Runtime Tests

- Missing text model produces the required message.
- Missing image model produces the required message for the relevant workflow.
- Provider without key or failed model status produces a "重新检测或更换模型" style message.
- Existing workers can still resolve provider config and model selection through the config center.

## Risk Register

### Full API Key Sent To Built-In Recognition Model

This is the largest security risk.

Mitigation:

- Clear UI disclosure.
- Toggle to disable.
- Dedicated request flag.
- Full-key redaction in normal logs.
- Separate audit trail for recognition requests.

### User Expectation That Every API Runs Automatically

The product should say "自动识别并生成可确认配置", not "任意 API 一定可运行".

Non-standard APIs that cannot map to existing runtimes remain drafts.

### LLM Hallucination

The LLM is a draft generator. Deterministic validation must own save eligibility.

### Model Misclassification

Users can correct model purpose. Unknown models are not enabled for workflows.

### Runtime Regression

The `provider::modelId` contract must remain. Runtime changes should be limited to reading the refactored config shape.

### Oversized Files

New functionality should live in focused modules. Existing large hooks should not absorb detection orchestration logic.

### Accidental Paid Calls

Default detection uses free endpoints. Lightweight text calls require confirmation. Image, video, voice, and lip-sync calls never run by default.

### Built-In Recognition Model Unavailable

If the recognition model is unavailable, detection falls back to rules, protocol probes, and manual configuration.

## Implementation Defaults For Planning

The implementation plan should use these defaults unless the user changes them before coding starts:

- Built-in recognition model config uses new server-only environment variables:
  - `CREATIVE_ENGINE_INSPECTOR_PROVIDER`
  - `CREATIVE_ENGINE_INSPECTOR_MODEL`
  - `CREATIVE_ENGINE_INSPECTOR_API_KEY`
  - `CREATIVE_ENGINE_INSPECTOR_BASE_URL`
- The built-in recognition model should call through a dedicated inspector adapter first. It may reuse low-level LLM request helpers, but it should not be wired through user model selection or user provider config.
- The smart-recognition key disclosure appears directly under the key field in the add-engine modal, next to the enabled-by-default toggle.
- `voice-design` remains a `CreativeModelPurpose` mapped to the existing `audio` runtime type in this redesign. It should not become a separate runtime type in this scope.

## Final Conclusion

This redesign turns `API 配置` into `创作引擎` by changing the product mental model, adding automatic detection, and keeping final model decisions under user control.

The platform helps users connect, identify, classify, and select external AI services. It does not decide the creative workflow model choices for them.

本次改造的目标不是让平台替用户做模型决策，而是让外部 AI 服务更容易被接入、识别和选择。
