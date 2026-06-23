# AI Video Editing V3 Tool Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Palmier-style AI editing inside Director so the current episode can use generated and imported media, mutate the existing editor timeline through safe tools, create pending versions, and export through the current Remotion renderer.

**Architecture:** Keep Director's existing `VideoEditorProject`, editor UI, task/version/storage/media/auth systems, and Remotion render path. Add a deterministic `EditorToolExecutor`, a unified episode media library, guarded import support, and an AI refine orchestrator that converts model output into validated tool calls instead of accepting raw project JSON.

**Tech Stack:** Next.js 15 route handlers, React 19, Prisma/MySQL, BullMQ, Vitest, Remotion, existing `MediaObject` storage, existing `VideoEditorAsset` / `VideoEditorProjectVersion`, existing model gateway text completion.

---

## Scope Check

The V3 design touches media import, AI planning, timeline mutation, versioning, editor UI, and render compatibility. These pieces are dependent because imported media and generated media must share the same tool context, and every AI edit must finish as an existing editor pending version. This is one implementation plan split into nine independently testable tasks.

Execution should happen from a development branch created from the current design branch:

```bash
git branch --show-current
git status --short --branch
git switch -c codex/ai-video-editing-v3-tools
```

Expected before implementation: current branch is `codex/ai-video-editing-v3-tools-doc` and status is clean. Expected after switching: current branch is `codex/ai-video-editing-v3-tools`.

## File Structure

Create backend modules:

- `src/lib/novel-promotion/ai-editing/media-library.ts`: Builds the AI-editable media library from generated panel videos, lip-sync videos, voice audio, transition bridge assets, render outputs, and user-imported editor assets.
- `src/lib/novel-promotion/ai-editing/import-media.ts`: Stores uploaded or URL-imported media through Director storage, creates `MediaObject`, probes metadata, and creates completed or failed `VideoEditorAsset` rows.
- `src/lib/novel-promotion/ai-editing/tool-types.ts`: Tool call/result schemas, operation log types, media entry types, and error codes.
- `src/lib/novel-promotion/ai-editing/tool-executor.ts`: Deterministic in-memory draft executor for `get_timeline`, `get_media`, `inspect_media`, `add_clips`, `insert_clips`, `replace_clip`, `set_clip_properties`, `move_clips`, `split_clip`, `remove_clips`, `ripple_delete_ranges`, `get_transcript`, `add_captions`, and `undo`.
- `src/lib/novel-promotion/ai-editing/tool-plan.ts`: Parses and repairs structured JSON tool-plan responses from the existing text LLM path.
- `src/lib/novel-promotion/ai-editing/tool-orchestrator.ts`: Builds prompts, calls the model, executes bounded tool calls through `EditorToolExecutor`, validates changed drafts, and returns summary/diff/warnings.

Modify backend modules:

- `src/lib/novel-promotion/ai-editing/types.ts`: Add imported media and tool operation types if they are shared with older V2 modules.
- `src/lib/novel-promotion/ai-editing/manifest.ts`: Keep generated manifest behavior; expose enough lineage for `media-library.ts`.
- `src/lib/novel-promotion/ai-editing/editor-assets.ts`: Add user-imported asset helpers while preserving transition bridge/render output helpers.
- `src/lib/novel-promotion/ai-editing/media-probe.ts`: Add metadata probing for video/audio/image imports.
- `src/lib/novel-promotion/ai-editing/refine.ts`: Replace the no-op pending version with tool-orchestrated pending draft creation.
- `src/features/video-editor/types/editor.types.ts`: Add compatible optional fields for imported media lineage and subtitle placement.
- `src/features/video-editor/utils/migration.ts`: Default new optional fields safely for old saved projects.
- `src/features/video-editor/remotion/VideoComposition.tsx`: Render subtitle placement and imported image clips without changing the existing render pipeline.
- `src/app/api/novel-promotion/[projectId]/editor/refine/route.ts`: Pass selected pending draft context and target duration.
- `src/app/api/novel-promotion/[projectId]/editor/refine/apply/route.ts`: Keep apply behavior; add conflict checks if the pending version no longer matches.

Create API/UI files:

- `src/app/api/novel-promotion/[projectId]/editor/media/route.ts`: Lists AI-editable generated/imported media and accepts upload or URL import requests.
- `src/features/video-editor/components/AiEditAssistant.tsx`: Conversational input, pending summary, apply/discard/continue controls.
- `src/features/video-editor/components/EditorMediaPanel.tsx`: Shows generated/imported media and import status.
- `src/features/video-editor/hooks/useAiEditing.ts`: Calls refine/apply/discard/media APIs and refreshes editor state.

Modify UI files:

- `src/features/video-editor/components/VideoEditorStage.tsx`: Mount the media panel and AI assistant inside the current editor.
- `src/features/video-editor/hooks/useEditorActions.ts`: Add media list/import, refine, apply, discard, and rollback client actions.
- `src/lib/query/keys.ts`: Add editor media and editor project query keys if the UI uses React Query for refresh.

Create focused tests:

- `tests/unit/ai-editing/media-library.test.ts`
- `tests/unit/ai-editing/import-media.test.ts`
- `tests/unit/ai-editing/tool-executor.test.ts`
- `tests/unit/ai-editing/tool-plan.test.ts`
- `tests/unit/ai-editing/tool-orchestrator.test.ts`
- `tests/unit/ai-editing/refine-tool-flow.test.ts`
- `tests/unit/video-editor/subtitle-placement.test.tsx`
- `tests/integration/api/specific/editor-media-api.test.ts`
- Extend `tests/integration/api/specific/editor-refine-api.test.ts`
- Extend `tests/integration/api/specific/editor-render-api.test.ts`

## Task 1: Unified Episode Media Library

**Files:**

- Create: `src/lib/novel-promotion/ai-editing/tool-types.ts`
- Create: `src/lib/novel-promotion/ai-editing/media-library.ts`
- Modify: `src/lib/novel-promotion/ai-editing/types.ts`
- Test: `tests/unit/ai-editing/media-library.test.ts`

- [ ] **Step 1: Write failing media library tests**

Create `tests/unit/ai-editing/media-library.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildAiEditableMediaLibrary } from '@/lib/novel-promotion/ai-editing/media-library'

describe('AI editing media library', () => {
  it('returns generated and imported media with eligibility status', async () => {
    const library = await buildAiEditableMediaLibrary({
      fps: 30,
      manifest: {
        episodeId: 'episode-1',
        fps: 30,
        dimensions: { width: 1920, height: 1080 },
        clips: [{
          clipId: 'panel-1',
          sourcePanelId: 'panel-1',
          storyboardId: 'storyboard-1',
          storyOrder: 0,
          videoUrl: '/m/panel-video',
          durationInFrames: 90,
          description: 'opening shot',
        }],
        voiceLines: [{
          id: 'voice-1',
          sourcePanelId: 'panel-1',
          audioUrl: '/m/voice',
          durationInFrames: 72,
          text: 'hello',
        }],
        editorAssets: [{
          id: 'bridge-1',
          kind: 'transition_bridge',
          url: '/m/bridge',
          durationInFrames: 24,
        }],
      },
      importedAssets: [{
        id: 'asset-import-1',
        kind: 'user_import_video',
        status: 'completed',
        url: '/m/import-video',
        mediaObjectId: 'media-1',
        metadata: JSON.stringify({ durationMs: 2400, width: 1280, height: 720, label: 'uploaded close-up' }),
      }, {
        id: 'asset-import-pending',
        kind: 'user_import_video',
        status: 'pending',
        url: null,
        mediaObjectId: null,
        metadata: null,
      }],
    })

    expect(library.entries.map((entry) => entry.id)).toEqual([
      'generated_panel_video:panel-1',
      'voice_audio:voice-1',
      'generated_transition_bridge:bridge-1',
      'user_import_video:asset-import-1',
      'user_import_video:asset-import-pending',
    ])
    expect(library.entries.find((entry) => entry.id === 'user_import_video:asset-import-1')).toMatchObject({
      kind: 'video',
      sourceType: 'user_import_video',
      status: 'completed',
      eligibleForTimeline: true,
      durationInFrames: 72,
      width: 1280,
      height: 720,
      label: 'uploaded close-up',
    })
    expect(library.entries.find((entry) => entry.id === 'user_import_video:asset-import-pending')).toMatchObject({
      status: 'pending',
      eligibleForTimeline: false,
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing/media-library.test.ts
```

Expected: FAIL because `media-library.ts` does not exist.

- [ ] **Step 3: Add media entry types**

Create `src/lib/novel-promotion/ai-editing/tool-types.ts` with these exported types:

```ts
import type { VideoEditorProject } from '@/features/video-editor/types/editor.types'

export type AiEditableMediaSourceType =
  | 'generated_panel_video'
  | 'generated_lip_sync_video'
  | 'generated_transition_bridge'
  | 'voice_audio'
  | 'subtitle_source'
  | 'user_import_video'
  | 'user_import_audio'
  | 'user_import_image'
  | 'render_output'

export type AiEditableMediaKind = 'video' | 'audio' | 'image' | 'subtitle'
export type AiEditableMediaStatus = 'pending' | 'completed' | 'failed' | 'canceled'

export type AiEditableMediaEntry = {
  id: string
  assetId?: string
  mediaObjectId?: string | null
  sourceType: AiEditableMediaSourceType
  kind: AiEditableMediaKind
  status: AiEditableMediaStatus
  eligibleForTimeline: boolean
  url?: string | null
  durationInFrames?: number
  width?: number | null
  height?: number | null
  sourcePanelId?: string
  storyboardId?: string
  voiceLineId?: string
  storyOrder?: number
  label: string
  description?: string
}

export type AiEditableMediaLibrary = {
  fps: number
  entries: AiEditableMediaEntry[]
}

export type EditorToolOperation = {
  tool: string
  targetIds: string[]
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  warnings: string[]
}

export type EditorToolDraftResult = {
  project: VideoEditorProject
  operations: EditorToolOperation[]
  warnings: string[]
  changed: boolean
}
```

- [ ] **Step 4: Implement the pure media library builder**

Create `src/lib/novel-promotion/ai-editing/media-library.ts` with a pure builder that accepts manifest plus editor asset rows. Use this shape so unit tests do not need Prisma:

