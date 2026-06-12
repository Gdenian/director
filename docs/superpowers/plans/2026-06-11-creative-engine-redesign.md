# Creative Engine Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将个人中心现有 `API 配置` 重构为 `创作引擎`，让用户接入外部 AI 服务、确认检测结果，并手动选择创作流程模型。

**Architecture:** 保留 `UserPreference.customProviders` 和 `UserPreference.customModels` 两个 JSON 存储位，但把 JSON 内容直接改为 `CreativeEngineConfig` 和 `CreativeModelConfig`。运行时继续通过 `provider::modelId` 合约解析模型，检测逻辑放入 `src/lib/user-api/creative-engine-detection/`，UI 放入新的 `creative-engine` 组件目录，避免继续扩大现有 api-config hooks。

**Tech Stack:** Next.js 15 App Router, React 19, Prisma, Vitest, Zod, OpenAI SDK, existing apiHandler/apiFetch/config-service/model-config-contract/model-capabilities.

---

## Execution Strategy Update After Task 2

Task 1 and Task 2 are complete. From Task 3 onward, execute this plan as task contracts rather than as literal micro-step scripts.

The original task sections intentionally contain detailed code sketches and small TDD steps. They were useful for bootstrapping the refactor, but after the persisted-shape foundation is in place they are too verbose for efficient Subagent-Driven execution. They can also cause review noise when reviewers treat later-task work as current-task blockers.

Updated execution rules:

- Keep the specification document `docs/superpowers/specs/2026-06-11-creative-engine-redesign.md` unchanged unless the user explicitly asks for a spec change.
- Treat each remaining task heading, file list, task summary, and success criteria as authoritative. Treat long code blocks and line-by-line steps below as reference context for test ideas, file locations, and edge cases; they are not mandatory copy-paste instructions.
- Before starting each task, restate its scope, non-scope, verification commands, and review acceptance rules in the subagent prompt.
- For every task, keep the gate: implementation/fix -> focused verification -> fresh spec review -> fresh code quality review.
- Reviews only fail on blockers inside the current task scope. Findings about Task N+1 or future cleanup must be recorded as non-blocking follow-up unless they prove a current-task acceptance criterion is broken. Reviewer prompts must repeat this rule explicitly.
- Do not expand existing oversized files when a focused helper or component can carry the task cleanly.
- Prefer the smallest focused test set that proves the task contract, then use broader suites only when the touched files or guard scripts require them.
- Database/container verification is not a per-step gate. `tests/integration/api/specific/*` in this plan are Vitest route tests with mocked Prisma unless the test itself explicitly says otherwise; they do not imply starting MySQL/Redis/MinIO.
- Do not stop and restart the test database for each task or commit. Run `docker compose up mysql redis minio -d` and `npx prisma db push` only when the touched area genuinely requires a real local database check, or once during Task 9 final smoke if feasible.
- If a hook or guard would force heavy database/container work for a narrow task, use focused verification and record the deferred smoke instead of expanding the task. Commits may use `--no-verify` after the focused verification and review gates have passed.
- When a real local smoke is needed, reuse already running services. Do not shut down shared services unless this session started them and the user asks to stop them.

Compact contracts for the remaining tasks:

| Task | Scope | Required verification | Explicit non-scope |
| --- | --- | --- | --- |
| Task 3 | `/api/user/models` model options and selector filtering by creative purpose/status/key availability. | Focused user-models tests, existing audio-filter regression, purpose rules tests, typecheck. | Product shell, detection, save confirmation, impact checks. |
| Task 4 | Visible product shell/copy and confirmation UI for creative engines. | Copy contract/component-focused tests and typecheck. | Real detection orchestration, impact API, runtime preflight. |
| Task 5 | Deterministic detection orchestration: URL normalization, fingerprinting, free probes, detect route. | Detection unit tests, detect route integration test, typecheck. | Built-in LLM inspector and paid/lightweight runtime tests. |
| Task 6 | Built-in recognition LLM inspector fallback, schema validation, and key redaction. | Inspector/redaction/orchestrator tests and typecheck. | UI confirmation save and usage impact checks. |
| Task 7 | Confirmation save flow and usage impact checks before delete/disable/connection edits. | Usage-impact unit/API tests, UI dialog tests where touched, typecheck. | Runtime preflight and light-test endpoint. |
| Task 8 | Explicit-confirmation lightweight text test and runtime preflight copy/errors. | Runtime-preflight tests, light-test route tests, provider compatibility regression, typecheck. | Broader cleanup or new model discovery behavior. |
| Task 9 | Cleanup, guards, and end-to-end verification of the creative-engine rollout. | Guard scripts, focused suite, broader config-center regression suite, one local smoke where feasible. | New feature work beyond the confirmed spec. |

## Assumptions

- 当前规格文档是 `docs/superpowers/specs/2026-06-11-creative-engine-redesign.md`，提交 `cc86e78` 已确认。
- 本计划只新增和修改代码，不新增 Prisma 表，不写在线迁移脚本。
- `provider::modelId` 的运行时形状不变。新存储形状中 `engineId` 对应 provider，`callName` 对应 modelId，`modelKey = engineId::callName`。
- 保存创作引擎不会写入 `analysisModel`、`characterModel`、`locationModel`、`storyboardModel`、`editModel`、`videoModel`、`audioModel`、`lipSyncModel`、`voiceDesignModel`。
- `voice-design` 是产品用途，运行时仍映射到 `audio`。
- 检测默认只跑免费接口。`light-test` 的文本调用必须由用户显式确认，图片、视频、语音、口型同步不在检测中自动消耗。

## Success Criteria

- 个人中心侧边栏和主模块显示 `创作引擎`，页面描述为 `接入你已有的 AI 服务，并在创作流程中选择需要使用的模型。`
- 添加入口默认只展示服务地址、密钥、自动识别按钮和智能识别开关；技术字段只在手动配置/高级设置中出现。
- `/api/user/api-config` 保存新 JSON 形状，API key 仍加密；GET 返回 `engines`、`models`、`defaultModels`、`capabilityDefaults`、`workflowConcurrency`。
- `/api/user/models` 只返回启用、服务有 key、状态可用或未检查、用途匹配的模型，并带来源/状态元数据。
- `POST /api/user/creative-engines/detect` 返回可确认的检测结果，不静默保存。
- LLM inspector 的 `allowKeyInInspector=false` 不发送完整 key，普通日志不包含完整 key。
- 删除引擎、停用模型、修改连接前能展示受影响的用户默认选择和项目选择。
- 运行前缺模型或模型不可用时只报错提示，不自动替换用户选择。

## File Structure

- Create `src/lib/creative-engine/types.ts`: shared persisted config, detection result, purpose, status, and default-field mapping types.
- Create `src/lib/creative-engine/model-purpose.ts`: purpose/type mapping, selector filtering, model-name heuristic classifier.
- Create `src/lib/creative-engine/persisted-config.ts`: parse/normalize/serialize creative-engine JSON, runtime aliases, key encryption/decryption helpers.
- Create `src/lib/creative-engine/usage-impact.ts`: find selected models affected by deleting/disabling/editing engines/models.
- Modify `src/app/api/user/api-config/route.ts`: delegate JSON parsing/saving to creative-engine helpers and expose `engines`.
- Modify `src/lib/api-config.ts`: read new creative-engine JSON shape while returning the existing runtime `ModelSelection` and `ProviderConfig`.
- Modify `src/app/api/user/models/route.ts`: filter by `purpose`, status, enabled state, and engine key presence.
- Create `src/app/api/user/creative-engines/detect/route.ts`: detection orchestration API.
- Create `src/app/api/user/creative-engines/light-test/route.ts`: explicit-confirmation lightweight text test API.
- Create `src/app/api/user/creative-engines/impact/route.ts`: impact-check API used by UI dialogs.
- Create `src/lib/user-api/creative-engine-detection/types.ts`: detection module request/result contracts.
- Create `src/lib/user-api/creative-engine-detection/url-normalizer.ts`: URL cleanup and candidate generation.
- Create `src/lib/user-api/creative-engine-detection/fingerprint.ts`: known source detection by domain/path/error shape.
- Create `src/lib/user-api/creative-engine-detection/probe-openai.ts`: OpenAI-compatible free probes.
- Create `src/lib/user-api/creative-engine-detection/probe-gemini.ts`: Gemini-compatible free probes.
- Create `src/lib/user-api/creative-engine-detection/probe-official.ts`: reuse low-cost provider-test paths for known providers.
- Create `src/lib/user-api/creative-engine-detection/model-classifier.ts`: deterministic model purpose classification.
- Create `src/lib/user-api/creative-engine-detection/llm-inspector.ts`: built-in recognition LLM with redaction and schema validation.
- Create `src/lib/user-api/creative-engine-detection/result-mapper.ts`: detection result to saveable engine/model drafts.
- Create `src/lib/user-api/creative-engine-detection/orchestrator.ts`: probe order and final detection result assembly.
- Create `src/app/[locale]/profile/components/creative-engine/CreativeEngineTabContainer.tsx`: new page shell and state coordinator.
- Create `src/app/[locale]/profile/components/creative-engine/CreativeEngineHome.tsx`: connected services list.
- Create `src/app/[locale]/profile/components/creative-engine/AddCreativeEngineModal.tsx`: add/detect/manual entry modal.
- Create `src/app/[locale]/profile/components/creative-engine/DetectionResultPanel.tsx`: confirmation panel.
- Create `src/app/[locale]/profile/components/creative-engine/CreativeModelList.tsx`: per-engine model management.
- Create `src/app/[locale]/profile/components/creative-engine/ModelSelectionPanel.tsx`: renamed default-model selection panel.
- Create `src/app/[locale]/profile/components/creative-engine/ModelUsageImpactDialog.tsx`: impact confirmation dialog.
- Modify `src/app/[locale]/profile/components/ApiConfigTab.tsx`: render `CreativeEngineTabContainer`.
- Modify `src/app/[locale]/profile/page.tsx`: keep state key if desired, but visible nav copy comes from messages.
- Modify `messages/zh/profile.json`, `messages/en/profile.json`: `apiConfig` label becomes creative-engine wording.
- Modify `messages/zh/apiConfig.json`, `messages/en/apiConfig.json`: replace visible copy while keeping namespace to reduce routing churn.
- Create tests under `tests/unit/creative-engine/`, `tests/unit/user-api/creative-engine-detection/`, and `tests/integration/api/specific/creative-engine-*.test.ts`.

