---
phase: 02-asset-backend-permissions
plan: 01
subsystem: asset-read-contract
tags: [style-assets, registry, mapper, media-ref, vitest]
requires:
  - phase: 01-data-model-contract
    provides: GlobalStyle schema, legacy system style projection, style resolver contract
provides:
  - `style` unified AssetKind contract and registry entry
  - Global style read service returning user styles plus read-only system styles
  - Media-safe style preview mapping using public MediaRef fields only
affects: [asset-api, asset-hub, react-query, media-safety]
key-files:
  created:
    - src/lib/assets/services/style-assets.ts
    - tests/unit/assets/style-assets.test.ts
  modified:
    - src/lib/assets/contracts.ts
    - src/lib/assets/kinds/registry.ts
    - src/lib/assets/mappers.ts
    - src/lib/assets/services/read-assets.ts
    - src/lib/assets/grouping.ts
    - src/lib/query/hooks/useAssets.ts
    - src/lib/query/keys.ts
    - tests/unit/assets/registry.test.ts
    - tests/unit/assets/mappers.test.ts
requirements-completed: [API-03, API-04]
completed: 2026-04-20
---

# Phase 02 Plan 01 Summary

## Accomplishments

- 把 `style` 加入统一 `AssetKind`、`AssetSummary` 和 asset kind registry。
- 新增 `listReadableGlobalStyleAssets()`，全局读取时同时返回用户自定义风格和 runtime 系统风格；按文件夹过滤时只返回用户风格。
- 新增 `mapGlobalStyleToAsset()` 与 `mapLegacySystemStyleToAsset()`，把风格预览媒体显式裁剪成公开 `MediaRef`，避免泄露 `storageKey`、`sha256`、`updatedAt` 等内部字段。
- 修正 `useAssets()` 与 `groupAssetsByKind()` 对无 `variants` 资产的兼容，避免 style 进入全局资产流后误伤现有 voice 分组。

## Verification

- `npx vitest run tests/unit/assets/registry.test.ts tests/unit/assets/mappers.test.ts tests/unit/assets/style-assets.test.ts`
- `npm run typecheck`

## Next Readiness

Plan 02 可以在统一 `/api/assets` 上接入 style CRUD，而不需要新增旁路风格 API。
