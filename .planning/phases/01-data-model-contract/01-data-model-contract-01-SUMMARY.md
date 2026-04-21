---
phase: 01-data-model-contract
plan: 01
subsystem: database
tags: [prisma, mysql, sqlite, style-assets, schema-contract]
requires: []
provides:
  - GlobalStyle Prisma model for user and system visual style assets
  - Nullable NovelPromotionProject.styleAssetId relation preserving legacy style fields
  - Schema parity test covering MySQL and SQLite style asset contract
affects: [asset-center, project-style-defaults, style-resolver, task-snapshots]
tech-stack:
  added: []
  patterns:
    - Additive Prisma schema evolution with dual MySQL/SQLite parity
    - Media previews represented by MediaObject relation, not raw URLs or storage keys
key-files:
  created:
    - tests/unit/style/schema-parity.test.ts
  modified:
    - prisma/schema.prisma
    - prisma/schema.sqlit.prisma
key-decisions:
  - "GlobalStyle is a dedicated asset model instead of overloading existing character/location style fields."
  - "Visual style preview media is stored via previewMediaId and MediaObject relation only."
patterns-established:
  - "Style asset schema changes must stay additive and preserve artStyle/artStylePrompt compatibility fields."
  - "Style schema parity is tested by reading both Prisma schema files directly."
requirements-completed: [DATA-01, DATA-02]
duration: 71 min
completed: 2026-04-18
---

# Phase 01 Plan 01: Data Model Contract Summary

**GlobalStyle Prisma contract with project style asset references and MySQL/SQLite parity coverage**

## Performance

- **Duration:** 71 min
- **Started:** 2026-04-18T02:11:05Z
- **Completed:** 2026-04-18T03:22:08Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added `GlobalStyle` to both Prisma schemas with owner, folder, source, legacy key, positive/negative prompt, tags, preview media and timestamp fields.
- Added nullable `NovelPromotionProject.styleAssetId` and `styleAsset` relation while keeping `artStyle` and `artStylePrompt` untouched.
- Added schema parity tests that prevent drift between MySQL and SQLite schemas and reject raw preview URL/storage fields on `GlobalStyle`.
- Ran Prisma validate, generate, and additive `db push` against the local MySQL development database without `--accept-data-loss`.

## Task Commits

1. **Task 1-3: Schema parity, GlobalStyle schema and Prisma push** - `f2f07e7` (feat)

**Plan metadata:** pending in docs commit

## Files Created/Modified

- `tests/unit/style/schema-parity.test.ts` - Reads both Prisma schema files and verifies the style asset/project relation contract.
- `prisma/schema.prisma` - Adds MySQL `GlobalStyle`, project style relation and backrefs.
- `prisma/schema.sqlit.prisma` - Adds SQLite parity for the same `GlobalStyle` and project relation contract.

## Decisions Made

- Dedicated `GlobalStyle` model matches the phase decision to treat visual style as an asset.
- `previewMediaId` uses the existing `MediaObject` relationship pattern and avoids signed URL/storage key persistence in this layer.
- The implementation keeps system styles out of the database for now; legacy system projection is handled in Plan 02.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing project dependencies before running local test tools**
- **Found during:** Task 1 red test verification
- **Issue:** `npx vitest` tried to download Vitest 4 because local `node_modules` was missing, while the project is pinned to Vitest 2.
- **Fix:** Ran `npm install` to restore project dependencies, then discarded lockfile noise from the install.
- **Files modified:** none retained
- **Verification:** `npx vitest` subsequently used local Vitest 2.1.9.
- **Committed in:** not committed; environment repair only

**2. [Rule 3 - Blocking] Supplied explicit local DATABASE_URL for Prisma CLI commands**
- **Found during:** Task 2 verification
- **Issue:** `npx prisma validate` could not read `DATABASE_URL` from an absent local `.env`.
- **Fix:** Used the repository's documented local MySQL URL from `.env.example` for MySQL commands and a SQLite file URL for the SQLite validate command.
- **Files modified:** none
- **Verification:** Prisma validate/generate/db push all completed with Prisma 6.19.2.
- **Committed in:** not committed; command environment only

---

**Total deviations:** 2 auto-fixed blocking/environment issues.
**Impact on plan:** No scope change. The retained implementation remains exactly the planned additive schema contract.

## Issues Encountered

None remaining. The local MySQL container was available and `npx prisma db push` completed without destructive-change output.

## User Setup Required

None - no external service configuration required.

## Verification

- `npx vitest run tests/unit/style/schema-parity.test.ts` passed.
- `DATABASE_URL="mysql://root:waoowaoo123@localhost:13306/waoowaoo" npx prisma validate --schema prisma/schema.prisma` passed.
- `DATABASE_URL="file:./dev.db" npx prisma validate --schema prisma/schema.sqlit.prisma` passed.
- `DATABASE_URL="mysql://root:waoowaoo123@localhost:13306/waoowaoo" npx prisma generate` passed.
- `DATABASE_URL="mysql://root:waoowaoo123@localhost:13306/waoowaoo" npx prisma db push` passed.
- `npm run typecheck` passed.
- Commit hook `npm run verify:commit` passed during `f2f07e7`.

## Next Phase Readiness

Plan 02 can now implement the runtime resolver and snapshot contract using the generated Prisma client field `globalStyle`/`styleAssetId`.

---
*Phase: 01-data-model-contract*
*Completed: 2026-04-18*
