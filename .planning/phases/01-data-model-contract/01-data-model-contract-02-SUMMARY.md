---
phase: 01-data-model-contract
plan: 02
subsystem: domain
tags: [style-resolver, task-snapshot, legacy-compatibility, vitest]
requires:
  - phase: 01-data-model-contract
    provides: GlobalStyle schema and NovelPromotionProject.styleAssetId relation
provides:
  - Runtime projection of legacy ART_STYLES as read-only system styles
  - Canonical resolveStyleContext priority contract
  - Versioned StylePromptSnapshot creation and normalization contract
affects: [asset-api, asset-center-ui, project-default-style, generation-workers]
tech-stack:
  added: []
  patterns:
    - Resolver accepts injectable Prisma client for focused unit tests
    - Missing and inaccessible style asset references share one fallback reason
key-files:
  created:
    - src/lib/style/types.ts
    - src/lib/style/legacy-system-styles.ts
    - src/lib/style/resolve-style-context.ts
    - src/lib/style/snapshot.ts
    - src/lib/style/index.ts
    - tests/unit/style/legacy-system-styles.test.ts
    - tests/unit/style/resolve-style-context.test.ts
    - tests/unit/style/snapshot.test.ts
  modified: []
key-decisions:
  - "System styles are runtime projections from ART_STYLES with stable system:{legacyKey} ids, not seed rows."
  - "resolveStyleContext returns source metadata and a separate fallbackReason so downstream UI can explain fallback without leaking private assets."
patterns-established:
  - "Prompt snapshots are versioned plain JSON and copy prompt text at capture time to avoid retry drift."
  - "Style resolver keeps positivePrompt and negativePrompt separate through all paths."
requirements-completed: [DATA-03, DATA-04, DATA-05, MIG-01, MIG-02, MIG-03, MIG-04]
duration: 10 min
completed: 2026-04-18
---

# Phase 01 Plan 02: Style Resolver Contract Summary

**Canonical style resolver and versioned prompt snapshot contract for legacy and asset-backed visual styles**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-18T03:22:08Z
- **Completed:** 2026-04-18T03:32:06Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Added `listLegacySystemStyles()` and `getLegacySystemStyle()` to project existing `ART_STYLES` as read-only system style records with stable `system:{legacyKey}` ids.
- Added `resolveStyleContext()` with canonical priority: task snapshot, accessible style asset, project `artStylePrompt`, project `artStyle`, user preference, default `american-comic`, then empty fallback.
- Added access-safe style asset lookup using `id` plus owner/system visibility and a generic `style-asset-missing-or-inaccessible` fallback.
- Added `StylePromptSnapshot` creation/normalization with version `1`, JSON-serializable fields, stable copied prompt text, and separated positive/negative prompts.

## Task Commits

1. **Task 1-3: Resolver tests, legacy projection, resolver, snapshots** - `8b8bbe7` (feat)

**Plan metadata:** pending in docs commit

## Files Created/Modified

- `src/lib/style/types.ts` - Shared style resolver, fallback and snapshot contracts.
- `src/lib/style/legacy-system-styles.ts` - Runtime projection from `ART_STYLES`.
- `src/lib/style/resolve-style-context.ts` - Canonical resolver with privacy-preserving fallback.
- `src/lib/style/snapshot.ts` - Snapshot creation and normalization helpers.
- `src/lib/style/index.ts` - Barrel exports for future phases.
- `tests/unit/style/legacy-system-styles.test.ts` - System style projection coverage.
- `tests/unit/style/resolve-style-context.test.ts` - Resolver priority and missing/inaccessible fallback coverage.
- `tests/unit/style/snapshot.test.ts` - Snapshot serializability and drift-prevention coverage.

## Decisions Made

- Snapshot resolution returns `source: 'task-snapshot'` to make retry/replay provenance explicit while keeping original identity fields.
- Inaccessible style assets are never queried outside the accessible owner/system filter, so resolver output cannot include private style metadata.
- Default fallback remains `american-comic` because it exists in the current legacy constants.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `npx vitest run tests/unit/style/legacy-system-styles.test.ts` passed.
- `npx vitest run tests/unit/style/resolve-style-context.test.ts tests/unit/style/snapshot.test.ts` passed.
- `npx vitest run tests/unit/style` passed.
- `npm run typecheck` passed.
- Commit hook `npm run verify:commit` passed during `8b8bbe7`.

## Next Phase Readiness

Phase 2 can register `style` as an asset kind and route asset reads through this resolver contract without reimplementing legacy fallback logic.

---
*Phase: 01-data-model-contract*
*Completed: 2026-04-18*
