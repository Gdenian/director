# AI Video Editing V3 Tool Layer Design

Date: 2026-06-22
Status: Revised after Palmier Pro review

## Goal

Upgrade AI video editing from a conservative first-cut workflow into a tool-driven AI editing workbench inside Director.

The user-facing goal is:

- A user opens the editor for the currently selected episode.
- The episode already has baseline generated materials from Director's upstream workflow: storyboard videos, lip-sync videos, voice audio, subtitles, and optional transition bridge assets.
- The user can also import extra video, audio, or image assets for the episode.
- The user gives natural-language instructions such as `节奏更快`, `删除拖沓片段`, `把我上传的特写插到第三段后面`, `字幕靠下`, or `第三段保留久一点`.
- AI reads the current timeline and available media, calls safe editor tools, creates a pending version with an understandable summary, and waits for user confirmation before applying.
- The final timeline still uses Director's existing editor and Remotion render/export path.

The technical goal is to absorb Palmier Pro's proven functional blocks without embedding Palmier Pro itself. Palmier's relevant lesson is that AI editing becomes useful when the agent can import media, inspect available assets, inspect and mutate a timeline through narrow undoable tools, and verify the result before reporting success. The lesson is not to replace Director's web editor, task system, media storage, version system, or renderer.

## Decision Summary

Use Director's own platform and implement Palmier-inspired functional blocks as internal Director capabilities.

Keep:

- Existing `VideoEditorProject` persistence.
- Existing editor UI and preview path.
- Existing task, queue, version, storage, media, and authorization abstractions.
- Existing Remotion render/export path.
- Existing upstream generation workflow for storyboard video, lip-sync video, voice, subtitles, and transition bridge assets.

Add:

- `EditorToolExecutor`, an internal deterministic mutation layer.
- A unified episode media library view for AI editing, covering generated assets and user-imported assets.
- Media import support for AI editing, implemented through Director storage and media probing.
- AI refine orchestration that uses tool calls instead of returning a whole replacement JSON blob.
- Pending-version summaries and diffs based on actual tool results.
- Assistant-scoped draft undo plus saved version rollback behavior.

Do not add in this phase:

- Palmier Pro as a runtime dependency.
- Palmier source code.
- Swift or AVFoundation export.
- External MCP server.
- BGM generation or beat-sync editing.
- Full visual semantic embedding search.

## Palmier Functional Blocks To Absorb

Palmier Pro should be treated as a reference implementation of useful product and tool semantics, not as code to copy.

Bring into Director:

- Tool-driven timeline editing:
  - `get_timeline`
  - `get_media`
  - `add_clips`
  - `insert_clips`
  - `replace_clip`
  - `move_clips`
  - `set_clip_properties`
  - `split_clip`
  - `remove_clips`
  - `ripple_delete_ranges`
  - `undo`
- Media import:
  - Director equivalent of `import_media`, routed through upload or URL import, object storage, media records, and duration/dimension probing.
- Media inspection:
  - Phase 1 lightweight `inspect_media` based on known metadata, thumbnails, dimensions, duration, source, and generated descriptions.
  - Later richer inspection with sampled frames, transcription, and visual understanding.
- Timeline inspection:
  - Later `inspect_timeline` based on Remotion frame sampling so the agent can verify visible output.
- Transcript and captions:
  - `get_transcript` from existing voice/subtitle data first.
  - `add_captions` or `align_captions` using existing subtitle and voice-line sources.
- Agent operating rules:
  - Read timeline and media before editing.
  - Use tool calls for all mutations.
  - Keep edits undoable inside the assistant draft.
  - Save only validated pending versions.
  - Report no-op or degraded edits honestly.

Adapt for Director:

- Palmier's media library becomes Director's project/episode media library.
- Palmier's local import becomes Director upload or URL import.
- Palmier's multi-track editor model maps to Director's current magnetic video timeline plus absolute audio/subtitle tracks for Phase 1.
- Palmier's undo maps to assistant draft undo and Director version rollback.
- Palmier's export path remains out of scope; Director continues using Remotion.

## Why Not Replace Rendering Or Embed Palmier

Replacing Director's editor or renderer with Palmier's implementation would create more technical debt than it removes.

Director's current render path is already integrated with:

- Web-based editor state.
- Project and episode authorization.
- Worker queues.
- Media storage and uploaded MP4 outputs.
- Project ratio and render dimensions.
- Subtitle burn-in options.
- Existing billing and task status conventions.

Palmier Pro is a macOS Swift application. Its open-source editor and MCP server are GPLv3, its generative AI processing is closed source, and its export path is AVFoundation-based. Directly embedding it would introduce platform coupling, licensing risk, duplicated editing models, and a split between local-app behavior and Director's cloud workflow.

Therefore V3 absorbs Palmier's functional blocks and agent semantics while implementing them inside Director's own architecture.

## Existing Context

The current V2 implementation already added the structural shell for AI editing:

- `src/features/video-editor` contains the editor UI, preview, timeline, and Remotion composition.
- `src/lib/novel-promotion/ai-editing` contains material manifest, conservative assembly, versions, render snapshot, and render worker logic.
- `/api/novel-promotion/[projectId]/editor/refine` submits an AI refine task.
- `/editor/refine/apply`, `/editor/rollback`, and `/editor/versions` support pending version and rollback flows.
- `renderWithRemotion` exports the editor timeline to MP4 through the existing worker path.

The current weakness is that AI planning is not actually enabled:

- Initial AI assembly uses conservative story-order timeline generation.
- Refine creates a pending version that keeps the current timeline unchanged.
- AI editing does not yet use imported user media as first-class edit material.

V3 should replace that no-op refine behavior with real tool-driven timeline mutation and make generated plus imported media available to the AI editor.

## Product Boundaries

V3 operates only on the currently selected episode.

In scope:

- Conversational timeline refinement.
- Current timeline inspection.
- Episode media inspection across generated and imported assets.
- User media import for video, audio, and image assets.
- Clip-level add, insert, replace, move, trim, split, remove, and ripple-delete tools.
- Subtitle positioning and caption alignment using available voice/subtitle data.
- Use of already generated transition bridge assets.
- Versioned pending edits with user confirmation.
- Rollback to previous editor versions.
- MP4 export through the existing Remotion renderer.

Out of scope:

- Multi-episode batch editing.
- Replacing the editor UI.
- Replacing Remotion rendering.
- Automatic BGM generation.
- Beat-sync editing.
- External MCP server.
- Full visual embedding search across all project media.
- Direct import of Palmier source code.

## Architecture

V3 introduces a deterministic tool layer between the LLM and the editor project.

Flow:

1. User imports optional extra media through the editor or project media panel.
2. Import stores media in Director storage, creates media records, and probes duration/dimensions before assets become AI-editable.
3. User sends a refine instruction from the editor.
4. API submits an `ai_edit_refine` task with project, episode, editor project, and instruction.
5. Worker loads the saved editor project and builds an edit context.
6. Worker builds a unified media context from generated episode materials, completed editor assets, and user-imported assets.
7. AI orchestration exposes a controlled set of internal editor tools to the model.
8. The model calls tools; tools validate and mutate an in-memory draft timeline.
9. Orchestrator records tool results, warnings, and a compact operation diff.
10. The final draft is saved as a pending editor version.
11. UI shows summary and confirmation controls.
12. User applies the pending version or rejects it.
13. Existing render flow exports the applied timeline.

The LLM never writes trusted final project state directly. It proposes tool calls; deterministic code validates and applies those calls.

## Core Modules

### Episode Media Library

The AI editor needs a unified media view. It should not care whether an asset came from upstream generation or user import once the asset is completed and safe to use.

Media sources:

- `generated_panel_video`
- `generated_lip_sync_video`
- `generated_transition_bridge`
- `voice_audio`
- `subtitle_source`
- `user_import_video`
- `user_import_audio`
- `user_import_image`
- `render_output`

Each media entry should expose:

- Stable media id.
- Source type.
- URL or storage key resolved through Director media/storage.
- Status: `pending`, `completed`, `failed`, or `canceled`.
- Mime type and media kind.
- Duration in frames when applicable.
- Width and height when applicable.
- Source panel, storyboard, voice line, or editor asset lineage when available.
- Short human-readable label and description when available.

Only completed assets are eligible for add, insert, or replace operations. Pending or failed assets may appear in `get_media` for explanation, but mutation tools must reject them.

### Media Import