---

### Task 1: Shared Creative Engine Types And Purpose Rules

**Files:**
- Create: `src/lib/creative-engine/types.ts`
- Create: `src/lib/creative-engine/model-purpose.ts`
- Test: `tests/unit/creative-engine/model-purpose.test.ts`

- [ ] **Step 1: Write the failing purpose mapping test**

```ts
import { describe, expect, it } from 'vitest'
import {
  classifyModelPurposeFromName,
  defaultFieldToPurpose,
  purposeToRuntimeType,
  shouldShowModelForDefaultField,
} from '@/lib/creative-engine/model-purpose'

describe('creative engine model purpose rules', () => {
  it('maps product purposes to existing runtime types', () => {
    expect(purposeToRuntimeType('text')).toBe('llm')
    expect(purposeToRuntimeType('image-generation')).toBe('image')
    expect(purposeToRuntimeType('image-edit')).toBe('image')
    expect(purposeToRuntimeType('video-generation')).toBe('video')
    expect(purposeToRuntimeType('voice-generation')).toBe('audio')
    expect(purposeToRuntimeType('lip-sync')).toBe('lipsync')
    expect(purposeToRuntimeType('voice-design')).toBe('audio')
  })

  it('filters default model fields by purpose', () => {
    expect(defaultFieldToPurpose('analysisModel')).toEqual(['text'])
    expect(defaultFieldToPurpose('characterModel')).toEqual(['image-generation'])
    expect(defaultFieldToPurpose('locationModel')).toEqual(['image-generation'])
    expect(defaultFieldToPurpose('storyboardModel')).toEqual(['image-generation'])
    expect(defaultFieldToPurpose('editModel')).toEqual(['image-edit'])
    expect(defaultFieldToPurpose('videoModel')).toEqual(['video-generation'])
    expect(defaultFieldToPurpose('audioModel')).toEqual(['voice-generation'])
    expect(defaultFieldToPurpose('lipSyncModel')).toEqual(['lip-sync'])
    expect(defaultFieldToPurpose('voiceDesignModel')).toEqual(['voice-design'])
  })

  it('keeps selectors strict and user-controlled', () => {
    expect(shouldShowModelForDefaultField({ purpose: 'image-edit', enabled: true, status: 'available' }, 'storyboardModel')).toBe(false)
    expect(shouldShowModelForDefaultField({ purpose: 'image-generation', enabled: true, status: 'available' }, 'storyboardModel')).toBe(true)
    expect(shouldShowModelForDefaultField({ purpose: 'voice-design', enabled: true, status: 'available' }, 'audioModel')).toBe(false)
    expect(shouldShowModelForDefaultField({ purpose: 'text', enabled: false, status: 'available' }, 'analysisModel')).toBe(false)
    expect(shouldShowModelForDefaultField({ purpose: 'text', enabled: true, status: 'failed' }, 'analysisModel')).toBe(false)
  })

  it('classifies model names only as an editable initial guess', () => {
    expect(classifyModelPurposeFromName('claude-sonnet-4.5')).toMatchObject({ purpose: 'text', confidence: 'high' })
    expect(classifyModelPurposeFromName('doubao-seedream-4-0')).toMatchObject({ purpose: 'image-generation' })
    expect(classifyModelPurposeFromName('gpt-image-edit')).toMatchObject({ purpose: 'image-edit' })
    expect(classifyModelPurposeFromName('veo-3.1-fast')).toMatchObject({ purpose: 'video-generation' })
    expect(classifyModelPurposeFromName('qwen3-tts')).toMatchObject({ purpose: 'voice-generation' })
    expect(classifyModelPurposeFromName('kling-lipsync')).toMatchObject({ purpose: 'lip-sync' })
    expect(classifyModelPurposeFromName('qwen-voice-design')).toMatchObject({ purpose: 'voice-design' })
    expect(classifyModelPurposeFromName('vendor-mystery-model')).toMatchObject({ purpose: 'unknown', confidence: 'low' })
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/unit/creative-engine/model-purpose.test.ts`

Expected: FAIL with an import error for `@/lib/creative-engine/model-purpose`.

- [ ] **Step 3: Add shared types**

Create `src/lib/creative-engine/types.ts`:

```ts
import type { ModelCapabilities, UnifiedModelType } from '@/lib/model-config-contract'
import type { OpenAICompatMediaTemplate } from '@/lib/openai-compat-media-template'

export type CreativeEngineStatus = 'unchecked' | 'available' | 'partial' | 'failed' | 'disabled'
export type CreativeModelStatus = 'unchecked' | 'available' | 'failed' | 'disabled'
export type CreativeDetectionConfidence = 'high' | 'medium' | 'low'

export type CreativeProtocolType =
  | 'official'
  | 'openai-compatible'
  | 'gemini-compatible'
  | 'manual-template'

export type CreativeAuthType = 'bearer' | 'api-key' | 'query-key' | 'custom'

export type CreativeModelPurpose =
  | 'text'
  | 'image-generation'
  | 'image-edit'
  | 'video-generation'
  | 'voice-generation'
  | 'lip-sync'
  | 'voice-design'

export type CreativeModelDraftPurpose = CreativeModelPurpose | 'unknown'

export type CreativeModelDetectionSource = 'rule' | 'provider-list' | 'llm' | 'manual'

export interface CreativeLlmCustomPricing {
  inputPerMillion?: number
  outputPerMillion?: number
}

export interface CreativeMediaCustomPricing {
  basePrice?: number
  optionPrices?: Record<string, Record<string, number>>
}

export interface CreativeModelPricing {
  llm?: CreativeLlmCustomPricing
  image?: CreativeMediaCustomPricing
  video?: CreativeMediaCustomPricing
}

export type DefaultModelField =
  | 'analysisModel'
  | 'characterModel'
  | 'locationModel'
  | 'storyboardModel'
  | 'editModel'
  | 'videoModel'
  | 'audioModel'
  | 'lipSyncModel'
  | 'voiceDesignModel'

export interface CreativeEngineConfig {
  id: string
  name: string
  source?: string
  providerKey: string
  displayProviderName?: string
  serviceUrl?: string
  apiKey?: string
  authType?: CreativeAuthType
  protocolType?: CreativeProtocolType
  apiMode?: 'gemini-sdk' | 'openai-official'
  gatewayRoute?: 'official' | 'openai-compat'
  status: CreativeEngineStatus
  confidence?: CreativeDetectionConfidence
  lastCheckedAt?: string
  allowKeyInInspector?: boolean
  hidden?: boolean
}

export interface CreativeModelConfig {
  id: string
  engineId: string
  name: string
  callName: string
  modelKey: string
  type: UnifiedModelType
  purpose: CreativeModelPurpose
  enabled: boolean
  status: CreativeModelStatus
  confidence?: CreativeDetectionConfidence
  capabilities?: ModelCapabilities
  pricing?: CreativeModelPricing
  llmProtocol?: 'responses' | 'chat-completions'
  compatMediaTemplate?: OpenAICompatMediaTemplate
  lastCheckedAt?: string
  detectionSource?: CreativeModelDetectionSource
  warningCodes?: string[]
}

export interface CreativeModelDraft extends Omit<CreativeModelConfig, 'purpose' | 'enabled'> {
  purpose: CreativeModelDraftPurpose
  enabled: false
}

export interface CreativeModelSelectorCandidate {
  purpose: CreativeModelPurpose
  enabled: boolean
  status: CreativeModelStatus
}
```

- [ ] **Step 4: Add purpose helpers**

Create `src/lib/creative-engine/model-purpose.ts`:

```ts
import type { UnifiedModelType } from '@/lib/model-config-contract'
import type {
  CreativeDetectionConfidence,
  CreativeModelDraftPurpose,
  CreativeModelPurpose,
  CreativeModelSelectorCandidate,
  DefaultModelField,
} from './types'

const DEFAULT_FIELD_PURPOSES: Record<DefaultModelField, CreativeModelPurpose[]> = {
  analysisModel: ['text'],
  characterModel: ['image-generation'],
  locationModel: ['image-generation'],
  storyboardModel: ['image-generation'],
  editModel: ['image-edit'],
  videoModel: ['video-generation'],
  audioModel: ['voice-generation'],
  lipSyncModel: ['lip-sync'],
  voiceDesignModel: ['voice-design'],
}

export function purposeToRuntimeType(purpose: CreativeModelPurpose): UnifiedModelType {
  if (purpose === 'text') return 'llm'
  if (purpose === 'image-generation' || purpose === 'image-edit') return 'image'
  if (purpose === 'video-generation') return 'video'
  if (purpose === 'voice-generation' || purpose === 'voice-design') return 'audio'
  return 'lipsync'
}

export function defaultFieldToPurpose(field: DefaultModelField): CreativeModelPurpose[] {
  return DEFAULT_FIELD_PURPOSES[field]
}

export function shouldShowModelForDefaultField(
  model: CreativeModelSelectorCandidate,
  field: DefaultModelField,
): boolean {
  if (!model.enabled) return false
  if (model.status === 'failed' || model.status === 'disabled') return false
  return defaultFieldToPurpose(field).includes(model.purpose)
}

export function classifyModelPurposeFromName(name: string): {
  purpose: CreativeModelDraftPurpose
  confidence: CreativeDetectionConfidence
} {
  const value = name.toLowerCase()
  if (/(voice[-_ ]?design|音色)/.test(value)) return { purpose: 'voice-design', confidence: 'high' }
  if (/(lip[-_ ]?sync|lipsync|口型|唇形)/.test(value)) return { purpose: 'lip-sync', confidence: 'high' }
  if (/(tts|text[-_ ]?to[-_ ]?speech|speech|voice|语音|配音)/.test(value)) {
    return { purpose: 'voice-generation', confidence: 'medium' }
  }
  if (/(image[-_ ]?edit|edit[-_ ]?image|inpaint|outpaint|修图|编辑)/.test(value)) {
    return { purpose: 'image-edit', confidence: 'medium' }
  }
  if (/(imagen|seedream|flux|sdxl|stable[-_ ]?diffusion|image|banana|图片|图像)/.test(value)) {
    return { purpose: 'image-generation', confidence: 'medium' }
  }
  if (/(veo|kling|wan|seedance|sora|vidu|video|hailuo|视频)/.test(value)) {
    return { purpose: 'video-generation', confidence: 'medium' }
  }
  if (/(gpt|claude|deepseek|qwen|gemini|doubao|llama|mistral|sonnet|haiku|文本|chat)/.test(value)) {
    return { purpose: 'text', confidence: 'high' }
  }
  return { purpose: 'unknown', confidence: 'low' }
}
```

