# Doc-Driven Creative Engine Detection Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the spec-mandated `URL + API key + optional docs` creative-engine detection flow so relay and non-standard media APIs can be identified from user-provided documentation instead of relying only on `/models` and model-name heuristics.

**Architecture:** Keep the existing fast probes as cheap evidence, then add documentation as first-class evidence for the LLM inspector. The inspector produces only drafts (`mediaContract`, `compatMediaTemplate`, warnings, risks); media capabilities remain unchecked until explicit media tests pass. Existing runtime and persistence contracts stay compatible.

**Tech Stack:** Next.js API routes, React profile UI, TypeScript, Vitest, existing `apiFetch`, existing `MediaContract` and `OpenAICompatMediaTemplate` validators.

---

## File Structure

- Modify `src/lib/user-api/creative-engine-detection/types.ts`: add `documentationText?: string` to detect request and inspector payload types.
- Modify `src/app/api/user/creative-engines/detect/route.ts`: accept and trim optional `documentationText`.
- Modify `src/lib/user-api/creative-engine-detection/orchestrator.ts`: pass docs into inspector and treat docs as reason to call inspector even when `/models` succeeds.
- Modify `src/lib/user-api/creative-engine-detection/llm-inspector.ts`: include sanitized docs in prompt payload, add prompt instructions that docs evidence outranks model-name heuristics.
- Modify `src/lib/user-api/creative-engine-detection/model-classifier.ts`: keep media metadata precedence fix for `video + audio` models.
- Modify `src/app/[locale]/profile/components/creative-engine/AddCreativeEngineModal.tsx`: add optional documentation textarea and submit it in detect payload.
- Modify `src/app/[locale]/profile/components/creative-engine/detection-save-draft.ts`: ensure media contracts override conflicting purpose labels before saving.
- Modify `src/app/[locale]/profile/components/api-config/hooks.ts`: normalize enabled models before save so stale UI state cannot submit `audio + video mediaContract`.
- Modify `messages/zh/apiConfig.json` and `messages/en/apiConfig.json`: add documentation input labels/help.
- Test:
  - `tests/unit/user-api/creative-engine-detection/orchestrator.test.ts`
  - `tests/unit/user-api/creative-engine-detection/inspector-redaction.test.ts`
  - `tests/unit/creative-engine/detection-save-draft.test.ts`
  - `tests/unit/api-config/use-providers-order.test.ts`
  - existing integration tests for `/api/user/api-config`

## Task 1: Lock Misclassification and Save-Failure Regression

**Files:**
- Modify: `src/lib/user-api/creative-engine-detection/model-classifier.ts`
- Modify: `src/app/[locale]/profile/components/creative-engine/detection-save-draft.ts`
- Modify: `src/app/[locale]/profile/components/api-config/hooks.ts`
- Test: `tests/unit/user-api/creative-engine-detection/orchestrator.test.ts`
- Test: `tests/unit/creative-engine/detection-save-draft.test.ts`
- Test: `tests/unit/api-config/use-providers-order.test.ts`

- [ ] **Step 1: Write failing tests for video/audio metadata and stale save payloads**

Add tests that prove:

```ts
expect(result.models[0]).toMatchObject({
  callName: 'c-dense-2.0-fast',
  purpose: 'video-generation',
})
```

and:

```ts
expect(normalizeModelsBeforeSave([{ type: 'audio', purpose: 'voice-generation', mediaContract: videoContract } as CustomModel])[0])
  .toMatchObject({ type: 'video', purpose: 'video-generation' })
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run tests/unit/user-api/creative-engine-detection/orchestrator.test.ts tests/unit/creative-engine/detection-save-draft.test.ts tests/unit/api-config/use-providers-order.test.ts
```

Expected before implementation: FAIL on video/audio metadata being classified as voice, and/or `normalizeModelsBeforeSave` missing.

- [ ] **Step 3: Implement minimal regression fix**

In `model-classifier.ts`, evaluate video/image evidence before generic audio evidence. In `detection-save-draft.ts`, derive purpose from `mediaContract.mediaType` when present. In `hooks.ts`, export and call `normalizeModelsBeforeSave()` before PUT.

- [ ] **Step 4: Run focused regression tests**

Run:

```bash
npx vitest run tests/unit/user-api/creative-engine-detection/orchestrator.test.ts tests/unit/creative-engine/detection-save-draft.test.ts tests/unit/api-config/use-providers-order.test.ts
```

Expected: PASS.

## Task 2: Add Documentation Text to Detect API

**Files:**
- Modify: `src/lib/user-api/creative-engine-detection/types.ts`
- Modify: `src/app/api/user/creative-engines/detect/route.ts`
- Test: `tests/unit/user-api/creative-engine-detection/orchestrator.test.ts`

- [ ] **Step 1: Write failing route/request test**

Add a test or extend an existing orchestrator test so `detectCreativeEngine()` receives:

```ts
{
  serviceUrl: 'https://api.example.com/v1',
  apiKey: 'example-key',
  allowKeyInInspector: false,
  documentationText: 'POST /v1/videos creates async video tasks. GET /v1/videos/{id} returns video.url.',
}
```

Expected result after implementation: the inspector receives the same `documentationText`.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/unit/user-api/creative-engine-detection/orchestrator.test.ts
```

Expected before implementation: FAIL because request type or inspector call does not include docs.

- [ ] **Step 3: Implement request field**

In `types.ts`, add:

```ts
documentationText?: string
```

to `CreativeEngineDetectRequest`.

In `route.ts`, add:

```ts
documentationText: readOptionalString(body.documentationText),
```

with:

```ts
function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
```

- [ ] **Step 4: Run typecheck and focused tests**

Run:

```bash
npx vitest run tests/unit/user-api/creative-engine-detection/orchestrator.test.ts
npm run typecheck
```

Expected: PASS.

## Task 3: Let Docs Trigger and Inform LLM Inspector

**Files:**
- Modify: `src/lib/user-api/creative-engine-detection/orchestrator.ts`
- Modify: `src/lib/user-api/creative-engine-detection/llm-inspector.ts`
- Test: `tests/unit/user-api/creative-engine-detection/orchestrator.test.ts`
- Test: `tests/unit/user-api/creative-engine-detection/inspector-redaction.test.ts`

- [ ] **Step 1: Write failing tests**

Add a test where `/models` succeeds with a text-looking model, but docs describe a video endpoint. Mock `inspectCreativeEngine` to return:

```ts
{
  source: 'doc-relay',
  recommendedProviderKey: 'openai-compatible',
  protocolType: 'openai-compatible',
  normalizedBaseUrl: 'https://api.example.com/v1',
  confidence: 'high',
  models: [{
    name: 'C Dense2.0 Fast',
    callName: 'c-dense-2.0-fast',
    purpose: 'video-generation',
    confidence: 'high',
    mediaContract: videoContract,
    mediaContractSource: 'llm',
  }],
  warnings: ['DOCS_USED'],
  risks: [],
}
```

Assert the final detection includes the inspector video draft.

Add a redaction test that `buildInspectorPayload()` replaces `sk-...` values inside `documentationText`.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run tests/unit/user-api/creative-engine-detection/orchestrator.test.ts tests/unit/user-api/creative-engine-detection/inspector-redaction.test.ts
```

Expected before implementation: FAIL because docs do not trigger inspector and docs are absent from payload.

- [ ] **Step 3: Implement docs-aware inspector path**

In `orchestrator.ts`, compute:

```ts
const hasDocumentation = typeof request.documentationText === 'string' && request.documentationText.trim().length > 0
```

When `openaiResult.ok` or `geminiResult.ok` is true and `hasDocumentation` is true, call `inspectCreativeEngine()` with probe evidence and docs. If inspector returns models, return inspector result passed through `withMediaContractDrafts()`. If inspector is unavailable, fall back to the probe result.

In `llm-inspector.ts`, add `documentationText` to `buildInspectorPayload()` and sanitize it with `redactInspectorText()`.

Update `INSPECTOR_SYSTEM_PROMPT` with:

```ts
'用户提供的接入文档优先于模型名关键词；/models 只证明模型存在，不能证明媒体能力已通过测试。',
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run tests/unit/user-api/creative-engine-detection/orchestrator.test.ts tests/unit/user-api/creative-engine-detection/inspector-redaction.test.ts
```

Expected: PASS.

## Task 4: Add Documentation Input to UI

**Files:**
- Modify: `src/app/[locale]/profile/components/creative-engine/AddCreativeEngineModal.tsx`
- Modify: `messages/zh/apiConfig.json`
- Modify: `messages/en/apiConfig.json`
- Test: existing typecheck and lint

- [ ] **Step 1: Add UI state and payload**

In `AddCreativeEngineModal.tsx`, add:

```ts
const [documentationText, setDocumentationText] = useState('')
```

and include it in the detect body only when non-empty:

```ts
...(documentationText.trim() ? { documentationText: documentationText.trim() } : {}),
```

- [ ] **Step 2: Add textarea under URL/key fields**

Use existing glass input classes:

```tsx
<label className="block">
  <span className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
    {t('creativeEngine.documentationText')}
  </span>
  <textarea
    value={documentationText}
    onChange={(event) => setDocumentationText(event.target.value)}
    placeholder={t('creativeEngine.documentationPlaceholder')}
    className="glass-input-base min-h-28 w-full resize-y px-3 py-2.5 text-sm"
  />
  <span className="mt-1 block text-xs text-[var(--glass-text-tertiary)]">
    {t('creativeEngine.documentationHint')}
  </span>
</label>
```

- [ ] **Step 3: Add locale strings**

In `messages/zh/apiConfig.json` under `creativeEngine`:

```json
"documentationText": "接入文档",
"documentationPlaceholder": "可粘贴 API 文档、curl 示例、请求/响应示例。用于识别同步/异步、请求字段和返回字段。",
"documentationHint": "可选。系统会脱敏密钥类文本后用于智能识别接口形态。"
```

In `messages/en/apiConfig.json`:

```json
"documentationText": "Integration docs",
"documentationPlaceholder": "Paste API docs, cURL examples, request/response samples. Used to infer sync/async behavior, request fields, and response paths.",
"documentationHint": "Optional. Key-like values are redacted before intelligent interface recognition."
```

- [ ] **Step 4: Run UI validation**

Run:

```bash
npm run typecheck
npm run lint -- 'src/app/[locale]/profile/components/creative-engine/AddCreativeEngineModal.tsx'
```

Expected: PASS.

## Task 5: Verify the Corrective Flow

**Files:**
- All modified files from Tasks 1-4.

- [ ] **Step 1: Run targeted suite**

Run:

```bash
npx vitest run tests/unit/user-api/creative-engine-detection/orchestrator.test.ts tests/unit/user-api/creative-engine-detection/inspector-redaction.test.ts tests/unit/creative-engine/detection-save-draft.test.ts tests/unit/api-config/use-providers-order.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run integration checks**

Run:

```bash
npx vitest run tests/integration/api/specific/user-api-config-put.test.ts tests/integration/api/specific/creative-engine-user-models.test.ts tests/integration/api/specific/user-models-media-contract.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run typecheck and targeted lint**

Run:

```bash
npm run typecheck
npm run lint -- src/lib/user-api/creative-engine-detection/model-classifier.ts src/lib/user-api/creative-engine-detection/orchestrator.ts src/lib/user-api/creative-engine-detection/llm-inspector.ts src/app/api/user/creative-engines/detect/route.ts 'src/app/[locale]/profile/components/creative-engine/AddCreativeEngineModal.tsx' 'src/app/[locale]/profile/components/creative-engine/detection-save-draft.ts' 'src/app/[locale]/profile/components/api-config/hooks.ts'
```

Expected: PASS.

## Self-Review

- Spec coverage: Covers the spec gap around optional docs, recognition assistant, model classification, draft-only media contracts, and save safety. It does not add documentation URL fetching; this plan intentionally supports pasted documentation text first to avoid server-side arbitrary URL fetching and reduce security scope.
- Placeholder scan: No TODO/TBD placeholders remain.
- Type consistency: `documentationText` is the same field name across UI, route, request type, orchestrator, and inspector payload.