Director should implement a Palmier-like `import_media` capability without bypassing platform infrastructure.

Import paths:

- Browser upload for video, audio, and image files.
- URL import for supported remote media when allowed by storage and security policies.

Import behavior:

- Store imported objects through Director storage.
- Create media records owned by the project or episode.
- Probe duration, dimensions, mime type, and basic metadata.
- Mark assets as completed only after they are usable by preview and render.
- Reject unsupported types before they can enter the timeline.

AI should not reference local file paths, temporary object URLs, or external URLs directly in timeline clips. Timeline clips should reference normalized Director media URLs or storage-backed media records.

### Editor Tool Executor

`EditorToolExecutor` owns safe timeline mutations.

Responsibilities:

- Read the current timeline into a compact context.
- Read available generated and imported media into a compact context.
- Validate all operation inputs before mutation.
- Apply operations to an in-memory draft project.
- Keep assistant-session undo snapshots for draft changes.
- Return concise results the AI can use for subsequent calls.
- Produce a structured operation log for pending-version diff and audit.

Phase 1 tools:

- `get_timeline`
  - Returns config, total frames, ordered clips, computed start/end frames, audio attachments, subtitle cues, and important metadata.
- `get_media`
  - Returns generated episode media, completed editor assets, user-imported media, and unavailable media statuses.
- `import_media`
  - Starts upload or URL import through Director's media pipeline. AI may request import only when the user has provided a file or URL.
- `inspect_media`
  - Returns lightweight metadata for a media asset: kind, status, duration, dimensions, source, lineage, description, and thumbnail if available.
- `add_clips`
  - Adds completed media assets to the current magnetic video timeline or absolute audio track.
- `insert_clips`
  - Inserts completed media at a timeline position and ripples later video/audio/subtitle content forward.
- `replace_clip`
  - Replaces an existing clip with a completed media asset while preserving nearby ordering and related audio/subtitle anchors where possible.
- `set_clip_properties`
  - Updates duration, source trim, transition, audio volume for linked audio, and subtitle-related metadata where supported.
- `move_clips`
  - Reorders or moves clips within the magnetic video timeline.
- `split_clip`
  - Splits a clip at a valid frame boundary.
- `remove_clips`
  - Removes selected clips and related audio/subtitle anchors when appropriate.
- `ripple_delete_ranges`
  - Deletes timeline frame ranges and closes gaps, keeping audio and subtitles aligned.
- `get_transcript`
  - Returns timeline-level transcript from existing voice lines and subtitle cues in project frames.
- `add_captions`
  - Creates or updates subtitle cues from existing voice line/subtitle data.
- `undo`
  - Reverts the assistant's most recent draft mutation in the current refine session.

Phase 1 intentionally keeps these tools within Director's current timeline model. It should not require a full Palmier-style multi-track replacement before becoming useful.

### AI Refine Orchestrator

The refine orchestrator replaces the current no-op pending version behavior.

Responsibilities:

- Build the AI context from the saved editor project, unified media library, and user instruction.
- Provide tool descriptions and schemas to the existing analysis/LLM model path.
- Execute model-requested tool calls against `EditorToolExecutor`.
- Stop after a bounded number of tool calls.
- Save the resulting draft as a pending version.
- Return a user-facing summary and machine-readable operation diff.

Rules:

- The model must call `get_timeline` before mutation.
- The model must call `get_media` before referencing any asset.
- The model must use tools for changes; raw project JSON from the model is ignored.
- If the model wants to use imported media that is still pending, the task should explain that the asset must finish importing before the edit can apply.
- If no tool call changes the draft, the task should return a clear warning instead of pretending success.
- If a tool fails validation, the orchestrator may allow one corrected retry, then return a failed or degraded pending result.
- If the chosen model path does not support native tool calling, use a structured tool-plan JSON fallback and execute it through the same executor.
- Expensive media generation remains outside conversational refine in V3 phase 1, except for using already generated transition bridge assets.

### Version And Confirmation Layer

V3 keeps the existing pending-version model and makes conversational draft behavior explicit.

Each AI refine run creates:

- `summary`: user-readable change summary.
- `reason`: `ai_refine`.
- `snapshot`: full draft `VideoEditorProject`.
- `diff`: compact operation log, including tool name, target ids, before/after frame ranges, media ids, and warnings.
- `createdByTaskId`: task id.

