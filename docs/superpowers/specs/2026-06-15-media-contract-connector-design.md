# Media Contract Connector Design

Date: 2026-06-15
Status: Pending user review

## Goal

Add a unified media connector contract for image and video models.

The current creative-engine detection flow can identify services, keys, model lists, and rough model purposes, but media generation fails when a service is only partially OpenAI-compatible or when a relay station uses non-standard image/video request shapes.

The core principle is:

> 自动识别生成草稿，媒体能力测试验证，用户确认后才进入正式工作流。

The feature must make heterogeneous image and video APIs easier to connect without turning the product into an arbitrary REST workflow platform.

## Problem Statement

Many services advertise OpenAI-compatible access, but compatibility differs by capability:

- Text completion may work while image generation fails.
- Text-to-image may work while image editing fails.
- Image generation may require JSON `image` data URLs instead of multipart files.
- Video generation may be asynchronous and require provider-specific polling.
- Some video APIs require public image URLs and reject base64 or uploaded files.
- Relay stations may expose `/models` successfully but not support image or video for the selected group or plan.

Today the runtime often infers media behavior from broad provider type. This is too coarse. Users can end up selecting a model that looks available, then see a generic upstream error such as `BadRequestError` during image or video generation.

## Product Boundaries

The platform is responsible for:

- Detecting service source and broad protocol type.
- Reading model lists when possible.
- Classifying models into text, image, video, voice, lip-sync, and related purposes.
- Generating image/video media connector drafts for supported protocol families.
- Declaring required media input formats per model capability.
- Testing image and video capabilities only after explicit user confirmation.
- Showing which capabilities are passed, failed, unchecked, or unavailable.
- Filtering workflow model selectors by tested capability.
- Preserving old configurations by falling back to existing runtime behavior when no media contract exists.

The platform is not responsible for:

- Executing arbitrary non-standard REST workflows.
- Supporting complex OAuth flows, custom request signing, WebSocket media streaming, or multi-step provider SDK flows in this phase.
- Automatically running paid image/video/voice tests without user confirmation.
- Automatically assigning models to creative workflows.
- Silently marking media capabilities as passed based only on `/models` success.

## Scope

This phase covers:

- OpenAI-compatible standard services.
- OpenAI-compatible relay stations.
- Gemini-compatible media capabilities.
- Existing official provider adapters.
- Existing OpenAI-compatible image/video media templates, upgraded with media input/output contract metadata.

This phase does not cover:

- Arbitrary REST connector graphs.
- New official provider SDK integrations unrelated to current image/video generation paths.
- Voice and lip-sync media-contract migration.
- Billing price-model redesign.

## Existing Implementation Analysis

Relevant current modules:

- `src/lib/creative-engine/types.ts`
  - Defines creative engine and creative model config shapes.
- `src/lib/creative-engine/persisted-config.ts`
  - Parses and normalizes persisted creative-engine JSON.
- `src/lib/user-api/creative-engine-detection/*`
  - Normalizes URLs, fingerprints service sources, probes OpenAI/Gemini/official providers, classifies model purposes, and maps detection results.
- `src/lib/openai-compat-media-template.ts`
  - Defines the current HTTP media-template shape for image/video templates.
- `src/lib/openai-compat-template-runtime.ts`
  - Renders template requests, substitutes variables, builds JSON/multipart/form bodies, and reads JSON paths.
- `src/lib/model-gateway/openai-compat/image.ts`
  - Runs the default OpenAI-compatible image path with OpenAI SDK semantics.
- `src/lib/model-gateway/openai-compat/video.ts`
  - Runs the default OpenAI-compatible video path with OpenAI SDK video semantics.
- `src/lib/model-gateway/openai-compat/template-image.ts`
  - Runs custom image media templates.
- `src/lib/model-gateway/openai-compat/template-video.ts`
  - Runs custom video media templates.
- `src/lib/user-api/model-template/*`
  - Validates, saves, and probes media templates.
- `src/lib/generator-api.ts`
  - Routes image/video generation through official providers, OpenAI-compatible paths, or media templates.
- `src/lib/workers/utils.ts`
  - Resolves generated image/video sources, resumes async external tasks, and polls external task results.
- `src/lib/workers/video.worker.ts`
  - Converts panel images before video generation and persists panel video results.
- `src/lib/media/outbound-image.ts`
  - Normalizes image inputs to base64 for outbound generation.
- `src/app/api/user/models/route.ts`
  - Exposes selectable model options to workflow UIs.

Current constraints:

- Runtime model keys must remain `provider::modelId`.
- `compatMediaTemplate` is already persisted on custom image/video models and should not be removed.
- OpenAI-compatible media models currently require templates in some runtime paths.
- Existing official provider adapters have provider-specific behavior that should remain in place.
- Existing projects and user configs must continue to load when no media contract exists.

