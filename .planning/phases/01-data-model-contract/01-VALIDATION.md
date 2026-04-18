---
phase: 01
slug: data-model-contract
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-17
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/style tests/unit/assets/registry.test.ts tests/unit/assets/mappers.test.ts` |
| **Full suite command** | `npm run typecheck && npm run test:unit:all && npm run test:integration:api` |
| **Estimated runtime** | ~90-240 seconds depending on installed dependencies and database availability |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/style/resolve-style-context.test.ts tests/unit/style/snapshot.test.ts`
- **After every plan wave:** Run `npm run typecheck && npx vitest run tests/unit/style tests/integration/api/specific/novel-promotion-project-art-style-validation.test.ts tests/integration/api/specific/user-preference-art-style-validation.test.ts`
- **Before `/gsd-verify-work`:** Full suite must be green, or database-dependent integration tests must be explicitly marked blocked with the unit/typecheck subset green
- **Max feedback latency:** 240 seconds for the required automated subset

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | DATA-01 | T-01-02 | Style preview uses `previewMediaId`, not raw storage keys | schema contract | `npx vitest run tests/unit/style/schema-parity.test.ts` | ✅ exists | ✅ green |
| 01-01-02 | 01 | 1 | DATA-02 | — | Existing `artStyle` and `artStylePrompt` remain present | schema contract | `npx vitest run tests/unit/style/schema-parity.test.ts` | ✅ exists | ✅ green |
| 01-02-01 | 02 | 1 | DATA-03, MIG-02 | — | Built-in styles expose stable legacy keys and deterministic fallback | unit | `npx vitest run tests/unit/style/legacy-system-styles.test.ts` | ✅ exists | ✅ green |
| 01-02-02 | 02 | 1 | DATA-04, MIG-01, MIG-03, MIG-04 | T-01-01 | Missing/inaccessible style assets fall back without leaking ownership | unit | `npx vitest run tests/unit/style/resolve-style-context.test.ts` | ✅ exists | ✅ green |
| 01-02-03 | 02 | 1 | DATA-05 | T-01-04 | Task snapshot is serializable and stable after creation | unit | `npx vitest run tests/unit/style/snapshot.test.ts` | ✅ exists | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/unit/style/legacy-system-styles.test.ts` — stubs and assertions for DATA-03 and MIG-02
- [x] `tests/unit/style/resolve-style-context.test.ts` — stubs and assertions for DATA-04, MIG-01, MIG-03, and MIG-04
- [x] `tests/unit/style/snapshot.test.ts` — stubs and assertions for DATA-05
- [x] Schema contract check for DATA-01 and DATA-02 via `tests/unit/style/schema-parity.test.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Database schema push against the developer's live database | DATA-01, DATA-02 | Local DB credentials and destructive migration prompts may vary by machine | Run `npx prisma db push` after schema edits; if Prisma reports destructive changes, stop and inspect because Phase 1 should be additive |

---

## Threat References

| Ref | Threat | Required Mitigation |
|-----|--------|---------------------|
| T-01-01 | Cross-user style probing through `styleAssetId` | Resolver must query only accessible style assets and return a generic missing/inaccessible fallback |
| T-01-02 | Preview storage key leakage | Schema and snapshot contract must use `previewMediaId` / future `MediaRef`, not raw signed URLs |
| T-01-03 | Prompt injection through user style text | Resolver separates style prompts from system instructions and never treats style text as executable control flow |
| T-01-04 | Task retry style drift | Snapshot captures prompt text and source metadata before later generation execution |

---

## Validation Sign-Off

- [x] All planned task groups have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency target recorded
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-17
