# Media Contract Connector Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified `MediaContract` layer so image/video models from OpenAI-compatible services, relay stations, Gemini-compatible services, and official adapters can declare, test, and safely execute granular media capabilities.

**Architecture:** Store optional `mediaContract` metadata on `CreativeModelConfig` inside the existing `UserPreference` JSON fields, beside the existing `compatMediaTemplate`. Runtime uses the contract only when present and falls back to current legacy routing when absent. Detection creates unchecked media drafts, explicit media tests update capability statuses, and workflow selectors consume only passed or trusted granular capabilities.

**Tech Stack:** Next.js 15 App Router, React 19, Prisma `UserPreference` JSON storage, Vitest, existing creative-engine config center, existing OpenAI-compatible media templates, `fetch`, `FormData`, and existing outbound image normalization helpers.

---

## Assumptions

- The approved spec is `docs/superpowers/specs/2026-06-15-media-contract-connector-design.md`.
- No Prisma table or migration is needed.
- `provider::modelId` remains the runtime model key contract.
- `compatMediaTemplate` remains the concrete HTTP execution detail for template-backed media models.
- Missing `mediaContract` preserves legacy generation behavior.
- `/models` success never marks image/video capabilities as passed.
- Image/video tests can consume quota, so the media-test route must require `confirmedCost: true`.
- Voice and lip-sync are outside this migration.
- Real API keys must be redacted from logs, docs, tests, and generated assistant output.

## Success Criteria

- Old creative-engine configs and old `compatMediaTemplate` models still parse, save, and run.
- New image/video models can store `mediaContract`, `mediaContractCheckedAt`, and `mediaContractSource`.
- Invalid contracts produce field-specific errors.
- Template-backed image/video runtime prepares `publicUrl`, `dataUrlBase64`, `rawBase64`, `multipartFile`, and array variants according to the contract.
- AISENYU-style sync image, JSON reference image, multipart image edit, and Agnes-style async public-URL video can be represented and tested with mocked upstreams.
- OpenAI-compatible and relay detection produces unchecked media drafts, not passed media capabilities.
- Explicit media tests show safe diagnostics and update only the tested capability.
- Workflow model selectors can filter by `text-to-image`, `image-edit`, `image-to-video`, and `first-last-frame-video` status.

## File Structure

- Create `src/lib/media-contract/types.ts`: canonical `MediaContract`, capability, executor, input/output, source, and status types.
- Create `src/lib/media-contract/validator.ts`: parse and validate contracts with field-specific issue objects.
- Create `src/lib/media-contract/status.ts`: capability/status helpers, trusted official adapter rules, workflow capability mapping.
- Create `src/lib/media-contract/input-preparation.ts`: convert workflow image inputs into contract-required formats.
- Create `src/lib/media-contract/runtime.ts`: runtime capability validation and executor guards.
- Create `src/lib/media-contract/test-diagnostics.ts`: normalize media-test failures into user-facing diagnostic codes/messages.
- Modify `src/lib/creative-engine/types.ts`: add optional media contract fields to `CreativeModelConfig`.
- Modify `src/lib/creative-engine/persisted-config.ts`: parse, preserve, and expose media contracts to runtime models.
- Modify `src/lib/api-config.ts`: include `mediaContract` in `CustomModel` and `ModelSelection`.
- Modify `src/app/api/user/api-config/route.ts`: accept/save/read media contracts in the existing API config payload.
- Modify `src/app/[locale]/profile/components/api-config/types.ts`: add media contract fields to frontend `CustomModel`.
- Modify `src/components/assistant/useAssistantChat.ts` and `src/lib/assistant-platform/types.ts`: allow assistant draft models to carry a media contract.
- Modify `src/lib/assistant-platform/skills/api-config-template.ts`: validate/redact assistant-generated `mediaContract` drafts.
- Modify `src/lib/model-gateway/types.ts`: add optional `mediaContract` to OpenAI-compatible image/video requests.
- Modify `src/lib/model-gateway/openai-compat/template-image.ts`: prepare template variables via media contract for image execution.
- Modify `src/lib/model-gateway/openai-compat/template-video.ts`: prepare template variables via media contract for video execution.
- Modify `src/lib/generator-api.ts`: route with media-contract capability checks when present, legacy behavior when absent.
- Create `src/lib/user-api/creative-engine-detection/media-contract-drafts.ts`: deterministic media draft generation for OpenAI-compatible, relay, Gemini-compatible, and official adapters.
- Modify `src/lib/user-api/creative-engine-detection/types.ts`: add draft `mediaContract` and optional `compatMediaTemplate` to `DetectedModelDraft`.
- Modify `src/lib/user-api/creative-engine-detection/result-mapper.ts`: attach media draft metadata to detection results.
- Create `src/lib/user-api/media-contract-test/runner.ts`: mocked/testable media capability probe runner.
- Create `src/lib/user-api/media-contract-test/save-result.ts`: persist one capability test result back to `customModels`.
- Create `src/app/api/user/creative-engines/media-test/route.ts`: explicit-confirmation media test endpoint.
- Create `src/app/[locale]/profile/components/api-config/provider-card/MediaCapabilityRows.tsx`: show granular capability rows and test actions.
- Modify `src/app/[locale]/profile/components/api-config/provider-card/ProviderAdvancedFields.tsx`: render capability rows for image/video models.
- Modify `src/lib/query/hooks/useUserModels.ts`: expose media contract metadata and capability summary to clients.
- Modify `src/app/api/user/models/route.ts`: include media contract metadata in model options.
- Create `src/lib/media-contract/workflow-filter.ts`: filter model options by required granular capability.
- Add tests under `tests/unit/media-contract/`, `tests/unit/user-api/media-contract-test/`, `tests/unit/user-api/creative-engine-detection/`, `tests/unit/model-gateway/`, `tests/unit/api-config/`, and focused integration route tests under `tests/integration/api/specific/`.

---

### Task 1: MediaContract Types, Validator, And Persistence

**Files:**
- Create: `src/lib/media-contract/types.ts`
- Create: `src/lib/media-contract/validator.ts`
- Create: `src/lib/media-contract/status.ts`
- Modify: `src/lib/creative-engine/types.ts`
- Modify: `src/lib/creative-engine/persisted-config.ts`
- Modify: `src/lib/api-config.ts`
- Test: `tests/unit/media-contract/validator.test.ts`
- Test: `tests/unit/creative-engine/persisted-config.test.ts`
- Test: `tests/unit/api-config/creative-engine-runtime-config.test.ts`

- [ ] **Step 1: Write failing validator tests**

```ts
import { describe, expect, it } from 'vitest'
import { validateMediaContract } from '@/lib/media-contract/validator'

describe('media contract validator', () => {
  it('accepts template-backed AISENYU-style image contract', () => {
    const result = validateMediaContract({
      version: 1,
      mediaType: 'image',
      executor: 'openai-compat-template',
      capabilities: ['text-to-image', 'image-to-image', 'image-edit'],
      input: {
        image: 'dataUrlBase64',
        images: 'dataUrlBase64Array',
      },
      output: {
        kind: 'url',
        urlPath: '$.data[0].url',
        base64Path: '$.data[0].b64_json',
      },
      testStatus: {
        textToImage: 'unchecked',
        imageToImage: 'unchecked',
        imageEdit: 'unchecked',
      },
      source: 'manual',
    }, {
      modelMediaType: 'image',
      hasCompatMediaTemplate: true,
    })

    expect(result.ok).toBe(true)
    expect(result.contract?.executor).toBe('openai-compat-template')
  })

  it('rejects video capability on image contract', () => {
    const result = validateMediaContract({
      version: 1,
      mediaType: 'image',
      executor: 'openai-standard',
      capabilities: ['image-to-video'],
      input: {},
      output: { kind: 'url', urlPath: '$.data[0].url' },
    }, {
      modelMediaType: 'image',
      hasCompatMediaTemplate: false,
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'MEDIA_CONTRACT_CAPABILITY_MEDIA_TYPE_MISMATCH',
      field: 'capabilities[0]',
    }))
  })

  it('requires compatMediaTemplate for template executor', () => {
    const result = validateMediaContract({
      version: 1,
      mediaType: 'video',
      executor: 'openai-compat-template',
      capabilities: ['image-to-video'],
      input: { image: 'publicUrl' },
      output: { kind: 'asyncTask', urlPath: '$.remixed_from_video_id' },
    }, {
      modelMediaType: 'video',
      hasCompatMediaTemplate: false,
    })

    expect(result.ok).toBe(false)
    expect(result.issues[0]).toMatchObject({
      code: 'MEDIA_CONTRACT_TEMPLATE_REQUIRED',
      field: 'executor',
    })
  })
})
```

Run: `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/media-contract/validator.test.ts`

Expected: FAIL because `@/lib/media-contract/validator` does not exist.

- [ ] **Step 2: Add type and validator modules**

Implement these exported names:

```ts
export type MediaContractExecutor =
  | 'official-adapter'
  | 'openai-standard'
  | 'gemini-standard'
  | 'openai-compat-template'

export type MediaCapability =
  | 'text-to-image'
  | 'image-to-image'
  | 'image-edit'
  | 'text-to-video'
  | 'image-to-video'
  | 'first-last-frame-video'

export type MediaCapabilityStatus = 'unchecked' | 'passed' | 'failed' | 'unavailable'
export type MediaContractSource = 'rule' | 'provider-list' | 'llm' | 'manual' | 'official-adapter'
export type MediaInputFormat = 'publicUrl' | 'dataUrlBase64' | 'rawBase64' | 'multipartFile'
export type MediaInputArrayFormat = 'publicUrlArray' | 'dataUrlBase64Array' | 'rawBase64Array' | 'multipartFiles'

export interface MediaContract {
  version: 1
  mediaType: 'image' | 'video'
  executor: MediaContractExecutor
  capabilities: MediaCapability[]
  input: {
    image?: MediaInputFormat
    images?: MediaInputArrayFormat
    lastFrameImage?: MediaInputFormat
  }
  output: {
    kind: 'url' | 'urlArray' | 'base64' | 'asyncTask'
    urlPath?: string
    urlsPath?: string
    base64Path?: string
  }
  testStatus?: {
    textToImage?: MediaCapabilityStatus
    imageToImage?: MediaCapabilityStatus
    imageEdit?: MediaCapabilityStatus
    textToVideo?: MediaCapabilityStatus
    imageToVideo?: MediaCapabilityStatus
    firstLastFrameVideo?: MediaCapabilityStatus
  }
  checkedAt?: string
  source?: MediaContractSource
}
```

`validateMediaContract(raw, context)` must return:

```ts
type MediaContractValidationIssue = {
  code:
    | 'MEDIA_CONTRACT_INVALID'
    | 'MEDIA_CONTRACT_MEDIA_TYPE_MISMATCH'
    | 'MEDIA_CONTRACT_CAPABILITY_MEDIA_TYPE_MISMATCH'
    | 'MEDIA_CONTRACT_TEMPLATE_REQUIRED'
    | 'MEDIA_CONTRACT_OUTPUT_PATH_REQUIRED'
  field: string
  message: string
}
```

Keep the validator dependency-free and deterministic. Normalize duplicate capabilities and statuses; reject unknown enum values with the exact `field` path.

- [ ] **Step 3: Persist mediaContract in creative-engine config**

Extend `CreativeModelConfig` with:

```ts
mediaContract?: import('@/lib/media-contract/types').MediaContract
mediaContractCheckedAt?: string
mediaContractSource?: import('@/lib/media-contract/types').MediaContractSource
```

In `src/lib/creative-engine/persisted-config.ts`:

- Add `normalizeMediaContract(value, index, modelType, hasCompatMediaTemplate)`.
- Call it after `compatMediaTemplate` is normalized.
- Include `mediaContract`, `mediaContractCheckedAt`, and `mediaContractSource` in `normalizeCreativeModelInput()`.
- Include the same fields in `toRuntimeModel()`.

Add this focused assertion to `tests/unit/creative-engine/persisted-config.test.ts`:

```ts
it('normalizes and exposes media contracts to runtime models', () => {
  const model = normalizeCreativeModelInput({
    id: 'm-image',
    engineId: 'openai-compatible:relay',
    name: 'GPT Image',
    callName: 'gpt-image-2',
    type: 'image',
    purpose: 'image-generation',
    enabled: true,
    status: 'available',
    compatMediaTemplate: {
      version: 1,
      mediaType: 'image',
      mode: 'sync',
      create: { method: 'POST', path: '/images/generations', contentType: 'application/json' },
      response: { outputUrlPath: '$.data[0].url' },
    },
    mediaContract: {
      version: 1,
      mediaType: 'image',
      executor: 'openai-compat-template',
      capabilities: ['text-to-image'],
      input: {},
      output: { kind: 'url', urlPath: '$.data[0].url' },
      testStatus: { textToImage: 'passed' },
      source: 'manual',
    },
  }, 0)

  expect(toRuntimeModel(model)).toMatchObject({
    mediaContract: {
      executor: 'openai-compat-template',
      testStatus: { textToImage: 'passed' },
    },
  })
})
```

- [ ] **Step 4: Include mediaContract in api-config runtime selection**

In `src/lib/api-config.ts`:

- Add `mediaContract?: MediaContract` to `CustomModel`.
- Add `mediaContract?: MediaContract` to `ModelSelection`.
- Return `mediaContract` from both `resolveModelSelection()` and `resolveSingleModelSelection()` for image/video models, regardless of provider key.

Add this assertion to `tests/unit/api-config/creative-engine-runtime-config.test.ts`:

```ts
await expect(resolveModelSelection(
  'user-1',
  'openai-compatible:abc::gpt-image-2',
  'image',
)).resolves.toMatchObject({
  mediaContract: {
    mediaType: 'image',
    executor: 'openai-compat-template',
  },
})
```

- [ ] **Step 5: Run focused verification**

Run:

```bash
BILLING_TEST_BOOTSTRAP=0 npx vitest run \
  tests/unit/media-contract/validator.test.ts \
  tests/unit/creative-engine/persisted-config.test.ts \
  tests/unit/api-config/creative-engine-runtime-config.test.ts
npm run typecheck
```

Expected: all tests PASS and typecheck exits with code 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/media-contract src/lib/creative-engine/types.ts src/lib/creative-engine/persisted-config.ts src/lib/api-config.ts tests/unit/media-contract/validator.test.ts tests/unit/creative-engine/persisted-config.test.ts tests/unit/api-config/creative-engine-runtime-config.test.ts
git commit -m "feat: add media contract persistence"
```

---

### Task 2: API Config Save/Read And Assistant Draft Support

**Files:**
- Modify: `src/app/api/user/api-config/route.ts`
- Modify: `src/app/[locale]/profile/components/api-config/types.ts`
- Modify: `src/components/assistant/useAssistantChat.ts`
- Modify: `src/lib/assistant-platform/types.ts`
- Modify: `src/lib/assistant-platform/skills/api-config-template.ts`
- Test: `tests/unit/api-config/creative-engine-runtime-config.test.ts`
- Test: `tests/unit/api-config/use-assistant-chat-saved-events.test.ts`
- Test: `tests/unit/assistant-platform/skills-api-config-template.test.ts`

- [ ] **Step 1: Write failing API config preservation test**

Add a test that posts or normalizes a custom image model with both `compatMediaTemplate` and `mediaContract`, then expects GET/readback payloads to preserve both. Use an image model shaped like:

```ts
const relayImageModel = {
  modelId: 'gpt-image-2',
  modelKey: 'openai-compatible:relay::gpt-image-2',
  name: 'GPT Image 2',
  type: 'image',
  provider: 'openai-compatible:relay',
  compatMediaTemplate: {
    version: 1,
    mediaType: 'image',
    mode: 'sync',
    create: {
      method: 'POST',
      path: '/images/generations',
      contentType: 'application/json',
      bodyTemplate: { model: '{{model}}', prompt: '{{prompt}}', image: '{{image}}' },
    },
    response: { outputUrlPath: '$.data[0].url' },
  },
  mediaContract: {
    version: 1,
    mediaType: 'image',
    executor: 'openai-compat-template',
    capabilities: ['text-to-image', 'image-to-image'],
    input: { image: 'dataUrlBase64' },
    output: { kind: 'url', urlPath: '$.data[0].url' },
    testStatus: { textToImage: 'unchecked', imageToImage: 'unchecked' },
    source: 'llm',
  },
}
```

Expected: FAIL because route normalization drops `mediaContract`.

- [ ] **Step 2: Accept media contract fields in API config route**

In `normalizeStoredModel()`:

- Import `validateMediaContract`.
- Validate `raw.mediaContract` with `modelMediaType: modelType` and `hasCompatMediaTemplate: Boolean(compatMediaTemplate)`.
- Reject invalid contracts with:

```ts
throw new ApiError('INVALID_PARAMS', {
  code: 'MODEL_MEDIA_CONTRACT_INVALID',
  field: `models[${index}].mediaContract`,
})
```

- Preserve `mediaContractCheckedAt` and `mediaContractSource`.

In `runtimeModelToCreativeModel()`, `mergeRuntimeModelIntoCreativeModel()`, and `syncCreativeModelsFromRuntime()`, copy the three media contract fields exactly like the existing `compatMediaTemplate` fields.

- [ ] **Step 3: Update frontend and assistant draft types**

Add optional fields to frontend `CustomModel`:

```ts
mediaContract?: MediaContract
mediaContractCheckedAt?: string
mediaContractSource?: MediaContractSource
```

Update `AssistantDraftModel` and `AssistantToolResult` so assistant drafts can carry:

```ts
mediaContract?: MediaContract
```

In `parseDraftModel()`, accept `mediaContract` only when it is an object. Do not display or log API keys in this parsing path.

- [ ] **Step 4: Validate assistant-generated media contracts**

In `src/lib/assistant-platform/skills/api-config-template.ts`:

- Import `validateMediaContract`.
- When an assistant tool result contains `mediaContract`, validate it with the draft model type and whether `compatMediaTemplate` exists.
- Save draft output with both `compatMediaTemplate` and `mediaContract`.
- Never allow assistant output to set `testStatus.* = 'passed'`; force all assistant-provided statuses to `unchecked`.

Add this test:

```ts
expect(result.draftModel?.mediaContract).toMatchObject({
  executor: 'openai-compat-template',
  testStatus: {
    imageToVideo: 'unchecked',
  },
})
```

- [ ] **Step 5: Run focused verification**

Run:

```bash
BILLING_TEST_BOOTSTRAP=0 npx vitest run \
  tests/unit/api-config/creative-engine-runtime-config.test.ts \
  tests/unit/api-config/use-assistant-chat-saved-events.test.ts \
  tests/unit/assistant-platform/skills-api-config-template.test.ts
npm run typecheck
```

Expected: all tests PASS and no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/user/api-config/route.ts src/app/[locale]/profile/components/api-config/types.ts src/components/assistant/useAssistantChat.ts src/lib/assistant-platform/types.ts src/lib/assistant-platform/skills/api-config-template.ts tests/unit/api-config/creative-engine-runtime-config.test.ts tests/unit/api-config/use-assistant-chat-saved-events.test.ts tests/unit/assistant-platform/skills-api-config-template.test.ts
git commit -m "feat: persist media contract drafts"
```

---

### Task 3: Media Input Preparation

**Files:**
- Create: `src/lib/media-contract/input-preparation.ts`
- Test: `tests/unit/media-contract/input-preparation.test.ts`

- [ ] **Step 1: Write failing input preparation tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareMediaInputs } from '@/lib/media-contract/input-preparation'

const normalizeToOriginalMediaUrl = vi.hoisted(() => vi.fn(async (input: string) => `https://signed.test/${input}`))
const normalizeToBase64ForGeneration = vi.hoisted(() => vi.fn(async () => 'data:image/png;base64,QUJD'))

vi.mock('@/lib/media/outbound-image', () => ({
  normalizeToOriginalMediaUrl,
  normalizeToBase64ForGeneration,
}))

describe('prepareMediaInputs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('prepares public URL image for Agnes-style image-to-video', async () => {
    const result = await prepareMediaInputs({
      capability: 'image-to-video',
      contract: {
        version: 1,
        mediaType: 'video',
        executor: 'openai-compat-template',
        capabilities: ['image-to-video'],
        input: { image: 'publicUrl' },
        output: { kind: 'asyncTask', urlPath: '$.remixed_from_video_id' },
      },
      image: 'images/panel.png',
    })

    expect(result.values.image).toBe('https://signed.test/images/panel.png')
    expect(result.diagnostics).toEqual([])
  })

  it('prepares data URL and raw base64 variants', async () => {
    const dataUrl = await prepareMediaInputs({
      capability: 'image-to-image',
      contract: {
        version: 1,
        mediaType: 'image',
        executor: 'openai-compat-template',
        capabilities: ['image-to-image'],
        input: { image: 'dataUrlBase64' },
        output: { kind: 'url', urlPath: '$.data[0].url' },
      },
      image: 'images/ref.png',
    })
    expect(dataUrl.values.image).toBe('data:image/png;base64,QUJD')

    const raw = await prepareMediaInputs({
      capability: 'image-to-image',
      contract: {
        version: 1,
        mediaType: 'image',
        executor: 'openai-compat-template',
        capabilities: ['image-to-image'],
        input: { image: 'rawBase64' },
        output: { kind: 'url', urlPath: '$.data[0].url' },
      },
      image: 'images/ref.png',
    })
    expect(raw.values.image).toBe('QUJD')
  })

  it('fails before provider call when public URL input is missing', async () => {
    const result = await prepareMediaInputs({
      capability: 'image-to-video',
      contract: {
        version: 1,
        mediaType: 'video',
        executor: 'openai-compat-template',
        capabilities: ['image-to-video'],
        input: { image: 'publicUrl' },
        output: { kind: 'asyncTask', urlPath: '$.video_url' },
      },
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]).toMatchObject({
      code: 'MEDIA_INPUT_PUBLIC_URL_REQUIRED',
      field: 'image',
    })
  })
})
```

Run: `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/media-contract/input-preparation.test.ts`

Expected: FAIL because `prepareMediaInputs` does not exist.

- [ ] **Step 2: Implement `prepareMediaInputs()`**

Export:

```ts
export type PreparedMediaInputValues = {
  image?: string
  images?: string[]
  lastFrameImage?: string
}

export type MediaInputDiagnosticCode =
  | 'MEDIA_INPUT_PUBLIC_URL_REQUIRED'
  | 'MEDIA_INPUT_BASE64_CONVERSION_FAILED'
  | 'MEDIA_INPUT_MULTIPART_CONVERSION_FAILED'
  | 'MEDIA_INPUT_LAST_FRAME_REQUIRED'
  | 'MEDIA_INPUT_FORMAT_UNSUPPORTED_BY_CONTRACT'

export type MediaInputDiagnostic = {
  code: MediaInputDiagnosticCode
  field: 'image' | 'images' | 'lastFrameImage'
  message: string
}
```

Implementation rules:

- `publicUrl`: call `normalizeToOriginalMediaUrl()`.
- `dataUrlBase64`: call `normalizeToBase64ForGeneration()`.
- `rawBase64`: call `normalizeToBase64ForGeneration()` and strip the `data:*;base64,` prefix.
- `multipartFile`: return a data URL string; existing template runtime converts multipart file fields with `toUploadFile()`.
- Array variants apply the same conversion to each item.
- For missing required `image` or `lastFrameImage`, return `ok: false` with the diagnostic code from the spec.
- Do not throw for user-fixable input conversion failures; return `ok: false` with diagnostics.

- [ ] **Step 3: Add array and last-frame coverage**

Add tests for:

```ts
expect(result.values.images).toEqual([
  'data:image/png;base64,QUJD',
  'data:image/png;base64,QUJD',
])
expect(result.values.lastFrameImage).toBe('https://signed.test/images/end.png')
```

Use capability `first-last-frame-video`, contract input `{ image: 'publicUrl', lastFrameImage: 'publicUrl' }`, and two image references for array tests.

- [ ] **Step 4: Run focused verification**

Run:

```bash
BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/media-contract/input-preparation.test.ts
npm run typecheck
```

Expected: all tests PASS and typecheck exits with code 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/media-contract/input-preparation.ts tests/unit/media-contract/input-preparation.test.ts
git commit -m "feat: prepare media inputs from contracts"
```

---

### Task 4: Template Runtime Contract Wiring

**Files:**
- Modify: `src/lib/model-gateway/types.ts`
- Modify: `src/lib/model-gateway/openai-compat/template-image.ts`
- Modify: `src/lib/model-gateway/openai-compat/template-video.ts`
- Modify: `src/lib/openai-compat-template-runtime.ts`
- Test: `tests/unit/model-gateway/openai-compat-template-renderer.test.ts`
- Test: `tests/unit/model-gateway/openai-compat-template-image-contract.test.ts`
- Test: `tests/unit/model-gateway/openai-compat-template-video-contract.test.ts`

- [ ] **Step 1: Write failing image template contract test**

Mock `resolveOpenAICompatClientConfig`, `fetch`, and `prepareMediaInputs`. Verify the rendered JSON body sends the prepared data URL image:

```ts
expect(JSON.parse(String(fetchBody))).toMatchObject({
  model: 'gpt-image-2',
  prompt: 'make poster',
  image: 'data:image/png;base64,QUJD',
})
```

The request must pass:

```ts
mediaContract: {
  version: 1,
  mediaType: 'image',
  executor: 'openai-compat-template',
  capabilities: ['image-to-image'],
  input: { image: 'dataUrlBase64' },
  output: { kind: 'url', urlPath: '$.data[0].url' },
  testStatus: { imageToImage: 'passed' },
}
```

Expected: FAIL because template-image currently passes the raw first reference image.

- [ ] **Step 2: Write failing Agnes-style video contract test**

Verify `generateVideoViaOpenAICompatTemplate()` sends a public URL image and returns async external id when upstream responds with a `video_id`:

```ts
expect(JSON.parse(String(fetchBody))).toMatchObject({
  model: 'agnes-video-v2',
  prompt: 'animate',
  image: 'https://signed.test/source.png',
  num_frames: 81,
  frame_rate: 16,
})
expect(result).toMatchObject({
  success: true,
  async: true,
  requestId: 'vid_123',
})
```

Template:

```ts
{
  version: 1,
  mediaType: 'video',
  mode: 'async',
  create: {
    method: 'POST',
    path: '/videos',
    contentType: 'application/json',
    bodyTemplate: {
      model: '{{model}}',
      prompt: '{{prompt}}',
      image: '{{image}}',
      num_frames: '{{num_frames}}',
      frame_rate: '{{frame_rate}}',
    },
  },
  status: { method: 'GET', path: '/agnesapi?video_id={{task_id}}' },
  response: {
    taskIdPath: '$.video_id',
    statusPath: '$.status',
    outputUrlPath: '$.remixed_from_video_id',
  },
  polling: {
    intervalMs: 5000,
    timeoutMs: 600000,
    doneStates: ['completed', 'succeeded'],
    failStates: ['failed'],
  },
}
```

- [ ] **Step 3: Add contract fields to gateway request types**

Add:

```ts
mediaContract?: import('@/lib/media-contract/types').MediaContract
```

to both `OpenAICompatImageRequest` and `OpenAICompatVideoRequest`.

- [ ] **Step 4: Wire prepared variables into template rendering**

In template image/video gateway functions:

- If `request.mediaContract` exists, call `prepareMediaInputs()` before `buildTemplateVariables()`.
- Determine requested capability:
  - image with `referenceImages?.length`: `image-to-image`
  - image without references: `text-to-image`
  - video with `options.lastFrameImageUrl`: `first-last-frame-video`
  - video otherwise: `image-to-video`
- If preparation returns `ok: false`, throw `MEDIA_INPUT_PREPARATION_FAILED: <first code>`.
- Pass prepared `image`, `images`, and `lastFrameImage` into `buildTemplateVariables()`.
- Keep legacy raw variables when no media contract exists.

In `buildTemplateVariables()`, allow extra option variables to include `num_frames`, `frame_rate`, `lastFrameImage`, and `last_frame_image` through the existing `appendTemplateOptionVariables()` path. Do not add unsupported placeholders unless they are explicitly in `TEMPLATE_PLACEHOLDER_ALLOWLIST`; update the allowlist with `num_frames`, `frame_rate`, `last_frame_image`, and `lastFrameImage`.

- [ ] **Step 5: Add output base64 extraction support**

In template image execution, when sync output has no URL:

- Read `request.mediaContract?.output.base64Path`.
- Return `{ success: true, imageUrl: dataUrl, imageBase64: rawBase64 }`.
- If the base64 path already returns a `data:` URL, keep it as `imageUrl` and strip the raw part for `imageBase64`.

Add a test with response `{ data: [{ b64_json: 'QUJD' }] }` and expect `imageUrl` to start with `data:image/png;base64,`.

- [ ] **Step 6: Run focused verification**

Run:

```bash
BILLING_TEST_BOOTSTRAP=0 npx vitest run \
  tests/unit/model-gateway/openai-compat-template-renderer.test.ts \
  tests/unit/model-gateway/openai-compat-template-image-contract.test.ts \
  tests/unit/model-gateway/openai-compat-template-video-contract.test.ts
npm run typecheck
```

Expected: all tests PASS and legacy renderer tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/model-gateway/types.ts src/lib/model-gateway/openai-compat/template-image.ts src/lib/model-gateway/openai-compat/template-video.ts src/lib/openai-compat-template-runtime.ts tests/unit/model-gateway/openai-compat-template-renderer.test.ts tests/unit/model-gateway/openai-compat-template-image-contract.test.ts tests/unit/model-gateway/openai-compat-template-video-contract.test.ts
git commit -m "feat: wire media contracts into template runtime"
```

---

### Task 5: Generator Routing With Contract Capability Checks

**Files:**
- Create: `src/lib/media-contract/runtime.ts`
- Modify: `src/lib/generator-api.ts`
- Test: `tests/unit/media-contract/runtime.test.ts`
- Test: `tests/unit/generator-api.test.ts`
- Test: `tests/unit/generator-api-openai-template-required.test.ts`

- [ ] **Step 1: Write failing runtime guard tests**

```ts
import { describe, expect, it } from 'vitest'
import { assertMediaContractCapability } from '@/lib/media-contract/runtime'

describe('media contract runtime guards', () => {
  it('allows passed template-backed image-to-image capability', () => {
    expect(() => assertMediaContractCapability({
      contract: {
        version: 1,
        mediaType: 'image',
        executor: 'openai-compat-template',
        capabilities: ['image-to-image'],
        input: { image: 'dataUrlBase64' },
        output: { kind: 'url', urlPath: '$.data[0].url' },
        testStatus: { imageToImage: 'passed' },
      },
      capability: 'image-to-image',
      trustedOfficialAdapter: false,
    })).not.toThrow()
  })

  it('blocks unchecked relay media capability', () => {
    expect(() => assertMediaContractCapability({
      contract: {
        version: 1,
        mediaType: 'video',
        executor: 'openai-compat-template',
        capabilities: ['image-to-video'],
        input: { image: 'publicUrl' },
        output: { kind: 'asyncTask', urlPath: '$.video_url' },
        testStatus: { imageToVideo: 'unchecked' },
      },
      capability: 'image-to-video',
      trustedOfficialAdapter: false,
    })).toThrow('MEDIA_CONTRACT_CAPABILITY_NOT_PASSED')
  })
})
```

Expected: FAIL because `runtime.ts` does not exist.

- [ ] **Step 2: Implement runtime helpers**

Export:

```ts
export function resolveRequestedImageCapability(referenceImages?: string[]): 'text-to-image' | 'image-to-image'
export function resolveRequestedVideoCapability(options?: { lastFrameImageUrl?: string }): 'image-to-video' | 'first-last-frame-video'
export function assertMediaContractCapability(input: {
  contract: MediaContract
  capability: MediaCapability
  trustedOfficialAdapter: boolean
}): void
```

Rules:

- Capability must exist in `contract.capabilities`.
- Status must be `passed`, unless `trustedOfficialAdapter === true` and `contract.executor === 'official-adapter'`.
- `failed`, `unchecked`, and `unavailable` throw `MEDIA_CONTRACT_CAPABILITY_NOT_PASSED: <capability>`.
- Wrong media type throws `MEDIA_CONTRACT_CAPABILITY_UNSUPPORTED: <capability>`.

- [ ] **Step 3: Wire generator-api contract routing**

In `generateImage()` and `generateVideo()`:

- After `resolveModelSelection()`, read `selection.mediaContract`.
- If no contract exists, keep current behavior exactly.
- If contract exists, validate requested capability before dispatch.
- If executor is `openai-compat-template`, require `compatMediaTemplate` and pass `mediaContract` to template gateway.
- If executor is `openai-standard`, use existing `generateImageViaOpenAICompat()` / `generateVideoViaOpenAICompat()`.
- If executor is `official-adapter` or `gemini-standard`, dispatch to existing official provider generator.
- For `openai-compatible` models with no contract, preserve current `MODEL_COMPAT_MEDIA_TEMPLATE_REQUIRED` behavior.

Add test expectations:

```ts
expect(generateImageViaOpenAICompatTemplateMock).toHaveBeenCalledWith(expect.objectContaining({
  mediaContract: expect.objectContaining({ executor: 'openai-compat-template' }),
}))
```

and:

```ts
await expect(generateVideo(...uncheckedContractModel...)).rejects.toThrow('MEDIA_CONTRACT_CAPABILITY_NOT_PASSED')
```

- [ ] **Step 4: Preserve legacy regression**

Keep `tests/unit/generator-api-openai-template-required.test.ts` passing:

- OpenAI-compatible image without `mediaContract` and without template still throws `MODEL_COMPAT_MEDIA_TEMPLATE_REQUIRED`.
- OpenAI-compatible video without `mediaContract` and without template still throws `MODEL_COMPAT_MEDIA_TEMPLATE_REQUIRED`.

- [ ] **Step 5: Run focused verification**

Run:

```bash
BILLING_TEST_BOOTSTRAP=0 npx vitest run \
  tests/unit/media-contract/runtime.test.ts \
  tests/unit/generator-api.test.ts \
  tests/unit/generator-api-openai-template-required.test.ts
npm run typecheck
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/media-contract/runtime.ts src/lib/generator-api.ts tests/unit/media-contract/runtime.test.ts tests/unit/generator-api.test.ts tests/unit/generator-api-openai-template-required.test.ts
git commit -m "feat: route media generation by contract"
```

---

### Task 6: Detection Media Drafts

**Files:**
- Create: `src/lib/user-api/creative-engine-detection/media-contract-drafts.ts`
- Modify: `src/lib/user-api/creative-engine-detection/types.ts`
- Modify: `src/lib/user-api/creative-engine-detection/result-mapper.ts`
- Modify: `src/lib/user-api/creative-engine-detection/orchestrator.ts`
- Modify: `src/lib/user-api/creative-engine-detection/llm-inspector.ts`
- Test: `tests/unit/user-api/creative-engine-detection/media-contract-drafts.test.ts`
- Test: `tests/unit/user-api/creative-engine-detection/orchestrator.test.ts`
- Test: `tests/unit/user-api/creative-engine-detection/inspector-redaction.test.ts`

- [ ] **Step 1: Write failing media draft tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildMediaContractDraftForDetectedModel } from '@/lib/user-api/creative-engine-detection/media-contract-drafts'

describe('creative engine media contract drafts', () => {
  it('creates unchecked OpenAI-compatible image draft', () => {
    const draft = buildMediaContractDraftForDetectedModel({
      protocolType: 'openai-compatible',
      source: 'unknown-relay',
      normalizedBaseUrl: 'https://relay.test/v1',
      model: {
        name: 'GPT Image',
        callName: 'gpt-image-2',
        purpose: 'image-generation',
        confidence: 'medium',
      },
    })

    expect(draft.mediaContract).toMatchObject({
      mediaType: 'image',
      executor: 'openai-standard',
      capabilities: ['text-to-image'],
      testStatus: { textToImage: 'unchecked' },
    })
  })

  it('does not create video draft for relay text-only evidence', () => {
    const draft = buildMediaContractDraftForDetectedModel({
      protocolType: 'openai-compatible',
      source: 'unknown-relay',
      normalizedBaseUrl: 'https://relay.test/v1',
      model: {
        name: 'Text Model',
        callName: 'gpt-5.4',
        purpose: 'text',
        confidence: 'high',
      },
    })

    expect(draft.mediaContract).toBeUndefined()
  })

  it('creates Gemini-standard video draft for Gemini-compatible Veo model', () => {
    const draft = buildMediaContractDraftForDetectedModel({
      protocolType: 'gemini-compatible',
      source: 'gemini-compatible',
      normalizedBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: {
        name: 'Veo',
        callName: 'veo-3.1-generate-preview',
        purpose: 'video-generation',
        confidence: 'medium',
      },
    })

    expect(draft.mediaContract).toMatchObject({
      executor: 'gemini-standard',
      capabilities: ['image-to-video'],
      testStatus: { imageToVideo: 'unchecked' },
    })
  })
})
```

- [ ] **Step 2: Implement deterministic draft builder**

Rules:

- OpenAI-compatible image purpose:
  - executor `openai-standard`
  - `text-to-image` unchecked
  - add `image-edit` unchecked only when model purpose is `image-edit` or docs/assistant evidence says edits are supported.
- Relay station:
  - same base contracts, but never status `passed`.
  - video remains undefined unless docs/assistant evidence provides endpoint/template.
- Gemini-compatible image/video:
  - executor `gemini-standard`
  - image models get `text-to-image`; video models get `image-to-video`.
- Official adapters:
  - executor `official-adapter`
  - source `official-adapter`
  - test status may remain undefined because trusted official adapter metadata is handled by runtime/status helpers.

- [ ] **Step 3: Extend detection result types**

Update `DetectedModelDraft`:

```ts
mediaContract?: MediaContract
compatMediaTemplate?: OpenAICompatMediaTemplate
mediaContractSource?: MediaContractSource
compatMediaTemplateSource?: OpenAICompatMediaTemplateSource
```

Ensure `mapProbeResultToDetection()` preserves these fields.

- [ ] **Step 4: Connect drafts in orchestrator**

After model classification/probing and before returning detection results:

- Map each image/video model through `buildMediaContractDraftForDetectedModel()`.
- Preserve any assistant-generated template-backed contract when present.
- Do not mark any paid media capability as `passed`.

Add orchestrator regression:

```ts
expect(result.models.find((model) => model.callName === 'gpt-image-2')?.mediaContract?.testStatus)
  .toEqual({ textToImage: 'unchecked' })
```

- [ ] **Step 5: Enforce inspector redaction and unchecked statuses**

In `llm-inspector.ts`:

- Accept `mediaContract` in assistant schema.
- Redact API-key-like values before including docs/snippets in prompts or logs.
- Coerce assistant-provided `passed` statuses to `unchecked`.

Add test:

```ts
expect(JSON.stringify(result)).not.toContain('sk-2475')
expect(result.models[0]?.mediaContract?.testStatus?.imageToVideo).toBe('unchecked')
```

- [ ] **Step 6: Run focused verification**

Run:

```bash
BILLING_TEST_BOOTSTRAP=0 npx vitest run \
  tests/unit/user-api/creative-engine-detection/media-contract-drafts.test.ts \
  tests/unit/user-api/creative-engine-detection/orchestrator.test.ts \
  tests/unit/user-api/creative-engine-detection/inspector-redaction.test.ts
npm run typecheck
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/user-api/creative-engine-detection/media-contract-drafts.ts src/lib/user-api/creative-engine-detection/types.ts src/lib/user-api/creative-engine-detection/result-mapper.ts src/lib/user-api/creative-engine-detection/orchestrator.ts src/lib/user-api/creative-engine-detection/llm-inspector.ts tests/unit/user-api/creative-engine-detection/media-contract-drafts.test.ts tests/unit/user-api/creative-engine-detection/orchestrator.test.ts tests/unit/user-api/creative-engine-detection/inspector-redaction.test.ts
git commit -m "feat: generate media contract drafts during detection"
```

---

### Task 7: Explicit Media Test Route And Diagnostics

**Files:**
- Create: `src/lib/user-api/media-contract-test/types.ts`
- Create: `src/lib/user-api/media-contract-test/runner.ts`
- Create: `src/lib/user-api/media-contract-test/save-result.ts`
- Create: `src/lib/media-contract/test-diagnostics.ts`
- Create: `src/app/api/user/creative-engines/media-test/route.ts`
- Test: `tests/unit/user-api/media-contract-test/diagnostics.test.ts`
- Test: `tests/unit/user-api/media-contract-test/runner.test.ts`
- Test: `tests/integration/api/specific/creative-engine-media-test-route.test.ts`

- [ ] **Step 1: Write failing diagnostics tests**

```ts
import { describe, expect, it } from 'vitest'
import { classifyMediaTestError } from '@/lib/media-contract/test-diagnostics'

describe('media test diagnostics', () => {
  it.each([
    [401, 'bad key', 'MEDIA_TEST_INVALID_KEY'],
    [403, 'insufficient quota', 'MEDIA_TEST_PERMISSION_OR_PLAN'],
    [429, 'rate limit', 'MEDIA_TEST_RATE_LIMIT'],
    [415, 'unsupported media type', 'MEDIA_TEST_REQUEST_SCHEMA_MISMATCH'],
  ])('maps status %s to %s', (status, body, code) => {
    expect(classifyMediaTestError({ status, body })).toMatchObject({ code })
  })

  it('maps missing json path to response path mismatch', () => {
    expect(classifyMediaTestError({ status: 200, body: '{"data":[]}', extraction: 'output-url-missing' }))
      .toMatchObject({ code: 'MEDIA_TEST_RESPONSE_JSON_PATH_MISMATCH' })
  })
})
```

Expected: FAIL because diagnostic module does not exist.

- [ ] **Step 2: Implement diagnostic classifier**

Diagnostic codes:

```ts
type MediaTestDiagnosticCode =
  | 'MEDIA_TEST_BASE_URL_ERROR'
  | 'MEDIA_TEST_INVALID_KEY'
  | 'MEDIA_TEST_MISSING_MODEL'
  | 'MEDIA_TEST_PERMISSION_OR_PLAN'
  | 'MEDIA_TEST_RATE_LIMIT'
  | 'MEDIA_TEST_BALANCE_INSUFFICIENT'
  | 'MEDIA_TEST_REQUEST_SCHEMA_MISMATCH'
  | 'MEDIA_TEST_UNSUPPORTED_INPUT_FORMAT'
  | 'MEDIA_TEST_PUBLIC_URL_UNAVAILABLE'
  | 'MEDIA_TEST_MULTIPART_FIELD_MISMATCH'
  | 'MEDIA_TEST_RESPONSE_JSON_PATH_MISMATCH'
  | 'MEDIA_TEST_ASYNC_TASK_ID_PATH_MISMATCH'
  | 'MEDIA_TEST_ASYNC_STATUS_PATH_MISMATCH'
  | 'MEDIA_TEST_ASYNC_UPSTREAM_FAILED'
  | 'MEDIA_TEST_OUTPUT_URL_MISSING'
  | 'MEDIA_TEST_OUTPUT_URL_NOT_DOWNLOADABLE'
  | 'MEDIA_TEST_PROVIDER_TIMEOUT'
  | 'MEDIA_TEST_UPSTREAM_POOL_UNAVAILABLE'
```

Return:

```ts
{ code, message, debugSnippet?: string }
```

Redact `Authorization`, `api_key`, `key`, and `sk-...` values in `debugSnippet`.

- [ ] **Step 3: Implement media test runner**

`runMediaContractTest(input)` must:

- Require a selected `CreativeModelConfig` with `mediaContract`.
- Build a redacted rendered request preview:
  - endpoint URL
  - method
  - content type
  - body preview with secrets redacted
- For `openai-compat-template`, use existing template rendering and mocked `fetch`.
- For async templates, extract task id, poll status, extract output URL/base64.
- For output URLs, perform a `HEAD` request when possible; if HEAD fails with 405, try `GET` with `Range: bytes=0-0`.
- Return `status: 'passed' | 'failed'` and the diagnostic object.

Unit test with mocked fetch:

```ts
expect(result.preview).toMatchObject({
  method: 'POST',
  endpointUrl: 'https://api.aisenyu.test/v1/images/generations',
  contentType: 'application/json',
})
expect(result.output).toMatchObject({ url: 'https://cdn.test/image.png' })
```

- [ ] **Step 4: Implement save-result helper**

`saveMediaContractTestResult({ userId, modelKey, capability, status, diagnostic })` must:

- Parse existing `customModels` through `parseCreativeModels()`.
- Update only the target capability status.
- Set `mediaContractCheckedAt` and `mediaContract.checkedAt`.
- Preserve `compatMediaTemplate`.
- Reject missing model with `MEDIA_TEST_MODEL_NOT_FOUND`.

- [ ] **Step 5: Implement route**

Route: `POST /api/user/creative-engines/media-test`

Request:

```ts
{
  "modelKey": "openai-compatible:relay::gpt-image-2",
  "capability": "text-to-image",
  "confirmedCost": true,
  "sample": {
    "prompt": "生成一张简单测试图",
    "image": "https://example.test/ref.png",
    "lastFrameImage": "https://example.test/end.png"
  }
}
```

Rules:

- `confirmedCost !== true` returns `400` with code `MEDIA_TEST_CONFIRMATION_REQUIRED`.
- The route uses `requireUserAuth()` and `apiHandler()`.
- The response includes `preview`, `diagnostic`, `status`, and redacted snippets.
- Never echo a full API key.

- [ ] **Step 6: Run focused verification**

Run:

```bash
BILLING_TEST_BOOTSTRAP=0 npx vitest run \
  tests/unit/user-api/media-contract-test/diagnostics.test.ts \
  tests/unit/user-api/media-contract-test/runner.test.ts \
  tests/integration/api/specific/creative-engine-media-test-route.test.ts
npm run typecheck
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/user-api/media-contract-test src/lib/media-contract/test-diagnostics.ts src/app/api/user/creative-engines/media-test/route.ts tests/unit/user-api/media-contract-test tests/integration/api/specific/creative-engine-media-test-route.test.ts
git commit -m "feat: add explicit media contract tests"
```

---

### Task 8: Configuration UI Capability Rows And Workflow Filtering

**Files:**
- Create: `src/app/[locale]/profile/components/api-config/provider-card/MediaCapabilityRows.tsx`
- Modify: `src/app/[locale]/profile/components/api-config/provider-card/ProviderAdvancedFields.tsx`
- Modify: `src/lib/query/hooks/useUserModels.ts`
- Modify: `src/app/api/user/models/route.ts`
- Create: `src/lib/media-contract/workflow-filter.ts`
- Modify: `messages/zh/apiConfig.json`
- Modify: `messages/en/apiConfig.json`
- Test: `tests/unit/api-config/media-capability-rows.test.tsx`
- Test: `tests/unit/media-contract/workflow-filter.test.ts`
- Test: `tests/integration/api/specific/user-models-media-contract.test.ts`

- [ ] **Step 1: Write failing workflow filter test**

```ts
import { describe, expect, it } from 'vitest'
import { filterModelOptionsForWorkflowCapability } from '@/lib/media-contract/workflow-filter'

describe('workflow media capability filter', () => {
  it('keeps passed image-to-video and hides unchecked relay video by default', () => {
    const options = [
      {
        value: 'relay::unchecked-video',
        label: 'Unchecked',
        mediaContract: {
          version: 1,
          mediaType: 'video',
          executor: 'openai-compat-template',
          capabilities: ['image-to-video'],
          input: { image: 'publicUrl' },
          output: { kind: 'asyncTask', urlPath: '$.video_url' },
          testStatus: { imageToVideo: 'unchecked' },
        },
      },
      {
        value: 'relay::passed-video',
        label: 'Passed',
        mediaContract: {
          version: 1,
          mediaType: 'video',
          executor: 'openai-compat-template',
          capabilities: ['image-to-video'],
          input: { image: 'publicUrl' },
          output: { kind: 'asyncTask', urlPath: '$.video_url' },
          testStatus: { imageToVideo: 'passed' },
        },
      },
    ]

    expect(filterModelOptionsForWorkflowCapability(options, 'image-to-video').map((item) => item.value))
      .toEqual(['relay::passed-video'])
  })
})
```

- [ ] **Step 2: Expose media metadata in `/api/user/models`**

Add to `UserModelOption`:

```ts
mediaContract?: MediaContract
mediaCapabilitySummary?: {
  available: MediaCapability[]
  unchecked: MediaCapability[]
  failed: MediaCapability[]
  unavailable: MediaCapability[]
}
```

When a model has a contract, include the contract and summary. When no contract exists, do not fabricate passed capabilities.

Integration test:

```ts
expect(payload.video[0]).toMatchObject({
  value: 'openai-compatible:relay::agnes-video-v2',
  mediaCapabilitySummary: {
    unchecked: ['image-to-video'],
  },
})
```

- [ ] **Step 3: Implement workflow filter helper**

`filterModelOptionsForWorkflowCapability(options, capability, options?)` must:

- Include models with matching `mediaContract.testStatus` of `passed`.
- Include trusted official adapter models when `mediaContract.executor === 'official-adapter'` and the capability exists.
- Exclude unchecked/failed/unavailable by default.
- When `{ includeUnverified: true }`, include missing-contract models but mark them with `unverified: true` in a returned copy.

- [ ] **Step 4: Add configuration UI capability rows**

`MediaCapabilityRows` props:

```ts
{
  model: CustomModel
  onRunTest: (modelKey: string, capability: MediaCapability) => void
  pendingCapability?: MediaCapability | null
  t: ProviderCardTranslator
}
```

Rows show:

```text
Text-to-image        Passed
Image-to-image       Unchecked
Image edit           Failed
Image-to-video       Unavailable
```

Rules:

- Show only image/video model contracts.
- Missing contract shows one compact warning row: `mediaContractUnverified`.
- Test button appears for `unchecked` and `failed`.
- Test button calls `onRunTest(model.modelKey, capability)`; actual modal/confirmation can use `window.confirm()` for this task.
- Button label and status text must come from `messages/*/apiConfig.json`.

- [ ] **Step 5: Wire UI to media-test route**

In `ProviderAdvancedFields.tsx`:

- Render `MediaCapabilityRows` inside each image/video `ModelRow`.
- Add `handleRunMediaTest()` that asks for confirmation and POSTs:

```ts
await apiFetch('/api/user/creative-engines/media-test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    modelKey,
    capability,
    confirmedCost: true,
    sample: { prompt: t('mediaTestSamplePrompt') },
  }),
})
```

- On success, call existing model update callback with returned `mediaContract`, `mediaContractCheckedAt`, and `mediaContractSource`.

- [ ] **Step 6: Run focused verification**

Run:

```bash
BILLING_TEST_BOOTSTRAP=0 npx vitest run \
  tests/unit/api-config/media-capability-rows.test.tsx \
  tests/unit/media-contract/workflow-filter.test.ts \
  tests/integration/api/specific/user-models-media-contract.test.ts
npm run typecheck
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/[locale]/profile/components/api-config/provider-card/MediaCapabilityRows.tsx src/app/[locale]/profile/components/api-config/provider-card/ProviderAdvancedFields.tsx src/lib/query/hooks/useUserModels.ts src/app/api/user/models/route.ts src/lib/media-contract/workflow-filter.ts messages/zh/apiConfig.json messages/en/apiConfig.json tests/unit/api-config/media-capability-rows.test.tsx tests/unit/media-contract/workflow-filter.test.ts tests/integration/api/specific/user-models-media-contract.test.ts
git commit -m "feat: show and filter media capabilities"
```

---

### Task 9: Regression Matrix, Task Snapshot, And Final Verification

**Files:**
- Modify: `src/lib/workers/utils.ts`
- Modify: `src/lib/workers/video.worker.ts`
- Modify: `src/lib/workers/handlers/panel-image-task-handler.ts`
- Modify only if needed: `src/app/api/novel-promotion/[projectId]/generate-video/route.ts`
- Test: `tests/unit/worker/video-worker.test.ts`
- Test: `tests/unit/worker/panel-image-task-handler.test.ts`
- Test: `tests/unit/async-poll-ocompat.test.ts`
- Test: `tests/unit/model-gateway/openai-compat-template-video-external-id.test.ts`

- [ ] **Step 1: Write regression tests for legacy fallback**

Add assertions that:

- A model without `mediaContract` still calls the legacy image/video route.
- A model with `compatMediaTemplate` but no `mediaContract` still renders the template with raw existing variables.
- Async OpenAI-compatible external IDs still use the current `OCOMPAT:IMAGE:` and `OCOMPAT:VIDEO:` formats.

Expected: tests should already PASS before changes; keep them as guardrails.

- [ ] **Step 2: Add task payload snapshot where the worker already has model context**

Use the smallest non-invasive snapshot:

```ts
type MediaModelSnapshot = {
  modelKey: string
  mediaContract?: MediaContract
  compatMediaTemplate?: OpenAICompatMediaTemplate
}
```

Implementation:

- In `src/lib/workers/utils.ts`, allow image/video generation helper params to accept `mediaModelSnapshot`.
- In `generateImage()` and `generateVideo()` options, pass snapshot through as an internal option key named `mediaModelSnapshot`.
- In `generator-api.ts`, if `options?.mediaModelSnapshot?.modelKey === selection.modelKey`, use snapshot contract/template instead of the latest global values for execution.
- Do not use a snapshot when the model key differs.
- Do not persist API keys in task payload snapshots.

This keeps queued media tasks stable without changing model selection ownership.

- [ ] **Step 3: Snapshot video panel model before generation**

In `video.worker.ts`, when `modelId` is resolved, call a helper that reads the current `ModelSelection` and builds a snapshot. Pass it into `resolveVideoSourceFromGeneration()` options.

Add a unit test that mutates mocked global selection after snapshot creation and verifies the original `mediaContract` is the one passed to `generateVideo()`.

- [ ] **Step 4: Snapshot panel image model before generation**

In `panel-image-task-handler.ts`, before `resolveImageSourceFromGeneration()`, build the same snapshot for `modelKey` and pass it through.

Add a unit test that verifies image generation receives `mediaModelSnapshot.modelKey`.

- [ ] **Step 5: Run the focused regression suite**

Run:

```bash
BILLING_TEST_BOOTSTRAP=0 npx vitest run \
  tests/unit/media-contract/validator.test.ts \
  tests/unit/media-contract/input-preparation.test.ts \
  tests/unit/media-contract/runtime.test.ts \
  tests/unit/media-contract/workflow-filter.test.ts \
  tests/unit/model-gateway/openai-compat-template-renderer.test.ts \
  tests/unit/model-gateway/openai-compat-template-image-contract.test.ts \
  tests/unit/model-gateway/openai-compat-template-video-contract.test.ts \
  tests/unit/model-gateway/openai-compat-template-video-external-id.test.ts \
  tests/unit/generator-api.test.ts \
  tests/unit/generator-api-openai-template-required.test.ts \
  tests/unit/user-api/creative-engine-detection/media-contract-drafts.test.ts \
  tests/unit/user-api/media-contract-test/diagnostics.test.ts \
  tests/unit/user-api/media-contract-test/runner.test.ts \
  tests/unit/async-poll-ocompat.test.ts \
  tests/unit/worker/video-worker.test.ts \
  tests/unit/worker/panel-image-task-handler.test.ts \
  tests/integration/api/specific/creative-engine-media-test-route.test.ts \
  tests/integration/api/specific/user-models-media-contract.test.ts
npm run typecheck
```

Expected: all listed tests PASS and typecheck exits with code 0.

- [ ] **Step 6: Run broad verification**

Run:

```bash
npm run test:unit:all
npm run test:integration:api
npm run typecheck
```

Expected: all commands PASS. If an integration test requires local services that are unavailable, record the exact failing command and rerun the focused mocked integration tests from Step 5.

- [ ] **Step 7: Self-review against spec**

Check:

- `rg -n "mediaContract|compatMediaTemplate|MEDIA_INPUT_|MEDIA_TEST_" src tests`
- No real API keys are present: `rg -n "sk-[A-Za-z0-9]{16,}|Bearer +sk-|api[_-]?key.*sk-" docs src tests`
- `/models` success does not mark paid media capability passed: `rg -n "testStatus.*passed|passed.*testStatus" src/lib/user-api/creative-engine-detection src/lib/assistant-platform`
- Legacy fallback still exists in `src/lib/generator-api.ts`.

Expected:

- First command shows the implemented contract paths.
- Second command has no matches.
- Third command has no detection/assistant path that marks paid media as passed.
- Legacy fallback branch is still visible.

- [ ] **Step 8: Commit**

```bash
git add src/lib/workers/utils.ts src/lib/workers/video.worker.ts src/lib/workers/handlers/panel-image-task-handler.ts src/app/api/novel-promotion/[projectId]/generate-video/route.ts tests/unit/worker/video-worker.test.ts tests/unit/worker/panel-image-task-handler.test.ts tests/unit/async-poll-ocompat.test.ts tests/unit/model-gateway/openai-compat-template-video-external-id.test.ts
git commit -m "test: lock media contract regression coverage"
```

---

## Execution Notes

- Use `superpowers:test-driven-development` during implementation tasks. Each task above starts with failing tests before implementation.
- Use `superpowers:verification-before-completion` before claiming a task or the branch is complete.
- Keep commits task-sized. If a task becomes too large, split at a passing test boundary and keep the same acceptance criteria.
- Do not add a generic arbitrary REST workflow builder.
- Do not auto-assign workflow defaults after detection or testing.
- Do not run paid media tests from detection, background jobs, or page load.
- Do not write real user API keys to docs, tests, logs, or assistant events.