```ts
import type { EditorManifest } from './types'
import type { AiEditableMediaEntry, AiEditableMediaLibrary, AiEditableMediaSourceType } from './tool-types'

type ImportedAssetRow = {
  id: string
  kind: string
  status: string
  url: string | null
  mediaObjectId: string | null
  metadata: string | null
}

function parseMetadata(metadata: string | null): Record<string, unknown> {
  if (!metadata) return {}
  try {
    const parsed = JSON.parse(metadata)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function framesFromDurationMs(value: unknown, fps: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.max(1, Math.round((value / 1000) * fps))
    : undefined
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function sourceTypeFromAssetKind(kind: string): AiEditableMediaSourceType | null {
  if (kind === 'user_import_video') return 'user_import_video'
  if (kind === 'user_import_audio') return 'user_import_audio'
  if (kind === 'user_import_image') return 'user_import_image'
  if (kind === 'render_output') return 'render_output'
  if (kind === 'transition_bridge') return 'generated_transition_bridge'
  return null
}

export async function buildAiEditableMediaLibrary(input: {
  fps: number
  manifest: EditorManifest
  importedAssets: ImportedAssetRow[]
}): Promise<AiEditableMediaLibrary> {
  const entries: AiEditableMediaEntry[] = []

  for (const clip of input.manifest.clips) {
    entries.push({
      id: `generated_panel_video:${clip.clipId}`,
      sourceType: 'generated_panel_video',
      kind: 'video',
      status: 'completed',
      eligibleForTimeline: true,
      url: clip.videoUrl,
      durationInFrames: clip.durationInFrames,
      sourcePanelId: clip.sourcePanelId,
      storyboardId: clip.storyboardId,
      storyOrder: clip.storyOrder,
      label: `分镜 ${clip.storyOrder + 1}`,
      description: clip.description,
    })
  }

  for (const line of input.manifest.voiceLines) {
    entries.push({
      id: `voice_audio:${line.id}`,
      sourceType: 'voice_audio',
      kind: 'audio',
      status: line.audioUrl ? 'completed' : 'failed',
      eligibleForTimeline: Boolean(line.audioUrl),
      url: line.audioUrl || null,
      durationInFrames: line.durationInFrames,
      sourcePanelId: line.sourcePanelId,
      voiceLineId: line.id,
      label: `配音 ${line.id}`,
      description: line.text,
    })
  }

  for (const asset of input.manifest.editorAssets) {
    entries.push({
      id: `${asset.kind === 'render_output' ? 'render_output' : 'generated_transition_bridge'}:${asset.id}`,
      assetId: asset.id,
      sourceType: asset.kind === 'render_output' ? 'render_output' : 'generated_transition_bridge',
      kind: 'video',
      status: 'completed',
      eligibleForTimeline: asset.kind === 'transition_bridge',
      url: asset.url,
      durationInFrames: asset.durationInFrames,
      label: asset.kind === 'render_output' ? '历史导出' : '转场补帧',
    })
  }

  for (const asset of input.importedAssets) {
    const sourceType = sourceTypeFromAssetKind(asset.kind)
    if (!sourceType) continue
    const metadata = parseMetadata(asset.metadata)
    const mediaKind = sourceType === 'user_import_audio'
      ? 'audio'
      : sourceType === 'user_import_image'
        ? 'image'
        : 'video'
    const status = asset.status === 'completed' || asset.status === 'failed' || asset.status === 'canceled'
      ? asset.status
      : 'pending'
    entries.push({
      id: `${sourceType}:${asset.id}`,
      assetId: asset.id,
      mediaObjectId: asset.mediaObjectId,
      sourceType,
      kind: mediaKind,
      status,
      eligibleForTimeline: status === 'completed' && Boolean(asset.url),
      url: asset.url,
      durationInFrames: framesFromDurationMs(metadata.durationMs, input.fps),
      width: readNumber(metadata.width),
      height: readNumber(metadata.height),
      label: typeof metadata.label === 'string' && metadata.label.trim() ? metadata.label.trim() : '导入素材',
      description: typeof metadata.description === 'string' ? metadata.description : undefined,
    })
  }

  return { fps: input.fps, entries }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing/media-library.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/novel-promotion/ai-editing/tool-types.ts src/lib/novel-promotion/ai-editing/media-library.ts tests/unit/ai-editing/media-library.test.ts
git commit -m "Add AI editor media library"
```

## Task 2: User Media Import Through Director Storage

**Files:**

- Create: `src/lib/novel-promotion/ai-editing/import-media.ts`
- Modify: `src/lib/novel-promotion/ai-editing/editor-assets.ts`
- Modify: `src/lib/novel-promotion/ai-editing/media-probe.ts`
- Create: `src/app/api/novel-promotion/[projectId]/editor/media/route.ts`
- Test: `tests/unit/ai-editing/import-media.test.ts`
- Test: `tests/integration/api/specific/editor-media-api.test.ts`

- [ ] **Step 1: Write failing unit tests for import normalization**

Create `tests/unit/ai-editing/import-media.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { classifyEditorImportMimeType, normalizeEditorImportMetadata } from '@/lib/novel-promotion/ai-editing/import-media'

describe('AI editing media import helpers', () => {
  it('accepts supported video, audio, and image mime types', () => {
    expect(classifyEditorImportMimeType('video/mp4')).toBe('user_import_video')
    expect(classifyEditorImportMimeType('video/quicktime')).toBe('user_import_video')
    expect(classifyEditorImportMimeType('audio/mpeg')).toBe('user_import_audio')
    expect(classifyEditorImportMimeType('audio/wav')).toBe('user_import_audio')
    expect(classifyEditorImportMimeType('image/png')).toBe('user_import_image')
    expect(classifyEditorImportMimeType('application/pdf')).toBeNull()
  })

  it('normalizes metadata needed by timeline tools', () => {
    expect(normalizeEditorImportMetadata({
      label: '  close up  ',
      mimeType: 'video/mp4',
      sizeBytes: 1234,
      durationMs: 2500,
      width: 1280,
      height: 720,
    })).toEqual({
      label: 'close up',
      mimeType: 'video/mp4',
      sizeBytes: 1234,
      durationMs: 2500,
      width: 1280,
      height: 720,
    })
  })
})
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing/import-media.test.ts
```

Expected: FAIL because `import-media.ts` does not exist.

- [ ] **Step 3: Implement import helper functions**

Create `src/lib/novel-promotion/ai-editing/import-media.ts` with supported MIME classification, upload/URL import orchestration, and metadata normalization. Start with these pure exports so the first test can pass:

```ts
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import { generateUniqueKey, uploadObject, downloadAndUploadVideo } from '@/lib/storage'
import { prisma } from '@/lib/prisma'
import { completeEditorAsset, createPendingEditorAsset, failEditorAsset } from './editor-assets'
import { probeMediaMetadata } from './media-probe'

export type EditorImportAssetKind = 'user_import_video' | 'user_import_audio' | 'user_import_image'

const SUPPORTED_IMPORT_MIME: Record<string, EditorImportAssetKind> = {
  'video/mp4': 'user_import_video',
  'video/webm': 'user_import_video',
  'video/quicktime': 'user_import_video',
  'audio/mpeg': 'user_import_audio',
  'audio/mp4': 'user_import_audio',
  'audio/wav': 'user_import_audio',
  'audio/ogg': 'user_import_audio',
  'image/png': 'user_import_image',
  'image/jpeg': 'user_import_image',
  'image/webp': 'user_import_image',
}

export function classifyEditorImportMimeType(mimeType: string | null | undefined): EditorImportAssetKind | null {
  if (!mimeType) return null
  return SUPPORTED_IMPORT_MIME[mimeType.toLowerCase()] || null
}

export function normalizeEditorImportMetadata(input: {
  label?: string | null
  mimeType: string
  sizeBytes?: number | null
  durationMs?: number | null
  width?: number | null
  height?: number | null
}) {
  return {
    label: input.label?.trim() || '导入素材',
    mimeType: input.mimeType,
    ...(typeof input.sizeBytes === 'number' ? { sizeBytes: input.sizeBytes } : {}),
    ...(typeof input.durationMs === 'number' ? { durationMs: input.durationMs } : {}),
    ...(typeof input.width === 'number' ? { width: input.width } : {}),
    ...(typeof input.height === 'number' ? { height: input.height } : {}),
  }
}
```

Then add these async functions in the same file:

```ts
export async function importEditorMediaFromBuffer(input: {
  editorProjectId: string
  episodeId: string
  fileName: string
  mimeType: string
  buffer: Buffer
  label?: string | null
}) {
  const kind = classifyEditorImportMimeType(input.mimeType)
  if (!kind) throw new Error('EDITOR_IMPORT_UNSUPPORTED_MIME')

  const ext = input.fileName.split('.').pop()?.toLowerCase() || (kind === 'user_import_video' ? 'mp4' : kind === 'user_import_audio' ? 'mp3' : 'png')
  const asset = await createPendingEditorAsset({
    editorProjectId: input.editorProjectId,
    episodeId: input.episodeId,
    kind,
    sourceClipIds: [],
    sourcePanelIds: [],
    metadata: { label: input.label?.trim() || input.fileName, mimeType: input.mimeType },
  })

  try {
    const key = generateUniqueKey(`editor-import/${input.editorProjectId}`, ext)
    const storageKey = await uploadObject(input.buffer, key, 1, input.mimeType)
    const probed = await probeMediaMetadata(storageKey, input.mimeType)
    const media = await ensureMediaObjectFromStorageKey(storageKey, {
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
      durationMs: probed.durationMs,
      width: probed.width,
      height: probed.height,
    })
    return await completeEditorAsset({
      id: asset.id,
      mediaObjectId: media.id,
      url: media.url,
      metadata: normalizeEditorImportMetadata({
        label: input.label || input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.buffer.length,
        durationMs: probed.durationMs,
        width: probed.width,
        height: probed.height,
      }),
    })
  } catch (error) {
    await failEditorAsset({ id: asset.id, error: error instanceof Error ? error.message : 'EDITOR_IMPORT_FAILED' })
    throw error
  }
}

export async function importEditorMediaFromUrl(input: {
  editorProjectId: string
  episodeId: string
  url: string
  mimeType: string
  label?: string | null
}) {
  const kind = classifyEditorImportMimeType(input.mimeType)
  if (!kind) throw new Error('EDITOR_IMPORT_UNSUPPORTED_MIME')
  if (!input.url.startsWith('https://') && !input.url.startsWith('http://')) throw new Error('EDITOR_IMPORT_URL_INVALID')

  const ext = input.url.split('?')[0]?.split('.').pop()?.toLowerCase() || (kind === 'user_import_video' ? 'mp4' : kind === 'user_import_audio' ? 'mp3' : 'png')
  const asset = await createPendingEditorAsset({
    editorProjectId: input.editorProjectId,
    episodeId: input.episodeId,
    kind,
    sourceClipIds: [],
    sourcePanelIds: [],
    metadata: { label: input.label?.trim() || input.url, mimeType: input.mimeType, importUrl: input.url },
  })

  try {
    const key = generateUniqueKey(`editor-import/${input.editorProjectId}`, ext)
    const storageKey = kind === 'user_import_video'
      ? await downloadAndUploadVideo(input.url, key, 1)
      : await uploadObject(Buffer.from(await (await fetch(input.url)).arrayBuffer()), key, 1, input.mimeType)
    const probed = await probeMediaMetadata(storageKey, input.mimeType)
    const media = await ensureMediaObjectFromStorageKey(storageKey, {
      mimeType: input.mimeType,
      durationMs: probed.durationMs,
      width: probed.width,
      height: probed.height,
    })
    return await completeEditorAsset({
      id: asset.id,
      mediaObjectId: media.id,
      url: media.url,
      metadata: normalizeEditorImportMetadata({
        label: input.label || input.url,
        mimeType: input.mimeType,
        durationMs: probed.durationMs,
        width: probed.width,
        height: probed.height,
      }),
    })
  } catch (error) {
    await failEditorAsset({ id: asset.id, error: error instanceof Error ? error.message : 'EDITOR_IMPORT_FAILED' })
    throw error
  }
}

export async function listImportedEditorAssets(editorProjectId: string) {
  return await prisma.videoEditorAsset.findMany({
    where: {
      editorProjectId,
      kind: { in: ['user_import_video', 'user_import_audio', 'user_import_image'] },
    },
    orderBy: { createdAt: 'asc' },
  })
}
```

- [ ] **Step 4: Extend editor asset kind typing**

Modify `src/lib/novel-promotion/ai-editing/editor-assets.ts`:

```ts
export type EditorAssetKind =
  | 'transition_bridge'
  | 'render_output'
  | 'user_import_video'
  | 'user_import_audio'
  | 'user_import_image'
```

Keep existing helper behavior unchanged.

- [ ] **Step 5: Add metadata probing helper**

Extend `src/lib/novel-promotion/ai-editing/media-probe.ts`:

```ts
export type MediaProbeMetadata = {
  durationMs?: number
  width?: number
  height?: number
}

export async function probeMediaMetadata(pathOrUrl: string, mimeType?: string | null): Promise<MediaProbeMetadata> {
  if (mimeType?.startsWith('image/')) {
    try {
      const sharp = (await import('sharp')).default
      const metadata = await sharp(pathOrUrl).metadata()
      return {
        width: metadata.width,
        height: metadata.height,
      }
    } catch {
      return {}
    }
  }

  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=width,height',
      '-of',
      'json',
      pathOrUrl,
    ])
    const parsed = JSON.parse(stdout) as { format?: { duration?: string }, streams?: Array<{ width?: number, height?: number }> }
    const seconds = Number.parseFloat(parsed.format?.duration || '')
    const videoStream = parsed.streams?.find((stream) => typeof stream.width === 'number' && typeof stream.height === 'number')
    return {
      ...(Number.isFinite(seconds) && seconds > 0 ? { durationMs: Math.round(seconds * 1000) } : {}),
      ...(videoStream ? { width: videoStream.width, height: videoStream.height } : {}),
    }
  } catch {
    return {}
  }
}
```

- [ ] **Step 6: Add media API integration tests**

Create `tests/integration/api/specific/editor-media-api.test.ts` with route-level mocks:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({ session: { user: { id: 'user-1' } } })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const importMock = vi.hoisted(() => ({
  importEditorMediaFromBuffer: vi.fn(async () => ({ id: 'asset-1', kind: 'user_import_video', status: 'completed' })),
  importEditorMediaFromUrl: vi.fn(async () => ({ id: 'asset-2', kind: 'user_import_video', status: 'completed' })),
  listImportedEditorAssets: vi.fn(async () => []),
}))

const manifestMock = vi.hoisted(() => ({
  buildEditorManifest: vi.fn(async () => ({
    episodeId: 'episode-1',
    fps: 30,
    dimensions: { width: 1920, height: 1080 },
    clips: [],
    voiceLines: [],
    editorAssets: [],
  })),
}))

const prismaMock = vi.hoisted(() => ({
  videoEditorProject: { findFirst: vi.fn(async () => ({ id: 'editor-1', episodeId: 'episode-1' })) },
  novelPromotionEpisode: { findFirst: vi.fn(async () => ({ id: 'episode-1' })) },
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/novel-promotion/ai-editing/import-media', () => importMock)
vi.mock('@/lib/novel-promotion/ai-editing/manifest', () => manifestMock)

describe('api specific - editor media route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('GET returns generated and imported media library', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/editor/media/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/editor/media',
      method: 'GET',
      query: { episodeId: 'episode-1', editorProjectId: 'editor-1' },
    })

    const res = await mod.GET(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.media.entries).toEqual([])
  })

  it('POST imports a remote URL through the editor import service', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/editor/media/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/editor/media',
      method: 'POST',
      body: {
        episodeId: 'episode-1',
        editorProjectId: 'editor-1',
        url: 'https://example.com/clip.mp4',
        mimeType: 'video/mp4',
        label: 'close-up',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(importMock.importEditorMediaFromUrl).toHaveBeenCalledWith(expect.objectContaining({
      editorProjectId: 'editor-1',
      episodeId: 'episode-1',
      url: 'https://example.com/clip.mp4',
    }))
    expect(body.asset).toEqual(expect.objectContaining({ id: 'asset-2' }))
  })
})
```

- [ ] **Step 7: Implement media API route**

Create `src/app/api/novel-promotion/[projectId]/editor/media/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { findScopedEditorProject } from '@/lib/novel-promotion/ai-editing/editor-auth'
import { buildEditorManifest } from '@/lib/novel-promotion/ai-editing/manifest'
import { buildAiEditableMediaLibrary } from '@/lib/novel-promotion/ai-editing/media-library'
import { importEditorMediaFromBuffer, importEditorMediaFromUrl, listImportedEditorAssets } from '@/lib/novel-promotion/ai-editing/import-media'

export const GET = apiHandler(async (request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const episodeId = request.nextUrl.searchParams.get('episodeId') || ''
  const editorProjectId = request.nextUrl.searchParams.get('editorProjectId') || null
  if (!episodeId) throw new ApiError('INVALID_PARAMS')

  const editorProject = await findScopedEditorProject({ projectId, episodeId, editorProjectId })
  if (!editorProject) throw new ApiError('NOT_FOUND')

  const manifest = await buildEditorManifest({ projectId, episodeId })
  const importedAssets = await listImportedEditorAssets(editorProject.id)
  const media = await buildAiEditableMediaLibrary({ fps: manifest.fps, manifest, importedAssets })

  return NextResponse.json({ media })
})

export const POST = apiHandler(async (request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const episodeId = String(form.get('episodeId') || '')
    const editorProjectId = String(form.get('editorProjectId') || '')
    const file = form.get('file')
    if (!episodeId || !(file instanceof File)) throw new ApiError('INVALID_PARAMS')
    const editorProject = await findScopedEditorProject({ projectId, episodeId, editorProjectId })
    if (!editorProject) throw new ApiError('NOT_FOUND')
    const buffer = Buffer.from(await file.arrayBuffer())
    const asset = await importEditorMediaFromBuffer({
      editorProjectId: editorProject.id,
      episodeId,
      fileName: file.name,
      mimeType: file.type,
      buffer,
      label: String(form.get('label') || file.name),
    })
    return NextResponse.json({ asset })
  }

  const body = await request.json()
  const episodeId = typeof body?.episodeId === 'string' ? body.episodeId.trim() : ''
  const editorProjectId = typeof body?.editorProjectId === 'string' ? body.editorProjectId.trim() : null
  const url = typeof body?.url === 'string' ? body.url.trim() : ''
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType.trim() : ''
  if (!episodeId || !url || !mimeType) throw new ApiError('INVALID_PARAMS')
  const editorProject = await findScopedEditorProject({ projectId, episodeId, editorProjectId })
  if (!editorProject) throw new ApiError('NOT_FOUND')
  const asset = await importEditorMediaFromUrl({
    editorProjectId: editorProject.id,
    episodeId,
    url,
    mimeType,
    label: typeof body?.label === 'string' ? body.label : null,
  })
  return NextResponse.json({ asset })
})
```

- [ ] **Step 8: Run focused tests**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing/import-media.test.ts tests/integration/api/specific/editor-media-api.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/novel-promotion/ai-editing/import-media.ts src/lib/novel-promotion/ai-editing/editor-assets.ts src/lib/novel-promotion/ai-editing/media-probe.ts 'src/app/api/novel-promotion/[projectId]/editor/media/route.ts' tests/unit/ai-editing/import-media.test.ts tests/integration/api/specific/editor-media-api.test.ts
git commit -m "Add editor media import API"
```

## Task 3: Timeline Tool Executor Core

**Files:**

- Create: `src/lib/novel-promotion/ai-editing/tool-executor.ts`
- Modify: `src/lib/novel-promotion/ai-editing/tool-types.ts`
- Test: `tests/unit/ai-editing/tool-executor.test.ts`

- [ ] **Step 1: Write failing executor tests**

Create `tests/unit/ai-editing/tool-executor.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { EditorToolExecutor } from '@/lib/novel-promotion/ai-editing/tool-executor'
import type { VideoEditorProject } from '@/features/video-editor/types/editor.types'

function baseProject(): VideoEditorProject {
  return {
    id: 'editor-1',
    episodeId: 'episode-1',
    schemaVersion: '1.2',
    config: { fps: 30, width: 1920, height: 1080, videoRatio: '16:9', burnSubtitlesDefault: true },
    timeline: [{
      id: 'clip-1',
      kind: 'source',
      src: '/m/a',
      durationInFrames: 90,
      metadata: { storyboardId: 'storyboard-1', sourcePanelId: 'panel-1', storyOrder: 0, source: 'panel' },
    }, {
      id: 'clip-2',
      kind: 'source',
      src: '/m/b',
      durationInFrames: 90,
      metadata: { storyboardId: 'storyboard-2', sourcePanelId: 'panel-2', storyOrder: 1, source: 'panel' },
    }],
    audioTrack: [{ id: 'audio-2', src: '/m/audio-b', startFrame: 90, durationInFrames: 90, sourcePanelId: 'panel-2', clipId: 'clip-2', volume: 1 }],
    subtitleCues: [{ id: 'subtitle-2', text: 'second', startFrame: 90, endFrame: 180, sourcePanelId: 'panel-2', style: 'default' }],
    editorAssets: [],
    bgmTrack: [],
    pendingVersion: null,
  }
}

describe('EditorToolExecutor', () => {
  it('rejects pending media when inserting clips', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: { fps: 30, entries: [{ id: 'user_import_video:asset-pending', sourceType: 'user_import_video', kind: 'video', status: 'pending', eligibleForTimeline: false, url: null, label: 'pending' }] },
    })

    expect(() => executor.insertClips({ afterClipId: 'clip-1', mediaIds: ['user_import_video:asset-pending'] })).toThrow('EDITOR_TOOL_MEDIA_NOT_ELIGIBLE')
  })

  it('inserts completed video media and ripples later audio and subtitles', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: { fps: 30, entries: [{ id: 'user_import_video:asset-1', sourceType: 'user_import_video', kind: 'video', status: 'completed', eligibleForTimeline: true, url: '/m/import', durationInFrames: 45, label: 'imported' }] },
    })

    executor.getTimeline()
    executor.getMedia()
    const result = executor.insertClips({ afterClipId: 'clip-1', mediaIds: ['user_import_video:asset-1'] })

    expect(result.project.timeline.map((clip) => clip.id)).toEqual(['clip-1', 'clip_asset-1', 'clip-2'])
    expect(result.project.timeline[1]).toMatchObject({
      src: '/m/import',
      durationInFrames: 45,
      metadata: { editorAssetId: 'asset-1', source: 'user_import_video' },
    })
    expect(result.project.audioTrack[0].startFrame).toBe(135)
    expect(result.project.subtitleCues[0]).toMatchObject({ startFrame: 135, endFrame: 225 })
  })

  it('undo reverts only the latest draft mutation', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: { fps: 30, entries: [{ id: 'user_import_video:asset-1', sourceType: 'user_import_video', kind: 'video', status: 'completed', eligibleForTimeline: true, url: '/m/import', durationInFrames: 45, label: 'imported' }] },
    })

    executor.getTimeline()
    executor.getMedia()
    executor.insertClips({ afterClipId: 'clip-1', mediaIds: ['user_import_video:asset-1'] })
    const result = executor.undo()

    expect(result.project.timeline.map((clip) => clip.id)).toEqual(['clip-1', 'clip-2'])
    expect(result.changed).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing/tool-executor.test.ts
```

Expected: FAIL because `tool-executor.ts` does not exist.

- [ ] **Step 3: Add tool call types**

Extend `src/lib/novel-promotion/ai-editing/tool-types.ts`:

```ts
export type InsertClipsInput = {
  afterClipId?: string
  beforeClipId?: string
  atIndex?: number
  mediaIds: string[]
}

export type ReplaceClipInput = {
  clipId: string
  mediaId: string
}

export type SetClipPropertiesInput = {
  clipId: string
  durationInFrames?: number
  sourceTrim?: { fromFrame: number; toFrame: number }
  transition?: { type: 'none' | 'dissolve' | 'fade' | 'slide'; durationInFrames: number }
  subtitlePlacement?: 'bottom' | 'lower' | 'middle'
}

export type MoveClipsInput = {
  clipIds: string[]
  toIndex: number
}

export type SplitClipInput = {
  clipId: string
  atFrame: number
}

export type RemoveClipsInput = {
  clipIds: string[]
  removeLinkedAudioAndSubtitles?: boolean
}

export type RippleDeleteRangesInput = {
  ranges: Array<{ startFrame: number; endFrame: number }>
}
```

- [ ] **Step 4: Implement the minimal executor methods**

Create `src/lib/novel-promotion/ai-editing/tool-executor.ts` with a class that clones the project in memory, requires `getTimeline()` before mutations and `getMedia()` before asset references, and records operation logs:

```ts
import type { AudioAttachment, SubtitleCue, VideoClip, VideoEditorProject } from '@/features/video-editor/types/editor.types'
import { computeClipPositions } from '@/features/video-editor/utils/time-utils'
import type {
  AiEditableMediaEntry,
  AiEditableMediaLibrary,
  EditorToolDraftResult,
  EditorToolOperation,
  InsertClipsInput,
  RemoveClipsInput,
} from './tool-types'

function cloneProject(project: VideoEditorProject): VideoEditorProject {
  return JSON.parse(JSON.stringify(project)) as VideoEditorProject
}

function mediaAssetId(entry: AiEditableMediaEntry): string {
  return entry.assetId || entry.id.split(':')[1] || entry.id
}

function sourceFromMedia(entry: AiEditableMediaEntry): VideoClip['metadata']['source'] {
  if (entry.sourceType === 'generated_transition_bridge') return 'ai_transition'
  if (entry.sourceType === 'user_import_video') return 'imported'
  return 'panel'
}

function totalBeforeIndex(clips: VideoClip[], index: number): number {
  return computeClipPositions(clips).slice(0, index).reduce((max, clip) => Math.max(max, clip.endFrame), 0)
}

function shiftAttachments(project: VideoEditorProject, fromFrame: number, deltaFrames: number) {
  project.audioTrack = project.audioTrack.map((audio) => audio.startFrame >= fromFrame ? { ...audio, startFrame: audio.startFrame + deltaFrames } : audio)
  project.subtitleCues = project.subtitleCues.map((cue) => cue.startFrame >= fromFrame ? { ...cue, startFrame: cue.startFrame + deltaFrames, endFrame: cue.endFrame + deltaFrames } : cue)
}

export class EditorToolExecutor {
  private project: VideoEditorProject
  private readonly media: AiEditableMediaLibrary
  private readonly undoStack: VideoEditorProject[] = []
  private readonly operations: EditorToolOperation[] = []
  private readonly warnings: string[] = []
  private timelineRead = false
  private mediaRead = false

  constructor(input: { project: VideoEditorProject; media: AiEditableMediaLibrary }) {
    this.project = cloneProject(input.project)
    this.media = input.media
  }

  getTimeline() {
    this.timelineRead = true
    return {
      config: this.project.config,
      clips: computeClipPositions(this.project.timeline),
      audioTrack: this.project.audioTrack,
      subtitleCues: this.project.subtitleCues,
    }
  }

  getMedia() {
    this.mediaRead = true
    return this.media
  }

  insertClips(input: InsertClipsInput): EditorToolDraftResult {
    this.assertMutationAllowed()
    const index = this.resolveInsertIndex(input)
    const insertFrame = totalBeforeIndex(this.project.timeline, index)
    const newClips = input.mediaIds.map((mediaId) => this.clipFromMedia(mediaId))
    const insertedDuration = newClips.reduce((sum, clip) => sum + clip.durationInFrames, 0)

    this.pushUndo()
    this.project.timeline.splice(index, 0, ...newClips)
    shiftAttachments(this.project, insertFrame, insertedDuration)
    this.operations.push({
      tool: 'insert_clips',
      targetIds: newClips.map((clip) => clip.id),
      before: { index, insertFrame },
      after: { insertedDuration },
      warnings: [],
    })
    return this.result()
  }

  removeClips(input: RemoveClipsInput): EditorToolDraftResult {
    this.assertMutationAllowed()
    const ids = new Set(input.clipIds)
    const positions = computeClipPositions(this.project.timeline)
    const removedRanges = positions.filter((clip) => ids.has(clip.id)).map((clip) => ({ startFrame: clip.startFrame, endFrame: clip.endFrame }))
    if (removedRanges.length === 0) throw new Error('EDITOR_TOOL_CLIP_NOT_FOUND')
    const removedDuration = removedRanges.reduce((sum, range) => sum + range.endFrame - range.startFrame, 0)
    const firstFrame = Math.min(...removedRanges.map((range) => range.startFrame))

    this.pushUndo()
    this.project.timeline = this.project.timeline.filter((clip) => !ids.has(clip.id))
    if (input.removeLinkedAudioAndSubtitles) {
      this.project.audioTrack = this.project.audioTrack.filter((audio) => !audio.clipId || !ids.has(audio.clipId))
      this.project.subtitleCues = this.project.subtitleCues.filter((cue) => !cue.sourcePanelId || !this.project.timeline.some((clip) => ids.has(clip.id) && clip.metadata.sourcePanelId === cue.sourcePanelId))
    }
    shiftAttachments(this.project, firstFrame, -removedDuration)
    this.operations.push({ tool: 'remove_clips', targetIds: input.clipIds, before: { removedRanges }, after: { removedDuration }, warnings: [] })
    return this.result()
  }

  undo(): EditorToolDraftResult {
    const previous = this.undoStack.pop()
    if (!previous) return this.result()
    this.project = previous
    this.operations.push({ tool: 'undo', targetIds: [], warnings: [] })
    return this.result()
  }

  snapshot(): EditorToolDraftResult {
    return this.result()
  }

  private assertMutationAllowed() {
    if (!this.timelineRead) throw new Error('EDITOR_TOOL_TIMELINE_NOT_READ')
    if (!this.mediaRead) throw new Error('EDITOR_TOOL_MEDIA_NOT_READ')
  }

  private resolveInsertIndex(input: InsertClipsInput) {
    if (typeof input.atIndex === 'number') return Math.max(0, Math.min(this.project.timeline.length, Math.floor(input.atIndex)))
    if (input.afterClipId) {
      const index = this.project.timeline.findIndex((clip) => clip.id === input.afterClipId)
      if (index < 0) throw new Error('EDITOR_TOOL_CLIP_NOT_FOUND')
      return index + 1
    }
    if (input.beforeClipId) {
      const index = this.project.timeline.findIndex((clip) => clip.id === input.beforeClipId)
      if (index < 0) throw new Error('EDITOR_TOOL_CLIP_NOT_FOUND')
      return index
    }
    return this.project.timeline.length
  }

  private clipFromMedia(mediaId: string): VideoClip {
    const media = this.media.entries.find((entry) => entry.id === mediaId)
    if (!media || !media.eligibleForTimeline || !media.url) throw new Error('EDITOR_TOOL_MEDIA_NOT_ELIGIBLE')
    if (media.kind !== 'video' && media.kind !== 'image') throw new Error('EDITOR_TOOL_MEDIA_KIND_UNSUPPORTED')
    const assetId = mediaAssetId(media)
    const durationInFrames = media.durationInFrames || this.project.config.fps * 3
    return {
      id: `clip_${assetId}`,
      kind: media.sourceType === 'generated_transition_bridge' ? 'transition_bridge' : 'source',
      src: media.url,
      durationInFrames,
      metadata: {
        sourcePanelId: media.sourcePanelId,
        storyboardId: media.storyboardId || `imported:${assetId}`,
        voiceLineId: media.voiceLineId,
        storyOrder: media.storyOrder,
        source: sourceFromMedia(media),
        description: media.description || media.label,
        editorAssetId: assetId,
      },
    }
  }

  private pushUndo() {
    this.undoStack.push(cloneProject(this.project))
  }

  private result(): EditorToolDraftResult {
    const changed = JSON.stringify(this.project) !== JSON.stringify(this.undoStack[0] || this.project)
    return {
      project: cloneProject(this.project),
      operations: [...this.operations],
      warnings: [...this.warnings],
      changed: this.operations.some((operation) => operation.tool !== 'undo'),
    }
  }
}
```

- [ ] **Step 5: Run tests and fix only executor-scoped issues**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing/tool-executor.test.ts
```

Expected: PASS. If TypeScript reports `source: 'imported'` is not assignable, complete Task 5's type extension before committing this task, and include only that compatible type change in this commit.

- [ ] **Step 6: Commit**

```bash
git add src/lib/novel-promotion/ai-editing/tool-types.ts src/lib/novel-promotion/ai-editing/tool-executor.ts tests/unit/ai-editing/tool-executor.test.ts src/features/video-editor/types/editor.types.ts
git commit -m "Add AI editor timeline tool executor"
```

## Task 4: Full Phase 1 Tool Surface

**Files:**

- Modify: `src/lib/novel-promotion/ai-editing/tool-executor.ts`
- Modify: `src/lib/novel-promotion/ai-editing/tool-types.ts`
- Test: `tests/unit/ai-editing/tool-executor.test.ts`

- [ ] **Step 1: Add failing tests for replace, trim, move, split, ripple, transcript, captions**

Append to `tests/unit/ai-editing/tool-executor.test.ts`:

```ts
it('replaces a clip with completed media while preserving linked anchors', () => {
  const executor = new EditorToolExecutor({
    project: baseProject(),
    media: { fps: 30, entries: [{ id: 'user_import_video:asset-1', sourceType: 'user_import_video', kind: 'video', status: 'completed', eligibleForTimeline: true, url: '/m/import', durationInFrames: 60, label: 'imported' }] },
  })

  executor.getTimeline()
  executor.getMedia()
  const result = executor.replaceClip({ clipId: 'clip-2', mediaId: 'user_import_video:asset-1' })

  expect(result.project.timeline.map((clip) => clip.src)).toEqual(['/m/a', '/m/import'])
  expect(result.project.audioTrack[0].clipId).toBe(result.project.timeline[1].id)
  expect(result.project.subtitleCues[0]).toMatchObject({ startFrame: 90, endFrame: 150 })
})

it('updates clip duration and subtitle placement safely', () => {
  const executor = new EditorToolExecutor({ project: baseProject(), media: { fps: 30, entries: [] } })
  executor.getTimeline()
  executor.getMedia()
  const result = executor.setClipProperties({ clipId: 'clip-2', durationInFrames: 45, subtitlePlacement: 'lower' })

  expect(result.project.timeline[1].durationInFrames).toBe(45)
  expect(result.project.subtitleCues[0]).toMatchObject({ startFrame: 90, endFrame: 135, placement: 'lower' })
})

it('moves clips by index without losing clip ids', () => {
  const executor = new EditorToolExecutor({ project: baseProject(), media: { fps: 30, entries: [] } })
  executor.getTimeline()
  executor.getMedia()
  const result = executor.moveClips({ clipIds: ['clip-2'], toIndex: 0 })

  expect(result.project.timeline.map((clip) => clip.id)).toEqual(['clip-2', 'clip-1'])
})

it('splits a clip into two valid clips', () => {
  const executor = new EditorToolExecutor({ project: baseProject(), media: { fps: 30, entries: [] } })
  executor.getTimeline()
  executor.getMedia()
  const result = executor.splitClip({ clipId: 'clip-1', atFrame: 30 })

  expect(result.project.timeline.slice(0, 2).map((clip) => clip.durationInFrames)).toEqual([30, 60])
  expect(result.project.timeline[1].sourceTrim).toEqual({ fromFrame: 30, toFrame: 90 })
})

it('returns transcript and can rebuild captions from voice media entries', () => {
  const executor = new EditorToolExecutor({
    project: baseProject(),
    media: { fps: 30, entries: [{ id: 'voice_audio:voice-1', sourceType: 'voice_audio', kind: 'audio', status: 'completed', eligibleForTimeline: true, url: '/m/audio', durationInFrames: 30, sourcePanelId: 'panel-1', voiceLineId: 'voice-1', label: 'voice', description: 'hello world' }] },
  })

  expect(executor.getTranscript()).toEqual([{ text: 'second', startFrame: 90, endFrame: 180, sourcePanelId: 'panel-2', sourceVoiceLineId: undefined }])
  executor.getTimeline()
  executor.getMedia()
  const result = executor.addCaptions({ placement: 'bottom' })

  expect(result.project.subtitleCues.some((cue) => cue.text === 'hello world')).toBe(true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing/tool-executor.test.ts
```

Expected: FAIL because the new methods are missing.

- [ ] **Step 3: Implement remaining methods**

Add methods to `EditorToolExecutor` with these exact semantics:

```ts
replaceClip(input: ReplaceClipInput): EditorToolDraftResult
setClipProperties(input: SetClipPropertiesInput): EditorToolDraftResult
moveClips(input: MoveClipsInput): EditorToolDraftResult
splitClip(input: SplitClipInput): EditorToolDraftResult
rippleDeleteRanges(input: RippleDeleteRangesInput): EditorToolDraftResult
getTranscript(): Array<{ text: string; startFrame: number; endFrame: number; sourcePanelId?: string; sourceVoiceLineId?: string }>
addCaptions(input: { placement?: 'bottom' | 'lower' | 'middle' }): EditorToolDraftResult
inspectMedia(input: { mediaId: string }): AiEditableMediaEntry
```

Implement the methods using these rules:

```ts
// replaceClip
// - validate existing clip
// - validate completed media
// - replace the clip at the same index
// - preserve transition from old clip
// - update audio.clipId when it pointed to the old clip
// - clamp linked subtitle/audio end frames if new duration is shorter

// setClipProperties
// - durationInFrames must be >= 1 and <= 10 minutes at project fps
// - sourceTrim must have fromFrame >= 0 and toFrame > fromFrame
// - transition duration must be 0..fps
// - subtitlePlacement updates cues whose sourcePanelId or sourceVoiceLineId match the clip metadata

// moveClips
// - remove selected clips in current order
// - insert at bounded toIndex
// - recompute attachment shifts by preserving sourcePanelId anchors where possible

// splitClip
// - atFrame must be inside 1..duration-1
// - first clip keeps id and duration atFrame
// - second clip id is `${clip.id}_split_${atFrame}`
// - second clip sourceTrim starts at old trim start + atFrame

// rippleDeleteRanges
// - ranges must be sorted, non-overlapping, and inside current duration
// - trim or remove overlapping clips
// - shift later audio/subtitles backward
// - remove subtitles fully inside deleted ranges

// getTranscript
// - return current subtitle cues ordered by startFrame

// addCaptions
// - add one caption per voice_audio media entry with description text
// - do not duplicate existing sourceVoiceLineId cues
```

Use small private helpers rather than refactoring unrelated editor utilities.

- [ ] **Step 4: Run executor tests**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing/tool-executor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/novel-promotion/ai-editing/tool-executor.ts src/lib/novel-promotion/ai-editing/tool-types.ts tests/unit/ai-editing/tool-executor.test.ts
git commit -m "Complete AI editor phase one tools"
```

## Task 5: Compatible Editor Schema Extensions And Render Support

**Files:**

- Modify: `src/features/video-editor/types/editor.types.ts`
- Modify: `src/features/video-editor/utils/migration.ts`
- Modify: `src/features/video-editor/remotion/VideoComposition.tsx`
- Test: `tests/unit/ai-editing/project-migration.test.ts`
- Test: `tests/unit/video-editor/subtitle-placement.test.tsx`

- [ ] **Step 1: Write failing tests for new optional fields**

Append to `tests/unit/ai-editing/project-migration.test.ts`:

```ts
it('preserves imported media metadata and subtitle placement during migration', () => {
  const migrated = migrateProjectData({
    id: 'editor-1',
    episodeId: 'episode-1',
    schemaVersion: '1.2',
    config: { fps: 30, width: 1920, height: 1080, videoRatio: '16:9', burnSubtitlesDefault: true },
    timeline: [{
      id: 'clip-import',
      kind: 'source',
      src: '/m/import',
      durationInFrames: 60,
      metadata: {
        storyboardId: 'imported:asset-1',
        source: 'imported',
        editorAssetId: 'asset-1',
        description: 'uploaded clip',
      },
    }],
    audioTrack: [],
    subtitleCues: [{ id: 'sub-1', text: 'hello', startFrame: 0, endFrame: 60, style: 'default', placement: 'lower' }],
    editorAssets: [{ id: 'asset-1', kind: 'user_import_video', status: 'completed', url: '/m/import', mediaObjectId: 'media-1' }],
    bgmTrack: [],
    pendingVersion: null,
  })

  expect(migrated.timeline[0].metadata).toMatchObject({ source: 'imported', editorAssetId: 'asset-1' })
  expect(migrated.subtitleCues[0].placement).toBe('lower')
  expect(migrated.editorAssets[0]).toMatchObject({ kind: 'user_import_video', mediaObjectId: 'media-1' })
})
```

Create `tests/unit/video-editor/subtitle-placement.test.tsx`:

```ts
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { VideoComposition } from '@/features/video-editor/remotion/VideoComposition'

describe('VideoComposition subtitle placement', () => {
  it('renders lower subtitles with a smaller bottom offset', () => {
    const html = renderToStaticMarkup(
      <VideoComposition
        clips={[]}
        audioTrack={[]}
        subtitleCues={[{ id: 's1', text: 'hello', startFrame: 0, endFrame: 30, style: 'default', placement: 'lower' }]}
        bgmTrack={[]}
        config={{ fps: 30, width: 1920, height: 1080, videoRatio: '16:9', burnSubtitlesDefault: true }}
        burnSubtitles
      />,
    )

    expect(html).toContain('hello')
    expect(html).toContain('padding-bottom:32px')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing/project-migration.test.ts tests/unit/video-editor/subtitle-placement.test.tsx
```

Expected: FAIL because `placement`, imported editor asset kinds, and `source: 'imported'` are not typed or rendered yet.

- [ ] **Step 3: Extend editor types compatibly**

Modify `src/features/video-editor/types/editor.types.ts`:

```ts
export type VideoClipSource = 'panel' | 'lip_sync' | 'ai_transition' | 'imported' | 'user_import_video' | 'user_import_image'
export type SubtitlePlacement = 'bottom' | 'lower' | 'middle'

export interface SubtitleCue {
  id: string
  text: string
  startFrame: number
  endFrame: number
  sourcePanelId?: string
  sourceVoiceLineId?: string
  style: SubtitleStyle
  placement?: SubtitlePlacement
  truncated?: boolean
}

export interface EditorAssetRef {
  id: string
  kind: 'transition_bridge' | 'render_output' | 'user_import_video' | 'user_import_audio' | 'user_import_image'
  url?: string
  status: 'pending' | 'completed' | 'failed' | 'canceled'
  taskId?: string
  mediaObjectId?: string
}
```

- [ ] **Step 4: Preserve new fields in migration**

Modify `src/features/video-editor/utils/migration.ts` so normalization accepts new asset kinds and subtitle placement:

```ts
function normalizeSubtitlePlacement(value: unknown): SubtitleCue['placement'] | undefined {
  return value === 'lower' || value === 'middle' || value === 'bottom' ? value : undefined
}

function normalizeEditorAssetKind(value: unknown): EditorAssetRef['kind'] {
  if (value === 'render_output') return 'render_output'
  if (value === 'user_import_video') return 'user_import_video'
  if (value === 'user_import_audio') return 'user_import_audio'
  if (value === 'user_import_image') return 'user_import_image'
  return 'transition_bridge'
}
```

Use these helpers inside the existing subtitle and editor asset normalization paths.

- [ ] **Step 5: Render subtitle placement and imported images**

Modify `src/features/video-editor/remotion/VideoComposition.tsx`:

```tsx
<SubtitleOverlay text={cue.text} style={cue.style} placement={cue.placement} />
```

Update `SubtitleOverlayProps`:

```ts
interface SubtitleOverlayProps {
  text: string
  style: 'default' | 'cinematic'
  placement?: 'bottom' | 'lower' | 'middle'
}
```

Set placement-specific layout:

```tsx
const placementStyle = {
  bottom: { justifyContent: 'flex-end', paddingBottom: '60px' },
  lower: { justifyContent: 'flex-end', paddingBottom: '32px' },
  middle: { justifyContent: 'center', paddingBottom: '0px' },
}[placement || 'bottom']
```

For imported images, render them as still clips without changing video behavior:

```tsx
{clip.metadata.source === 'user_import_image' || /\.(png|jpe?g|webp)(\?|$)/i.test(clip.src)
  ? <Img src={clip.src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  : <Video src={clip.src} startFrom={clip.sourceTrim?.fromFrame || 0} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
```

Import `Img` from `remotion`.

- [ ] **Step 6: Run focused tests**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing/project-migration.test.ts tests/unit/video-editor/subtitle-placement.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/video-editor/types/editor.types.ts src/features/video-editor/utils/migration.ts src/features/video-editor/remotion/VideoComposition.tsx tests/unit/ai-editing/project-migration.test.ts tests/unit/video-editor/subtitle-placement.test.tsx
git commit -m "Support imported media metadata in editor project"
```

## Task 6: Structured Tool Plan And LLM Orchestrator

**Files:**

- Create: `src/lib/novel-promotion/ai-editing/tool-plan.ts`
- Create: `src/lib/novel-promotion/ai-editing/tool-orchestrator.ts`
- Modify: `src/lib/novel-promotion/ai-editing/tool-types.ts`
- Test: `tests/unit/ai-editing/tool-plan.test.ts`
- Test: `tests/unit/ai-editing/tool-orchestrator.test.ts`

- [ ] **Step 1: Write failing tool-plan parser tests**

Create `tests/unit/ai-editing/tool-plan.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseEditorToolPlan } from '@/lib/novel-promotion/ai-editing/tool-plan'

describe('AI editor tool plan parser', () => {
  it('parses fenced JSON tool plans', () => {
    const result = parseEditorToolPlan('```json\n{"summary":"更快","toolCalls":[{"tool":"get_timeline","input":{}},{"tool":"get_media","input":{}},{"tool":"set_clip_properties","input":{"clipId":"clip-1","durationInFrames":45}}]}\n```')

    expect(result).toEqual({
      summary: '更快',
      toolCalls: [
        { tool: 'get_timeline', input: {} },
        { tool: 'get_media', input: {} },
        { tool: 'set_clip_properties', input: { clipId: 'clip-1', durationInFrames: 45 } },
      ],
    })
  })

  it('rejects mutation before timeline and media reads', () => {
    expect(() => parseEditorToolPlan('{"summary":"bad","toolCalls":[{"tool":"insert_clips","input":{"mediaIds":["m1"]}}]}')).toThrow('EDITOR_TOOL_PLAN_MISSING_CONTEXT_READS')
  })
})
```

- [ ] **Step 2: Write failing orchestrator tests**

Create `tests/unit/ai-editing/tool-orchestrator.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { runAiEditorToolOrchestration } from '@/lib/novel-promotion/ai-editing/tool-orchestrator'

describe('AI editor tool orchestrator', () => {
  it('executes structured tool plan and returns a changed draft', async () => {
    const completion = vi.fn(async () => ({
      choices: [{ message: { content: JSON.stringify({
        summary: '插入上传特写',
        toolCalls: [
          { tool: 'get_timeline', input: {} },
          { tool: 'get_media', input: {} },
          { tool: 'insert_clips', input: { afterClipId: 'clip-1', mediaIds: ['user_import_video:asset-1'] } },
        ],
      }) } }],
    }))

    const result = await runAiEditorToolOrchestration({
      userId: 'user-1',
      projectId: 'project-1',
      instruction: '把上传的特写插到第一段后面',
      model: 'analysis-model',
      project: {
        id: 'editor-1',
        episodeId: 'episode-1',
        schemaVersion: '1.2',
        config: { fps: 30, width: 1920, height: 1080, videoRatio: '16:9', burnSubtitlesDefault: true },
        timeline: [{ id: 'clip-1', kind: 'source', src: '/m/a', durationInFrames: 90, metadata: { storyboardId: 's1', sourcePanelId: 'p1' } }],
        audioTrack: [],
        subtitleCues: [],
        editorAssets: [],
        bgmTrack: [],
        pendingVersion: null,
      },
      media: { fps: 30, entries: [{ id: 'user_import_video:asset-1', sourceType: 'user_import_video', kind: 'video', status: 'completed', eligibleForTimeline: true, url: '/m/import', durationInFrames: 45, label: 'close-up' }] },
      complete: completion,
    })

    expect(result.changed).toBe(true)
    expect(result.summary).toBe('插入上传特写')
    expect(result.project.timeline.map((clip) => clip.src)).toEqual(['/m/a', '/m/import'])
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing/tool-plan.test.ts tests/unit/ai-editing/tool-orchestrator.test.ts
```

Expected: FAIL because parser and orchestrator modules do not exist.

- [ ] **Step 4: Implement structured parser**

Create `src/lib/novel-promotion/ai-editing/tool-plan.ts`:

```ts
import { jsonrepair } from 'jsonrepair'

export type EditorToolName =
  | 'get_timeline'
  | 'get_media'
  | 'inspect_media'
  | 'add_clips'
  | 'insert_clips'
  | 'replace_clip'
  | 'set_clip_properties'
  | 'move_clips'
  | 'split_clip'
  | 'remove_clips'
  | 'ripple_delete_ranges'
  | 'get_transcript'
  | 'add_captions'
  | 'undo'

export type ParsedEditorToolCall = {
  tool: EditorToolName
  input: Record<string, unknown>
}

export type ParsedEditorToolPlan = {
  summary: string
  toolCalls: ParsedEditorToolCall[]
}

const MUTATION_TOOLS = new Set([
  'add_clips',
  'insert_clips',
  'replace_clip',
  'set_clip_properties',
  'move_clips',
  'split_clip',
  'remove_clips',
  'ripple_delete_ranges',
  'add_captions',
  'undo',
])

function stripFence(content: string) {
  return content.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
}

export function parseEditorToolPlan(content: string): ParsedEditorToolPlan {
  const parsed = JSON.parse(jsonrepair(stripFence(content))) as ParsedEditorToolPlan
  if (!parsed || typeof parsed.summary !== 'string' || !Array.isArray(parsed.toolCalls)) {
    throw new Error('EDITOR_TOOL_PLAN_INVALID')
  }
  const calls = parsed.toolCalls.map((call) => ({
    tool: call.tool,
    input: call.input && typeof call.input === 'object' && !Array.isArray(call.input) ? call.input : {},
  })) as ParsedEditorToolCall[]

  const firstMutationIndex = calls.findIndex((call) => MUTATION_TOOLS.has(call.tool))
  if (firstMutationIndex >= 0) {
    const previous = calls.slice(0, firstMutationIndex).map((call) => call.tool)
    if (!previous.includes('get_timeline') || !previous.includes('get_media')) {
      throw new Error('EDITOR_TOOL_PLAN_MISSING_CONTEXT_READS')
    }
  }

  return { summary: parsed.summary.trim() || 'AI 剪辑调整', toolCalls: calls }
}
```

- [ ] **Step 5: Implement orchestrator**

Create `src/lib/novel-promotion/ai-editing/tool-orchestrator.ts`:

```ts
import type OpenAI from 'openai'
import { runModelGatewayTextCompletion } from '@/lib/model-gateway/llm'
import type { VideoEditorProject } from '@/features/video-editor/types/editor.types'
import type { AiEditableMediaLibrary, EditorToolDraftResult } from './tool-types'
import { EditorToolExecutor } from './tool-executor'
import { parseEditorToolPlan, type ParsedEditorToolCall } from './tool-plan'

type CompleteFn = (input: {
  userId: string
  model: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
}) => Promise<Pick<OpenAI.Chat.Completions.ChatCompletion, 'choices'>>

function contentFromCompletion(completion: Pick<OpenAI.Chat.Completions.ChatCompletion, 'choices'>) {
  return completion.choices[0]?.message?.content || ''
}

function buildSystemPrompt() {
  return [
    '你是 Director 内部 AI 剪辑助手。',
    '必须先调用 get_timeline 和 get_media，再调用任何修改工具。',
    '只能输出 JSON：{"summary": string, "toolCalls": [{"tool": string, "input": object}]}。',
    '保持剧情连贯，优先小范围裁剪、插入、替换和字幕位置调整。',
    '不要输出完整 VideoEditorProject JSON。',
  ].join('\n')
}

function buildUserPrompt(input: { instruction: string; project: VideoEditorProject; media: AiEditableMediaLibrary }) {
  return JSON.stringify({
    instruction: input.instruction,
    timelineClipCount: input.project.timeline.length,
    media: input.media.entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      status: entry.status,
      eligibleForTimeline: entry.eligibleForTimeline,
      label: entry.label,
      durationInFrames: entry.durationInFrames,
    })),
  })
}

function executeCall(executor: EditorToolExecutor, call: ParsedEditorToolCall): unknown {
  switch (call.tool) {
    case 'get_timeline': return executor.getTimeline()
    case 'get_media': return executor.getMedia()
    case 'inspect_media': return executor.inspectMedia(call.input as { mediaId: string })
    case 'add_clips': return executor.insertClips(call.input as { mediaIds: string[] })
    case 'insert_clips': return executor.insertClips(call.input as { mediaIds: string[]; afterClipId?: string; beforeClipId?: string; atIndex?: number })
    case 'replace_clip': return executor.replaceClip(call.input as { clipId: string; mediaId: string })
    case 'set_clip_properties': return executor.setClipProperties(call.input as never)
    case 'move_clips': return executor.moveClips(call.input as never)
    case 'split_clip': return executor.splitClip(call.input as never)
    case 'remove_clips': return executor.removeClips(call.input as never)
    case 'ripple_delete_ranges': return executor.rippleDeleteRanges(call.input as never)
    case 'get_transcript': return executor.getTranscript()
    case 'add_captions': return executor.addCaptions(call.input as never)
    case 'undo': return executor.undo()
  }
}

export async function runAiEditorToolOrchestration(input: {
  userId: string
  projectId: string
  instruction: string
  model: string
  project: VideoEditorProject
  media: AiEditableMediaLibrary
  complete?: CompleteFn
}): Promise<EditorToolDraftResult & { summary: string }> {
  const complete = input.complete || (async (params) => runModelGatewayTextCompletion({
    userId: params.userId,
    model: params.model,
    messages: params.messages,
    options: { action: 'ai_edit_tool_plan', projectId: input.projectId, temperature: 0.2, reasoning: true },
  }))
  const completion = await complete({
    userId: input.userId,
    model: input.model,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(input) },
    ],
  })
  const plan = parseEditorToolPlan(contentFromCompletion(completion))
  const executor = new EditorToolExecutor({ project: input.project, media: input.media })

  for (const call of plan.toolCalls.slice(0, 20)) {
    executeCall(executor, call)
  }

  const result = executor.snapshot()
  return { ...result, summary: plan.summary }
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing/tool-plan.test.ts tests/unit/ai-editing/tool-orchestrator.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/novel-promotion/ai-editing/tool-plan.ts src/lib/novel-promotion/ai-editing/tool-orchestrator.ts src/lib/novel-promotion/ai-editing/tool-types.ts tests/unit/ai-editing/tool-plan.test.ts tests/unit/ai-editing/tool-orchestrator.test.ts
git commit -m "Add AI editor tool orchestration"
```

## Task 7: Replace No-Op Refine With Tool-Driven Pending Drafts

**Files:**

- Modify: `src/lib/novel-promotion/ai-editing/refine.ts`
- Modify: `src/app/api/novel-promotion/[projectId]/editor/refine/route.ts`
- Modify: `src/app/api/novel-promotion/[projectId]/editor/refine/apply/route.ts`
- Test: `tests/unit/ai-editing/refine-tool-flow.test.ts`
- Test: `tests/integration/api/specific/editor-refine-api.test.ts`

- [ ] **Step 1: Write failing refine flow tests**

Create `tests/unit/ai-editing/refine-tool-flow.test.ts` with Prisma and orchestrator mocks:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  videoEditorProject: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  videoEditorProjectVersion: {
    findUnique: vi.fn(),
  },
  videoEditorAsset: {
    findMany: vi.fn(async () => []),
  },
}))

const manifestMock = vi.hoisted(() => ({
  buildEditorManifest: vi.fn(async () => ({
    episodeId: 'episode-1',
    fps: 30,
    dimensions: { width: 1920, height: 1080 },
    clips: [],
    voiceLines: [],
    editorAssets: [],
  })),
}))

const configMock = vi.hoisted(() => ({
  getUserModelConfig: vi.fn(async () => ({ analysisModel: 'analysis-model' })),
}))

const orchestratorMock = vi.hoisted(() => ({
  runAiEditorToolOrchestration: vi.fn(async ({ project }) => ({
    project: { ...project, timeline: [{ id: 'clip-1', kind: 'source', src: '/m/a', durationInFrames: 60, metadata: { storyboardId: 's1' } }] },
    summary: '已调整节奏',
    operations: [{ tool: 'set_clip_properties', targetIds: ['clip-1'], warnings: [] }],
    warnings: [],
    changed: true,
  })),
}))

const versionsMock = vi.hoisted(() => ({
  createEditorVersion: vi.fn(async () => ({ id: 'version-1', createdAt: new Date('2026-06-22T00:00:00.000Z') })),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/novel-promotion/ai-editing/manifest', () => manifestMock)
vi.mock('@/lib/user-api/config', () => configMock)
vi.mock('@/lib/novel-promotion/ai-editing/tool-orchestrator', () => orchestratorMock)
vi.mock('@/lib/novel-promotion/ai-editing/versions', () => versionsMock)

describe('refineAiEdit tool flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.videoEditorProject.findFirst.mockResolvedValue({
      id: 'editor-1',
      episodeId: 'episode-1',
      projectData: JSON.stringify({
        id: 'editor-1',
        episodeId: 'episode-1',
        schemaVersion: '1.2',
        config: { fps: 30, width: 1920, height: 1080, videoRatio: '16:9', burnSubtitlesDefault: true },
        timeline: [],
        audioTrack: [],
        subtitleCues: [],
        editorAssets: [],
        bgmTrack: [],
        pendingVersion: null,
      }),
    })
    prismaMock.videoEditorProject.update.mockResolvedValue({ id: 'editor-1' })
  })

  it('creates a changed pending version from tool orchestration', async () => {
    const { refineAiEdit } = await import('@/lib/novel-promotion/ai-editing/refine')
    const result = await refineAiEdit({
      taskId: 'task-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      instruction: '节奏更快',
      payload: {},
    })

    expect(orchestratorMock.runAiEditorToolOrchestration).toHaveBeenCalledWith(expect.objectContaining({
      instruction: '节奏更快',
      model: 'analysis-model',
    }))
    expect(versionsMock.createEditorVersion).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'ai_refine',
      summary: '已调整节奏',
      diff: expect.objectContaining({ operations: expect.any(Array) }),
    }))
    expect(prismaMock.videoEditorProject.update).toHaveBeenCalled()
    expect(result).toEqual(expect.objectContaining({ pendingVersionId: 'version-1', summary: '已调整节奏', warnings: [] }))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing/refine-tool-flow.test.ts
```

Expected: FAIL because `refine.ts` still returns no-op pending versions.

- [ ] **Step 3: Update refine orchestration**

Modify `src/lib/novel-promotion/ai-editing/refine.ts` so it:

```ts
// 1. Finds the scoped editor project.
// 2. Migrates projectData.
// 3. If projectData.pendingVersion exists, loads that version snapshot and uses it as the base draft.
// 4. Builds manifest and media library.
// 5. Reads the user's configured analysis model.
// 6. Runs runAiEditorToolOrchestration.
// 7. Throws or returns warning if changed is false.
// 8. Creates VideoEditorProjectVersion with diff.operations.
// 9. Writes projectData with pendingVersion pointing to the new version, without applying the draft as active.
```

Use this base selection logic:

```ts
async function resolveRefineBaseProject(activeProject: VideoEditorProject): Promise<VideoEditorProject> {
  if (!activeProject.pendingVersion?.versionId) return activeProject
  const pending = await prisma.videoEditorProjectVersion.findUnique({
    where: { id: activeProject.pendingVersion.versionId },
  })
  if (!pending?.snapshotJson) return activeProject
  return migrateProjectData(JSON.parse(pending.snapshotJson))
}
```

Use this no-change behavior:

```ts
if (!orchestrated.changed) {
  return {
    editorProjectId: editorProject.id,
    pendingVersionId: '',
    summary: orchestrated.summary || '没有可安全应用的剪辑修改',
    warnings: [...orchestrated.warnings, 'AI did not produce a timeline-changing edit.'],
  }
}
```

- [ ] **Step 4: Extend API tests for consecutive pending draft behavior**

Append to `tests/integration/api/specific/editor-refine-api.test.ts`:

```ts
it('POST /refine keeps editor project id and lets worker refine the pending draft', async () => {
  const mod = await import('@/app/api/novel-promotion/[projectId]/editor/refine/route')
  const req = buildMockRequest({
    path: '/api/novel-promotion/project-1/editor/refine',
    method: 'POST',
    body: { episodeId: 'episode-1', editorProjectId: 'editor-1', instruction: '字幕靠下', targetDurationSeconds: 30 },
  })

  const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })

  expect(res.status).toBe(202)
  expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
    dedupeKey: 'ai_edit_refine:editor-1',
    payload: expect.objectContaining({
      editorProjectId: 'editor-1',
      instruction: '字幕靠下',
      targetDurationSeconds: 30,
    }),
  }))
})
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing/refine-tool-flow.test.ts tests/integration/api/specific/editor-refine-api.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/novel-promotion/ai-editing/refine.ts 'src/app/api/novel-promotion/[projectId]/editor/refine/route.ts' 'src/app/api/novel-promotion/[projectId]/editor/refine/apply/route.ts' tests/unit/ai-editing/refine-tool-flow.test.ts tests/integration/api/specific/editor-refine-api.test.ts
git commit -m "Enable tool-driven AI edit refine"
```

## Task 8: Editor UI For Import, Assistant, Confirm, Discard

**Files:**

- Create: `src/features/video-editor/components/AiEditAssistant.tsx`
- Create: `src/features/video-editor/components/EditorMediaPanel.tsx`
- Create: `src/features/video-editor/hooks/useAiEditing.ts`
- Modify: `src/features/video-editor/hooks/useEditorActions.ts`
- Modify: `src/features/video-editor/components/VideoEditorStage.tsx`
- Test: `tests/unit/video-editor/ai-edit-assistant.test.tsx`
- Test: `tests/unit/video-editor/editor-media-panel.test.tsx`

- [ ] **Step 1: Write failing static render tests**

Create `tests/unit/video-editor/ai-edit-assistant.test.tsx`:

```tsx
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AiEditAssistant } from '@/features/video-editor/components/AiEditAssistant'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('AiEditAssistant', () => {
  it('renders instruction input and pending version actions', () => {
    const html = renderToStaticMarkup(
      <AiEditAssistant
        pendingVersion={{ versionId: 'version-1', summary: '已调整节奏', reason: 'ai_refine', createdAt: '2026-06-22T00:00:00.000Z' }}
        isSubmitting={false}
        onSubmitInstruction={() => undefined}
        onApplyPending={() => undefined}
        onDiscardPending={() => undefined}
      />,
    )

    expect(html).toContain('已调整节奏')
    expect(html).toContain('editor.ai.instructionPlaceholder')
    expect(html).toContain('editor.ai.apply')
    expect(html).toContain('editor.ai.discard')
  })
})
```

Create `tests/unit/video-editor/editor-media-panel.test.tsx`:

```tsx
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { EditorMediaPanel } from '@/features/video-editor/components/EditorMediaPanel'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('EditorMediaPanel', () => {
  it('renders generated and imported media statuses', () => {
    const html = renderToStaticMarkup(
      <EditorMediaPanel
        media={{
          fps: 30,
          entries: [
            { id: 'generated_panel_video:panel-1', sourceType: 'generated_panel_video', kind: 'video', status: 'completed', eligibleForTimeline: true, url: '/m/a', label: '分镜 1' },
            { id: 'user_import_video:asset-1', sourceType: 'user_import_video', kind: 'video', status: 'pending', eligibleForTimeline: false, url: null, label: '上传素材' },
          ],
        }}
        onImportFile={() => undefined}
        onImportUrl={() => undefined}
      />,
    )

    expect(html).toContain('分镜 1')
    expect(html).toContain('上传素材')
    expect(html).toContain('pending')
  })
})
```

- [ ] **Step 2: Run UI tests to verify they fail**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/video-editor/ai-edit-assistant.test.tsx tests/unit/video-editor/editor-media-panel.test.tsx
```

Expected: FAIL because UI components do not exist.

- [ ] **Step 3: Implement assistant component**

Create `src/features/video-editor/components/AiEditAssistant.tsx`:

```tsx
'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { PendingEditorVersion } from '../types/editor.types'

export function AiEditAssistant(props: {
  pendingVersion: PendingEditorVersion | null
  isSubmitting: boolean
  onSubmitInstruction: (instruction: string) => void | Promise<void>
  onApplyPending: () => void | Promise<void>
  onDiscardPending: () => void | Promise<void>
}) {
  const t = useTranslations('video')
  const [instruction, setInstruction] = useState('')

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <textarea
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        placeholder={t('editor.ai.instructionPlaceholder')}
        rows={3}
        style={{ width: '100%', resize: 'vertical' }}
      />
      <button
        className="glass-btn-base glass-btn-primary px-3 py-2"
        disabled={props.isSubmitting || !instruction.trim()}
        onClick={() => {
          const value = instruction.trim()
          if (!value) return
          void props.onSubmitInstruction(value)
          setInstruction('')
        }}
      >
        {props.isSubmitting ? t('editor.ai.running') : t('editor.ai.submit')}
      </button>
      {props.pendingVersion ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 12 }}>{props.pendingVersion.summary}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="glass-btn-base glass-btn-tone-success px-3 py-2" onClick={() => void props.onApplyPending()}>{t('editor.ai.apply')}</button>
            <button className="glass-btn-base glass-btn-secondary px-3 py-2" onClick={() => void props.onDiscardPending()}>{t('editor.ai.discard')}</button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
```

- [ ] **Step 4: Implement media panel component**

Create `src/features/video-editor/components/EditorMediaPanel.tsx`:

```tsx
'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { AiEditableMediaLibrary } from '@/lib/novel-promotion/ai-editing/tool-types'

export function EditorMediaPanel(props: {
  media: AiEditableMediaLibrary | null
  onImportFile: (file: File) => void | Promise<void>
  onImportUrl: (url: string, mimeType: string) => void | Promise<void>
}) {
  const t = useTranslations('video')
  const [url, setUrl] = useState('')

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ margin: 0, fontSize: 14 }}>{t('editor.media.title')}</h3>
      <input
        type="file"
        accept="video/*,audio/*,image/*"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void props.onImportFile(file)
        }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder={t('editor.media.urlPlaceholder')} style={{ minWidth: 0, flex: 1 }} />
        <button className="glass-btn-base glass-btn-secondary px-2 py-1" onClick={() => {
          const value = url.trim()
          if (!value) return
          void props.onImportUrl(value, value.match(/\.(png|jpe?g|webp)(\?|$)/i) ? 'image/png' : value.match(/\.(mp3|wav|m4a)(\?|$)/i) ? 'audio/mpeg' : 'video/mp4')
          setUrl('')
        }}>{t('editor.media.importUrl')}</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(props.media?.entries || []).map((entry) => (
          <div key={entry.id} style={{ border: '1px solid var(--glass-stroke-base)', borderRadius: 6, padding: 8 }}>
            <div style={{ fontSize: 12 }}>{entry.label}</div>
            <div style={{ fontSize: 11, color: 'var(--glass-text-tertiary)' }}>{entry.sourceType} · {entry.status}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Add editor actions and hook**

Extend `src/features/video-editor/hooks/useEditorActions.ts`:

```ts
const listEditorMedia = useCallback(async (editorProjectId: string) => {
  const response = await apiFetch(`/api/novel-promotion/${projectId}/editor/media?episodeId=${episodeId}&editorProjectId=${editorProjectId}`)
  if (!response.ok) throw new Error('Failed to list editor media')
  return response.json()
}, [episodeId, projectId])

const importEditorFile = useCallback(async (editorProjectId: string, file: File) => {
  const form = new FormData()
  form.set('episodeId', episodeId)
  form.set('editorProjectId', editorProjectId)
  form.set('file', file)
  const response = await apiFetch(`/api/novel-promotion/${projectId}/editor/media`, { method: 'POST', body: form })
  if (!response.ok) throw new Error('Failed to import editor media')
  return response.json()
}, [episodeId, projectId])

const refineEditor = useCallback(async (editorProjectId: string, instruction: string) => {
  const response = await apiFetch(`/api/novel-promotion/${projectId}/editor/refine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ episodeId, editorProjectId, instruction }),
  })
  if (!response.ok) throw new Error('Failed to start AI refine')
  return response.json()
}, [episodeId, projectId])
```

Return these functions from the hook.

- [ ] **Step 6: Wire components into the editor stage**

Modify `src/features/video-editor/components/VideoEditorStage.tsx`:

```tsx
// Left panel contents:
<EditorMediaPanel
  media={editorMedia}
  onImportFile={(file) => importEditorFile(project.id, file).then(refreshEditorMedia)}
  onImportUrl={(url, mimeType) => importEditorUrl(project.id, url, mimeType).then(refreshEditorMedia)}
