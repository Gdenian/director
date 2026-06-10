# AI Video Editing Design

Date: 2026-06-10
Status: V2 revision pending user review

## Goal

Add AI editing for the currently selected episode. The feature should create a complete first-cut timeline from existing generated storyboards, videos, voice lines, and subtitles, automatically fill missing video and voice assets, support natural-language refinement, preserve rollback history, and export an MP4.

The MVP is not a generic video generator and does not include BGM. It is an AI montage assembly workflow for material that already belongs to a novel-promotion episode.

## V2 Revision Scope

This revision keeps the original product direction but tightens the engineering design around the gaps found during spec review.

V2 adds explicit designs for:

- Transition bridge media persistence that does not overwrite panel videos.
- Frame-accurate media probing and clip duration validation.
- Subtitle and voice timecode alignment after trimming and reordering.
- Deterministic material analysis before LLM planning.
- Task, queue, SSE, billing, cancellation, and retry integration.
- Editor project version storage outside the main JSON blob.
- Project and episode authorization requirements for all editor routes.
- Render snapshots and export reproducibility.

The implementation plan should treat these V2 corrections as mandatory. If V1 and V2 conflict, V2 wins.

## External Product Lessons

The design borrows patterns from adjacent AI editing and montage assembly projects:

- [FireRed-OpenStoryline](https://github.com/FireRedTeam/FireRed-OpenStoryline) uses natural-language directing, LLM planning, precise tool orchestration, human-in-the-loop approval, reusable workflow skills, and AI transition generation. The project supports our decision that LLMs should create plans and summaries, while deterministic code applies validated operations.
- [Montage AI](https://github.com/mfahsold/montage-ai) emphasizes local-first rough cuts, transcript-based editing, beat-synced cuts, OTIO/EDL export, quality profiles, and rendering. Even without BGM in this MVP, it shows that export profiles, timeline artifacts, and repeatable render inputs need first-class design.
- [BeatSync Engine](https://github.com/Merserk/BeatSync-Engine) emphasizes audio analysis, beat detection, scene analysis, semantic clip labels, and video rendering. For this project, the relevant lesson is deterministic pre-analysis, not beat syncing.
- [auto-editor](https://github.com/WyattBlue/auto-editor) automatically edits media by analyzing loudness and other signals. The relevant lesson is that obvious pacing cuts should not rely only on LLM judgment.

## User Outcomes

- A user can click `AI剪辑` for the current episode and receive a usable first-cut timeline.
- Missing panel videos and missing voice audio are generated before the timeline is finalized.
- The first cut keeps plot continuity and follows the original story order by default.
- A user can refine the current timeline with natural language, such as `节奏更快一点`, `删掉拖沓片段`, or `这里转场太硬`.
- AI refinements show a summary before they are applied.
- The user can roll back to an earlier timeline version.
- The user can export MP4, with an export-time option to burn subtitles into the video.

## Non-Goals

- No BGM generation or beat-sync editing in the MVP.
- No multi-episode batch editing.
- No project-wide long-video merge.
- No separate AI editing model configuration. The feature reuses the existing default analysis/LLM model.
- No unconditional AI transition generation between every pair of clips.
- No adoption of unvalidated LLM output.

## Existing Context

The project already has a video editor skeleton under `src/features/video-editor`:

- `VideoEditorStage` provides a preview, properties panel, timeline, save button, and export button.
- `RemotionPreview` renders the timeline using `@remotion/player`.
- `VideoEditorProject` is persisted in the `video_editor_projects` table as JSON.
- `/api/novel-promotion/[projectId]/editor` supports loading, saving, and deleting editor projects.
- `EditorStageRoute` currently builds a project from panels each time instead of prioritizing a saved editor project.
- `useEditorActions.startRender` calls `/editor/render`, but that route does not exist.
- The current editor config defaults to `1920x1080`; export must instead follow the project video ratio.

The video stage also has a first-last-frame flow:

- It generates a panel video whose first frame is the current panel image and whose last frame is the next panel image.
- It writes the generated result back to the current panel `videoUrl`.
- It marks panel continuity with `linkedToNextPanel` and `videoGenerationMode = "firstlastframe"`.

This first-last-frame feature is source-material continuity generation. AI editing should reuse it before creating separate timeline bridge clips.

## Architecture

The feature is implemented as an artifact-first editing pipeline:

1. Material readiness check
2. Missing asset generation
3. Media probing and duration normalization
4. Editor material manifest creation
5. Deterministic material analysis
6. AI edit plan generation
7. Edit plan validation
8. Optional transition bridge generation
9. Timeline project persistence
10. Natural-language refinement
11. MP4 rendering

The core boundary is that LLMs produce plans, not trusted final state. Deterministic project code validates and applies those plans.

The second boundary is that all timeline operations use frame-based normalized artifacts. Panel durations, voice durations, SRT timings, and media metadata are inputs, but the saved editor project stores normalized frame positions at the project FPS.

## Core Modules

### Editor Media Probe

Builds reliable media facts before planning.

Responsibilities:

- Resolve stable media URLs through the existing media layer.
- Probe video and audio duration with a server-side media tool such as ffprobe.
- Prefer `MediaObject.durationMs` when it exists and refresh it when missing or clearly invalid.
- Convert media durations to frames using the editor FPS.
- Record probe failures in the manifest instead of silently using panel estimates.

Rules:

- `NovelPromotionPanel.duration` is a hint, not the final video duration.
- `NovelPromotionVoiceLine.audioDuration` is a hint, not the final audio duration.
- A clip can only be trimmed against a known or conservatively estimated source duration.
- If a video cannot be probed, the fallback duration is the panel duration, then 3 seconds, and the timeline summary must include the downgrade.

### Editor Source Asset Registry

Stores edit-only generated media that is not allowed to overwrite source panel fields.

Initial asset kinds:

- `transition_bridge`
- `render_output`
- Future-compatible `analysis_proxy` if low-resolution proxy media is introduced later.

The MVP persists these assets in a dedicated editor asset table that references `MediaObject`. Do not store bridge clips only inside `projectData`, because the render worker, rollback, cleanup, and retries need durable media identity.

Each editor asset records:

- `id`
- `editorProjectId`
- `episodeId`
- `kind`
- `mediaObjectId`
- Stable resolved URL for read APIs
- `sourceClipIds`
- `sourcePanelIds`
- `prompt`
- `durationMs`
- `status`
- `taskId`
- `createdAt`

### Deterministic Material Analyzer

Computes non-LLM signals that help identify obvious pacing and continuity issues.

Inputs:

- Media duration and FPS
- Panel order and storyboard order
- SRT segment text and timings
- Voice line duration, line index, and matched panel
- Existing first-last-frame linkage
- Optional lightweight frame metrics when affordable

MVP signals:

- Missing media and missing voice.
- Video duration versus voice/subtitle duration mismatch.
- Very short or very long clips relative to neighboring clips.
- Adjacent panels without first-last-frame continuity.
- Repeated descriptions or duplicate source URLs.
- Silent voice gaps when audio duration is known.

Non-MVP signals:

- Beat detection and BGM energy analysis.
- Full visual semantic tagging with a vision model.
- Motion-scene scoring across all source video frames.

The AI planner receives these signals as hints. The validator still decides whether proposed cuts are legal.

### Editor Manifest Builder

Builds a normalized manifest for the selected episode.

Inputs:

- Episode id
- Storyboards and panels
- Panel video URLs, lip-sync video URLs, image URLs, descriptions, durations
- Voice lines, audio URLs, speaker, text, matched panel ids
- Project video ratio and style metadata
- Existing first-last-frame state

Output:

- Ordered list of candidate source clips
- Voice and subtitle attachment candidates
- Continuity hints, including first-last-frame links
- Missing asset report
- Project export dimensions derived from video ratio
- Media probe facts and analyzer signals

### AI Edit Planner

Calls the existing default analysis/LLM model and produces an `edit_plan`.

Planner constraints:

- Preserve story order by default.
- Do not invent media URLs.
- Prefer existing `lipSyncVideoUrl` over `videoUrl` where appropriate.
- Prefer first-last-frame source videos for linked adjacent panels.
- Only delete or shorten content when the reason is explicit.
- Mark continuity gaps where a bridge transition may help.
- Respect optional target duration only during refinement, not initial full-story assembly.

### Edit Plan Schema

The `edit_plan` is a structured intermediate artifact. It should include:

- Ordered source clip references
- Trim ranges
- Voice/subtitle attachments
- Subtitle cue operations
- Deterministic transition choices
- Optional bridge transition requests
- Human-readable summary
- Risk notes, such as deleted clips or reordered clips

The `edit_plan` is not persisted as the final editor project without validation.

### Timeline Timecode Model

V2 uses explicit cue-level timing instead of a single subtitle text per clip.

Normalized timeline entities:

- Video clip: `startFrame`, `durationInFrames`, `sourceTrim.fromFrame`, `sourceTrim.toFrame`.
- Audio attachment: `sourceVoiceLineId`, `src`, `startFrame`, `durationInFrames`, `clipOffsetFrames`, `volume`.
- Subtitle cue: `id`, `text`, `startFrame`, `endFrame`, `sourcePanelId`, `sourceVoiceLineId`, `style`.

Source priority:

1. If panel `srtSegment`, `srtStart`, and `srtEnd` exist, use them to create subtitle cues.
2. If a voice line is matched to a panel and has content, use the voice line as the subtitle text and align it to the matched clip.
3. If neither exists, use the panel description only as editor metadata, not as a burned subtitle.

Alignment rules:

- Initial assembly keeps voice and subtitle cues attached to their source panel clip.
- Clip trimming also trims or shifts attached audio/subtitle cues.
- If target duration refinement shortens visual clips below voice duration, the validator must either reject the change, extend the clip, or mark the voice/subtitle as intentionally truncated in the summary.
- Small local reorder moves attached voice and subtitle cues with the clip unless the edit plan explicitly separates them and the validator accepts it.
- Burned subtitles are produced at render time from normalized cues. Editable project data keeps cues independent of the render setting.

### Timeline Validator

Validates and normalizes the `edit_plan`.

Hard checks:

- Every media URL must come from the episode manifest or from a completed transition bridge task.
- Every panel id, storyboard id, and voice line id must exist in the current episode.
- Trim ranges must be inside clip duration.
- Audio attachments and subtitle cues must stay inside the normalized timeline unless explicitly marked as truncated.
- Voice and subtitle cues cannot be orphaned from their source panel without an accepted edit-plan reason.
- Transition durations must be legal.
- Reordering must stay within the allowed small local movement policy.
- Deleted clips must be listed in the change summary.
- Output dimensions must match the project video ratio.
- Render snapshots must reference only durable media assets, not expiring signed URLs.

Failure handling:

- One LLM repair attempt is allowed with validator errors.
- If repair fails, fall back to a conservative timeline in story order.

### Transition Bridge Planner

AI transition generation is included, but only as an optional continuity enhancement.

Priority rules:

1. If adjacent panels already have a generated first-last-frame video and `linkedToNextPanel` is true, use that source video and do not generate an additional bridge by default.
2. If two adjacent source clips still have a high continuity gap, request a bridge clip.
3. Limit automatic bridge generation to a small number of high-value gaps, defaulting to 1-3 per episode.
4. User refinement can explicitly request a bridge for the selected cut.

Bridge task inputs:

- Tail frame or representative image from the previous clip
- Head frame or representative image from the next clip
- Previous and next panel descriptions
- Characters, location, emotion, and user instruction
- Target duration, usually 0.8-1.5 seconds

Bridge output:

- A separate timeline clip with `kind = "transition_bridge"`
- It does not overwrite the source panel `videoUrl`
- It can be previewed, deleted, regenerated, and rolled back
- It is persisted through the Editor Source Asset Registry.
- It has a durable `editorAssetId` and `mediaObjectId` before it can enter a saved timeline.

Failure handling:

- Bridge generation failure does not fail the AI edit.
- The system falls back to a deterministic `dissolve` or `fade` transition and records the downgrade in the summary.

Task integration:

- Add a dedicated `AI_EDIT_TRANSITION_BRIDGE` task type that creates or updates an editor asset target.
- The target must be an editor asset or pending bridge request, not `NovelPromotionPanel`.
- Bridge generation may reuse the existing image-to-video provider path, but its persistence path must write an editor asset rather than panel fields.
- A bridge task is billable as video generation when billing is enabled.
- A canceled assemble/refine task must stop waiting for bridge generation and leave pending editor assets in a canceled or failed state.

### AI Edit Assemble Worker

Adds a long-running task, `AI_EDIT_ASSEMBLE`, for the initial one-click AI edit.

Flow:

1. Load episode and project context.
2. Build a missing asset report.
3. Submit missing panel video and voice generation tasks through existing task submitters.
4. Wait for required video generation to complete with timeout and cancellation checks.
5. Wait for voice generation where possible with timeout and cancellation checks.
6. Probe media duration and normalize all timecodes.
7. Run deterministic material analysis.
8. Build the final manifest.
9. Generate and validate an edit plan.
10. Generate selected transition bridge clips if needed.
11. Persist `VideoEditorProject` schema `1.2`.
12. Create an initial version record.
13. Publish progress and completion events.

Video generation failures are fatal for panels required by the final timeline. Voice generation failures are non-fatal; the timeline can be generated with missing audio marked in the summary.

Subtask waiting rules:

- The assemble task waits on project task records, not open HTTP requests.
- Every wait loop must check task cancellation.
- Required video tasks use a clear timeout. If timeout expires, the assemble task fails with the panel ids that blocked completion.
- Optional voice and bridge tasks may time out into a degraded timeline if the summary explains the downgrade.
- Dedupe keys must include the source panel or editor asset id so a retry can reattach to in-flight work.

### AI Edit Refine Worker

Adds a long-running task, `AI_EDIT_REFINE`, for natural-language edits against the current timeline.

Inputs:

- Current editor project
- User instruction
- Optional target duration
- Current manifest
- Selected clip or selected cut, if any

Flow:

1. Generate a diff plan rather than a complete replacement project.
2. Validate the diff.
3. Generate any required pending bridge assets.
4. Return a pending version with summary.
5. Wait for user confirmation.
6. Apply the version only after confirmation.
7. Create a version record after application.

Allowed refinement scope:

- Delete obviously slow, redundant, or low-value content.
- Adjust durations and trims.
- Make small local reorders if plot continuity is preserved.
- Add, replace, or remove transition bridge clips.

Target duration handling:

- Initial assembly ignores target duration and produces a complete story version.
- Refinement can accept a target duration.
- The planner may shorten or remove clips to approach the target, but the validator must protect required plot beats and attached voice/subtitle cues.
- If the target is impossible without breaking continuity, the pending summary must say so instead of forcing the timeline to fit.

### Remotion Render Worker

Adds `/api/novel-promotion/[projectId]/editor/render` and a background render task.

Inputs:

- Editor project id
- Render quality
- `burnSubtitles` boolean
- Format, initially MP4

Flow:

1. Load saved editor project.
2. Create a render snapshot that freezes timeline data, dimensions, FPS, subtitle mode, and durable media references.
3. Render via Remotion in a worker-safe module.
4. Upload output through the existing storage/media layer.
5. Store the render output as an editor asset with `kind = "render_output"`.
6. Update `VideoEditorProject.renderStatus`, `renderTaskId`, and `outputUrl`.
7. Publish completion or failure.

The render implementation must stay out of ordinary page/API import chains to avoid build-time side effects.

Render rules:

- The render task uses project video ratio dimensions from normalized editor config.
- The render task must not depend on client-only editor components.
- If `burnSubtitles` is false, subtitles are not drawn into the MP4. A later non-MVP may also export SRT/VTT.
- If `burnSubtitles` is true, normalized subtitle cues are drawn by the render composition.
- Render retry uses the current saved project unless the user explicitly retries from a previous render snapshot.

## Data Model

Continue storing the current editor project in `VideoEditorProject.projectData`, but migrate the JSON schema from `1.0` to `1.2`.

Do not store full version history inside `projectData`. The existing `projectData` column is a text JSON field and should only hold the latest editable project plus a lightweight pending change summary.

### VideoEditorProject 1.2

Fields:

- `id`
- `episodeId`
- `schemaVersion: "1.2"`
- `config`
- `timeline`
- `subtitleCues`
- `audioTrack`
- `editorAssets`
- `bgmTrack`, kept as an empty array for MVP compatibility
- `pendingVersion`

### EditorConfig

Fields:

- `fps`
- `width`
- `height`
- `videoRatio`
- `burnSubtitlesDefault`

Dimensions are derived from project video ratio. For example, `9:16` should render as portrait dimensions rather than `1920x1080`.

### VideoClip

Fields:

- `id`
- `kind: "source" | "transition_bridge"`
- `src`
- `durationInFrames`
- `sourceTrim`
- `attachment`
- `transition`
- `metadata`

Metadata fields:

- `sourcePanelId`
- `storyboardId`
- `voiceLineId`
- `storyOrder`
- `source: "panel" | "lip_sync" | "ai_transition"`
- `description`
- `transitionBridge`, only for bridge clips
- `editorAssetId`, required for bridge clips
- `probe`, including probed duration and fallback flags

### SubtitleCue

Fields:

- `id`
- `text`
- `startFrame`
- `endFrame`
- `sourcePanelId`
- `sourceVoiceLineId`
- `style`
- `truncated`

### AudioAttachment

Fields:

- `id`
- `src`
- `startFrame`
- `durationInFrames`
- `sourceVoiceLineId`
- `sourcePanelId`
- `clipId`
- `volume`
- `truncated`

### Editor Asset Record

Add durable storage for media generated or owned by the editor workflow.

Required fields:

- `id`
- `editorProjectId`
- `episodeId`
- `kind: "transition_bridge" | "render_output"`
- `mediaObjectId`
- `url`
- `status`
- `taskId`
- `sourceClipIds`
- `sourcePanelIds`
- `metadata`
- `createdAt`
- `updatedAt`

Use a dedicated Prisma model that points to `MediaObject`, because bridge and render outputs need status, source links, and cleanup behavior.

### Version History

Store history in a dedicated `VideoEditorProjectVersion` table.

Each version:

- `versionId`
- `editorProjectId`
- `createdAt`
- `reason: "ai_initial" | "ai_refine" | "user_edit" | "render_snapshot"`
- `summary`
- `snapshotJson`
- `diffJson`, optional
- `createdByTaskId`

The version list should be capped to a small number, such as 10 snapshots per editor project. Old version rows may be deleted or compacted, but the current project must remain valid after cleanup.

### Schema Migration

Read paths must support existing `1.0` editor projects.

Migration from `1.0` to `1.2`:

- Keep existing timeline clip order.
- Convert `trim` to `sourceTrim`.
- Preserve existing `attachment.audio` as an `AudioAttachment` when it has a source URL.
- Preserve existing `attachment.subtitle` as a single `SubtitleCue` spanning the clip when no better panel or voice timing exists.
- Add `kind = "source"` to existing clips.
- Add `videoRatio`, `burnSubtitlesDefault`, and normalized dimensions to config.
- Initialize `editorAssets` and `pendingVersion` as empty values.
- Create one version record with reason `user_edit` or `ai_initial` only when the migrated project is saved.

Migration must be deterministic and must not re-run AI planning.

## Task And Queue Integration

Add editor workflow task types to the existing task system:

- `AI_EDIT_ASSEMBLE`
- `AI_EDIT_REFINE`
- `AI_EDIT_TRANSITION_BRIDGE`
- `EDITOR_RENDER`

Queue placement:

- `AI_EDIT_ASSEMBLE` and `AI_EDIT_REFINE` run in the text queue because they orchestrate LLM planning and existing media tasks.
- `AI_EDIT_TRANSITION_BRIDGE` runs in the video queue but writes editor assets instead of panel video fields.
- `EDITOR_RENDER` runs in a dedicated render queue so CPU-heavy export does not block provider video generation. The render queue imports Remotion only from worker-only modules.

Billing:

- Assemble/refine LLM planning is billable as text/LLM work when billing is enabled.
- Missing video, voice, bridge, and render tasks use the existing billing primitives where possible.
- If render is not externally billable, it still has task lifecycle records for progress and retry.

SSE and progress:

- Each top-level editor task publishes lifecycle and progress events with `episodeId`, `editorProjectId`, and `stage`.
- Child media tasks keep their existing events. The UI can show child progress by reading task ids recorded in the assemble/refine payload.
- Terminal events must invalidate editor project, voice lines, project data, and task queries as needed.

Cancellation and retry:

- Canceling assemble/refine stops the orchestration loop and stops waiting for optional child work.
- Already submitted child media tasks may continue unless the existing task cancellation route can cancel them safely.
- Retrying assemble/refine reattaches to in-flight child tasks using dedupe keys before submitting duplicates.

Authorization:

- Every editor route must validate that `episodeId` belongs to the current `projectId`.
- Editor asset, version, refine, bridge, and render routes must never fetch by `episodeId` alone.
- Render and rollback must verify the editor project belongs to the authorized project before reading media URLs or snapshots.

## UI

### AI Edit Entry

Add `AI剪辑` to the current episode flow, visible from the video stage and editor stage.

Progress states:

- Checking materials
- Generating missing videos
- Generating missing voice audio
- Planning edit
- Generating transition bridges
- Saving editor project

The UI uses existing task and SSE patterns rather than a blocking request.

### Editor Stage

Upgrade the current editor UI:

- Load saved editor project first.
- Fall back to creating a project from panels only when no saved project exists.
- Show source clips and transition bridge clips differently on the timeline.
- Show whether a source clip came from normal video, lip sync, or first-last-frame generation.
- Allow selected bridge clips to be deleted or regenerated.
- Add AI refine action.
- Add rollback action.
- Enable real export.

### AI Refine Interaction

Use a drawer or modal inside the editor.

The user enters an instruction. The system returns:

- Change summary
- Affected clips
- Expected duration change
- Deleted clips
- Added or replaced transition bridges
- Warnings about continuity risk

The user can apply or discard the pending result. Applying creates a version record. Discarding leaves the current project unchanged.

### Export Interaction

Before render, show a small export dialog:

- Burn subtitles on or off
- Quality: draft or high
- Format: MP4

The render output is visible after completion and stored as the editor project's `outputUrl`.

## Error Handling

The chain should degrade instead of failing unnecessarily.

- Missing required video fails the assemble task and identifies the failed panel.
- Missing voice audio creates a timeline with missing audio marked.
- LLM failure retries once.
- Invalid LLM output triggers one repair attempt.
- Validator failure after repair falls back to a conservative story-order timeline.
- Bridge transition failure falls back to deterministic transition.
- Render failure preserves the saved timeline and allows render retry.
- Media probe failure falls back to conservative duration only when the clip is otherwise usable.
- Required child task timeout fails the parent task with blocking target ids.
- Optional child task timeout degrades the timeline and records the downgrade.
- Authorization failure always fails closed and does not reveal whether the editor project or asset exists.
- Version apply failure must leave the current saved project unchanged.

## Testing

### Unit Tests

- Edit plan schema validation.
- Timeline validator for invalid URL, invalid panel id, invalid trim, invalid transition duration, and excessive reorder.
- Timeline validator for audio/subtitle cue truncation and orphan cue rejection.
- Media probe fallback duration behavior.
- Deterministic material analyzer signals.
- Project ratio to render dimensions.
- First-last-frame priority over bridge generation.
- Conservative timeline fallback.
- Version table cap and rollback behavior.
- Render snapshot creation from durable media references.

### Integration Tests

- `/editor` loads saved project before rebuilding from panels.
- `AI_EDIT_ASSEMBLE` submits missing video and voice tasks.
- `AI_EDIT_ASSEMBLE` waits for required child video tasks and times out with blocking panel ids.
- Failed voice generation does not block timeline creation.
- LLM failure falls back to conservative timeline.
- Bridge failure still completes AI edit.
- Transition bridge generation creates an editor asset and does not update panel `videoUrl`.
- Editor routes reject an `episodeId` from another project.
- `/editor/render` creates render task and updates status.
- `/editor/render` uses a render snapshot and can burn or omit subtitles.

### UI Behavior Tests

- `AI剪辑` starts the assemble task and shows progress.
- AI refine returns summary and does not apply without confirmation.
- Apply creates a new version.
- Cancel keeps current timeline unchanged.
- Rollback restores previous timeline.
- Export sends `burnSubtitles` in the render payload.
- Timeline shows bridge clips and source clips distinctly.
- Export completion exposes the output URL.

## Implementation Constraints

- Keep worker-only render and queue modules out of normal client/page imports.
- Keep new logic out of already oversized UI files where possible.
- Add small, focused modules for manifest building, planning, validation, transition planning, and rendering.
- Preserve current editor behavior for users who do not run AI editing.
- Reuse existing task, run, storage, media, model configuration, and provider abstractions.
- Do not let editor bridge generation overwrite `NovelPromotionPanel.videoUrl` or `lipSyncVideoUrl`.
- Do not keep full timeline history inside `VideoEditorProject.projectData`.
- Do not render from expiring signed URLs in saved render snapshots.
- Keep subtitle cue rendering shared between preview and export where practical, but keep Remotion server rendering out of client import chains.
- Prefer deterministic analyzer results for obvious pacing cuts; use the LLM for narrative judgment and user-intent interpretation.

## Open Technical Choices Resolved

- Scope is current episode only.
- BGM is excluded from MVP.
- Default LLM configuration is reused.
- Initial edit generates the full story version.
- Target duration is a refinement constraint.
- AI transition generation is included as optional bridge generation and must first respect existing first-last-frame video continuity.
- Subtitles are saved in editable project data and can be burned during export.
- V2 editor project JSON schema is `1.2`.
- Version history uses a dedicated `VideoEditorProjectVersion` table, not `projectData.history`.
- Transition bridges and render outputs are editor assets.
- Media probing and timecode normalization happen before AI planning.
