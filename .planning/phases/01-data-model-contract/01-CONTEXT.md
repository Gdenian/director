# Phase 1: 数据模型与兼容契约 - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning
**Source:** User goal + brownfield codebase map + project research

<domain>

## Phase Boundary

Phase 1 establishes the durable data and compatibility contract for making visual style a first-class asset. It should create the schema, type-level contract, system style seed source, single resolver, and task snapshot shape needed by later phases.

This phase should not implement the full asset center UI, full CRUD routes, project picker UI, or worker migration. It may add small internal APIs/services only when they are necessary to prove the model and resolver contract.

</domain>

<decisions>

## Implementation Decisions

### Style Asset Model

- Add a dedicated Prisma model for global style assets rather than overloading `GlobalLocation`, `GlobalCharacterAppearance`, or `UserPreference`.
- The model should support at least: `id`, `userId`, `folderId`, `name`, `description`, `positivePrompt`, `negativePrompt`, `tags`, `source`, `legacyKey`, `previewMediaId`, `createdAt`, and `updatedAt`.
- User-created styles belong to one user. Built-in styles must be representable as read-only system styles or seed records with stable `legacyKey` values.
- Preview media must reference `MediaObject`; do not persist signed URLs, arbitrary storage keys, or external preview URLs as the main preview source.

### Project Compatibility

- Add `styleAssetId` to `NovelPromotionProject` as an optional project default style reference.
- Keep `NovelPromotionProject.artStyle`, `NovelPromotionProject.artStylePrompt`, and `UserPreference.artStyle` intact for backward compatibility.
- Existing projects with only `artStyle` or `artStylePrompt` must continue to resolve a style without requiring migration.
- Missing, deleted, or inaccessible `styleAssetId` must not break generation; resolver should fall back deterministically and expose enough state for later UI to show the fallback.

### Resolver Contract

- Create one style resolver service and make it the canonical contract for all later phases.
- Resolver priority is:
  1. Explicit task payload snapshot when present.
  2. Project `styleAssetId` if accessible.
  3. Project `artStylePrompt`.
  4. Project `artStyle` resolved through legacy `ART_STYLES` / `getArtStylePrompt`.
  5. `UserPreference.artStyle`.
  6. Default `american-comic` or empty fallback text meaning "与参考图风格一致".
- Resolver output must separate positive style text from negative prompt text so later non-image prompts are not accidentally polluted.
- Resolver output should include source metadata, such as `source`, `styleAssetId`, `legacyKey`, `label`, and fallback reason.

### Task Snapshot Contract

- Define a serializable style snapshot shape for generation task payloads.
- Snapshot should include `styleAssetId`, `legacyKey`, style display label/name, positive prompt, negative prompt, source, and enough metadata to debug whether fallback occurred.
- Phase 1 can define and test this snapshot contract without migrating every worker call site.

### Migration Strategy

- Prefer additive schema changes and compatibility services in this phase.
- Do not remove or rename existing style fields.
- Seed or expose legacy system styles from existing `ART_STYLES`; avoid manually duplicating style text in multiple files.
- If SQLite schema parity exists in `prisma/schema.sqlit.prisma`, update it consistently with `prisma/schema.prisma`.

### the agent's Discretion

- Exact model name may be `GlobalStyle` unless local naming patterns strongly suggest a better name.
- Exact enum/string representation for `source` can be string-based first if that matches existing schema conventions.
- The resolver may live under `src/lib/style/` or `src/lib/assets/services/` as long as imports make it clearly canonical and future phases can use it.
- Migration file strategy should follow the repo's existing Prisma workflow; if migration generation is unsafe locally, the plan must include a blocking schema push/generation task for execution.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope

- `.planning/PROJECT.md` — Core value and active requirements for style assetization.
- `.planning/REQUIREMENTS.md` — Phase 1 requirement IDs and acceptance scope.
- `.planning/ROADMAP.md` — Phase boundaries and dependencies.
- `.planning/research/SUMMARY.md` — Recommended architecture, pitfalls, and phase ordering.

### Existing Style Fields

- `prisma/schema.prisma` — Current `NovelPromotionProject.artStyle`, `NovelPromotionProject.artStylePrompt`, `UserPreference.artStyle`, global asset models, `MediaObject`, and relation patterns.
- `prisma/schema.sqlit.prisma` — SQLite/test schema parity if still maintained.
- `src/lib/constants.ts` — Current `ART_STYLES`, `ArtStyleValue`, `isArtStyleValue`, and `getArtStylePrompt` legacy source.
- `src/lib/config-service.ts` — Existing project model/config aggregation that returns `artStyle`.

### Asset And Media Patterns

- `src/lib/assets/contracts.ts` — Current asset kinds and summary contracts; later phases will add `style`.
- `src/lib/assets/kinds/registry.ts` — Current asset capability registration pattern.
- `src/lib/media/types.ts` — Media reference types to align preview snapshot and future API response shape.
- `src/lib/media/attach.ts` — Existing MediaRef attachment pattern.

### Existing Tests

- `tests/integration/api/specific/novel-promotion-project-art-style-validation.test.ts` — Current project `artStyle` validation behavior.
- `tests/integration/api/specific/user-preference-art-style-validation.test.ts` — Current user preference `artStyle` validation behavior.
- `tests/unit/worker/character-image-task-handler.test.ts` — Current worker style prompt expectations.
- `tests/unit/worker/location-image-task-handler.test.ts` — Current worker style prompt expectations.
- `tests/unit/worker/panel-image-task-handler.test.ts` — Current panel image style prompt expectations.

</canonical_refs>

<specifics>

## Specific Ideas

- Add resolver tests before broad implementation so fallback priority is locked.
- Keep built-in style text sourced from `ART_STYLES` in Phase 1; do not fork prompt text into new seed constants unless there is a single canonical transform.
- If a style asset is inaccessible, resolver should not leak whether another user's private style exists; return a generic inaccessible/missing fallback reason.
- The first implementation should optimize for deterministic compatibility over rich UX.

</specifics>

<deferred>

## Deferred Ideas

- Asset center CRUD API and UI belong to Phases 2 and 3.
- Project picker and workspace display belong to Phase 4.
- Worker migration and task payload write-through belong to Phase 5.
- Guard scripts and broad compatibility matrix belong to Phase 6, though Phase 1 should include focused resolver/schema tests.

</deferred>

---

*Phase: 01-data-model-contract*
*Context gathered: 2026-04-17 via direct phase planning context*
