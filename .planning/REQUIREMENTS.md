# Requirements: waoowaoo Style Assets

**Defined:** 2026-04-17
**Core Value:** 用户可以把画面风格作为可管理资产沉淀下来，并稳定地复用于角色、场景、分镜和视频生成，减少反复填写风格提示词带来的不一致。

## v1 Requirements

### Data Model

- [x] **DATA-01**: System can store global style assets with name, description, positive prompt, optional negative prompt, tags, source type, preview media, owner, folder, and timestamps.
- [x] **DATA-02**: System can link a project to a default style asset while preserving existing `artStyle` and `artStylePrompt` fields for legacy projects.
- [ ] **DATA-03**: System can represent built-in system styles as read-only style assets or seed records with stable legacy keys.
- [ ] **DATA-04**: System can resolve style context through a single service that supports style asset, legacy project prompt, legacy style key, user preference, and default fallback.
- [ ] **DATA-05**: System can preserve a style prompt snapshot for generation tasks so retries and recovery do not drift after a style is edited.

### Asset Hub

- [ ] **ASSET-01**: User can see "画面风格" as an asset type in the asset center alongside characters, locations, props, and voices.
- [ ] **ASSET-02**: User can list style assets with name, prompt summary, source, tags, folder, and optional preview image.
- [ ] **ASSET-03**: User can create a custom style asset from the asset center.
- [ ] **ASSET-04**: User can edit their own custom style asset fields.
- [ ] **ASSET-05**: User can delete a custom style asset only when deletion will not break active project references, or the system safely clears references while preserving snapshots.
- [ ] **ASSET-06**: User can copy a built-in system style into their own custom style asset.
- [ ] **ASSET-07**: User can organize style assets with existing asset center folders and filters.
- [ ] **ASSET-08**: User can attach or change a style preview image through the existing media system.

### Project Style Selection

- [ ] **PROJ-01**: User can select a style asset during quick project creation from the home/story input flow.
- [ ] **PROJ-02**: User can select or change a project default style asset inside the project workspace configuration flow.
- [ ] **PROJ-03**: User can see the currently resolved project style in workspace areas that affect generation.
- [ ] **PROJ-04**: Existing projects that only have legacy `artStyle` or `artStylePrompt` still display a meaningful style label and remain editable.
- [ ] **PROJ-05**: System prevents a project from binding to another user's private style asset.

### Generation Flow

- [ ] **GEN-01**: Character image generation uses the same resolved project style context as other visual generation flows.
- [ ] **GEN-02**: Location and prop image generation use the same resolved project style context as other visual generation flows.
- [ ] **GEN-03**: Storyboard panel image generation uses the same resolved project style context as other visual generation flows.
- [ ] **GEN-04**: Storyboard variant and image edit flows preserve style continuity by using the same style resolver or an explicit generation snapshot.
- [ ] **GEN-05**: Non-image text/analysis prompts do not receive raw negative prompt text unless the prompt contract explicitly supports it.
- [ ] **GEN-06**: Generation task payloads record style asset identity and prompt snapshot for debugging, retry, and recovery.

### API & Permissions

- [ ] **API-01**: Style asset CRUD routes require user authentication and scope all reads/writes by owner or system visibility.
- [ ] **API-02**: Project style binding routes require project ownership and verify selected style accessibility.
- [ ] **API-03**: Style asset responses expose preview images as `MediaRef` data, not raw storage keys or long-lived signed URLs.
- [ ] **API-04**: React Query hooks and mutations can fetch, create, update, delete, and invalidate style assets without breaking existing asset kinds.

### Compatibility & Migration

- [ ] **MIG-01**: Existing projects continue to generate without data migration by falling back from `styleAssetId` to legacy style fields.
- [ ] **MIG-02**: Built-in legacy style options remain available as system styles or fallback options.
- [ ] **MIG-03**: User preference default style remains compatible with the new style asset selection flow.
- [ ] **MIG-04**: The application can handle missing, deleted, or inaccessible style assets with a deterministic fallback and user-visible state.

### Testing & Guardrails

