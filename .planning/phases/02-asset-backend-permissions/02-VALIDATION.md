---
phase: 02
slug: asset-backend-permissions
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-20
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/assets/registry.test.ts tests/unit/assets/mappers.test.ts tests/unit/assets/style-assets.test.ts` |
| **Full suite command** | `npx vitest run tests/unit/assets tests/integration/api/specific/assets-route.test.ts tests/unit/optimistic/asset-style-actions.test.ts && npm run typecheck` |
| **Estimated runtime** | ~90 seconds |

## Sampling Rate

- **After every task commit:** Run the task's focused `npx vitest run ...` command.
- **After every plan wave:** Run the phase full suite command.
- **Before `/gsd-verify-work`:** Full suite and `npm run typecheck` must be green.
- **Max feedback latency:** 120 seconds.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | API-04 | T-02-01 / T-02-04 | `AssetKind='style'` is accepted without breaking existing kinds | unit | `npx vitest run tests/unit/assets/registry.test.ts` | existing | pending |
| 02-01-02 | 01 | 1 | API-03, API-04 | T-02-02 | style preview response omits `storageKey` and uses `/m/{publicId}` | unit | `npx vitest run tests/unit/assets/mappers.test.ts tests/unit/assets/style-assets.test.ts` | W0 | pending |
| 02-01-03 | 01 | 1 | API-01, API-04 | T-02-01 / T-02-03 | global style reads include user rows plus read-only system styles scoped by authenticated user | unit | `npx vitest run tests/unit/assets/style-assets.test.ts` | W0 | pending |
| 02-02-01 | 02 | 2 | API-01 | T-02-03 | style create/update/delete writes only `source='user'` rows owned by requester | unit | `npx vitest run tests/unit/assets/style-assets.test.ts` | W0 | pending |
| 02-02-02 | 02 | 2 | API-01, API-03 | T-02-02 / T-02-03 | `/api/assets` style routes require auth and return safe asset responses | integration | `npx vitest run tests/integration/api/specific/assets-route.test.ts` | existing | pending |
| 02-02-03 | 02 | 2 | API-04 | T-02-04 | React Query style mutations use unified routes and invalidate asset caches | unit | `npx vitest run tests/unit/optimistic/asset-style-actions.test.ts` | W0 | pending |

## Wave 0 Requirements

- [ ] `tests/unit/assets/style-assets.test.ts` — service/read/write and preview response contract for style assets.
- [ ] `tests/unit/optimistic/asset-style-actions.test.ts` — React Query style action payload and invalidation tests.
- [ ] Extend `tests/unit/assets/registry.test.ts` and `tests/unit/assets/mappers.test.ts` before implementation.
- [ ] Extend `tests/integration/api/specific/assets-route.test.ts` with style route coverage before route changes.

## Manual-Only Verifications

All Phase 02 behaviors have automated verification.

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency < 120s.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending
