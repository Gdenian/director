# AI Video Editing V3 Tool Layer Design

Date: 2026-06-22
Status: Pending user review

## Goal

Upgrade AI video editing from a conservative first-cut workflow into a tool-driven conversational editor inside Director.

The user-facing goal is:

- A user opens the editor for the currently selected episode.
- The user gives natural-language instructions such as `节奏更快`, `删除拖沓片段`, `字幕靠下`, or `第三段保留久一点`.
- AI reads the current timeline, calls safe editor tools, creates a pending version with an understandable summary, and waits for user confirmation before applying.
- The final timeline still uses Director's existing editor and Remotion render/export path.

The technical goal is to borrow Palmier Pro's useful editing model without embedding Palmier Pro itself. Palmier's relevant lesson is that AI editing becomes useful when the agent can inspect and mutate a timeline through narrow, undoable tools. The lesson is not to replace Director's web editor, task system, or renderer.

## Decision Summary

Use Director's own platform and implement a Palmier-style internal tool layer.

Keep:

- Existing `VideoEditorProject` persistence.
- Existing editor UI and preview path.
- Existing task, queue, version, storage, and media abstractions.
- Existing Remotion render/export path.

Add:

- `EditorToolExecutor`, an internal deterministic mutation layer.
- AI refine orchestration that uses tool calls instead of returning a whole replacement JSON blob.
- Pending-version summaries and diffs based on actual tool results.
- Assistant-scoped undo or rollback behavior.

Do not add in this phase:

- Palmier Pro as a runtime dependency.
- Palmier source code.
- Swift or AVFoundation export.
- External MCP server.
- BGM generation or beat-sync editing.
- Full visual semantic search.

## Why Not Replace Rendering

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

Therefore V3 treats Palmier as a product and architecture reference, not as code or infrastructure to import.

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

V3 should replace that no-op refine behavior with real tool-driven timeline mutation.

## Product Boundaries

V3 operates only on the currently selected episode.

In scope:

- Conversational timeline refinement.
- Current timeline inspection.
- Clip-level add, insert, move, trim, split, remove, and ripple-delete tools.
- Subtitle positioning and caption generation using available voice/subtitle data.
- Versioned pending edits with user confirmation.
- Rollback to previous editor versions.
- MP4 export through the existing Remotion renderer.

Out of scope:

- Multi-episode batch editing.
- Replacing the editor UI.
- Replacing Remotion rendering.
- Automatic BGM generation.
- External MCP server.
- Visual embedding search across all project media.
- Direct import of Palmier source code.

## Architecture

V3 introduces a deterministic tool layer between the LLM and the editor project.

Flow:

1. User sends a refine instruction from the editor.
2. API submits an `ai_edit_refine` task with project, episode, editor project, and instruction.
3. Worker loads the saved editor project and builds an edit context.
4. AI orchestration exposes a small set of internal editor tools to the model.
5. The model calls tools; tools validate and mutate an in-memory draft timeline.
6. Orchestrator records tool results, warnings, and a compact operation diff.
7. The final draft is saved as a pending editor version.
8. UI shows summary and confirmation controls.
9. User applies the pending version or rejects it.
10. Existing render flow exports the applied timeline.

The LLM never writes trusted final project state directly. It proposes tool calls; deterministic code validates and applies those calls.

## Core Modules

### Editor Tool Executor

`EditorToolExecutor` owns safe timeline mutations.

Responsibilities:

- Read the current timeline into a compact context.
- Validate all operation inputs before mutation.
- Apply operations to an in-memory draft project.
- Return concise results the AI can use for subsequent calls.
- Produce a structured operation log for pending-version diff and audit.

Initial tools:

- `get_timeline`
  - Returns config, total frames, ordered clips, audio attachments, subtitle cues, and important metadata.
- `get_media`
  - Returns available episode media from the editor manifest: panel videos, generated transition assets, voice audio, and subtitle source text.
- `set_clip_properties`
  - Updates duration, source trim, transition, volume, and subtitle-related metadata where supported.
- `move_clips`
  - Reorders or moves clips within the magnetic video timeline.
- `split_clip`
  - Splits a clip at a valid frame boundary.
- `remove_clips`
  - Removes selected clips and related audio/subtitle anchors when appropriate.
- `ripple_delete_ranges`
  - Deletes timeline frame ranges and closes gaps, keeping audio and subtitles aligned.
- `add_captions`
  - Creates or updates subtitle cues from existing voice line/subtitle data.
- `undo_or_rollback`
  - Reverts the assistant's current draft edit session or points users to saved version rollback.

The first implementation should keep the tool set small. Add new tools only when a real user instruction cannot be safely represented by the initial set.

### AI Refine Orchestrator

The refine orchestrator replaces the current no-op pending version behavior.

Responsibilities:

- Build the AI context from the saved editor project, manifest, and user instruction.
- Provide tool descriptions and schemas to the existing analysis/LLM model path.
- Execute model-requested tool calls against `EditorToolExecutor`.
- Stop after a bounded number of tool calls.
- Save the resulting draft as a pending version.
- Return a user-facing summary and machine-readable operation diff.

Rules:

- The model must call `get_timeline` before mutation.
- The model must use tools for changes; raw project JSON from the model is ignored.
- If no tool call changes the draft, the task should return a clear warning instead of pretending success.
- If a tool fails validation, the orchestrator may allow one corrected retry, then return a failed or degraded pending result.
- Expensive media generation remains out of the refine path in V3 phase 1.