Apply behavior:

- `/editor/refine/apply` replaces the active project with the pending snapshot only after user confirmation.
- Applying clears `pendingVersion`.
- Rollback continues to restore from saved `VideoEditorProjectVersion` rows.

Conversational behavior:

- If a pending version exists, the next AI instruction should refine that pending draft by default.
- The user can discard the pending version to return the assistant base to the active timeline.
- Assistant `undo` only affects draft mutations from the current refine session.
- Saved rollback affects applied versions and should remain explicit user action.

### Timeline Compatibility

Phase 1 should work with the current `VideoEditorProject` schema, with small compatible extensions where needed.

Allowed compatible extensions:

- Add optional assistant metadata fields if needed for operation audit.
- Add optional clip metadata for imported media and edited source lineage.
- Add optional subtitle positioning/style fields needed for commands like `字幕靠下`.
- Add optional imported media references in editor assets or project media records.
- Keep existing fields readable by older saved projects through migration defaults.

Avoid in phase 1:

- Replacing the magnetic `timeline: VideoClip[]` model with a full multi-track model.
- Moving audio and subtitle storage into a new unrelated timeline structure.
- Adding keyframes, transforms, opacity, crop, or full Palmier text clips before the current edit surface needs them.
- Letting imported assets bypass Director storage, auth, or media probing.

## Data Flow

### Media Import

1. User selects a file or provides a URL.
2. Route verifies project and episode authorization.
3. Route creates an import task or direct upload session.
4. Import stores the object through Director storage.
5. Import creates or updates the media record.
6. Media probing records duration, dimensions, mime type, and status.
7. Completed assets appear in `get_media` and can be used by AI tools.

### Conversational Refine

1. UI sends `instruction`, `episodeId`, and `editorProjectId`.
2. Route verifies project and episode authorization.
3. Route submits `ai_edit_refine` task with a dedupe key per editor project.
4. Worker loads the active editor project or existing pending draft, then migrates project data.
5. Worker builds unified media context from generated and imported assets.
6. AI calls tools against an in-memory draft.
7. Worker validates final draft.
8. Worker creates a pending editor version.
9. UI refreshes project state and shows summary.
10. User applies, discards, or continues refining the pending version.

### Render Export

Render export does not change.

1. User exports the applied editor project.
2. Render route creates an editor render task.
3. Worker creates a render snapshot.
4. Remotion renders MP4.
5. Output is uploaded and stored as a render output editor asset.

## Error Handling

Expected errors:

- Missing editor project.
- Unauthorized project or episode access.
- Invalid instruction.
- Unsupported import type.
- Import or probe failure.
- Tool references pending, failed, or unknown media.
- Tool validation failure.
- Model returns no tool calls.
- Model tries unsupported operations.
- Timeline validation failure after tool execution.
- Pending version conflict.

Behavior:

- User-facing errors should explain whether no change was made.
- Validation errors should not partially apply to the saved project.
- Import failures should not create timeline clips.
- Tool execution should mutate only the draft until the pending version is created.
- Existing active timeline must remain unchanged until apply.
- Render failures remain isolated to render status and output asset state.

## UI Behavior

Editor UI should expose:

- An AI assistant input in the editor stage.
- A way to upload or import extra video, audio, and image assets.
- A media panel or compact picker showing generated and imported episode assets.
- Asset status for importing, probing, completed, and failed media.
- A pending edit summary when AI finishes.
- Apply and discard controls.
- Version history and rollback access.
- Clear warnings when AI could not make a meaningful edit.

The UI should not show raw tool calls by default. It may expose a compact "changed clips" detail view later.

Common first-phase instructions:

- `节奏更快`
- `删除拖沓片段`
- `把我上传的特写插到第三段后面`
- `用上传的视频替换第二个镜头`
- `第三个镜头短一点`
- `保留最后一个镜头久一点`
- `字幕靠下一点`
- `删除第 2 段`

## Testing Strategy

### Unit Tests

Add focused tests for `EditorToolExecutor`:

- `get_media` returns generated and imported assets with correct status.
- `add_clips` rejects pending or failed media and accepts completed media.
- `insert_clips` ripples video, audio, and subtitle timing.
- `replace_clip` preserves order and expected anchors.
- `set_clip_properties` updates duration and trim safely.
- `move_clips` preserves valid order.
- `split_clip` creates two valid clips.
- `remove_clips` removes related subtitle/audio anchors when configured.
- `ripple_delete_ranges` closes gaps and shifts subtitle/audio cues.
- `undo` reverts only assistant draft mutations.
- Invalid frame ranges are rejected without draft mutation.

Add media import tests:

- Unsupported types are rejected.
- Completed imports become visible to `get_media`.
- Imported metadata includes duration and dimensions when applicable.
- Import failures do not create usable timeline entries.

Add orchestrator tests:

- Mock LLM tool calls create a changed pending version.
- Mock LLM uses imported completed media in `add_clips` or `replace_clip`.
- No-op model output returns a warning and does not claim success.
- Tool validation failure is surfaced.
- Operation diff records meaningful before/after facts.
- Consecutive refine instructions build on the pending draft.

### API And Worker Tests

Extend existing editor refine tests:

- `/refine` submits a task with editor project context.
- Worker calls refine orchestration with instruction and task metadata.
- `/refine/apply` applies the changed pending snapshot.
- `/rollback` restores previous versions after an applied AI edit.

Add or extend media import tests:

- Import route enforces project and episode authorization.
- Import worker stores and probes media before status becomes completed.
- AI refine cannot use imported assets before completion.

### Render Regression

Add or update tests that confirm:

- AI-modified projects still create valid render snapshots.
- Imported assets included in the timeline render through Remotion.
- Render input preserves project FPS, width, height, and subtitle burn-in option.
- Timeline duration after insert or ripple edits is reflected in render duration.

## Rollout Plan

### Phase 1: Tool-Driven Conversational Refine With Imported Media

- Implement unified generated/imported media context.
- Add media import path needed by the editor.
- Implement internal tool executor with Phase 1 tools.
- Replace no-op refine with tool-call orchestration.
- Save changed pending versions with summaries and diffs.
- Keep all edits within current schema and renderer.

### Phase 2: Transcript-Aware Editing

- Improve `get_transcript` with word or phrase timing when available.
- Improve `ripple_delete_ranges` for filler, repeated lines, and dead-air removal.
- Add better verification around spoken content after cuts.

### Phase 3: Richer Agent Capabilities

- Add Remotion-based `inspect_timeline` frame sampling.
- Add visual inspection or sampled frame snapshots for imported and generated video.
- Add semantic `search_media` after media indexing exists.
- Add optional AI transition bridge generation as an async tool.
- Consider an external MCP server only after the internal tool layer is stable.

## Risks And Mitigations

- Risk: The LLM still makes poor edit choices.
  - Mitigation: Restrict it to safe tools, require pending confirmation, and keep rollback.
- Risk: Tool layer becomes a second editor model.
  - Mitigation: Mutate the existing `VideoEditorProject` schema in phase 1 and defer full multi-track semantics.
- Risk: Imported assets bypass storage or expire before render.
  - Mitigation: Normalize all imports through Director storage and media records before they become timeline-eligible.
- Risk: Imported media duration or dimensions are missing.
  - Mitigation: Require media probing before status becomes completed; reject unknown-duration video/audio for add/insert.
- Risk: Ripple edits desync audio and subtitles.
  - Mitigation: Unit test frame shifts and reject invalid ranges.
- Risk: Users expect full Palmier-like generation immediately.
  - Mitigation: Position V3 phase 1 as AI editing over generated and imported media, not full generative media replacement.
- Risk: Render output diverges from preview.
  - Mitigation: Keep preview and export on the current Remotion composition path.
- Risk: GPL contamination from Palmier code.
  - Mitigation: Use Palmier only as a reference for product/tool semantics; do not copy source code.

## Acceptance Criteria

- A user can import a video asset, see it as completed media, and ask AI to insert or replace a clip with it.
- A user can issue at least three consecutive AI refine instructions and see real timeline changes before applying.
- Consecutive AI instructions refine the current pending draft unless the user discards it.
- AI refine no longer returns a successful pending version when the timeline is unchanged, unless the summary explicitly says no safe edit was possible.
- User can apply and roll back an AI edit version.
- Modified timelines containing generated and imported assets render through existing Remotion export.
- No Palmier source code or runtime dependency is added.