- [ ] **Step 5: Run the test and commit**

Run: `npx vitest run tests/unit/creative-engine/model-purpose.test.ts`

Expected: PASS.

Commit:

```bash
git add src/lib/creative-engine/types.ts src/lib/creative-engine/model-purpose.ts tests/unit/creative-engine/model-purpose.test.ts
git commit -m "feat: add creative engine purpose rules"
```

---

### Task 2: Persisted Config Shape Refactor

**Files:**
- Create: `src/lib/creative-engine/persisted-config.ts`
- Modify: `src/app/api/user/api-config/route.ts`
- Modify: `src/lib/api-config.ts`
- Test: `tests/unit/creative-engine/persisted-config.test.ts`
- Test: `tests/integration/api/specific/creative-engine-api-config-put.test.ts`

- [ ] **Step 1: Write persisted-config tests**

```ts
import { describe, expect, it } from 'vitest'
import { composeModelKey } from '@/lib/model-config-contract'
import {
  normalizeCreativeEngineInput,
  normalizeCreativeModelInput,
  toRuntimeModel,
  toRuntimeProvider,
} from '@/lib/creative-engine/persisted-config'

describe('creative engine persisted config', () => {
  it('normalizes engine storage fields and keeps runtime provider identity', () => {
    const engine = normalizeCreativeEngineInput({
      id: 'openai-compatible:abc',
      name: 'OpenRouter',
      source: 'OpenRouter',
      providerKey: 'openai-compatible',
      serviceUrl: ' https://openrouter.ai/api/v1/ ',
      apiKey: ' sk-test ',
      protocolType: 'openai-compatible',
      status: 'available',
      confidence: 'high',
      allowKeyInInspector: true,
    }, 0)

    expect(engine).toMatchObject({
      id: 'openai-compatible:abc',
      providerKey: 'openai-compatible',
      serviceUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-test',
      status: 'available',
      confidence: 'high',
      allowKeyInInspector: true,
    })

    expect(toRuntimeProvider(engine)).toMatchObject({
      id: 'openai-compatible:abc',
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-test',
      gatewayRoute: 'openai-compat',
    })
  })

  it('normalizes model storage fields and preserves provider::modelId', () => {
    const model = normalizeCreativeModelInput({
      id: 'm-1',
      engineId: 'openai-compatible:abc',
      name: 'Claude Sonnet',
      callName: 'anthropic/claude-sonnet-4.5',
      type: 'llm',
      purpose: 'text',
      enabled: true,
      status: 'available',
      confidence: 'high',
    }, 0)

    expect(model.modelKey).toBe(composeModelKey('openai-compatible:abc', 'anthropic/claude-sonnet-4.5'))
    expect(toRuntimeModel(model)).toMatchObject({
      provider: 'openai-compatible:abc',
      modelId: 'anthropic/claude-sonnet-4.5',
      modelKey: 'openai-compatible:abc::anthropic/claude-sonnet-4.5',
      type: 'llm',
    })
  })

  it('keeps unknown detection drafts disabled by rejecting persisted unknown purpose', () => {
    expect(() => normalizeCreativeModelInput({
      id: 'm-1',
      engineId: 'openai-compatible:abc',
      name: 'Mystery',
      callName: 'mystery',
      type: 'llm',
      purpose: 'unknown',
      enabled: true,
      status: 'available',
    }, 0)).toThrow('CREATIVE_MODEL_PURPOSE_INVALID')
  })
})
```

- [ ] **Step 2: Run the unit test and verify it fails**

Run: `npx vitest run tests/unit/creative-engine/persisted-config.test.ts`

Expected: FAIL with an import error for `@/lib/creative-engine/persisted-config`.

- [ ] **Step 3: Implement persisted config helpers**

Create `src/lib/creative-engine/persisted-config.ts`:

```ts
import { ApiError } from '@/lib/api-errors'
import { composeModelKey, parseModelKeyStrict, type UnifiedModelType } from '@/lib/model-config-contract'
import type { CreativeEngineConfig, CreativeEngineStatus, CreativeModelConfig, CreativeModelPurpose, CreativeModelStatus } from './types'

type RuntimeProvider = {
  id: string
  name: string
  baseUrl?: string
  apiKey?: string
  hidden?: boolean
  apiMode?: 'gemini-sdk' | 'openai-official'
  gatewayRoute?: 'official' | 'openai-compat'
}

type RuntimeModel = {
  modelId: string
  modelKey: string
  name: string
  type: UnifiedModelType
  provider: string
  llmProtocol?: 'responses' | 'chat-completions'
  compatMediaTemplate?: CreativeModelConfig['compatMediaTemplate']
  price: number
  enabled?: boolean
  purpose?: CreativeModelPurpose
  status?: CreativeModelStatus
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function optionalString(value: unknown): string | undefined {
  const text = readString(value)
  return text || undefined
}

function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function isEngineStatus(value: unknown): value is CreativeEngineStatus {
  return value === 'unchecked' || value === 'available' || value === 'partial' || value === 'failed' || value === 'disabled'
}

function isModelStatus(value: unknown): value is CreativeModelStatus {
  return value === 'unchecked' || value === 'available' || value === 'failed' || value === 'disabled'
}

function isRuntimeType(value: unknown): value is UnifiedModelType {
  return value === 'llm' || value === 'image' || value === 'video' || value === 'audio' || value === 'lipsync'
}

function isPurpose(value: unknown): value is CreativeModelPurpose {
  return value === 'text'
    || value === 'image-generation'
    || value === 'image-edit'
    || value === 'video-generation'
    || value === 'voice-generation'
    || value === 'lip-sync'
    || value === 'voice-design'
}

function defaultGatewayRoute(providerKey: string): 'official' | 'openai-compat' {
  return providerKey === 'openai-compatible' ? 'openai-compat' : 'official'
}

export function normalizeCreativeEngineInput(raw: unknown, index: number): CreativeEngineConfig {
  if (!isRecord(raw)) throw new Error(`CREATIVE_ENGINE_PAYLOAD_INVALID: engines[${index}]`)
  const id = readString(raw.id)
  const name = readString(raw.name)
  const providerKey = readString(raw.providerKey)
  if (!id || !name || !providerKey) throw new Error(`CREATIVE_ENGINE_REQUIRED: engines[${index}]`)
  const status = isEngineStatus(raw.status) ? raw.status : 'unchecked'
  const protocolType = raw.protocolType === 'official'
    || raw.protocolType === 'openai-compatible'
    || raw.protocolType === 'gemini-compatible'
    || raw.protocolType === 'manual-template'
    ? raw.protocolType
    : undefined

  return {
    id,
    name,
    providerKey,
    source: optionalString(raw.source),
    displayProviderName: optionalString(raw.displayProviderName),
    serviceUrl: optionalString(raw.serviceUrl),
    apiKey: optionalString(raw.apiKey),
    authType: raw.authType === 'bearer' || raw.authType === 'api-key' || raw.authType === 'query-key' || raw.authType === 'custom' ? raw.authType : undefined,
    protocolType,
    apiMode: raw.apiMode === 'gemini-sdk' || raw.apiMode === 'openai-official' ? raw.apiMode : undefined,
    gatewayRoute: raw.gatewayRoute === 'official' || raw.gatewayRoute === 'openai-compat' ? raw.gatewayRoute : defaultGatewayRoute(providerKey),
    status,
    confidence: raw.confidence === 'high' || raw.confidence === 'medium' || raw.confidence === 'low' ? raw.confidence : undefined,
    lastCheckedAt: optionalString(raw.lastCheckedAt),
    allowKeyInInspector: readBoolean(raw.allowKeyInInspector, false),
    hidden: readBoolean(raw.hidden, false),
  }
}

export function normalizeCreativeModelInput(raw: unknown, index: number): CreativeModelConfig {
  if (!isRecord(raw)) throw new Error(`CREATIVE_MODEL_PAYLOAD_INVALID: models[${index}]`)
  const id = readString(raw.id) || readString(raw.modelKey)
  const engineId = readString(raw.engineId)
  const callName = readString(raw.callName)
  const name = readString(raw.name) || callName
  if (!id || !engineId || !callName || !name) throw new Error(`CREATIVE_MODEL_REQUIRED: models[${index}]`)
  if (!isRuntimeType(raw.type)) throw new Error(`CREATIVE_MODEL_TYPE_INVALID: models[${index}].type`)
  if (!isPurpose(raw.purpose)) throw new Error(`CREATIVE_MODEL_PURPOSE_INVALID: models[${index}].purpose`)

  const modelKey = composeModelKey(engineId, callName)
  const parsedInputKey = parseModelKeyStrict(readString(raw.modelKey))
  if (parsedInputKey && parsedInputKey.modelKey !== modelKey) {
    throw new Error(`CREATIVE_MODEL_KEY_MISMATCH: models[${index}].modelKey`)
  }

  return {
    id,
    engineId,
    name,
    callName,
    modelKey,
    type: raw.type,
    purpose: raw.purpose,
    enabled: readBoolean(raw.enabled, false),
    status: isModelStatus(raw.status) ? raw.status : 'unchecked',
    confidence: raw.confidence === 'high' || raw.confidence === 'medium' || raw.confidence === 'low' ? raw.confidence : undefined,
    capabilities: isRecord(raw.capabilities) ? raw.capabilities as CreativeModelConfig['capabilities'] : undefined,
    pricing: isRecord(raw.pricing) ? raw.pricing as CreativeModelConfig['pricing'] : undefined,
    llmProtocol: raw.llmProtocol === 'responses' || raw.llmProtocol === 'chat-completions' ? raw.llmProtocol : undefined,
    compatMediaTemplate: isRecord(raw.compatMediaTemplate) ? raw.compatMediaTemplate as CreativeModelConfig['compatMediaTemplate'] : undefined,
    lastCheckedAt: optionalString(raw.lastCheckedAt),
    detectionSource: raw.detectionSource === 'rule' || raw.detectionSource === 'provider-list' || raw.detectionSource === 'llm' || raw.detectionSource === 'manual' ? raw.detectionSource : undefined,
    warningCodes: Array.isArray(raw.warningCodes) ? raw.warningCodes.filter((item): item is string => typeof item === 'string') : undefined,
  }
}

export function parseCreativeEngines(raw: string | null | undefined): CreativeEngineConfig[] {
  if (!raw) return []
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) throw new Error('CREATIVE_ENGINE_PAYLOAD_INVALID: customProviders')
  return parsed.map(normalizeCreativeEngineInput)
}

export function parseCreativeModels(raw: string | null | undefined): CreativeModelConfig[] {
  if (!raw) return []
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) throw new Error('CREATIVE_MODEL_PAYLOAD_INVALID: customModels')
  return parsed.map(normalizeCreativeModelInput)
}

export function toRuntimeProvider(engine: CreativeEngineConfig): RuntimeProvider {
  return {
    id: engine.id,
    name: engine.name,
    baseUrl: engine.serviceUrl,
    apiKey: engine.apiKey,
    hidden: engine.hidden,
    apiMode: engine.apiMode,
    gatewayRoute: engine.gatewayRoute ?? defaultGatewayRoute(engine.providerKey),
  }
}

export function toRuntimeModel(model: CreativeModelConfig): RuntimeModel {
  return {
    modelId: model.callName,
    modelKey: model.modelKey,
    name: model.name,
    type: model.type,
    provider: model.engineId,
    llmProtocol: model.llmProtocol,
    compatMediaTemplate: model.compatMediaTemplate,
    price: 0,
    enabled: model.enabled,
    purpose: model.purpose,
    status: model.status,
  }
}

export function toApiError(error: unknown, field: string): ApiError {
  const message = error instanceof Error ? error.message : String(error)
  return new ApiError('INVALID_PARAMS', { code: message.split(':')[0] || 'CREATIVE_ENGINE_INVALID', field })
}
```