/>

// Right panel above clip properties:
<AiEditAssistant
  pendingVersion={project.pendingVersion}
  isSubmitting={aiSubmitting}
  onSubmitInstruction={(instruction) => refineEditor(project.id, instruction)}
  onApplyPending={() => applyPendingVersion(project.id, project.pendingVersion?.versionId)}
  onDiscardPending={() => discardPendingVersion(project.id)}
/>
```

Keep existing preview/timeline layout intact. Do not replace the editor UI.

- [ ] **Step 7: Run UI tests**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/video-editor/ai-edit-assistant.test.tsx tests/unit/video-editor/editor-media-panel.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/video-editor/components/AiEditAssistant.tsx src/features/video-editor/components/EditorMediaPanel.tsx src/features/video-editor/hooks/useAiEditing.ts src/features/video-editor/hooks/useEditorActions.ts src/features/video-editor/components/VideoEditorStage.tsx tests/unit/video-editor/ai-edit-assistant.test.tsx tests/unit/video-editor/editor-media-panel.test.tsx
git commit -m "Add AI editing assistant UI"
```

## Task 9: Render Regression, Guards, And Final Verification

**Files:**

- Modify: `tests/integration/api/specific/editor-render-api.test.ts`
- Modify: `tests/unit/ai-editing/timeline-validator.test.ts` if validation blocks imported media URLs.
- Modify: `docs/superpowers/specs/2026-06-22-ai-video-editing-v3-tools-design.md` only if implementation reveals a necessary design correction.

