# AI Video Editing Design

Date: 2026-06-10
Status: Approved for implementation planning

## Goal

Add AI editing for the currently selected episode. The feature should create a complete first-cut timeline from existing generated storyboards, videos, voice lines, and subtitles, automatically fill missing video and voice assets, support natural-language refinement, preserve rollback history, and export an MP4.

The MVP is not a generic video generator and does not include BGM. It is an AI montage assembly workflow for material that already belongs to a novel-promotion episode.

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
3. Editor material manifest creation
4. AI edit plan generation
5. Edit plan validation
6. Optional transition bridge generation
7. Timeline project persistence
8. Natural-language refinement
9. MP4 rendering

The core boundary is that LLMs produce plans, not trusted final state. Deterministic project code validates and applies those plans.

## Core Modules

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
- Deterministic transition choices
- Optional bridge transition requests
- Human-readable summary
- Risk notes, such as deleted clips or reordered clips

The `edit_plan` is not persisted as the final editor project without validation.

### Timeline Validator

Validates and normalizes the `edit_plan`.

Hard checks:

- Every media URL must come from the episode manifest or from a completed transition bridge task.
- Every panel id, storyboard id, and voice line id must exist in the current episode.
- Trim ranges must be inside clip duration.
- Transition durations must be legal.
- Reordering must stay within the allowed small local movement policy.
- Deleted clips must be listed in the change summary.
- Output dimensions must match the project video ratio.

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

Failure handling:

- Bridge generation failure does not fail the AI edit.
- The system falls back to a deterministic `dissolve` or `fade` transition and records the downgrade in the summary.

### AI Edit Assemble Worker

Adds a long-running task, `AI_EDIT_ASSEMBLE`, for the initial one-click AI edit.

Flow:

1. Load episode and project context.
2. Build a missing asset report.
3. Submit missing panel video and voice generation tasks through existing task submitters.
4. Wait for required video generation to complete.
5. Wait for voice generation where possible.
6. Build the final manifest.
7. Generate and validate an edit plan.
8. Generate selected transition bridge clips if needed.
9. Persist `VideoEditorProject` schema `1.1`.
10. Publish progress and completion events.

Video generation failures are fatal for panels required by the final timeline. Voice generation failures are non-fatal; the timeline can be generated with missing audio marked in the summary.

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
3. Return a pending version with summary.
4. Wait for user confirmation.
5. Apply the version only after confirmation.

Allowed refinement scope:

- Delete obviously dragged content.
- Adjust durations and trims.
- Make small local reorders if plot continuity is preserved.
- Add, replace, or remove transition bridge clips.

### Remotion Render Worker

Adds `/api/novel-promotion/[projectId]/editor/render` and a background render task.

Inputs:

- Editor project id or episode id
- Render quality
- `burnSubtitles` boolean
- Format, initially MP4

Flow:

1. Load saved editor project.
2. Render via Remotion in a worker-safe module.
3. Upload output through the existing storage/media layer.
4. Update `VideoEditorProject.renderStatus`, `renderTaskId`, and `outputUrl`.
5. Publish completion or failure.

The render implementation must stay out of ordinary page/API import chains to avoid build-time side effects.

## Data Model

Continue storing editor project data in `VideoEditorProject.projectData`, but migrate the JSON schema from `1.0` to `1.1`.

### VideoEditorProject 1.1

Fields:

- `id`
- `episodeId`
- `schemaVersion: "1.1"`
- `config`
- `timeline`
- `bgmTrack`, kept as an empty array for MVP compatibility
- `history`
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
- `trim`
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

### Version History

Store MVP history inside `projectData.history`.

Each version:

- `versionId`
- `createdAt`
- `reason: "ai_initial" | "ai_refine" | "user_edit" | "render_snapshot"`
- `summary`
- `snapshot`

The history should be capped to a small number, such as 10 snapshots, to avoid unbounded JSON growth.

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

The UI should use existing task and SSE patterns rather than a blocking request.

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

The user can apply or discard the pending result. Applying creates a history snapshot. Discarding leaves the current project unchanged.

### Export Interaction

Before render, show a small export dialog:

- Burn subtitles on or off
- Quality: draft or high
- Format: MP4

The render output should be visible after completion and stored as the editor project's `outputUrl`.

## Error Handling

The chain should degrade instead of failing unnecessarily.

- Missing required video fails the assemble task and identifies the failed panel.
- Missing voice audio creates a timeline with missing audio marked.
- LLM failure retries once.
- Invalid LLM output triggers one repair attempt.
- Validator failure after repair falls back to a conservative story-order timeline.
- Bridge transition failure falls back to deterministic transition.
- Render failure preserves the saved timeline and allows render retry.

## Testing

### Unit Tests

- Edit plan schema validation.
- Timeline validator for invalid URL, invalid panel id, invalid trim, invalid transition duration, and excessive reorder.
- Project ratio to render dimensions.
- First-last-frame priority over bridge generation.
- Conservative timeline fallback.
- Version history cap and rollback behavior.

### Integration Tests

- `/editor` loads saved project before rebuilding from panels.
- `AI_EDIT_ASSEMBLE` submits missing video and voice tasks.
- Failed voice generation does not block timeline creation.
- LLM failure falls back to conservative timeline.
- Bridge failure still completes AI edit.
- `/editor/render` creates render task and updates status.

### UI Behavior Tests

- `AI剪辑` starts the assemble task and shows progress.
- AI refine returns summary and does not apply without confirmation.
- Apply creates a new version.
- Cancel keeps current timeline unchanged.
- Rollback restores previous timeline.
- Export sends `burnSubtitles` in the render payload.

## Implementation Constraints

- Keep worker-only render and queue modules out of normal client/page imports.
- Keep new logic out of already oversized UI files where possible.
- Add small, focused modules for manifest building, planning, validation, transition planning, and rendering.
- Preserve current editor behavior for users who do not run AI editing.
- Reuse existing task, run, storage, media, model configuration, and provider abstractions.

## Open Technical Choices Resolved

- Scope is current episode only.
- BGM is excluded from MVP.
- Default LLM configuration is reused.
- Initial edit generates the full story version.
- Target duration is a refinement constraint.
- AI transition generation is included as optional bridge generation and must first respect existing first-last-frame video continuity.
- Subtitles are saved in editable project data and can be burned during export.