- [ ] **Step 4: Update `api-config` PUT/GET to use `engines`**

In `src/app/api/user/api-config/route.ts`, keep existing default model, billing, capability, and concurrency logic. Replace provider parsing/saving with creative-engine parsing:

```ts
import {
  normalizeCreativeEngineInput,
  normalizeCreativeModelInput,
  parseCreativeEngines,
  parseCreativeModels,
  toApiError,
  toRuntimeModel,
  toRuntimeProvider,
} from '@/lib/creative-engine/persisted-config'
```

Add `engines?: unknown` to the PUT body type. In GET, parse `pref.customProviders` with `parseCreativeEngines`, decrypt `engine.apiKey`, and return `engines` instead of `providers`. Convert models through existing pricing/capability enrichment only after `toRuntimeModel`.

In PUT, read:

```ts
const normalizedEngines = body.engines === undefined
  ? undefined
  : (body.engines as unknown[]).map(normalizeCreativeEngineInput)
const normalizedCreativeModels = body.models === undefined
  ? undefined
  : (body.models as unknown[]).map(normalizeCreativeModelInput)
const normalizedModelsInput = normalizedCreativeModels?.map(toRuntimeModel)
```

When saving engines, preserve encrypted keys exactly as current provider code does:

```ts
const enginesToSave = normalizedEngines.map((engine) => {
  const existing = existingEngines.find((candidate) => candidate.id === engine.id)
  const finalApiKey = engine.apiKey === undefined
    ? existing?.apiKey
    : engine.apiKey === ''
      ? undefined
      : encryptApiKey(engine.apiKey)

  return {
    ...engine,
    apiKey: finalApiKey,
  }
})
updateData.customProviders = JSON.stringify(enginesToSave)
```

- [ ] **Step 5: Update runtime parser**

In `src/lib/api-config.ts`, replace `parseCustomProviders` and `parseCustomModels` internals with creative-engine helpers and runtime conversion:

```ts
import {
  parseCreativeEngines,
  parseCreativeModels,
  toRuntimeModel,
  toRuntimeProvider,
} from './creative-engine/persisted-config'
```

Then:

```ts
function parseCustomProviders(rawProviders: string | null | undefined): CustomProvider[] {
  return parseCreativeEngines(rawProviders).map(toRuntimeProvider)
}

function parseCustomModels(rawModels: string | null | undefined): CustomModel[] {
  return parseCreativeModels(rawModels)
    .filter((model) => model.enabled && model.status !== 'disabled' && model.status !== 'failed')
    .map(toRuntimeModel)
}
```

- [ ] **Step 6: Write integration test for new API shape**

Create `tests/integration/api/specific/creative-engine-api-config-put.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import { installAuthMocks, mockAuthenticated, resetAuthMockState } from '../../../helpers/auth'

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(async () => ({ customProviders: null, customModels: null })),
    upsert: vi.fn(async () => ({ id: 'pref-1' })),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/crypto-utils', () => ({
  encryptApiKey: vi.fn((value: string) => `enc:${value}`),
  decryptApiKey: vi.fn((value: string) => value.replace(/^enc:/, '')),
}))
vi.mock('@/lib/billing/mode', () => ({ getBillingMode: vi.fn(async () => 'OFF') }))

describe('creative engine api-config PUT', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resetAuthMockState()
  })

  it('stores engines and models without changing default model selections', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        engines: [{
          id: 'openai-compatible:abc',
          name: 'OpenRouter',
          providerKey: 'openai-compatible',
          serviceUrl: 'https://openrouter.ai/api/v1',
          apiKey: 'sk-test',
          protocolType: 'openai-compatible',
          status: 'available',
          confidence: 'high',
        }],
        models: [{
          id: 'model-1',
          engineId: 'openai-compatible:abc',
          name: 'Claude Sonnet',
          callName: 'anthropic/claude-sonnet-4.5',
          modelKey: 'openai-compatible:abc::anthropic/claude-sonnet-4.5',
          type: 'llm',
          purpose: 'text',
          enabled: true,
          status: 'available',
        }],
      },
    })

    const res = await route.PUT(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)

    const payload = prismaMock.userPreference.upsert.mock.calls[0]?.[0] as {
      update: Record<string, unknown>
    }
    expect(payload.update.analysisModel).toBeUndefined()
    expect(JSON.parse(payload.update.customProviders as string)[0]).toMatchObject({
      id: 'openai-compatible:abc',
      serviceUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'enc:sk-test',
    })
    expect(JSON.parse(payload.update.customModels as string)[0]).toMatchObject({
      engineId: 'openai-compatible:abc',
      callName: 'anthropic/claude-sonnet-4.5',
      modelKey: 'openai-compatible:abc::anthropic/claude-sonnet-4.5',
      purpose: 'text',
    })
  })
})
```

- [ ] **Step 7: Run focused tests and commit**

Run:

```bash
npx vitest run tests/unit/creative-engine/persisted-config.test.ts tests/integration/api/specific/creative-engine-api-config-put.test.ts tests/integration/api/specific/user-api-config-put.test.ts
npm run typecheck
```

Expected: all PASS.

Commit:

```bash
git add src/lib/creative-engine/persisted-config.ts src/app/api/user/api-config/route.ts src/lib/api-config.ts tests/unit/creative-engine/persisted-config.test.ts tests/integration/api/specific/creative-engine-api-config-put.test.ts
git commit -m "feat: refactor api config storage to creative engines"
```

---

### Task 3: Model Options Endpoint And Selector Filtering

**Files:**
- Modify: `src/app/api/user/models/route.ts`
- Modify: `src/app/[locale]/profile/components/api-config-tab/hooks/useApiConfigFilters.ts`
- Test: `tests/integration/api/specific/creative-engine-user-models.test.ts`
- Test: `tests/unit/creative-engine/model-purpose.test.ts`

- [ ] **Step 1: Write API model filtering test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({ session: { user: { id: 'user-1' } } })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(async () => ({
      customProviders: JSON.stringify([
        { id: 'engine-1', name: 'Engine 1', providerKey: 'openai-compatible', apiKey: 'enc-key', status: 'available' },
        { id: 'engine-2', name: 'Engine 2', providerKey: 'openai-compatible', apiKey: 'enc-key', status: 'failed' },
      ]),
      customModels: JSON.stringify([
        { id: 'm1', engineId: 'engine-1', name: 'Text', callName: 'gpt-5', modelKey: 'engine-1::gpt-5', type: 'llm', purpose: 'text', enabled: true, status: 'available' },
        { id: 'm2', engineId: 'engine-1', name: 'Image', callName: 'flux', modelKey: 'engine-1::flux', type: 'image', purpose: 'image-generation', enabled: true, status: 'available' },
        { id: 'm3', engineId: 'engine-1', name: 'Voice Design', callName: 'qwen-voice-design', modelKey: 'engine-1::qwen-voice-design', type: 'audio', purpose: 'voice-design', enabled: true, status: 'available' },
        { id: 'm4', engineId: 'engine-2', name: 'Failed Engine Text', callName: 'bad', modelKey: 'engine-2::bad', type: 'llm', purpose: 'text', enabled: true, status: 'available' },
        { id: 'm5', engineId: 'engine-1', name: 'Disabled', callName: 'disabled', modelKey: 'engine-1::disabled', type: 'llm', purpose: 'text', enabled: false, status: 'available' },
      ]),
    })),
  },
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/model-capabilities/catalog', () => ({ findBuiltinCapabilities: vi.fn(() => undefined) }))
vi.mock('@/lib/model-pricing/catalog', () => ({ findBuiltinPricingCatalogEntry: vi.fn(() => undefined) }))