- [ ] **TEST-01**: Unit tests cover style resolver priority, fallback behavior, task snapshot creation, and deleted/inaccessible asset behavior.
- [ ] **TEST-02**: API tests cover style CRUD permissions, cross-user access denial, project binding permissions, and media preview response shape.
- [ ] **TEST-03**: Asset contract tests cover `AssetKind='style'`, style registry capabilities, asset mappers, read-assets filtering, and React Query cache invalidation.
- [ ] **TEST-04**: Generation tests cover style propagation for character, location/prop, storyboard panel, and variant flows.
- [ ] **TEST-05**: Legacy compatibility tests cover old projects with `artStyle`, old projects with `artStylePrompt`, new projects with `styleAssetId`, and mixed-field projects.
- [ ] **TEST-06**: Guard scripts or equivalent checks prevent new direct style prompt assembly from bypassing the style resolver in generation code.

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Style Intelligence

- **V2-STYLE-01**: User can generate a preview image for a style asset through an AI task.
- **V2-STYLE-02**: User can extract a style prompt from a reference image.
- **V2-STYLE-03**: User can compare multiple styles on the same sample shot.
- **V2-STYLE-04**: User can tune style strength per project or per generation task.
- **V2-STYLE-05**: System can version style assets and show generation history per version.

### Sharing & Commerce

- **V2-SHARE-01**: User can share style assets with other users or a team.
- **V2-SHARE-02**: User can publish style assets to a community style library.
- **V2-SHARE-03**: System can support marketplace or paid style packs.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| LoRA/DreamBooth/model fine-tuning | This milestone manages prompts and reusable assets, not training infrastructure. |
| Copyright or style compliance auditing | Important but separate from the first asset management capability. |
| Public marketplace or paid style packs | Requires sharing, moderation, billing, and ownership policy beyond v1. |
| Full asset center redesign | v1 extends the existing asset center patterns instead of replacing them. |
| Automatic style preview generation | Adds task, billing, provider, and media complexity; defer until manual style management is stable. |
| Solving all existing security/production concerns | Those risks remain tracked in `.planning/codebase/CONCERNS.md` but are not the active product capability scope. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Pending |
| DATA-04 | Phase 1 | Pending |
| DATA-05 | Phase 1 | Pending |
| ASSET-01 | Phase 3 | Pending |
| ASSET-02 | Phase 3 | Pending |
| ASSET-03 | Phase 3 | Pending |
| ASSET-04 | Phase 3 | Pending |
| ASSET-05 | Phase 3 | Pending |
| ASSET-06 | Phase 3 | Pending |
| ASSET-07 | Phase 3 | Pending |
| ASSET-08 | Phase 3 | Pending |
| PROJ-01 | Phase 4 | Pending |
| PROJ-02 | Phase 4 | Pending |
| PROJ-03 | Phase 4 | Pending |
| PROJ-04 | Phase 4 | Pending |
| PROJ-05 | Phase 4 | Pending |
| GEN-01 | Phase 5 | Pending |
| GEN-02 | Phase 5 | Pending |
| GEN-03 | Phase 5 | Pending |
| GEN-04 | Phase 5 | Pending |
| GEN-05 | Phase 5 | Pending |
| GEN-06 | Phase 5 | Pending |
| API-01 | Phase 2 | Pending |
| API-02 | Phase 4 | Pending |
| API-03 | Phase 2 | Pending |
| API-04 | Phase 2 | Pending |
| MIG-01 | Phase 1 | Pending |
| MIG-02 | Phase 1 | Pending |
| MIG-03 | Phase 1 | Pending |
| MIG-04 | Phase 1 | Pending |
| TEST-01 | Phase 6 | Pending |
| TEST-02 | Phase 6 | Pending |
| TEST-03 | Phase 6 | Pending |
| TEST-04 | Phase 6 | Pending |
| TEST-05 | Phase 6 | Pending |
| TEST-06 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 38 total
- Mapped to phases: 38
- Unmapped: 0
- Duplicate mappings: 0

---
*Requirements defined: 2026-04-17*
*Last updated: 2026-04-17 after roadmap creation*