## Proposed Approach

Add a new `MediaContract` layer for image/video models.

`MediaContract` describes what the model can do, what input formats it requires, how output is expected, and which executor should run it. It does not replace provider adapters or HTTP templates. It gives the product and runtime a stable media capability contract.

`compatMediaTemplate` remains the concrete HTTP execution detail for custom OpenAI-compatible image/video templates.

The relationship is:

```text
CreativeModelConfig
  modelKey
  type
  purpose
  compatMediaTemplate?       // concrete HTTP template when needed
  mediaContract?             // capability, input, output, executor, test status
```

## MediaContract Shape

Conceptual TypeScript shape:

```ts
type MediaContract = {
  version: 1
  mediaType: 'image' | 'video'
  executor:
    | 'official-adapter'
    | 'openai-standard'
    | 'gemini-standard'
    | 'openai-compat-template'

  capabilities: Array<
    | 'text-to-image'
    | 'image-to-image'
    | 'image-edit'
    | 'text-to-video'
    | 'image-to-video'
    | 'first-last-frame-video'
  >

  input: {
    image?: 'publicUrl' | 'dataUrlBase64' | 'rawBase64' | 'multipartFile'
    images?: 'publicUrlArray' | 'dataUrlBase64Array' | 'rawBase64Array' | 'multipartFiles'
    lastFrameImage?: 'publicUrl' | 'dataUrlBase64' | 'rawBase64' | 'multipartFile'
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
  source?: 'rule' | 'provider-list' | 'llm' | 'manual' | 'official-adapter'
}

type MediaCapabilityStatus =
  | 'unchecked'
  | 'passed'
  | 'failed'
  | 'unavailable'
```

Validation rules:

- `mediaType=image` cannot declare video capabilities.
- `mediaType=video` cannot declare image capabilities.
- `executor=openai-compat-template` requires a matching `compatMediaTemplate`.
- `executor=official-adapter` does not require a `compatMediaTemplate`.
- A capability must not be exposed to workflow selectors as usable until its status is `passed`, or until it is covered by trusted official adapter metadata.
- Missing `mediaContract` keeps legacy runtime behavior, but UI should show the model as unverified for granular media capabilities.

## Template Upgrade

The existing `OpenAICompatMediaTemplate` remains valid.

For template-backed models, the media contract supplies semantic requirements that the template alone cannot express cleanly:

- Whether `{{image}}` should be rendered as public URL, data URL base64, raw base64, or multipart file.
- Whether `{{images}}` is an array of URLs, data URLs, raw base64 strings, or multipart files.
- Whether the response should produce URL, URL array, base64, or async task output.
- Which specific media capability the template supports.

The template stays responsible for:

- HTTP method.
- Path.
- Content type.
- Headers.
- Body template.
- Multipart file fields.
- Task id path.
- Status path.
- Output path.
- Error path.
- Polling states and timeout.

## Runtime Media Input Preparation

Add a shared `prepareMediaInputs()` runtime helper.

Inputs:

- Original image references from the workflow.
- Target `MediaContract`.
- Requested capability.
- Project/user context for storage signing.

Outputs:

- Prepared values for template variables or provider adapter calls.
- Diagnostics when required conversion cannot be satisfied.

Supported conversion targets:

- `publicUrl`
  - Use an existing external URL when it is already public.
  - Use a signed object-storage URL when possible.
  - Fail early if no upstream-accessible URL can be produced.
- `dataUrlBase64`
  - Convert local, signed, or existing image source into `data:image/...;base64,...`.
- `rawBase64`
  - Convert image source into bare base64 without data URL prefix.
- `multipartFile`
  - Convert image source into a `File`/multipart-compatible value.
- Array variants
  - Apply the same strategy to each image.

Failure should be explicit:

- `MEDIA_INPUT_PUBLIC_URL_REQUIRED`
- `MEDIA_INPUT_BASE64_CONVERSION_FAILED`
- `MEDIA_INPUT_MULTIPART_CONVERSION_FAILED`
- `MEDIA_INPUT_LAST_FRAME_REQUIRED`
- `MEDIA_INPUT_FORMAT_UNSUPPORTED_BY_CONTRACT`

This replaces provider-type guessing in image/video generation paths where a media contract exists. Existing behavior remains as fallback for models without contracts.

## Execution Routing

Generation should resolve in this order:

1. Resolve model selection through the existing config center.
2. Read `mediaContract` and `compatMediaTemplate` from the selected model.
3. If no media contract exists, use current legacy routing.
4. If a contract exists:
   - Validate requested capability against the contract.
   - Prepare media inputs according to the contract.
   - Dispatch based on `executor`.

Executor behavior:

- `official-adapter`
  - Use existing provider adapter.
  - Use the contract to validate capability and input shape before calling adapter.
- `openai-standard`
  - Use standard OpenAI-compatible image/video paths when the contract matches those semantics.
- `gemini-standard`
  - Use Gemini-compatible media runtime and its native media parts.
- `openai-compat-template`
  - Render the current `compatMediaTemplate` using prepared variables.
  - Use the existing async polling path for async templates.

Submitted tasks should snapshot the effective media contract and media template where feasible, so worker execution does not drift if a user edits global configuration while a task is queued.

## Detection Flow

Detection should produce two layers:

1. Service-level detection.
2. Model-level media contract drafts.

Flow:

```text
User enters service URL + API key + optional docs
-> normalize URL
-> fingerprint service
-> probe free model-list endpoints
-> classify model purposes
-> generate media contract drafts for image/video models
-> generate compat media templates where required
-> user confirms drafts
-> user explicitly runs media tests
-> passed capabilities enter workflow model selectors
```

Rules by source:

### OpenAI-Compatible Standard

Generate default contracts for likely image/video models:

- Text-to-image through `/images/generations`.
- Image editing through `/images/edits`.
- Video only when model metadata, known model naming, or user-provided docs give enough evidence.

Do not mark image/video capabilities as passed from `/models` alone.

### Relay Stations

Relay stations are treated as OpenAI-compatible services with partial capability risk.

Examples include OpenRouter-like, 302-like, AISENYU-like, one-api/new-api-like, and unknown relay services.

Rules:

- Text can be verified by `/models` and optional lightweight text call.
- Image/video capabilities start as `unchecked` unless provider-specific evidence exists.
- If docs mention image endpoints, create image templates and media contracts as drafts.
- If docs do not mention video endpoints, do not enable video capabilities.
- If image docs mention both JSON data URL and multipart edit modes, generate separate capability drafts or a combined contract with distinct input requirements per capability.

Example AISENYU-style result:

```text
Service: relay / OpenAI-compatible
Base URL: https://example-relay.test/v1
Text: available after normal probe
Text-to-image: draft, sync output from response.data[].url or response.data[].b64_json
Image-to-image: draft, JSON image field expects data URL base64
Image edit: draft, multipart image field
Video: unavailable unless docs or tests prove support
```

### Gemini-Compatible

Generate Gemini-standard media contracts using Gemini-native input parts.

Do not force Gemini-compatible services through OpenAI image/video template semantics.

### Official Providers

Generate contracts from known adapter capabilities.

The contract should reflect existing adapter behavior rather than introducing new HTTP templates for official providers.

## Recognition Assistant

The existing built-in recognition assistant may generate drafts, but it must not directly mark media capability tests as passed.

Allowed assistant outputs:

- Candidate `mediaContract`.
- Candidate `compatMediaTemplate`.
- Warnings and risks.
- Suggested sample prompt.
- Suggested sample image requirement.

Disallowed assistant outputs:

- Marking a paid media capability as tested.
- Saving runnable configuration without user confirmation.
- Assigning models to workflow defaults.
- Storing or echoing full API keys in logs or generated docs.

If the user provides documentation snippets, the assistant may use them to infer template shapes. Any real API key shown in a browser or pasted by the user must be redacted from generated specs, logs, and examples.

## Media Capability Testing

Add a media capability test flow for model detail pages.

Capabilities tested independently:

- Text-to-image.
- Image-to-image.
- Image edit.
- Text-to-video.
- Image-to-video.
- First-last-frame video.

Each test should show:

- Rendered endpoint and method.
- Content type.
- Redacted request body preview.
- Prepared image input format.
- Create response status and response snippet.
- Task id extraction result when async.
- Status polling response when async.
- Output URL/base64 extraction result.
- Downloadability check for output URLs where practical.
- Human-readable diagnosis.

Tests that may trigger image/video generation must require explicit confirmation because they can consume provider quota or credits.

Lightweight `/models` or text tests may run automatically when already allowed by the creative-engine detection flow.

## Diagnostics

Diagnostics should distinguish:

- Base URL error.
- Invalid key.
- Missing model.
- Group/plan does not support media capability.
- Rate limit.
- Balance insufficient.
- Request schema mismatch.
- Unsupported input format.
- Public URL unavailable.
- Multipart field mismatch.
- Response JSON path mismatch.
- Async task id path mismatch.
- Async status path mismatch.
- Async task failed upstream.
- Output URL missing.
- Output URL not downloadable.
- Provider timeout.
- Upstream account pool unavailable.

The UI should avoid raw provider stack traces as the primary user-facing message. Raw snippets can be available in an advanced/debug section with secrets redacted.

## Workflow Impact

Workflow model selectors should filter by granular media capability.

Examples:

- Storyboard image generation requires `text-to-image` passed or trusted.
- Asset image modification requires `image-to-image` or `image-edit` passed or trusted.
- Panel video generation requires `image-to-video` passed or trusted.
- First-last-frame video generation requires `first-last-frame-video` passed or trusted.

Existing models without media contracts:

- Continue to load.
- Continue to use legacy runtime behavior.
- Show an unverified warning in configuration UI.
- Should not be silently promoted as passed for granular media selectors after this feature is enabled.

Task submission should include effective model key and media contract/template snapshot where feasible. Worker runtime should use the snapshot to prepare inputs and execute generation, avoiding behavior drift after global config edits.

## Persistence

No new Prisma tables are required.

Continue storing creative engine and model config in existing `UserPreference` JSON fields.

`CreativeModelConfig` should add optional:

- `mediaContract`
- `mediaContractCheckedAt`
- `mediaContractSource`

Existing:

- `compatMediaTemplate`
- `compatMediaTemplateCheckedAt`
- `compatMediaTemplateSource`

remain supported.

Parsing and validation should preserve unknown old configs only where current parsing already permits them. Invalid new `mediaContract` payloads should be rejected with field-specific errors.

## UI Changes

Model detail should show capability rows:

```text
Text-to-image        Passed
Image-to-image       Unchecked
Image edit           Failed: multipart image field rejected
Image-to-video       Unavailable
```

Provider/engine summary should show a compact state:

- Available.
- Partial.
- Failed.
- Unchecked.

Workflow model dropdowns should only show models that match the required capability, unless the user explicitly chooses to show unverified models in an advanced configuration context.

## Phased Implementation

### Phase 1: MediaContract Data Model

Add types, parser, persistence, and UI display for `mediaContract`.

Acceptance:

- Old configs still load.
- New media contracts can be saved and read.
- Model detail can show granular media statuses.
- Invalid contracts produce field-specific validation errors.

### Phase 2: Media Input Strategy

Add `prepareMediaInputs()` and wire it into template-backed image/video runtime first.

Acceptance:

- Public URL, data URL base64, raw base64, multipart file, and array variants are supported.
- Required public URL failures are caught before provider calls.
- AISENYU-style data URL image generation and multipart image edit can be represented.
- Agnes-style public URL video input can be represented.

### Phase 3: Detection Drafts

Generate media contract drafts during creative-engine detection.

Acceptance:

- OpenAI-compatible services get standard image contract drafts when appropriate.
- Relay stations are not marked fully media-compatible from `/models` alone.
- Gemini-compatible services get Gemini-standard media contract drafts.
- Official providers get contracts from known adapter metadata.
- Optional docs can produce template-backed drafts.

### Phase 4: Media Test Wizard

Add explicit media tests and diagnostics.

Acceptance:

- Paid image/video tests require confirmation.
- Tests show rendered request, response extraction, polling, output extraction, and diagnosis.
- Passed capabilities become selectable in workflow model lists.
- Failed/unchecked capabilities remain visible in config but do not silently enter workflow selectors.

## Test Plan

Unit tests:

- `MediaContract` parser and validation.
- Input preparation for public URL, data URL base64, raw base64, multipart file, and arrays.
- Template variable rendering with prepared media values.
- Capability-to-workflow filtering.
- Diagnostic mapping for common failures.

Integration tests:

- OpenAI-compatible relay with text-only `/models` response does not mark image/video as passed.
- AISENYU-style image generation template returns `data[0].url`.
- AISENYU-style JSON reference image template sends data URL image.
- AISENYU-style multipart edit template sends file field.
- Agnes-style async video template uses public URL image and polls output URL.
- Gemini-compatible media model produces Gemini-standard contract.
- Official provider model exposes trusted adapter contract.

Regression tests:

- Existing models without `mediaContract` continue legacy generation path.
- Existing `compatMediaTemplate` models continue to save and load.
- Workflow selectors do not include failed/unchecked media capabilities by default.

## Success Criteria

The feature succeeds when:

```text
User enters a relay or compatible service URL and key.
System detects the service and models.
System generates media capability drafts.
User tests image/video capabilities explicitly.
Passed capabilities enter the correct workflow selectors.
Failed capabilities show actionable diagnoses.
Legacy models continue to run through existing paths.
```

The feature should reduce generic media generation failures by moving compatibility checks from generation time to connection/testing time.

## Open Decisions Resolved

- Use a unified media contract layer rather than vendor-specific special cases.
- Include OpenAI-compatible, relay stations, Gemini-compatible, and official provider adapters in scope.
- Do not build arbitrary REST workflow automation in this phase.
- Require explicit confirmation before paid image/video tests.
- Keep `compatMediaTemplate` as the concrete HTTP execution detail for template-backed models.