describe('creative engine user models endpoint', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns selectable models grouped by runtime type with purpose metadata', async () => {
    const mod = await import('@/app/api/user/models/route')
    const res = await mod.GET(buildMockRequest({ path: '/api/user/models', method: 'GET' }), { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const body = await res.json() as {
      llm: Array<{ value: string; purpose: string; engineStatus: string }>
      image: Array<{ value: string; purpose: string }>
      audio: Array<{ value: string; purpose: string }>
    }
    expect(body.llm.map((item) => item.value)).toEqual(['engine-1::gpt-5'])
    expect(body.llm[0]).toMatchObject({ purpose: 'text', engineStatus: 'available' })
    expect(body.image.map((item) => item.value)).toEqual(['engine-1::flux'])
    expect(body.audio.map((item) => item.value)).toEqual([])
    expect((body as { voiceDesign?: Array<{ value: string }> }).voiceDesign?.map((item) => item.value)).toEqual(['engine-1::qwen-voice-design'])
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/integration/api/specific/creative-engine-user-models.test.ts`

Expected: FAIL because `/api/user/models` still reads legacy `provider/modelId` fields and has no `voiceDesign` group.

- [ ] **Step 3: Update `/api/user/models`**

In `src/app/api/user/models/route.ts`, parse engines/models through creative-engine helpers. Extend payload:

```ts
interface UserModelOption {
  value: string
  label: string
  provider?: string
  providerName?: string
  purpose?: CreativeModelPurpose
  engineStatus?: CreativeEngineStatus
  modelStatus?: CreativeModelStatus
  source?: string
  confidence?: CreativeDetectionConfidence
  capabilities?: ModelCapabilities
  videoPricingTiers?: VideoPricingTier[]
}

interface UserModelsPayload {
  llm: UserModelOption[]
  image: UserModelOption[]
  video: UserModelOption[]
  audio: UserModelOption[]
  lipsync: UserModelOption[]
  voiceDesign: UserModelOption[]
}
```

Filtering rule:

```ts
const engine = engineById.get(model.engineId)
if (!engine?.apiKey) continue
if (engine.status === 'disabled' || engine.status === 'failed') continue
if (!model.enabled) continue
if (model.status === 'disabled' || model.status === 'failed') continue
```

Group voice design separately:

```ts
if (model.purpose === 'voice-design') {
  grouped.voiceDesign.push(option)
  continue
}
grouped[model.type].push(option)
```

- [ ] **Step 4: Update client selector filtering**

In `src/app/[locale]/profile/components/api-config-tab/hooks/useApiConfigFilters.ts`, replace model-id based voice-design special case with purpose-based filtering:

```ts
if (model.purpose === 'voice-design') {
  grouped.voicedesign.push(option)
  continue
}
if (model.purpose === 'voice-generation') {
  grouped.audio.push(option)
  continue
}
```

Keep the old `qwen-voice-design` exclusion only as a fallback for preset data that is still local during this task.

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
npx vitest run tests/integration/api/specific/creative-engine-user-models.test.ts tests/integration/api/specific/user-models-audio-filter.test.ts tests/unit/creative-engine/model-purpose.test.ts
npm run typecheck
```

Expected: all PASS.

Commit:

```bash
git add src/app/api/user/models/route.ts src/app/[locale]/profile/components/api-config-tab/hooks/useApiConfigFilters.ts tests/integration/api/specific/creative-engine-user-models.test.ts
git commit -m "feat: expose creative engine model options"
```

---

### Task 4: Product Shell, Copy, And Confirmation UI

**Files:**
- Create: `src/app/[locale]/profile/components/creative-engine/CreativeEngineTabContainer.tsx`
- Create: `src/app/[locale]/profile/components/creative-engine/CreativeEngineHome.tsx`
- Create: `src/app/[locale]/profile/components/creative-engine/AddCreativeEngineModal.tsx`
- Create: `src/app/[locale]/profile/components/creative-engine/DetectionResultPanel.tsx`
- Create: `src/app/[locale]/profile/components/creative-engine/CreativeModelList.tsx`
- Create: `src/app/[locale]/profile/components/creative-engine/ModelSelectionPanel.tsx`
- Modify: `src/app/[locale]/profile/components/ApiConfigTab.tsx`
- Modify: `messages/zh/profile.json`
- Modify: `messages/en/profile.json`
- Modify: `messages/zh/apiConfig.json`
- Modify: `messages/en/apiConfig.json`
- Test: `tests/unit/creative-engine/ui-copy-contract.test.ts`

- [ ] **Step 1: Write copy contract test**

```ts
import { describe, expect, it } from 'vitest'
import zhApiConfig from '../../../messages/zh/apiConfig.json'
import enApiConfig from '../../../messages/en/apiConfig.json'
import zhProfile from '../../../messages/zh/profile.json'

const forbiddenZh = ['生成默认方案', '自动配置创作方案', '已为你选择最佳模型', '已自动分配模型']

describe('creative engine UI copy contract', () => {
  it('renames profile navigation and main module', () => {
    expect(zhProfile.apiConfig).toBe('创作引擎')
    expect(zhApiConfig.title).toBe('创作引擎')
    expect(zhApiConfig.providerPool).toBe('已接入的服务')
    expect(zhApiConfig.defaultModels).toBe('模型选择')
    expect(enApiConfig.title).toBe('Creative Engine')
  })

  it('contains required disclosure and confirmation copy', () => {
    expect(zhApiConfig.creativeEngine.description).toBe('接入你已有的 AI 服务，并在创作流程中选择需要使用的模型。')
    expect(zhApiConfig.creativeEngine.smartRecognitionDisclosure).toContain('完整密钥')
    expect(zhApiConfig.creativeEngine.saveEngine).toBe('保存创作引擎')
    expect(zhApiConfig.creativeEngine.skipDetectionAndSave).toBe('跳过检测并保存')
  })

  it('does not contain forbidden automatic-decision copy', () => {
    const serialized = JSON.stringify(zhApiConfig)
    for (const phrase of forbiddenZh) {
      expect(serialized.includes(phrase)).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Run the copy test and verify it fails**

Run: `npx vitest run tests/unit/creative-engine/ui-copy-contract.test.ts`

Expected: FAIL because messages still say `API 配置`.

- [ ] **Step 3: Add message keys**

In `messages/zh/profile.json`, set:

```json
{
  "apiConfig": "创作引擎"
}
```

In `messages/zh/apiConfig.json`, update existing visible keys and add `creativeEngine`:

```json
{
  "title": "创作引擎",
  "providerPool": "已接入的服务",
  "providerPoolDesc": "接入你已有的 AI 服务，并在创作流程中选择需要使用的模型。",
  "defaultModels": "模型选择",
  "addGeminiProvider": "添加创作引擎",
  "baseUrl": "服务地址",
  "modelDisplayName": "模型名称",
  "modelActualId": "模型调用名",
  "testConnection": "检测是否可用",
  "addAnyway": "跳过检测并保存",
  "creativeEngine": {
    "description": "接入你已有的 AI 服务，并在创作流程中选择需要使用的模型。",
    "addTitle": "添加创作引擎",
    "addDescription": "粘贴你从其他平台获得的服务地址和密钥，我们会自动识别可用模型。",
    "serviceAddress": "服务地址",
    "key": "密钥",
    "autoDetect": "自动识别",
    "manualConfig": "手动配置",
    "smartRecognition": "智能识别",
    "smartRecognitionDisclosure": "开启后，完整密钥可能会发送给平台内置识别模型用于判断服务类型。你可以在识别前关闭。",
    "saveEngine": "保存创作引擎",
    "viewModels": "查看模型列表",
    "redetect": "重新识别",
    "manualAdjust": "手动调整",
    "goSelectModel": "去选择模型",
    "continueAdding": "继续添加",
    "done": "完成",
    "saveSuccess": "创作引擎已添加。你可以在模型选择中使用这些模型。",
    "skipDetectionAndSave": "跳过检测并保存"
  }
}
```

Mirror the same key names in `messages/en/apiConfig.json` with English copy.

- [ ] **Step 4: Create UI shell**

Create `src/app/[locale]/profile/components/creative-engine/CreativeEngineTabContainer.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { ApiConfigToolbar } from '../api-config-tab/ApiConfigToolbar'
import { useProviders } from '../api-config'
import { CreativeEngineHome } from './CreativeEngineHome'
import { AddCreativeEngineModal } from './AddCreativeEngineModal'
import { ModelSelectionPanel } from './ModelSelectionPanel'

export function CreativeEngineTabContainer() {
  const t = useTranslations('apiConfig')
  const state = useProviders()
  const [isAddOpen, setIsAddOpen] = useState(false)

  return (
    <div className="flex h-full flex-col">
      <ApiConfigToolbar
        title={t('title')}
        saveStatus={state.saveStatus}
        savingState={null}
        savingLabel={t('saving')}
        savedLabel={t('saved')}
        saveFailedLabel={t('saveFailed')}
      />
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-6 p-6">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-[var(--glass-text-secondary)]">{t('creativeEngine.description')}</p>
            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              className="glass-button-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
            >
              <AppIcon name="plus" className="h-4 w-4" />
              {t('creativeEngine.addTitle')}
            </button>
          </div>
          <CreativeEngineHome providers={state.providers} models={state.models} onAdd={() => setIsAddOpen(true)} />
          <ModelSelectionPanel state={state} />
        </div>
      </div>
      {isAddOpen ? (
        <AddCreativeEngineModal
          onClose={() => setIsAddOpen(false)}
          onSaved={() => {
            setIsAddOpen(false)
            void state.flushConfig()
          }}
        />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 5: Create add modal with required disclosure**

Create `src/app/[locale]/profile/components/creative-engine/AddCreativeEngineModal.tsx` with local state for `serviceUrl`, `apiKey`, `allowKeyInInspector`, `mode`, and detection result. The detection button sends:

```ts
await apiFetch('/api/user/creative-engines/detect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    serviceUrl,
    apiKey,
    allowKeyInInspector,
  }),
})
```

The disclosure must render directly under the key input:

```tsx
<label className="flex items-start gap-2 text-xs text-[var(--glass-text-secondary)]">
  <input
    type="checkbox"
    checked={allowKeyInInspector}
    onChange={(event) => setAllowKeyInInspector(event.target.checked)}
  />
  <span>{t('creativeEngine.smartRecognitionDisclosure')}</span>
</label>
```

- [ ] **Step 6: Render detection confirmation, not autosave**

Create `DetectionResultPanel.tsx` with buttons `保存创作引擎`, `查看模型列表`, `重新识别`, and `手动调整`. The save button calls the existing config save hook with `engines` and classified `models`; it must not call `updateDefaultModel`.

The component must show:

```tsx
<dl className="grid grid-cols-2 gap-3 text-sm">
  <div><dt>{t('creativeEngine.source')}</dt><dd>{result.source}</dd></div>
  <div><dt>{t('creativeEngine.confidence')}</dt><dd>{result.confidence}</dd></div>
  <div><dt>{t('creativeEngine.modelCount')}</dt><dd>{result.models.length}</dd></div>
  <div><dt>{t('creativeEngine.serviceAddress')}</dt><dd>{result.normalizedBaseUrl}</dd></div>
</dl>
```

- [ ] **Step 7: Switch `ApiConfigTab` to new shell**

Modify `src/app/[locale]/profile/components/ApiConfigTab.tsx`:

```tsx
import { CreativeEngineTabContainer } from './creative-engine/CreativeEngineTabContainer'

export default function ApiConfigTab() {
  return <CreativeEngineTabContainer />
}
```

- [ ] **Step 8: Run copy/type checks and commit**

Run:

```bash
npx vitest run tests/unit/creative-engine/ui-copy-contract.test.ts
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add src/app/[locale]/profile/components/creative-engine src/app/[locale]/profile/components/ApiConfigTab.tsx messages/zh/profile.json messages/en/profile.json messages/zh/apiConfig.json messages/en/apiConfig.json tests/unit/creative-engine/ui-copy-contract.test.ts
git commit -m "feat: add creative engine product shell"
```

---

### Task 5: Deterministic Detection Orchestration

**Files:**
- Create: `src/lib/user-api/creative-engine-detection/types.ts`
- Create: `src/lib/user-api/creative-engine-detection/url-normalizer.ts`
- Create: `src/lib/user-api/creative-engine-detection/fingerprint.ts`
- Create: `src/lib/user-api/creative-engine-detection/probe-openai.ts`
- Create: `src/lib/user-api/creative-engine-detection/probe-gemini.ts`
- Create: `src/lib/user-api/creative-engine-detection/probe-official.ts`
- Create: `src/lib/user-api/creative-engine-detection/model-classifier.ts`
- Create: `src/lib/user-api/creative-engine-detection/result-mapper.ts`
- Create: `src/lib/user-api/creative-engine-detection/orchestrator.ts`
- Create: `src/app/api/user/creative-engines/detect/route.ts`
- Test: `tests/unit/user-api/creative-engine-detection/url-normalizer.test.ts`
- Test: `tests/unit/user-api/creative-engine-detection/fingerprint.test.ts`
- Test: `tests/unit/user-api/creative-engine-detection/orchestrator.test.ts`
- Test: `tests/integration/api/specific/creative-engine-detect-route.test.ts`

- [ ] **Step 1: Write URL normalizer tests**

```ts
import { describe, expect, it } from 'vitest'
import { normalizeCreativeEngineUrl } from '@/lib/user-api/creative-engine-detection/url-normalizer'

describe('creative engine URL normalizer', () => {
  it('trims and removes trailing slashes', () => {
    expect(normalizeCreativeEngineUrl(' https://api.example.com/v1/// ').primaryUrl).toBe('https://api.example.com/v1')
  })

  it('rolls endpoint URLs back to base path', () => {
    expect(normalizeCreativeEngineUrl('https://api.example.com/v1/chat/completions').primaryUrl).toBe('https://api.example.com/v1')
    expect(normalizeCreativeEngineUrl('https://api.example.com/v1/models').primaryUrl).toBe('https://api.example.com/v1')
  })

  it('adds a v1 candidate for likely OpenAI-compatible bases', () => {
    expect(normalizeCreativeEngineUrl('https://api.example.com').candidates).toContain('https://api.example.com/v1')
  })

  it('suggests known API URL from common homepages', () => {
    expect(normalizeCreativeEngineUrl('https://openrouter.ai').primaryUrl).toBe('https://openrouter.ai/api/v1')
  })
})
```

- [ ] **Step 2: Write fingerprint tests**

```ts
import { describe, expect, it } from 'vitest'
import { fingerprintCreativeEngineSource } from '@/lib/user-api/creative-engine-detection/fingerprint'

describe('creative engine fingerprint', () => {
  it.each([
    ['https://openrouter.ai/api/v1', 'openrouter'],
    ['https://api.openai.com/v1', 'openai'],
    ['https://generativelanguage.googleapis.com/v1beta', 'google-ai-studio'],
    ['https://ark.cn-beijing.volces.com/api/v3', 'volcengine-ark'],
    ['https://dashscope.aliyuncs.com/compatible-mode/v1', 'alibaba-bailian'],
    ['https://api.siliconflow.cn/v1', 'siliconflow'],
    ['https://api.minimaxi.com/v1', 'minimax'],
    ['https://api.vidu.cn', 'vidu'],
    ['https://queue.fal.run', 'fal'],
    ['https://api.302.ai/v1', '302-ai'],
  ])('detects %s as %s', (url, source) => {
    expect(fingerprintCreativeEngineSource({ url }).source).toBe(source)
  })
})
```

- [ ] **Step 3: Add detection types**

Create `types.ts`:

```ts
import type { CreativeDetectionConfidence, CreativeModelDraftPurpose, CreativeProtocolType } from '@/lib/creative-engine/types'

export type DetectionFailureCategory =
  | 'key-invalid'
  | 'service-unreachable'
  | 'interface-unsupported'
  | 'rate-limited'
  | 'balance-insufficient'
  | 'provider-error'
  | 'partial-compatibility'

export interface CreativeEngineDetectRequest {
  serviceUrl: string
  apiKey: string
  allowKeyInInspector: boolean
}

export interface DetectedModelDraft {
  name: string
  callName: string
  purpose: CreativeModelDraftPurpose
  confidence: CreativeDetectionConfidence
}

export interface CreativeEngineDetectionResult {
  source: string
  recommendedProviderKey: string
  protocolType: CreativeProtocolType
  normalizedBaseUrl: string
  confidence: CreativeDetectionConfidence
  models: DetectedModelDraft[]
  warnings: string[]
  risks: string[]
  failureCategory?: DetectionFailureCategory
  requiresManualModelEntry?: boolean
}

export interface ProbeResult {
  ok: boolean
  source?: string
  protocolType?: CreativeProtocolType
  confidence: CreativeDetectionConfidence
  models: DetectedModelDraft[]
  warnings: string[]
  failureCategory?: DetectionFailureCategory
}
```

- [ ] **Step 4: Implement normalizer and fingerprint**

`url-normalizer.ts` should export `normalizeCreativeEngineUrl(input)` returning `{ primaryUrl, candidates, warnings }`. Use a known homepage map:

```ts
const KNOWN_HOME_API_URLS: Record<string, string> = {
  'openrouter.ai': 'https://openrouter.ai/api/v1',
  'api.openai.com': 'https://api.openai.com/v1',
  'aistudio.google.com': 'https://generativelanguage.googleapis.com/v1beta',
  'dashscope.aliyuncs.com': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  'api.siliconflow.cn': 'https://api.siliconflow.cn/v1',
  'api.minimaxi.com': 'https://api.minimaxi.com/v1',
}
```

`fingerprint.ts` should return `{ source, providerKey, confidence, protocolType }` using deterministic domain rules.

- [ ] **Step 5: Implement OpenAI and Gemini free probes**

`probe-openai.ts` uses `GET ${candidate}/models` with `Authorization: Bearer ${apiKey}`. Parse both `{ data: [{ id }] }` and `{ models: [{ name }] }`. Map status:

```ts
if (response.status === 401 || response.status === 403) failureCategory = 'key-invalid'
if (response.status === 429) failureCategory = 'rate-limited'
if (response.status === 402) failureCategory = 'balance-insufficient'
if (response.status === 404 || response.status === 405) warnings.push('MODEL_LIST_UNSUPPORTED')
```

`probe-gemini.ts` should call a models list endpoint with key as query parameter only for Gemini-compatible candidates. It must not send text generation requests.

- [ ] **Step 6: Implement orchestrator**

`orchestrator.ts` probe order:

```ts
export async function detectCreativeEngine(request: CreativeEngineDetectRequest): Promise<CreativeEngineDetectionResult> {
  const normalized = normalizeCreativeEngineUrl(request.serviceUrl)
  const fingerprint = fingerprintCreativeEngineSource({ url: normalized.primaryUrl })
  const openaiResult = await probeOpenAICompatibleModels({ urls: normalized.candidates, apiKey: request.apiKey })
  if (openaiResult.ok) return mapProbeResultToDetection({ normalized, fingerprint, probe: openaiResult })

  const geminiResult = await probeGeminiCompatibleModels({ urls: normalized.candidates, apiKey: request.apiKey })
  if (geminiResult.ok) return mapProbeResultToDetection({ normalized, fingerprint, probe: geminiResult })

  const officialResult = await probeOfficialCreativeEngine({ fingerprint, normalizedBaseUrl: normalized.primaryUrl, apiKey: request.apiKey })
  if (officialResult.ok) return mapProbeResultToDetection({ normalized, fingerprint, probe: officialResult })

  return {
    source: fingerprint.source,
    recommendedProviderKey: fingerprint.providerKey,
    protocolType: fingerprint.protocolType,
    normalizedBaseUrl: normalized.primaryUrl,
    confidence: 'low',
    models: [],
    warnings: [...normalized.warnings, 'MODEL_LIST_UNREADABLE'],
    risks: ['这个服务没有开放模型列表接口。你仍然可以手动添加模型调用名。'],
    failureCategory: openaiResult.failureCategory ?? geminiResult.failureCategory ?? officialResult.failureCategory,
    requiresManualModelEntry: true,
  }
}
```

- [ ] **Step 7: Add detect route**

Create `src/app/api/user/creative-engines/detect/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { detectCreativeEngine } from '@/lib/user-api/creative-engine-detection/orchestrator'

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => null)
  if (!body || typeof body.serviceUrl !== 'string' || typeof body.apiKey !== 'string') {
    throw new ApiError('INVALID_PARAMS', { code: 'CREATIVE_ENGINE_DETECT_INVALID', field: 'body' })
  }

  const result = await detectCreativeEngine({
    serviceUrl: body.serviceUrl,
    apiKey: body.apiKey,
    allowKeyInInspector: body.allowKeyInInspector !== false,
  })

  return NextResponse.json(result)
})
```

- [ ] **Step 8: Run tests and commit**

Run:

```bash
npx vitest run tests/unit/user-api/creative-engine-detection/url-normalizer.test.ts tests/unit/user-api/creative-engine-detection/fingerprint.test.ts tests/unit/user-api/creative-engine-detection/orchestrator.test.ts tests/integration/api/specific/creative-engine-detect-route.test.ts
npm run typecheck
```

Expected: all PASS.

Commit:

```bash
git add src/lib/user-api/creative-engine-detection src/app/api/user/creative-engines/detect/route.ts tests/unit/user-api/creative-engine-detection tests/integration/api/specific/creative-engine-detect-route.test.ts
git commit -m "feat: add creative engine detection"
```

---

### Task 6: Built-In Recognition LLM Inspector

**Files:**
- Create: `src/lib/user-api/creative-engine-detection/llm-inspector.ts`
- Modify: `src/lib/user-api/creative-engine-detection/orchestrator.ts`
- Test: `tests/unit/user-api/creative-engine-detection/llm-inspector.test.ts`
- Test: `tests/unit/user-api/creative-engine-detection/inspector-redaction.test.ts`

- [ ] **Step 1: Write inspector schema and redaction tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  buildInspectorPayload,
  parseInspectorOutput,
  redactSecret,
} from '@/lib/user-api/creative-engine-detection/llm-inspector'

describe('creative engine LLM inspector', () => {
  it('validates structured JSON output', () => {
    const parsed = parseInspectorOutput(JSON.stringify({
      source: 'OpenRouter',
      recommendedProviderKey: 'openai-compatible',
      protocolType: 'openai-compatible',
      normalizedBaseUrl: 'https://openrouter.ai/api/v1',
      confidence: 'high',
      models: [{ name: 'Claude', callName: 'anthropic/claude-sonnet-4.5', purpose: 'llm', confidence: 'high' }],
      warnings: [],
    }))
    expect(parsed.models[0]).toMatchObject({ purpose: 'llm' })
  })

  it('rejects malformed or unsafe output', () => {
    expect(() => parseInspectorOutput('not json')).toThrow('INSPECTOR_OUTPUT_INVALID')
    expect(() => parseInspectorOutput(JSON.stringify({
      source: 'Bad',
      recommendedProviderKey: 'x',
      protocolType: 'arbitrary-rest',
      normalizedBaseUrl: 'https://x.test',
      confidence: 'high',
      models: [],
      warnings: [],
    }))).toThrow('INSPECTOR_OUTPUT_INVALID')
  })

  it('omits the full key when allowKeyInInspector is false', () => {
    const payload = buildInspectorPayload({
      serviceUrl: 'https://api.example.com/v1',
      apiKey: 'sk-secret-full',
      allowKeyInInspector: false,
      probeLogs: ['401 sk-secret-full'],
      responseSamples: ['{"error":"bad sk-secret-full"}'],
    })
    expect(JSON.stringify(payload)).not.toContain('sk-secret-full')
    expect(JSON.stringify(payload)).toContain('sk-...full')
  })

  it('may include the full key when explicitly allowed', () => {
    const payload = buildInspectorPayload({
      serviceUrl: 'https://api.example.com/v1',
      apiKey: 'sk-secret-full',
      allowKeyInInspector: true,
      probeLogs: [],
      responseSamples: [],
    })
    expect(JSON.stringify(payload)).toContain('sk-secret-full')
  })

  it('redacts secrets in normal logs', () => {
    expect(redactSecret('abc sk-secret-full xyz', 'sk-secret-full')).toBe('abc sk-...full xyz')
  })
})
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run tests/unit/user-api/creative-engine-detection/llm-inspector.test.ts tests/unit/user-api/creative-engine-detection/inspector-redaction.test.ts`

Expected: FAIL due missing `llm-inspector.ts`.

- [ ] **Step 3: Implement inspector**

Use server-only env vars:

- `CREATIVE_ENGINE_INSPECTOR_PROVIDER`
- `CREATIVE_ENGINE_INSPECTOR_MODEL`
- `CREATIVE_ENGINE_INSPECTOR_API_KEY`
- `CREATIVE_ENGINE_INSPECTOR_BASE_URL`

`llm-inspector.ts` must include a Zod schema:

```ts
const InspectorOutputSchema = z.object({
  source: z.string().min(1),
  recommendedProviderKey: z.string().min(1),
  protocolType: z.enum(['openai-compatible', 'gemini-compatible', 'official', 'manual-template']),
  normalizedBaseUrl: z.string().url(),
  confidence: z.enum(['high', 'medium', 'low']),
  models: z.array(z.object({
    name: z.string().min(1),
    callName: z.string().min(1),
    purpose: z.enum(['llm', 'image', 'video', 'audio', 'lipsync', 'voice-design', 'unknown']),
    confidence: z.enum(['high', 'medium', 'low']),
  })),
  warnings: z.array(z.string()),
})
```

Map inspector purposes to draft purposes:

```ts
const INSPECTOR_PURPOSE_MAP = {
  llm: 'text',
  image: 'image-generation',
  video: 'video-generation',
  audio: 'voice-generation',
  lipsync: 'lip-sync',
  'voice-design': 'voice-design',
  unknown: 'unknown',
} as const
```

The prompt must state:

```text
你只能生成配置草稿。不能声称已经保存，不能推荐默认创作方案，不能自动分配模型。
```

- [ ] **Step 4: Wire inspector as fallback**

In `orchestrator.ts`, after deterministic probes fail or return low confidence, call inspector if env config exists. Pass `allowKeyInInspector` from request. Validate output, merge warnings, and keep `requiresManualModelEntry=true` when protocol is `manual-template` and there is no existing runtime mapping.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npx vitest run tests/unit/user-api/creative-engine-detection/llm-inspector.test.ts tests/unit/user-api/creative-engine-detection/inspector-redaction.test.ts tests/unit/user-api/creative-engine-detection/orchestrator.test.ts
npm run typecheck
```

Expected: all PASS.

Commit:

```bash
git add src/lib/user-api/creative-engine-detection/llm-inspector.ts src/lib/user-api/creative-engine-detection/orchestrator.ts tests/unit/user-api/creative-engine-detection/llm-inspector.test.ts tests/unit/user-api/creative-engine-detection/inspector-redaction.test.ts
git commit -m "feat: add creative engine recognition inspector"
```

---

### Task 7: Confirmation Save And Impact Checks

**Files:**
- Create: `src/lib/creative-engine/usage-impact.ts`
- Create: `src/app/api/user/creative-engines/impact/route.ts`
- Modify: `src/app/[locale]/profile/components/creative-engine/DetectionResultPanel.tsx`
- Modify: `src/app/[locale]/profile/components/creative-engine/ModelUsageImpactDialog.tsx`
- Modify: `src/app/[locale]/profile/components/creative-engine/CreativeModelList.tsx`
- Test: `tests/unit/creative-engine/usage-impact.test.ts`
- Test: `tests/integration/api/specific/creative-engine-impact-route.test.ts`

- [ ] **Step 1: Write usage impact tests**

```ts
import { describe, expect, it } from 'vitest'
import { findCreativeEngineUsageImpact } from '@/lib/creative-engine/usage-impact'

describe('creative engine usage impact', () => {
  it('reports user defaults and project selections affected by engine deletion', () => {
    const impact = findCreativeEngineUsageImpact({
      target: { type: 'engine', engineId: 'engine-1' },
      models: [
        { modelKey: 'engine-1::gpt-5', engineId: 'engine-1', name: 'GPT 5' },
        { modelKey: 'engine-1::veo', engineId: 'engine-1', name: 'Veo' },
      ],
      userDefaults: { analysisModel: 'engine-1::gpt-5' },
      projects: [{ projectId: 'p1', title: 'Project A', videoModel: 'engine-1::veo' }],
    })
    expect(impact.affectedCount).toBe(2)
    expect(impact.items).toEqual([
      { scope: 'user-default', field: 'analysisModel', label: '文本分析模型', modelKey: 'engine-1::gpt-5', modelName: 'GPT 5' },
      { scope: 'project', projectId: 'p1', projectTitle: 'Project A', field: 'videoModel', label: '视频生成模型', modelKey: 'engine-1::veo', modelName: 'Veo' },
    ])
  })
})
```

- [ ] **Step 2: Implement `usage-impact.ts`**

Create functions:

```ts
export function findCreativeEngineUsageImpact(input: {
  target: { type: 'engine'; engineId: string } | { type: 'model'; modelKey: string }
  models: Array<{ modelKey: string; engineId: string; name: string }>
  userDefaults: Partial<Record<DefaultModelField, string | null>>
  projects: Array<Partial<Record<DefaultModelField, string | null>> & { projectId: string; title?: string | null }>
}): { affectedCount: number; items: CreativeEngineUsageImpactItem[] }
```

Use labels:

```ts
const FIELD_LABELS: Record<DefaultModelField, string> = {
  analysisModel: '文本分析模型',
  characterModel: '角色生成模型',
  locationModel: '场景生成模型',
  storyboardModel: '分镜生成模型',
  editModel: '图片编辑模型',
  videoModel: '视频生成模型',
  audioModel: '语音生成模型',
  lipSyncModel: '口型同步模型',
  voiceDesignModel: '音色设计模型',
}
```

- [ ] **Step 3: Add impact route**

`src/app/api/user/creative-engines/impact/route.ts` reads user preferences and projects owned by the user. Request body:

```ts
type ImpactRequest = {
  target:
    | { type: 'engine'; engineId: string }
    | { type: 'model'; modelKey: string }
}
```

Response:

```ts
{
  affectedCount: number,
  items: CreativeEngineUsageImpactItem[]
}
```

- [ ] **Step 4: Connect impact dialogs**

Before deleting an engine, disabling a model, or changing service URL/key, call the impact route. Show these exact Chinese messages:

```text
这个创作引擎中的 {count} 个模型正在被使用。删除后，相关创作流程可能无法运行。
这个模型正在被「{label}」使用。停用后，{label} 将无法运行。
修改后会影响使用该创作引擎的模型。历史生成结果不受影响，之后的新任务会使用新的连接信息。
```

Dialog buttons:

```text
查看使用位置
替换模型
仍然删除
仍然停用
取消
```

The destructive action only runs after the user clicks the matching confirm button.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npx vitest run tests/unit/creative-engine/usage-impact.test.ts tests/integration/api/specific/creative-engine-impact-route.test.ts
npm run typecheck
```

Expected: all PASS.

Commit:

```bash
git add src/lib/creative-engine/usage-impact.ts src/app/api/user/creative-engines/impact/route.ts src/app/[locale]/profile/components/creative-engine tests/unit/creative-engine/usage-impact.test.ts tests/integration/api/specific/creative-engine-impact-route.test.ts
git commit -m "feat: add creative engine usage impact checks"
```

---

### Task 8: Lightweight Test And Runtime Preflight Copy

**Files:**
- Create: `src/app/api/user/creative-engines/light-test/route.ts`
- Create: `src/lib/creative-engine/runtime-preflight.ts`
- Modify: `src/lib/config-service.ts`
- Modify: `src/lib/api-config.ts`
- Test: `tests/unit/creative-engine/runtime-preflight.test.ts`
- Test: `tests/integration/api/specific/creative-engine-light-test-route.test.ts`
- Test: `tests/unit/user-api/provider-test-compatible.test.ts`

- [ ] **Step 1: Write runtime preflight tests**

```ts
import { describe, expect, it } from 'vitest'
import { getCreativeEnginePreflightMessage } from '@/lib/creative-engine/runtime-preflight'

describe('creative engine runtime preflight messages', () => {
  it('reports missing model selections without auto-fixing them', () => {
    expect(getCreativeEnginePreflightMessage({ code: 'MISSING_TEXT_MODEL' })).toBe('当前还没有选择文本分析模型，请先选择一个文本模型。')
    expect(getCreativeEnginePreflightMessage({ code: 'MISSING_IMAGE_MODEL' })).toBe('当前流程需要图片模型，请先选择角色、场景或分镜使用的图片模型。')
  })

  it('reports unavailable selected model', () => {
    expect(getCreativeEnginePreflightMessage({ code: 'MODEL_UNAVAILABLE' })).toBe('当前选择的模型暂时不可用，请重新检测或更换模型。')
  })
})
```

- [ ] **Step 2: Implement preflight helper**

Create `runtime-preflight.ts`:

```ts
export type CreativeEnginePreflightCode =
  | 'MISSING_TEXT_MODEL'
  | 'MISSING_IMAGE_MODEL'
  | 'MISSING_VIDEO_MODEL'
  | 'MISSING_VOICE_MODEL'
  | 'MODEL_UNAVAILABLE'

export function getCreativeEnginePreflightMessage(input: { code: CreativeEnginePreflightCode }): string {
  switch (input.code) {
    case 'MISSING_TEXT_MODEL':
      return '当前还没有选择文本分析模型，请先选择一个文本模型。'
    case 'MISSING_IMAGE_MODEL':
      return '当前流程需要图片模型，请先选择角色、场景或分镜使用的图片模型。'
    case 'MISSING_VIDEO_MODEL':
      return '当前流程需要视频模型，请先选择一个视频生成模型。'
    case 'MISSING_VOICE_MODEL':
      return '当前流程需要语音模型，请先选择一个语音模型。'
    case 'MODEL_UNAVAILABLE':
      return '当前选择的模型暂时不可用，请重新检测或更换模型。'
  }
}
```

Use this helper in `config-service.ts` where missing config messages are generated, and in `api-config.ts` when `resolveModelSelection` fails because the selected model is disabled/failed.

- [ ] **Step 3: Add explicit-confirmation light-test route**

`light-test` request:

```ts
type LightTestRequest = {
  protocolType: 'openai-compatible' | 'gemini-compatible'
  serviceUrl: string
  apiKey: string
  modelCallName: string
  confirmedCostRisk: boolean
}
```

The route rejects unconfirmed calls:

```ts
if (body.confirmedCostRisk !== true) {
  throw new ApiError('INVALID_PARAMS', {
    code: 'CREATIVE_ENGINE_LIGHT_TEST_CONFIRMATION_REQUIRED',
    field: 'confirmedCostRisk',
  })
}
```

For OpenAI-compatible text, send a minimal chat completion with `max_tokens: 1`. Do not add image/video/audio/lipsync paths.

- [ ] **Step 4: Write light-test API test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import { installAuthMocks, mockAuthenticated, resetAuthMockState } from '../../../helpers/auth'

vi.mock('openai', () => ({
  default: class OpenAI {
    chat = { completions: { create: vi.fn(async () => ({ choices: [{ message: { content: 'ok' } }] })) } }
  },
}))

describe('creative engine light-test route', () => {
  it('requires explicit confirmation before a paid text call', async () => {
    resetAuthMockState()
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/creative-engines/light-test/route')
    const res = await route.POST(buildMockRequest({
      path: '/api/user/creative-engines/light-test',
      method: 'POST',
      body: {
        protocolType: 'openai-compatible',
        serviceUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        modelCallName: 'gpt-5-mini',
        confirmedCostRisk: false,
      },
    }), { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npx vitest run tests/unit/creative-engine/runtime-preflight.test.ts tests/integration/api/specific/creative-engine-light-test-route.test.ts tests/unit/user-api/provider-test-compatible.test.ts
npm run typecheck
```

Expected: all PASS.

Commit:

```bash
git add src/app/api/user/creative-engines/light-test/route.ts src/lib/creative-engine/runtime-preflight.ts src/lib/config-service.ts src/lib/api-config.ts tests/unit/creative-engine/runtime-preflight.test.ts tests/integration/api/specific/creative-engine-light-test-route.test.ts
git commit -m "feat: add creative engine runtime preflight"
```

---

### Task 9: Cleanup, Guards, And End-To-End Verification

**Files:**
- Modify only files already touched by earlier tasks when checks reveal direct regressions.
- Test/guard commands only.

- [ ] **Step 1: Scan for forbidden visible copy**

Run:

```bash
rg -n "API 配置|厂商资源池|默认模型配置|新增模型服务商|测试连接|仍然添加|生成默认方案|自动配置创作方案|已为你选择最佳模型|已自动分配模型" src messages
```

Expected: no hits for user-facing creative-engine UI. Allowed hits only in historical tests or internal comments that are not rendered. If a rendered hit remains, replace it with the product-language mapping from the spec.

- [ ] **Step 2: Run config and provider guards**

Run:

```bash
npm run check:no-provider-guessing
npm run check:no-model-key-downgrade
npm run check:model-config-contract
```

Expected: all PASS. If `no-provider-guessing` flags detection code, adjust the guard or detection code so runtime selection remains strict and only detection drafts use fingerprint guesses.

- [ ] **Step 3: Run focused creative-engine suite**

Run:

```bash
npx vitest run tests/unit/creative-engine tests/unit/user-api/creative-engine-detection tests/integration/api/specific/creative-engine-api-config-put.test.ts tests/integration/api/specific/creative-engine-user-models.test.ts tests/integration/api/specific/creative-engine-detect-route.test.ts tests/integration/api/specific/creative-engine-impact-route.test.ts tests/integration/api/specific/creative-engine-light-test-route.test.ts
```

Expected: all PASS.

- [ ] **Step 4: Run broader config-center regression suite**

Run:

```bash
npx vitest run tests/integration/api/specific/user-api-config-put.test.ts tests/integration/api/specific/user-api-config-probe-model-llm-protocol.test.ts tests/integration/api/specific/user-models-audio-filter.test.ts tests/unit/user-api/provider-test-compatible.test.ts tests/unit/user-api/model-llm-protocol-probe.test.ts tests/unit/helpers/workspace-model-setup.test.ts
npm run typecheck
```

Expected: all PASS.

- [ ] **Step 5: Manual local smoke**

Run:

```bash
docker compose up mysql redis minio -d
npx prisma db push
npm run dev
```

Open `http://localhost:3000/profile`. Verify:

- Sidebar shows `创作引擎`.
- Main title shows `创作引擎`.
- Connected services section says `已接入的服务`.
- Add modal defaults to service address, key, auto-detect, and smart-recognition disclosure.
- Detection result page has `保存创作引擎`, `查看模型列表`, `重新识别`, `手动调整`.
- Saving a detected engine does not change model-selection fields until the user uses `模型选择`.

- [ ] **Step 6: Final commit**

Commit remaining verified changes:

```bash
git add src messages tests
git commit -m "feat: complete creative engine redesign"
```

---

## Self-Review

**Spec coverage:**

- Product renaming and language: Task 4 and Task 9.
- JSON shape refactor without new tables: Task 2.
- Runtime `provider::modelId` contract: Task 1, Task 2, Task 3, Task 9.
- Detection orchestration: Task 5.
- Built-in recognition model and key disclosure: Task 4 and Task 6.
- Non-standard API draft handling: Task 5 and Task 6.
- Confirmation before saving: Task 4 and Task 7.
- Model selection remains user-controlled: Task 2, Task 3, Task 4.
- Impact checks: Task 7.
- Runtime preflight messages: Task 8.
- Accidental paid-call prevention: Task 5 and Task 8.
- Cleanup and regression verification: Task 9.

**Placeholder scan:**

- The plan avoids deferred placeholder markers, open-ended validation instructions, and references to undefined task artifacts.
- Each new module has a stated responsibility, concrete tests, and at least one implementation snippet.

**Type consistency:**

- `CreativeEngineConfig.id` is the runtime provider id.
- `CreativeModelConfig.engineId` maps to runtime `provider`.
- `CreativeModelConfig.callName` maps to runtime `modelId`.
- `CreativeModelConfig.modelKey` remains `engineId::callName`.
- `voice-design` remains a purpose and maps to runtime `audio`.
