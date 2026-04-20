---
phase: 02
slug: asset-backend-permissions
status: complete
researched: 2026-04-20
requirements:
  - API-01
  - API-03
  - API-04
---

# Phase 02 Research — 资产后端与权限边界

## Question

What do I need to know to plan Phase 02 well?

Phase 02 should make `style` a legal unified asset type and expose it through protected asset APIs and React Query data access. It should not build the asset-center UI, project style picker, or generation-chain migration.

## Current State

- Phase 01 added `GlobalStyle`, nullable `NovelPromotionProject.styleAssetId`, legacy system style runtime projection, canonical `resolveStyleContext()`, and `StylePromptSnapshot`.
- Existing unified asset contracts live in `src/lib/assets/contracts.ts`, `src/lib/assets/kinds/registry.ts`, `src/lib/assets/mappers.ts`, and `src/lib/assets/services/read-assets.ts`.
- Unified asset API lives in `src/app/api/assets/route.ts` and `src/app/api/assets/[assetId]/route.ts`.
- Client data access is already centralized in `src/lib/query/hooks/useAssets.ts` and `src/lib/query/keys.ts`.
- `GlobalStyle.previewMediaId` points to `MediaObject`, but the generic media helper can include `storageKey` on internal `MediaRef` objects. Style asset responses must explicitly strip storage internals.

## Implementation Findings

### Asset Contract

`AssetKind` currently supports only `character | location | prop | voice`. Phase 02 needs `style` added to the union, registry, grouping/mapping tests, query key kind types, route kind guards, and any filter paths.

The style asset summary should be a first-class `AssetSummary` variant:

- `kind: 'style'`
- `family: 'visual'`
- `description: string | null`
- `positivePrompt: string`
- `negativePrompt: string | null`
- `tags: string[]`
- `source: 'user' | 'system'`
- `legacyKey: string | null`
- `readOnly: boolean`
- `previewMedia: MediaRef | null`

System styles from `listLegacySystemStyles()` should appear as read-only global assets with IDs such as `system:american-comic`. They should be visible only for global style reads and should not be returned inside a concrete user folder filter.

### Read Path

`readAssets({ scope: 'global', kind: 'style' }, { userId })` should combine:

- user-owned `GlobalStyle` rows with `source: 'user'`
- runtime-projected legacy system styles from `listLegacySystemStyles()`

For `scope: 'project'`, style assets should not be project-backed assets in Phase 02. Project style binding belongs to Phase 04, so project scope can safely return no style rows after the normal filter.

Preview media must be returned as a public media reference only. The mapper should construct a public object with `id`, `publicId`, `/m/{publicId}` URL and metadata fields, and must not spread internal media rows or helper objects that contain `storageKey`.

### Write Path

The existing `/api/assets` POST and `/api/assets/[assetId]` PATCH/DELETE routes are the right integration points. They already authenticate global scope with `requireUserAuth()` and project scope with project auth.

Style CRUD should be global-only in Phase 02:

- create: `scope=global`, `kind=style`, authenticated user creates `GlobalStyle` row with `source: 'user'`
- update: only rows where `id`, `userId`, and `source: 'user'` match
- delete: only rows where `id`, `userId`, and `source: 'user'` match
- system styles: update/delete/copy behavior is deferred; attempted write to `system:*` or `source='system'` should return `NOT_FOUND` or `INVALID_PARAMS` without revealing more detail

Write payload should accept only model-backed fields: `name`, `description`, `positivePrompt`, `negativePrompt`, `tags`, `folderId`, `previewMediaId`. It should reject raw preview URL/storage/signed URL fields by not mapping them to Prisma data, and tests should prove those keys do not reach `globalStyle.create` / `globalStyle.updateMany`.

### React Query

`useAssets()` already fetches `/api/assets?scope=...&kind=...`, and `useAssetActions()` already wraps create/update/delete with cache invalidation. Adding `style` to the shared types and query key kind type should make style data available without a parallel hook.

Focused tests should prove:

- `queryKeys.assets.list({ scope: 'global', kind: 'style' })` accepts style
- `useAssetActions({ scope: 'global', kind: 'style' })` posts/patches/deletes through unified routes
- existing `character`, `location`, `prop`, and `voice` cases remain valid

## Recommended Plan Split

### Plan 02-01: Contract, Read Service, And Media-Safe Mapping

Add style to asset contracts, registry, mappers, global read service, and focused unit tests. This plan proves `style` is a legal read asset type and style preview media is public-only.

### Plan 02-02: CRUD Routes, Permissions, And Query Mutations

Extend unified asset write routes and action service to create/update/delete user styles only, add route tests for auth/scope/read-only behavior, and add Query tests for style create/update/delete invalidation.

## Validation Architecture

## Test Strategy

Phase 02 should use focused Vitest tests instead of broad system tests:

- Unit tests for `AssetKind='style'`, registry capabilities, style mapper, read service composition, and preview media stripping.
- API route tests in `tests/integration/api/specific/assets-route.test.ts` for global style reads and CRUD permission forwarding.
- Service tests for user-only write filters on `GlobalStyle`.
- React Query hook tests for `kind: 'style'` create/update/delete request payloads and invalidation.

## Commands

Fast feedback:

```bash
npx vitest run tests/unit/assets/registry.test.ts tests/unit/assets/mappers.test.ts tests/unit/assets/style-assets.test.ts
npx vitest run tests/integration/api/specific/assets-route.test.ts
npx vitest run tests/unit/optimistic/asset-style-actions.test.ts
```

Final verification:

```bash
npx vitest run tests/unit/assets tests/integration/api/specific/assets-route.test.ts tests/unit/optimistic/asset-style-actions.test.ts
npm run typecheck
```

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Raw `storageKey` leaks through preview media | Build style preview response by explicit field copy, not object spread; add test that `storageKey` is absent. |
| System styles become accidentally writable | Only write rows matching `userId` plus `source: 'user'`; system runtime IDs are never passed to Prisma as writable rows. |
| Adding `style` breaks existing asset unions | Update `AssetSummary`, `filterAssetsByKind`, route `isAssetKind`, query key type, and registry tests together. |
| CRUD expands into UI scope | Keep Phase 02 to backend/data hooks; Phase 03 owns asset-center cards/forms. |