- [ ] **Step 1: Add render regression test for imported media**

Append to `tests/integration/api/specific/editor-render-api.test.ts`:

```ts
it('POST render accepts an editor project containing imported media clips', async () => {
  prismaMock.videoEditorProject.findFirst.mockResolvedValueOnce({
    id: 'editor-1',
    episodeId: 'episode-1',
    projectData: JSON.stringify({
      id: 'editor-1',
      episodeId: 'episode-1',
      schemaVersion: '1.2',
      config: { fps: 30, width: 1080, height: 1920, videoRatio: '9:16', burnSubtitlesDefault: true },
      timeline: [{
        id: 'clip-import',
        kind: 'source',
        src: '/m/import-video',
        durationInFrames: 60,
        metadata: { storyboardId: 'imported:asset-1', source: 'imported', editorAssetId: 'asset-1' },
      }],
      audioTrack: [],
      subtitleCues: [],
      editorAssets: [{ id: 'asset-1', kind: 'user_import_video', status: 'completed', url: '/m/import-video', mediaObjectId: 'media-1' }],
      bgmTrack: [],
      pendingVersion: null,
    }),
    renderStatus: null,
    renderTaskId: null,
  })

  const mod = await import('@/app/api/novel-promotion/[projectId]/editor/render/route')
  const req = buildMockRequest({
    path: '/api/novel-promotion/project-1/editor/render',
    method: 'POST',
    body: { episodeId: 'episode-1', editorProjectId: 'editor-1', format: 'mp4', quality: 'high' },
  })

  const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
  expect(res.status).toBe(202)
  expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
    type: 'editor_render',
    payload: expect.objectContaining({ editorProjectId: 'editor-1' }),
  }))
})
```

- [ ] **Step 2: Run AI editing test slice**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing tests/unit/video-editor tests/integration/api/specific/editor-media-api.test.ts tests/integration/api/specific/editor-refine-api.test.ts tests/integration/api/specific/editor-render-api.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run lint on changed files**

Run:

```bash
npm run lint -- src/lib/novel-promotion/ai-editing src/features/video-editor 'src/app/api/novel-promotion/[projectId]/editor'
```

Expected: PASS, or warnings only if the repository already allows the same warning class.

- [ ] **Step 5: Optional local smoke test with full dev server**

Run when MySQL, Redis, and MinIO are available:

```bash
docker compose up mysql redis minio -d
npx prisma db push
npm run dev
```

Open an editor URL for one episode, import a short MP4, ask:

```text
把我上传的特写插到第一段后面
```

Expected:

- Imported media appears in the editor media panel as completed.
- AI refine task completes.
- Pending summary appears.
- Applying the pending version changes the timeline.
- Export starts an `editor_render` task using the existing Remotion path.

- [ ] **Step 6: Commit final regression coverage**

```bash
git add tests/integration/api/specific/editor-render-api.test.ts tests/unit/ai-editing/timeline-validator.test.ts docs/superpowers/specs/2026-06-22-ai-video-editing-v3-tools-design.md
git commit -m "Verify AI editor imported media render path"
```

## Acceptance Criteria

- User can import video, audio, or image media into the current episode editor, and the imported asset is stored through Director storage and represented as a `MediaObject` plus `VideoEditorAsset`.
- `get_media` returns generated episode assets, transition bridge assets, render outputs, and user imports with status and eligibility.
- AI refine uses the current active project or pending draft as its base, calls tool-plan orchestration, and creates a changed pending version when safe edits are produced.
- AI refine returns a clear warning instead of a fake success when no timeline-changing tool call succeeds.
- Consecutive refine instructions build on the pending draft by default.
- User can apply, discard, and roll back AI edit versions.
- Timeline tools support insert, replace, trim/duration, move, split, remove, ripple delete, transcript, captions, inspect media, and undo in the current `VideoEditorProject` model.
- Imported and generated media render through the existing Remotion export path.
- No Palmier Pro source code, runtime dependency, Swift code, AVFoundation export path, or external MCP server is added.

## Self-Review Checklist

- Spec coverage: The plan covers generated plus imported media, Palmier-style tools, pending versions, consecutive refine, existing Remotion export, subtitle placement, and no Palmier code embedding.
- Placeholder scan: The plan contains no unresolved placeholder steps. Each task names files, test commands, expected outcomes, and concrete code or behavior.
- Type consistency: Tool names match the V3 design; `user_import_*` asset kinds are added consistently to media library, imports, editor assets, migration, executor, and UI.
- Risk check: The plan avoids replacing the editor model or renderer and keeps external/imported media behind Director storage and media probing.