### Version And Confirmation Layer

V3 keeps the existing pending-version model.

Each AI refine run creates:

- `summary`: user-readable change summary.
- `reason`: `ai_refine`.
- `snapshot`: full draft `VideoEditorProject`.
- `diff`: compact operation log, including tool name, target ids, before/after frame ranges, and warnings.
- `createdByTaskId`: task id.

Apply behavior:

- `/editor/refine/apply` replaces the active project with the pending snapshot only after user confirmation.
- Applying clears `pendingVersion`.
- Rollback continues to restore from saved `VideoEditorProjectVersion` rows.

### Timeline Compatibility

Phase 1 should work with the current `VideoEditorProject` schema.

Allowed compatible extensions:

- Add optional assistant metadata fields if needed for operation audit.
- Add optional clip metadata for generated or edited source lineage.
- Keep existing fields readable by older saved projects through migration defaults.

Avoid in phase 1:

- Replacing the magnetic `timeline: VideoClip[]` model with a full multi-track model.
- Moving audio and subtitle storage into a new unrelated timeline structure.
- Adding schema changes that are only useful for future MCP or visual search work.

## Data Flow

### Conversational Refine

1. UI sends `instruction`, `episodeId`, and `editorProjectId`.
2. Route verifies project and episode authorization.
3. Route submits `ai_edit_refine` task with a dedupe key per editor project.
4. Worker loads the editor project and migrates project data.
5. Worker builds editor manifest and tool context.
6. AI calls tools against an in-memory draft.
7. Worker validates final draft.
8. Worker creates a pending editor version.
9. UI refreshes project state and shows summary.
10. User applies or discards pending version.

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
- Tool validation failure.
- Model returns no tool calls.
- Model tries unsupported operations.
- Timeline validation failure after tool execution.
- Pending version conflict.

Behavior:

- User-facing errors should explain whether no change was made.
- Validation errors should not partially apply to the saved project.
- Tool execution should mutate only the draft until the pending version is created.
- Existing active timeline must remain unchanged until apply.
- Render failures remain isolated to render status and output asset state.

## UI Behavior

Editor UI should expose:

- An AI assistant input in the editor stage.
- A pending edit summary when AI finishes.
- Apply and discard controls.
- Version history and rollback access.
- Clear warnings when AI could not make a meaningful edit.

The UI should not show raw tool calls by default. It may expose a compact "changed clips" detail view later.

Common first-phase instructions:

- `节奏更快`
- `删除拖沓片段`
- `第三个镜头短一点`
- `保留最后一个镜头久一点`
- `字幕靠下一点`
- `删除第 2 段`

## Testing Strategy

### Unit Tests

Add focused tests for `EditorToolExecutor`:

- `set_clip_properties` updates duration and trim safely.
- `move_clips` preserves valid order.
- `split_clip` creates two valid clips.
- `remove_clips` removes related subtitle/audio anchors when configured.
- `ripple_delete_ranges` closes gaps and shifts subtitle/audio cues.
- Invalid frame ranges are rejected without draft mutation.

Add orchestrator tests:

- Mock LLM tool calls create a changed pending version.
- No-op model output returns a warning and does not claim success.
- Tool validation failure is surfaced.
- Operation diff records meaningful before/after facts.

### API And Worker Tests

Extend existing editor refine tests:

- `/refine` submits a task with editor project context.
- Worker calls refine orchestration with instruction and task metadata.
- `/refine/apply` applies the changed pending snapshot.
- `/rollback` restores previous versions after an applied AI edit.

### Render Regression

Add or update tests that confirm:

- AI-modified projects still create valid render snapshots.
- Render input preserves project FPS, width, height, and subtitle burn-in option.
- Timeline duration after ripple edits is reflected in render duration.

## Rollout Plan

### Phase 1: Tool-Driven Conversational Refine

- Implement internal tool executor.
- Replace no-op refine with tool-call orchestration.
- Save changed pending versions with summaries and diffs.
- Keep all edits within current schema and renderer.

### Phase 2: Transcript-Aware Editing

- Add transcript or word-timing context from existing voice/subtitle data.
- Improve `ripple_delete_ranges` for filler, repeated lines, and dead-air removal.
- Add better verification around spoken content after cuts.

### Phase 3: Richer Agent Capabilities

- Add visual inspection or sampled frame snapshots.
- Add optional AI transition bridge generation as a tool.
- Consider an external MCP server only after the internal tool layer is stable.

## Risks And Mitigations

- Risk: The LLM still makes poor edit choices.
  - Mitigation: Restrict it to safe tools, require pending confirmation, and keep rollback.
- Risk: Tool layer becomes a second editor model.
  - Mitigation: Mutate the existing `VideoEditorProject` schema in phase 1.
- Risk: Ripple edits desync audio and subtitles.
  - Mitigation: Unit test frame shifts and reject invalid ranges.
- Risk: Users expect full Palmier-like media generation immediately.
  - Mitigation: Position V3 phase 1 as conversational editing, not full generation replacement.
- Risk: Render output diverges from preview.
  - Mitigation: Keep preview and export on the current Remotion composition path.

## Acceptance Criteria

- A user can issue at least three consecutive AI refine instructions and see real timeline changes before applying.
- AI refine no longer returns a successful pending version when the timeline is unchanged, unless the summary explicitly says no safe edit was possible.
- User can apply and roll back an AI edit version.
- Modified timelines render through existing Remotion export.
- No Palmier source code or runtime dependency is added.

