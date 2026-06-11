# AI Video Editing V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the current-episode AI editing workflow that prepares missing media, assembles a validated timeline, supports conversational refinement with version rollback, and exports MP4 with optional burned subtitles.

**Architecture:** Implement the feature as an artifact-first pipeline. Persist editor-owned media and versions outside the main editor JSON, normalize all timeline timing to frames, validate every AI plan before applying it, and route long-running work through the existing task/worker/SSE system.

**Tech Stack:** Next.js 15 route handlers, React 19, Prisma/MySQL, BullMQ, Remotion, Vitest, React Query, existing storage/media/task/billing abstractions.

---

## Scope Check

The V2 spec spans data model, backend pipeline, worker orchestration, rendering, and editor UI. These pieces are dependent, so this is one implementation plan split into ten independently testable tasks. Do not start with UI or rendering; the data model and pure timeline modules must exist first.

## File Structure

Create these backend modules:

- `src/lib/novel-promotion/ai-editing/types.ts`: server-side manifest, plan, normalized timeline, summary, and worker payload types.
- `src/lib/novel-promotion/ai-editing/dimensions.ts`: video ratio to render dimensions.
- `src/lib/novel-promotion/ai-editing/media-probe.ts`: media duration probing and fallback.
- `src/lib/novel-promotion/ai-editing/manifest.ts`: episode material manifest builder.
- `src/lib/novel-promotion/ai-editing/analyzer.ts`: deterministic pacing and continuity signals.
- `src/lib/novel-promotion/ai-editing/plan-schema.ts`: strict edit-plan parsing and validation helpers.
- `src/lib/novel-promotion/ai-editing/timeline-validator.ts`: validates and normalizes AI plans.
- `src/lib/novel-promotion/ai-editing/conservative-timeline.ts`: story-order fallback timeline.
- `src/lib/novel-promotion/ai-editing/project.ts`: project data migration and serialization helpers.
- `src/lib/novel-promotion/ai-editing/editor-assets.ts`: editor asset persistence helpers.
- `src/lib/novel-promotion/ai-editing/versions.ts`: version history helpers.
- `src/lib/novel-promotion/ai-editing/planner.ts`: LLM edit-plan generation and repair.
- `src/lib/novel-promotion/ai-editing/assemble.ts`: initial AI edit orchestration.
- `src/lib/novel-promotion/ai-editing/refine.ts`: natural-language refinement orchestration.
- `src/lib/novel-promotion/ai-editing/bridge.ts`: transition bridge request and persistence helpers.
- `src/lib/novel-promotion/ai-editing/render-snapshot.ts`: freezes render inputs.
- `src/lib/workers/handlers/ai-edit-assemble.ts`: text worker handler for `AI_EDIT_ASSEMBLE`.
- `src/lib/workers/handlers/ai-edit-refine.ts`: text worker handler for `AI_EDIT_REFINE`.
- `src/lib/workers/handlers/ai-edit-transition-bridge.ts`: video worker handler for editor transition bridges.
- `src/lib/workers/render.worker.ts`: dedicated render worker for `EDITOR_RENDER`.
- `src/app/api/novel-promotion/[projectId]/editor/ai-edit/route.ts`: starts AI assemble.
- `src/app/api/novel-promotion/[projectId]/editor/refine/route.ts`: starts AI refine.
- `src/app/api/novel-promotion/[projectId]/editor/refine/apply/route.ts`: applies pending version.
- `src/app/api/novel-promotion/[projectId]/editor/versions/route.ts`: lists versions.
- `src/app/api/novel-promotion/[projectId]/editor/rollback/route.ts`: rolls back to a version.
- `src/app/api/novel-promotion/[projectId]/editor/render/route.ts`: starts render and reads render status.

Modify these existing files:

- `prisma/schema.prisma`
- `prisma/schema.sqlit.prisma`
- `src/lib/task/types.ts`
- `src/lib/task/queues.ts`
- `src/lib/task/presentation.ts`
- `src/lib/task/intent.ts`
- `src/lib/task/progress-message.ts`
- `src/lib/billing/task-policy.ts`
- `src/lib/workers/index.ts`
- `src/lib/workers/text.worker.ts`
- `src/lib/workers/video.worker.ts`
- `src/app/api/novel-promotion/[projectId]/editor/route.ts`
- `src/features/video-editor/types/editor.types.ts`
- `src/features/video-editor/utils/migration.ts`
- `src/features/video-editor/utils/time-utils.ts`
- `src/features/video-editor/remotion/VideoComposition.tsx`
- `src/features/video-editor/components/Preview/RemotionPreview.tsx`
- `src/features/video-editor/hooks/useEditorActions.ts`
- `src/features/video-editor/hooks/useEditorState.ts`
- `src/features/video-editor/components/VideoEditorStage.tsx`
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/EditorStageRoute.tsx`
- `src/lib/query/keys.ts`
- `src/lib/query/hooks/useSSE.ts`

Create focused tests:

- `tests/unit/ai-editing/dimensions.test.ts`
- `tests/unit/ai-editing/project-migration.test.ts`
- `tests/unit/ai-editing/media-probe.test.ts`
- `tests/unit/ai-editing/analyzer.test.ts`
- `tests/unit/ai-editing/timeline-validator.test.ts`
- `tests/unit/ai-editing/versions.test.ts`
- `tests/unit/ai-editing/conservative-timeline.test.ts`
- `tests/unit/worker/ai-edit-assemble.test.ts`
- `tests/unit/worker/ai-edit-refine.test.ts`
- `tests/unit/worker/ai-edit-transition-bridge.test.ts`
- `tests/unit/worker/render-worker.test.ts`
- `tests/integration/api/specific/editor-project-auth.test.ts`
- `tests/integration/api/specific/editor-ai-edit-api.test.ts`
- `tests/integration/api/specific/editor-refine-api.test.ts`
- `tests/integration/api/specific/editor-render-api.test.ts`
- `tests/system/ai-editing.system.test.ts`

## Task 1: Prisma Models, Task Types, Queues

**Files:**

- Modify: `prisma/schema.prisma`
- Modify: `prisma/schema.sqlit.prisma`
- Modify: `src/lib/task/types.ts`
- Modify: `src/lib/task/queues.ts`
- Modify: `src/lib/task/intent.ts`
- Modify: `src/lib/task/progress-message.ts`
- Modify: `src/lib/task/presentation.ts`
- Modify: `src/lib/billing/task-policy.ts`
- Modify: `src/lib/workers/index.ts`
- Create: `src/lib/workers/render.worker.ts`
- Test: `tests/unit/task/queue-names.test.ts`
- Test: `tests/unit/billing/task-policy.test.ts`

- [x] **Step 1: Write failing queue and billing tests**

Add these assertions to `tests/unit/task/queue-names.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getQueueTypeByTaskType, QUEUE_NAME } from '@/lib/task/queues'
import { TASK_TYPE } from '@/lib/task/types'

describe('task queue names', () => {
  it('routes AI editing task types to their worker queues', () => {
    expect(getQueueTypeByTaskType(TASK_TYPE.AI_EDIT_ASSEMBLE)).toBe('text')
    expect(getQueueTypeByTaskType(TASK_TYPE.AI_EDIT_REFINE)).toBe('text')
    expect(getQueueTypeByTaskType(TASK_TYPE.AI_EDIT_TRANSITION_BRIDGE)).toBe('video')
    expect(getQueueTypeByTaskType(TASK_TYPE.EDITOR_RENDER)).toBe('render')
    expect(QUEUE_NAME.RENDER).toBe('director-render')
  })
})
```

Add these assertions to `tests/unit/billing/task-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildDefaultTaskBillingInfo, isBillableTaskType } from '@/lib/billing'
import { TASK_TYPE } from '@/lib/task/types'

describe('AI editing billing policy', () => {
  it('bills assemble and refine as text planning tasks', () => {
    const payload = { analysisModel: 'openrouter::anthropic/claude-sonnet-4', maxInputTokens: 3000, maxOutputTokens: 1200 }

    expect(isBillableTaskType(TASK_TYPE.AI_EDIT_ASSEMBLE)).toBe(true)
    expect(isBillableTaskType(TASK_TYPE.AI_EDIT_REFINE)).toBe(true)
    expect(buildDefaultTaskBillingInfo(TASK_TYPE.AI_EDIT_ASSEMBLE, payload)).toMatchObject({
      billable: true,
      apiType: 'text',
      taskType: TASK_TYPE.AI_EDIT_ASSEMBLE,
    })
    expect(buildDefaultTaskBillingInfo(TASK_TYPE.AI_EDIT_REFINE, payload)).toMatchObject({
      billable: true,
      apiType: 'text',
      taskType: TASK_TYPE.AI_EDIT_REFINE,
    })
  })

  it('bills bridge generation as video and keeps render non-billable', () => {
    const payload = { videoModel: 'fal::fal-ai/kling-video/v2.1/master/image-to-video', generationOptions: { duration: 1 } }

    expect(isBillableTaskType(TASK_TYPE.AI_EDIT_TRANSITION_BRIDGE)).toBe(true)
    expect(buildDefaultTaskBillingInfo(TASK_TYPE.AI_EDIT_TRANSITION_BRIDGE, payload)).toMatchObject({
      billable: true,
      apiType: 'video',
      taskType: TASK_TYPE.AI_EDIT_TRANSITION_BRIDGE,
    })
    expect(isBillableTaskType(TASK_TYPE.EDITOR_RENDER)).toBe(false)
    expect(buildDefaultTaskBillingInfo(TASK_TYPE.EDITOR_RENDER, {})).toBeNull()
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/task/queue-names.test.ts tests/unit/billing/task-policy.test.ts
```

Expected: FAIL with missing `TASK_TYPE.AI_EDIT_ASSEMBLE` or queue `render`.

- [x] **Step 3: Add Prisma models**

Add these models to both Prisma schemas, next to `VideoEditorProject`:

```prisma
model VideoEditorAsset {
  id              String             @id @default(uuid())
  editorProjectId String
  episodeId       String
  kind            String
  mediaObjectId   String?
  url             String?            @db.Text
  status          String             @default("pending")
  taskId          String?
  sourceClipIds   String?            @db.Text
  sourcePanelIds  String?            @db.Text
  metadata        String?            @db.Text
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @default(now()) @updatedAt
  editorProject   VideoEditorProject @relation(fields: [editorProjectId], references: [id], onDelete: Cascade)
  episode         NovelPromotionEpisode @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  mediaObject     MediaObject?       @relation(fields: [mediaObjectId], references: [id], onDelete: SetNull)

  @@index([editorProjectId])
  @@index([episodeId])
  @@index([taskId])
  @@map("video_editor_assets")
}

model VideoEditorProjectVersion {
  id              String             @id @default(uuid())
  editorProjectId String
  versionIndex    Int
  reason          String
  summary         String             @db.Text
  snapshotJson    String             @db.Text
  diffJson        String?            @db.Text
  createdByTaskId String?
  createdAt       DateTime           @default(now())
  editorProject   VideoEditorProject @relation(fields: [editorProjectId], references: [id], onDelete: Cascade)

  @@unique([editorProjectId, versionIndex])
  @@index([editorProjectId])
  @@map("video_editor_project_versions")
}
```

Add relations to `VideoEditorProject`, `NovelPromotionEpisode`, and `MediaObject`:

```prisma
assets   VideoEditorAsset[]
versions VideoEditorProjectVersion[]
```

For `NovelPromotionEpisode`, add:

```prisma
editorAssets VideoEditorAsset[]
```

For `MediaObject`, add:

```prisma
videoEditorAssets VideoEditorAsset[]
```

- [x] **Step 4: Add task types and render queue**

In `src/lib/task/types.ts`, add:

```ts
AI_EDIT_ASSEMBLE: 'ai_edit_assemble',
AI_EDIT_REFINE: 'ai_edit_refine',
AI_EDIT_TRANSITION_BRIDGE: 'ai_edit_transition_bridge',
EDITOR_RENDER: 'editor_render',
```

Change `QueueType` to:

```ts
export type QueueType = 'image' | 'video' | 'voice' | 'text' | 'render'
```

In `src/lib/task/queues.ts`, add `QUEUE_NAME.RENDER`, `renderQueue`, include it in `ALL_QUEUES`, route `AI_EDIT_TRANSITION_BRIDGE` to video, and route `EDITOR_RENDER` to render:

```ts
export const QUEUE_NAME = {
  IMAGE: 'director-image',
  VIDEO: 'director-video',
  VOICE: 'director-voice',
  TEXT: 'director-text',
  RENDER: 'director-render',
} as const

export const renderQueue = new Queue<TaskJobData>(QUEUE_NAME.RENDER, {
  connection: queueRedis,
  defaultJobOptions,
})
```

- [x] **Step 5: Add render worker stub**

Create `src/lib/workers/render.worker.ts`:

```ts
import { Worker } from 'bullmq'
import { queueRedis } from '@/lib/redis'
import { QUEUE_NAME } from '@/lib/task/queues'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { reportTaskProgress, withTaskLifecycle } from './shared'

async function processRenderTask(job: { data: TaskJobData }) {
  await reportTaskProgress(job as never, 5, { stage: 'received' })
  if (job.data.type !== TASK_TYPE.EDITOR_RENDER) {
    throw new Error(`Unsupported render task type: ${job.data.type}`)
  }
  throw new Error('EDITOR_RENDER_HANDLER_NOT_IMPLEMENTED')
}

export function createRenderWorker() {
  return new Worker<TaskJobData>(
    QUEUE_NAME.RENDER,
    async (job) => await withTaskLifecycle(job, processRenderTask),
    {
      connection: queueRedis,
      concurrency: Number.parseInt(process.env.QUEUE_CONCURRENCY_RENDER || '1', 10) || 1,
    },
  )
}
```

Add `createRenderWorker()` to `src/lib/workers/index.ts`.

- [x] **Step 6: Update task intent, progress label, and billing policy**

In `src/lib/billing/task-policy.ts`, add assemble/refine/bridge to `BILLABLE_TASK_TYPES`; add `AI_EDIT_TRANSITION_BRIDGE` to the video branch and assemble/refine to the text branch. Do not add `EDITOR_RENDER` to billable types.

In `src/lib/task/intent.ts`, map:

```ts
case TASK_TYPE.AI_EDIT_ASSEMBLE:
case TASK_TYPE.AI_EDIT_REFINE:
  return 'text'
case TASK_TYPE.AI_EDIT_TRANSITION_BRIDGE:
case TASK_TYPE.EDITOR_RENDER:
  return 'video'
```

In `src/lib/task/progress-message.ts`, add readable labels:

```ts
[TASK_TYPE.AI_EDIT_ASSEMBLE]: 'AI剪辑',
[TASK_TYPE.AI_EDIT_REFINE]: 'AI剪辑微调',
[TASK_TYPE.AI_EDIT_TRANSITION_BRIDGE]: 'AI转场',
[TASK_TYPE.EDITOR_RENDER]: '导出视频',
```

- [x] **Step 7: Run focused tests**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/task/queue-names.test.ts tests/unit/billing/task-policy.test.ts
```

Expected: PASS.

- [x] **Step 8: Push Prisma schema to test DB**

Run:

```bash
docker compose -f docker-compose.test.yml up -d mysql redis
DATABASE_URL='mysql://root:root@127.0.0.1:3307/director_test' npx prisma db push --skip-generate --schema prisma/schema.prisma
```

Expected: Prisma reports the database is in sync.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/schema.sqlit.prisma src/lib/task src/lib/billing/task-policy.ts src/lib/workers/index.ts src/lib/workers/render.worker.ts tests/unit/task/queue-names.test.ts tests/unit/billing/task-policy.test.ts
git commit -m "Add AI editing task and persistence foundations"
```

## Task 2: Editor Project 1.2 Types And Migration

**Files:**

- Modify: `src/features/video-editor/types/editor.types.ts`
- Modify: `src/features/video-editor/utils/migration.ts`
- Modify: `src/features/video-editor/utils/time-utils.ts`
- Create: `src/features/video-editor/utils/dimensions.ts`
- Test: `tests/unit/ai-editing/dimensions.test.ts`
- Test: `tests/unit/ai-editing/project-migration.test.ts`

- [x] **Step 1: Write failing dimension and migration tests**

Create `tests/unit/ai-editing/dimensions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dimensionsForVideoRatio } from '@/features/video-editor/utils/dimensions'

describe('editor dimensions', () => {
  it.each([
    ['16:9', 1920, 1080],
    ['9:16', 1080, 1920],
    ['1:1', 1080, 1080],
    ['4:3', 1440, 1080],
  ])('maps %s to stable render dimensions', (ratio, width, height) => {
    expect(dimensionsForVideoRatio(ratio)).toEqual({ width, height })
  })

  it('falls back to 16:9 for unknown ratios', () => {
    expect(dimensionsForVideoRatio('unknown')).toEqual({ width: 1920, height: 1080 })
  })
})
```

Create `tests/unit/ai-editing/project-migration.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { migrateProjectData } from '@/features/video-editor/utils/migration'

describe('editor project migration', () => {
  it('migrates schema 1.0 projects to schema 1.2 without reordering clips', () => {
    const migrated = migrateProjectData({
      id: 'editor-1',
      episodeId: 'episode-1',
      schemaVersion: '1.0',
      config: { fps: 30, width: 1920, height: 1080 },
      timeline: [{
        id: 'clip-1',
        src: '/m/video',
        durationInFrames: 90,
        trim: { from: 10, to: 80 },
        attachment: {
          audio: { src: '/m/audio', volume: 1, voiceLineId: 'voice-1' },
          subtitle: { text: 'hello', style: 'default' },
        },
        metadata: { panelId: 'panel-1', storyboardId: 'storyboard-1', description: 'desc' },
      }],
      bgmTrack: [],
    })

    expect(migrated.schemaVersion).toBe('1.2')
    expect(migrated.timeline[0]).toMatchObject({
      id: 'clip-1',
      kind: 'source',
      sourceTrim: { fromFrame: 10, toFrame: 80 },
      metadata: {
        sourcePanelId: 'panel-1',
        storyboardId: 'storyboard-1',
      },
    })
    expect(migrated.audioTrack).toHaveLength(1)
    expect(migrated.subtitleCues).toEqual([expect.objectContaining({
      text: 'hello',
      startFrame: 0,
      endFrame: 90,
      sourcePanelId: 'panel-1',
      sourceVoiceLineId: 'voice-1',
    })])
    expect(migrated.editorAssets).toEqual([])
    expect(migrated.pendingVersion).toBeNull()
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing/dimensions.test.ts tests/unit/ai-editing/project-migration.test.ts
```

Expected: FAIL because `dimensionsForVideoRatio` and schema `1.2` are missing.

- [x] **Step 3: Update editor types**

Change `VideoEditorProject` in `src/features/video-editor/types/editor.types.ts` to include:

```ts
export type VideoEditorSchemaVersion = '1.0' | '1.2'
export type VideoClipKind = 'source' | 'transition_bridge'
export type VideoClipSource = 'panel' | 'lip_sync' | 'ai_transition'

export interface VideoEditorProject {
  id: string
  episodeId: string
  schemaVersion: '1.2'
  config: EditorConfig
  timeline: VideoClip[]
  audioTrack: AudioAttachment[]
  subtitleCues: SubtitleCue[]
  editorAssets: EditorAssetRef[]
  bgmTrack: BgmClip[]
  pendingVersion: PendingEditorVersion | null
}
```

Add `SubtitleCue`, `AudioAttachment`, `EditorAssetRef`, `PendingEditorVersion`, and change clip `trim` to `sourceTrim`:

```ts
export interface VideoClip {
  id: string
  kind: VideoClipKind
  src: string
  durationInFrames: number
  sourceTrim?: { fromFrame: number; toFrame: number }
  transition?: ClipTransition
  metadata: ClipMetadata
}

export interface SubtitleCue {
  id: string
  text: string
  startFrame: number
  endFrame: number
  sourcePanelId?: string
  sourceVoiceLineId?: string
  style: 'default' | 'cinematic'
  truncated?: boolean
}

export interface AudioAttachment {
  id: string
  src: string
  startFrame: number
  durationInFrames: number
  sourceVoiceLineId?: string
  sourcePanelId?: string
  clipId?: string
  volume: number
  truncated?: boolean
}
```

- [x] **Step 4: Add dimensions helper**

Create `src/features/video-editor/utils/dimensions.ts`:

```ts
export type RenderDimensions = { width: number; height: number }

const DIMENSIONS_BY_RATIO: Record<string, RenderDimensions> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
}

export function dimensionsForVideoRatio(videoRatio: string | null | undefined): RenderDimensions {
  return DIMENSIONS_BY_RATIO[videoRatio || ''] || DIMENSIONS_BY_RATIO['16:9']
}
```

- [x] **Step 5: Implement migration**

In `src/features/video-editor/utils/migration.ts`, convert `1.0` projects to `1.2`. Use stable IDs derived from clip IDs:

```ts
function migrateOnePointZero(project: Record<string, unknown>): VideoEditorProject {
  const timeline = Array.isArray(project.timeline) ? project.timeline as Array<Record<string, unknown>> : []
  const audioTrack: AudioAttachment[] = []
  const subtitleCues: SubtitleCue[] = []

  const migratedTimeline = timeline.map((clip, index): VideoClip => {
    const clipId = typeof clip.id === 'string' ? clip.id : `clip_${index}`
    const durationInFrames = typeof clip.durationInFrames === 'number' ? clip.durationInFrames : 90
    const attachment = clip.attachment && typeof clip.attachment === 'object'
      ? clip.attachment as Record<string, unknown>
      : {}
    const metadata = clip.metadata && typeof clip.metadata === 'object'
      ? clip.metadata as Record<string, unknown>
      : {}
    const sourcePanelId = typeof metadata.panelId === 'string' ? metadata.panelId : undefined
    const sourceVoiceLineId = typeof (attachment.audio as { voiceLineId?: unknown } | undefined)?.voiceLineId === 'string'
      ? (attachment.audio as { voiceLineId: string }).voiceLineId
      : undefined

    if (attachment.audio && typeof attachment.audio === 'object') {
      const audio = attachment.audio as Record<string, unknown>
      if (typeof audio.src === 'string' && audio.src) {
        audioTrack.push({
          id: `audio_${clipId}`,
          src: audio.src,
          startFrame: 0,
          durationInFrames,
          sourceVoiceLineId,
          sourcePanelId,
          clipId,
          volume: typeof audio.volume === 'number' ? audio.volume : 1,
        })
      }
    }

    if (attachment.subtitle && typeof attachment.subtitle === 'object') {
      const subtitle = attachment.subtitle as Record<string, unknown>
      if (typeof subtitle.text === 'string' && subtitle.text) {
        subtitleCues.push({
          id: `subtitle_${clipId}`,
          text: subtitle.text,
          startFrame: 0,
          endFrame: durationInFrames,
          sourcePanelId,
          sourceVoiceLineId,
          style: subtitle.style === 'cinematic' ? 'cinematic' : 'default',
        })
      }
    }

    return {
      id: clipId,
      kind: 'source',
      src: typeof clip.src === 'string' ? clip.src : '',
      durationInFrames,
      sourceTrim: normalizeLegacyTrim(clip.trim),
      transition: normalizeTransition(clip.transition),
      metadata: {
        sourcePanelId,
        storyboardId: typeof metadata.storyboardId === 'string' ? metadata.storyboardId : '',
        voiceLineId: sourceVoiceLineId,
        storyOrder: index,
        source: 'panel',
        description: typeof metadata.description === 'string' ? metadata.description : undefined,
      },
    }
  })

  return {
    id: typeof project.id === 'string' ? project.id : `editor_${Date.now()}`,
    episodeId: typeof project.episodeId === 'string' ? project.episodeId : '',
    schemaVersion: '1.2',
    config: normalizeConfig(project.config),
    timeline: migratedTimeline,
    audioTrack,
    subtitleCues,
    editorAssets: [],
    bgmTrack: Array.isArray(project.bgmTrack) ? project.bgmTrack as BgmClip[] : [],
    pendingVersion: null,
  }
}
```

- [x] **Step 6: Update default project and time utilities**

Use `dimensionsForVideoRatio` in `createDefaultProject`. Keep `calculateTimelineDuration` and `computeClipPositions` working with `sourceTrim`.

- [x] **Step 7: Run focused tests**

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing/dimensions.test.ts tests/unit/ai-editing/project-migration.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/video-editor tests/unit/ai-editing
git commit -m "Add editor project schema 1.2 migration"
```

## Task 3: Pure AI Editing Core Modules

**Files:**

- Create: `src/lib/novel-promotion/ai-editing/types.ts`
- Create: `src/lib/novel-promotion/ai-editing/dimensions.ts`
- Create: `src/lib/novel-promotion/ai-editing/media-probe.ts`
- Create: `src/lib/novel-promotion/ai-editing/analyzer.ts`
- Create: `src/lib/novel-promotion/ai-editing/plan-schema.ts`
- Create: `src/lib/novel-promotion/ai-editing/timeline-validator.ts`
- Create: `src/lib/novel-promotion/ai-editing/conservative-timeline.ts`
- Test: `tests/unit/ai-editing/media-probe.test.ts`
- Test: `tests/unit/ai-editing/analyzer.test.ts`
- Test: `tests/unit/ai-editing/timeline-validator.test.ts`
- Test: `tests/unit/ai-editing/conservative-timeline.test.ts`

- [x] **Step 1: Write failing core module tests**

Create `tests/unit/ai-editing/analyzer.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { analyzeEditorManifest } from '@/lib/novel-promotion/ai-editing/analyzer'

describe('AI editing deterministic analyzer', () => {
  it('flags duration mismatch, duplicate media, and missing continuity', () => {
    const result = analyzeEditorManifest({
      fps: 30,
      clips: [
        { clipId: 'clip-1', sourcePanelId: 'panel-1', storyOrder: 0, durationInFrames: 300, videoUrl: '/m/a', voiceDurationInFrames: 60, linkedToNextPanel: false, description: 'same' },
        { clipId: 'clip-2', sourcePanelId: 'panel-2', storyOrder: 1, durationInFrames: 30, videoUrl: '/m/a', voiceDurationInFrames: 90, linkedToNextPanel: false, description: 'same' },
      ],
    })

    expect(result.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'duration_mismatch', clipId: 'clip-1' }),
      expect.objectContaining({ type: 'duplicate_source_url', clipId: 'clip-2' }),
      expect.objectContaining({ type: 'continuity_gap', clipId: 'clip-1' }),
    ]))
  })
})
```

Create `tests/unit/ai-editing/timeline-validator.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { validateEditPlan } from '@/lib/novel-promotion/ai-editing/timeline-validator'

const manifest = {
  episodeId: 'episode-1',
  fps: 30,
  dimensions: { width: 1080, height: 1920 },
  clips: [{
    clipId: 'clip-1',
    sourcePanelId: 'panel-1',
    storyboardId: 'storyboard-1',
    storyOrder: 0,
    videoUrl: '/m/video',
    durationInFrames: 90,
    linkedToNextPanel: true,
  }],
  voiceLines: [{ id: 'voice-1', sourcePanelId: 'panel-1', audioUrl: '/m/audio', durationInFrames: 60, text: 'line' }],
  editorAssets: [],
} as const

describe('AI editing timeline validator', () => {
  it('rejects unknown media URLs', () => {
    const result = validateEditPlan(manifest, {
      clips: [{ clipId: 'clip-x', sourcePanelId: 'panel-1', src: 'https://evil.invalid/x.mp4', trim: { fromFrame: 0, toFrame: 10 } }],
      audio: [],
      subtitles: [],
      transitions: [],
      summary: 'bad url',
      risks: [],
    })

    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'MEDIA_URL_NOT_IN_MANIFEST' }))
  })

  it('rejects orphan subtitle cues', () => {
    const result = validateEditPlan(manifest, {
      clips: [{ clipId: 'clip-1', sourcePanelId: 'panel-1', src: '/m/video', trim: { fromFrame: 0, toFrame: 60 } }],
      audio: [],
      subtitles: [{ id: 'sub-1', text: 'orphan', startFrame: 0, endFrame: 10, sourcePanelId: 'missing-panel' }],
      transitions: [],
      summary: 'orphan subtitle',
      risks: [],
    })

    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'SUBTITLE_SOURCE_NOT_IN_EPISODE' }))
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing/analyzer.test.ts tests/unit/ai-editing/timeline-validator.test.ts
```

Expected: FAIL because modules are missing.

- [x] **Step 3: Implement shared AI editing types**

In `src/lib/novel-promotion/ai-editing/types.ts`, export:

```ts
export type EditorManifestClip = {
  clipId: string
  sourcePanelId: string
  storyboardId?: string
  storyOrder: number
  videoUrl: string
  durationInFrames: number
  voiceDurationInFrames?: number
  linkedToNextPanel?: boolean
  description?: string
}

export type EditorManifest = {
  episodeId: string
  fps: number
  dimensions: { width: number; height: number }
  clips: EditorManifestClip[]
  voiceLines: Array<{
    id: string
    sourcePanelId?: string
    audioUrl?: string | null
    durationInFrames?: number
    text: string
  }>
  editorAssets: Array<{
    id: string
    kind: 'transition_bridge' | 'render_output'
    url: string
    durationInFrames?: number
  }>
}

export type EditPlan = {
  clips: Array<{
    clipId: string
    sourcePanelId: string
    src: string
    trim: { fromFrame: number; toFrame: number }
    transition?: { type: 'none' | 'dissolve' | 'fade' | 'slide'; durationInFrames: number }
  }>
  audio: Array<{
    sourceVoiceLineId: string
    sourcePanelId?: string
    startFrame: number
    durationInFrames: number
    src: string
  }>
  subtitles: Array<{
    id: string
    text: string
    startFrame: number
    endFrame: number
    sourcePanelId?: string
    sourceVoiceLineId?: string
    truncated?: boolean
  }>
  transitions: Array<{ afterClipId: string; type: 'none' | 'dissolve' | 'fade' | 'slide'; durationInFrames: number }>
  summary: string
  risks: string[]
}
```

- [x] **Step 4: Implement analyzer**

In `analyzer.ts`, implement signals with these codes:

```ts
export type AnalyzerSignalType =
  | 'duration_mismatch'
  | 'very_short_clip'
  | 'very_long_clip'
  | 'continuity_gap'
  | 'duplicate_source_url'
  | 'repeated_description'

export function analyzeEditorManifest(input: { fps: number; clips: EditorManifestClip[] }) {
  const signals: Array<{ type: AnalyzerSignalType; clipId: string; message: string }> = []
  const seenUrls = new Set<string>()
  const seenDescriptions = new Set<string>()

  for (let index = 0; index < input.clips.length; index += 1) {
    const clip = input.clips[index]
    if (typeof clip.voiceDurationInFrames === 'number' && Math.abs(clip.durationInFrames - clip.voiceDurationInFrames) > input.fps * 2) {
      signals.push({ type: 'duration_mismatch', clipId: clip.clipId, message: 'Video and voice durations differ by more than 2 seconds.' })
    }
    if (clip.durationInFrames < input.fps) {
      signals.push({ type: 'very_short_clip', clipId: clip.clipId, message: 'Clip is shorter than 1 second.' })
    }
    if (clip.durationInFrames > input.fps * 8) {
      signals.push({ type: 'very_long_clip', clipId: clip.clipId, message: 'Clip is longer than 8 seconds.' })
    }
    if (index < input.clips.length - 1 && clip.linkedToNextPanel !== true) {
      signals.push({ type: 'continuity_gap', clipId: clip.clipId, message: 'Adjacent panels do not have first-last-frame continuity.' })
    }
    if (seenUrls.has(clip.videoUrl)) {
      signals.push({ type: 'duplicate_source_url', clipId: clip.clipId, message: 'Clip repeats a source video URL.' })
    }
    seenUrls.add(clip.videoUrl)
    const normalizedDescription = (clip.description || '').trim().toLowerCase()
    if (normalizedDescription && seenDescriptions.has(normalizedDescription)) {
      signals.push({ type: 'repeated_description', clipId: clip.clipId, message: 'Clip repeats a prior description.' })
    }
    if (normalizedDescription) seenDescriptions.add(normalizedDescription)
  }

  return { signals }
}
```

- [x] **Step 5: Implement validator**

In `timeline-validator.ts`, return a discriminated result:

```ts
export type ValidationError = { code: string; message: string; path?: string }
export type ValidationResult =
  | { ok: true; project: VideoEditorProject; warnings: string[] }
  | { ok: false; errors: ValidationError[] }
```

Validation must check:

- media URL belongs to manifest clips or editor assets
- panel IDs belong to manifest clips
- trim range is non-negative and inside clip duration
- subtitle source panel belongs to manifest
- subtitle end is after start
- transition duration is between 0 and `fps`
- local reorder moves a clip by no more than 2 positions unless the plan has a risk string containing `local_reorder_accepted`

- [x] **Step 6: Implement conservative timeline**

In `conservative-timeline.ts`, build a story-order `VideoEditorProject` from manifest clips. It must:

- sort by `storyOrder`
- keep every source clip
- create audio attachments for voice lines with audio URLs
- create subtitle cues from voice line text when matched
- use `dissolve` transitions of `Math.round(fps / 2)` between source clips

- [x] **Step 7: Run focused tests**

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing/analyzer.test.ts tests/unit/ai-editing/timeline-validator.test.ts tests/unit/ai-editing/conservative-timeline.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/novel-promotion/ai-editing tests/unit/ai-editing
git commit -m "Add AI editing timeline core"
```

## Task 4: Manifest Builder, Media Probe, Editor Assets, Versions

**Files:**

- Create: `src/lib/novel-promotion/ai-editing/media-probe.ts`
- Create: `src/lib/novel-promotion/ai-editing/manifest.ts`
- Create: `src/lib/novel-promotion/ai-editing/editor-assets.ts`
- Create: `src/lib/novel-promotion/ai-editing/versions.ts`
- Test: `tests/unit/ai-editing/media-probe.test.ts`
- Test: `tests/unit/ai-editing/versions.test.ts`
- Test: `tests/integration/api/specific/editor-project-auth.test.ts`

- [x] **Step 1: Write failing media probe and version tests**

Create `tests/unit/ai-editing/media-probe.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { resolveDurationFrames } from '@/lib/novel-promotion/ai-editing/media-probe'

describe('AI editing media probe', () => {
  it('uses stored media duration before fallback duration', async () => {
    const result = await resolveDurationFrames({
      fps: 30,
      mediaDurationMs: 2500,
      fallbackSeconds: 10,
      probeUrl: '/m/video',
      probe: vi.fn(),
    })

    expect(result).toEqual({ durationInFrames: 75, source: 'media_object' })
  })

  it('falls back to panel duration when probing fails', async () => {
    const result = await resolveDurationFrames({
      fps: 30,
      mediaDurationMs: null,
      fallbackSeconds: 4,
      probeUrl: '/m/video',
      probe: vi.fn(async () => null),
    })

    expect(result).toEqual({ durationInFrames: 120, source: 'fallback' })
  })
})
```

Create `tests/unit/ai-editing/versions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { nextVersionIndex, trimVersionRowsForCap } from '@/lib/novel-promotion/ai-editing/versions'

describe('editor versions', () => {
  it('increments version indexes from existing rows', () => {
    expect(nextVersionIndex([{ versionIndex: 1 }, { versionIndex: 2 }])).toBe(3)
  })

  it('selects oldest rows beyond cap for deletion', () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({ id: `v-${index + 1}`, versionIndex: index + 1 }))

    expect(trimVersionRowsForCap(rows, 10)).toEqual(['v-1', 'v-2'])
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing/media-probe.test.ts tests/unit/ai-editing/versions.test.ts
```

Expected: FAIL because modules are missing.

- [x] **Step 3: Implement media probe**

`resolveDurationFrames` is pure and testable. Add a server probe wrapper that uses `node:child_process` `execFile` for `ffprobe`, but make the probe function injectable:

```ts
export async function resolveDurationFrames(input: {
  fps: number
  mediaDurationMs?: number | null
  fallbackSeconds?: number | null
  probeUrl?: string | null
  probe?: (url: string) => Promise<number | null>
}) {
  if (typeof input.mediaDurationMs === 'number' && input.mediaDurationMs > 0) {
    return { durationInFrames: Math.max(1, Math.round((input.mediaDurationMs / 1000) * input.fps)), source: 'media_object' as const }
  }
  if (input.probeUrl && input.probe) {
    const probedMs = await input.probe(input.probeUrl)
    if (typeof probedMs === 'number' && probedMs > 0) {
      return { durationInFrames: Math.max(1, Math.round((probedMs / 1000) * input.fps)), source: 'probe' as const }
    }
  }
  const seconds = typeof input.fallbackSeconds === 'number' && input.fallbackSeconds > 0 ? input.fallbackSeconds : 3
  return { durationInFrames: Math.max(1, Math.round(seconds * input.fps)), source: 'fallback' as const }
}
```

- [x] **Step 4: Implement editor asset helper**

In `editor-assets.ts`, add helpers:

```ts
export async function createPendingEditorAsset(input: {
  editorProjectId: string
  episodeId: string
  kind: 'transition_bridge' | 'render_output'
  sourceClipIds: string[]
  sourcePanelIds: string[]
  metadata?: Record<string, unknown>
}) {
  return await prisma.videoEditorAsset.create({
    data: {
      editorProjectId: input.editorProjectId,
      episodeId: input.episodeId,
      kind: input.kind,
      status: 'pending',
      sourceClipIds: JSON.stringify(input.sourceClipIds),
      sourcePanelIds: JSON.stringify(input.sourcePanelIds),
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  })
}
```

Add `completeEditorAsset` to set `status`, `mediaObjectId`, `url`, `durationMs`, and `taskId`.

- [x] **Step 5: Implement version helpers**

In `versions.ts`, add pure helpers from the test and DB helpers:

```ts
export function nextVersionIndex(rows: Array<{ versionIndex: number }>) {
  return rows.reduce((max, row) => Math.max(max, row.versionIndex), 0) + 1
}

export function trimVersionRowsForCap(rows: Array<{ id: string; versionIndex: number }>, cap = 10) {
  return [...rows]
    .sort((a, b) => a.versionIndex - b.versionIndex)
    .slice(0, Math.max(0, rows.length - cap))
    .map((row) => row.id)
}
```

Add `createEditorVersion`, `listEditorVersions`, `restoreEditorVersion`.

- [x] **Step 6: Implement manifest builder**

In `manifest.ts`, query the authorized episode with storyboards, panels, voice lines, editor project, and editor assets. The builder must return only current-episode panel IDs and voice IDs. Use `dimensionsForVideoRatio` and `resolveDurationFrames`.

- [x] **Step 7: Run focused tests**

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing/media-probe.test.ts tests/unit/ai-editing/versions.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/novel-promotion/ai-editing tests/unit/ai-editing
git commit -m "Add AI editing manifest persistence helpers"
```

## Task 5: Harden Editor Project API And Add Start Routes

**Files:**

- Modify: `src/app/api/novel-promotion/[projectId]/editor/route.ts`
- Create: `src/app/api/novel-promotion/[projectId]/editor/ai-edit/route.ts`
- Create: `src/app/api/novel-promotion/[projectId]/editor/refine/route.ts`
- Create: `src/app/api/novel-promotion/[projectId]/editor/refine/apply/route.ts`
- Create: `src/app/api/novel-promotion/[projectId]/editor/versions/route.ts`
- Create: `src/app/api/novel-promotion/[projectId]/editor/rollback/route.ts`
- Test: `tests/integration/api/specific/editor-project-auth.test.ts`
- Test: `tests/integration/api/specific/editor-ai-edit-api.test.ts`
- Test: `tests/integration/api/specific/editor-refine-api.test.ts`

- [ ] **Step 1: Write failing auth test**

Create `tests/integration/api/specific/editor-project-auth.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { GET, PUT } from '@/app/api/novel-promotion/[projectId]/editor/route'
import { callRoute } from '../helpers/call-route'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-auth')>('@/lib/api-auth')
  return {
    ...actual,
    requireProjectAuthLight: vi.fn(async () => ({ session: { user: { id: 'user-1' } } })),
    isErrorResponse: actual.isErrorResponse,
  }
})

describe('editor project route auth', () => {
  it('does not load an editor project for an episode in another project', async () => {
    const projectA = await prisma.project.create({ data: { id: 'project-a', userId: 'user-1', name: 'A', type: 'novel-promotion' } })
    const projectB = await prisma.project.create({ data: { id: 'project-b', userId: 'user-1', name: 'B', type: 'novel-promotion' } })
    const novelA = await prisma.novelPromotionProject.create({ data: { projectId: projectA.id, userId: 'user-1', name: 'A' } })
    const novelB = await prisma.novelPromotionProject.create({ data: { projectId: projectB.id, userId: 'user-1', name: 'B' } })
    const episodeB = await prisma.novelPromotionEpisode.create({ data: { novelPromotionProjectId: novelB.id, episodeNumber: 1, title: 'B1' } })
    await prisma.videoEditorProject.create({
      data: { episodeId: episodeB.id, projectData: JSON.stringify({ id: 'editor-b', episodeId: episodeB.id, schemaVersion: '1.2', config: {}, timeline: [], audioTrack: [], subtitleCues: [], editorAssets: [], bgmTrack: [], pendingVersion: null }) },
    })
    await prisma.novelPromotionEpisode.create({ data: { novelPromotionProjectId: novelA.id, episodeNumber: 1, title: 'A1' } })

    const res = await callRoute(GET, 'GET', undefined, {
      params: { projectId: 'project-a' },
      query: { episodeId: episodeB.id },
    })

    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cross-env BILLING_TEST_BOOTSTRAP=1 vitest run tests/integration/api/specific/editor-project-auth.test.ts
```

Expected: FAIL because current GET fetches by `episodeId` only.

- [ ] **Step 3: Harden `/editor` GET, PUT, DELETE**

In `src/app/api/novel-promotion/[projectId]/editor/route.ts`, add a helper:

```ts
async function requireEpisodeForProject(projectId: string, episodeId: string) {
  const episode = await prisma.novelPromotionEpisode.findFirst({
    where: {
      id: episodeId,
      novelPromotionProject: { projectId },
    },
  })
  if (!episode) throw new ApiError('NOT_FOUND')
  return episode
}
```

Use it in GET before loading `videoEditorProject`, in PUT before upsert, and in DELETE before delete.

- [ ] **Step 4: Add start assemble route**

Create `editor/ai-edit/route.ts` with:

```ts
export const POST = apiHandler(async (request, { params }: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const body = await request.json()
  const episodeId = typeof body.episodeId === 'string' ? body.episodeId : ''
  if (!episodeId) throw new ApiError('INVALID_PARAMS')
  await requireEpisodeForProject(projectId, episodeId)
  const locale = resolveRequiredTaskLocale(request, body)
  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    episodeId,
    type: TASK_TYPE.AI_EDIT_ASSEMBLE,
    targetType: 'VideoEditorProject',
    targetId: episodeId,
    payload: { episodeId },
    dedupeKey: `ai_edit_assemble:${episodeId}`,
  })
  return NextResponse.json(result)
})
```

Export `requireEpisodeForProject` from a new shared server module instead of importing route files from route files:

`src/lib/novel-promotion/ai-editing/editor-auth.ts`.

- [ ] **Step 5: Add refine, apply, versions, rollback routes**

Routes use the same auth helper. Shapes:

- `POST /editor/refine`: body `{ episodeId, instruction, targetDurationSeconds?, selectedClipId?, selectedCutId? }`, submit `AI_EDIT_REFINE`.
- `POST /editor/refine/apply`: body `{ episodeId, pendingVersionId }`, apply pending version through `versions.ts`.
- `GET /editor/versions?episodeId=...`: list version summaries.
- `POST /editor/rollback`: body `{ episodeId, versionId }`, restore snapshot.

- [ ] **Step 6: Run focused API tests**

```bash
cross-env BILLING_TEST_BOOTSTRAP=1 vitest run tests/integration/api/specific/editor-project-auth.test.ts tests/integration/api/specific/editor-ai-edit-api.test.ts tests/integration/api/specific/editor-refine-api.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/novel-promotion/[projectId]/editor src/lib/novel-promotion/ai-editing/editor-auth.ts tests/integration/api/specific/editor-*.test.ts
git commit -m "Add AI editing editor API routes"
```

## Task 6: Assemble And Refine Worker Orchestration

**Files:**

- Create: `src/lib/novel-promotion/ai-editing/planner.ts`
- Create: `src/lib/novel-promotion/ai-editing/assemble.ts`
- Create: `src/lib/novel-promotion/ai-editing/refine.ts`
- Create: `src/lib/novel-promotion/ai-editing/wait-for-task.ts`
- Create: `src/lib/workers/handlers/ai-edit-assemble.ts`
- Create: `src/lib/workers/handlers/ai-edit-refine.ts`
- Modify: `src/lib/workers/text.worker.ts`
- Test: `tests/unit/worker/ai-edit-assemble.test.ts`
- Test: `tests/unit/worker/ai-edit-refine.test.ts`

- [ ] **Step 1: Write failing assemble worker test**

Create `tests/unit/worker/ai-edit-assemble.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { handleAiEditAssembleTask } from '@/lib/workers/handlers/ai-edit-assemble'

vi.mock('@/lib/novel-promotion/ai-editing/assemble', () => ({
  assembleInitialAiEdit: vi.fn(async () => ({ editorProjectId: 'editor-1', summary: 'assembled', degraded: false })),
}))

describe('AI edit assemble worker', () => {
  it('returns editor project id and summary', async () => {
    const result = await handleAiEditAssembleTask({
      data: {
        taskId: 'task-1',
        type: 'ai_edit_assemble',
        locale: 'zh',
        projectId: 'project-1',
        episodeId: 'episode-1',
        targetType: 'VideoEditorProject',
        targetId: 'episode-1',
        payload: { episodeId: 'episode-1' },
        userId: 'user-1',
      },
    } as never)

    expect(result).toEqual({ editorProjectId: 'editor-1', summary: 'assembled', degraded: false })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/worker/ai-edit-assemble.test.ts
```

Expected: FAIL because handler is missing.

- [ ] **Step 3: Implement worker handlers**

`ai-edit-assemble.ts`:

```ts
import type { Job } from 'bullmq'
import type { TaskJobData } from '@/lib/task/types'
import { assembleInitialAiEdit } from '@/lib/novel-promotion/ai-editing/assemble'

export async function handleAiEditAssembleTask(job: Job<TaskJobData>) {
  const episodeId = job.data.episodeId || (job.data.payload?.episodeId as string | undefined)
  if (!episodeId) throw new Error('AI_EDIT_ASSEMBLE missing episodeId')
  return await assembleInitialAiEdit({
    taskId: job.data.taskId,
    projectId: job.data.projectId,
    episodeId,
    userId: job.data.userId,
    locale: job.data.locale,
    payload: job.data.payload || {},
  })
}
```

`ai-edit-refine.ts` mirrors this shape and requires `instruction`.

Add cases to `text.worker.ts`:

```ts
case TASK_TYPE.AI_EDIT_ASSEMBLE:
  return await handleAiEditAssembleTask(job)
case TASK_TYPE.AI_EDIT_REFINE:
  return await handleAiEditRefineTask(job)
```

- [ ] **Step 4: Implement assemble orchestration**

`assembleInitialAiEdit` flow:

1. Build initial manifest.
2. Submit missing video and voice tasks with existing `submitTask`.
3. Wait for required video tasks through `waitForTaskCompletion`.
4. Probe media and rebuild manifest.
5. Run analyzer.
6. Ask planner for edit plan.
7. Validate plan.
8. Use conservative timeline if planning or validation fails.
9. Save `VideoEditorProject` schema `1.2`.
10. Create version record with reason `ai_initial`.

The function returns:

```ts
export type AssembleResult = {
  editorProjectId: string
  summary: string
  degraded: boolean
  warnings: string[]
}
```

- [ ] **Step 5: Implement planner repair boundary**

In `planner.ts`, expose:

```ts
export async function generateEditPlan(input: {
  projectId: string
  userId: string
  manifest: EditorManifest
  instruction?: string
  validationErrors?: Array<{ code: string; message: string }>
}): Promise<EditPlan>
```

Use existing `executeAiTextStep` or the established LLM helper used by text workers. The prompt must require JSON only and must include manifest IDs, analyzer signals, and constraints. If parsing fails, throw `AI_EDIT_PLAN_PARSE_FAILED`.

- [ ] **Step 6: Implement refine orchestration**

`refineAiEdit` loads the saved project, builds the current manifest, calls planner with user instruction, validates the diff, stores `pendingVersion` in `projectData`, and returns summary without applying.

- [ ] **Step 7: Run focused tests**

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/worker/ai-edit-assemble.test.ts tests/unit/worker/ai-edit-refine.test.ts tests/unit/ai-editing/timeline-validator.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/novel-promotion/ai-editing src/lib/workers/handlers/ai-edit-*.ts src/lib/workers/text.worker.ts tests/unit/worker/ai-edit-*.test.ts
git commit -m "Add AI editing assemble and refine workers"
```

## Task 7: Transition Bridge Generation

**Files:**

- Create: `src/lib/novel-promotion/ai-editing/bridge.ts`
- Create: `src/lib/workers/handlers/ai-edit-transition-bridge.ts`
- Modify: `src/lib/workers/video.worker.ts`
- Test: `tests/unit/worker/ai-edit-transition-bridge.test.ts`
- Test: `tests/integration/api/specific/editor-ai-edit-api.test.ts`

- [ ] **Step 1: Write failing bridge worker test**

Create `tests/unit/worker/ai-edit-transition-bridge.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { handleAiEditTransitionBridgeTask } from '@/lib/workers/handlers/ai-edit-transition-bridge'

vi.mock('@/lib/novel-promotion/ai-editing/bridge', () => ({
  generateTransitionBridgeAsset: vi.fn(async () => ({
    editorAssetId: 'asset-1',
    url: '/m/bridge-video',
    durationMs: 1200,
  })),
}))

describe('AI transition bridge worker', () => {
  it('returns editor asset output without panel output fields', async () => {
    const result = await handleAiEditTransitionBridgeTask({
      data: {
        taskId: 'task-1',
        type: 'ai_edit_transition_bridge',
        locale: 'zh',
        projectId: 'project-1',
        episodeId: 'episode-1',
        targetType: 'VideoEditorAsset',
        targetId: 'asset-1',
        payload: { editorAssetId: 'asset-1' },
        userId: 'user-1',
      },
    } as never)

    expect(result).toEqual({ editorAssetId: 'asset-1', url: '/m/bridge-video', durationMs: 1200 })
    expect(result).not.toHaveProperty('panelId')
    expect(result).not.toHaveProperty('videoUrl')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/worker/ai-edit-transition-bridge.test.ts
```

Expected: FAIL because handler is missing.

- [ ] **Step 3: Implement bridge generation helper**

`generateTransitionBridgeAsset` must:

- load `VideoEditorAsset` by `editorAssetId`
- verify `episodeId` and `projectId`
- use payload tail/head images
- call existing `resolveVideoSourceFromGeneration`
- upload via `uploadVideoSourceToCos(source, 'editor-transition-bridge', editorAssetId)`
- create or update `MediaObject`
- call `completeEditorAsset`
- return `{ editorAssetId, url, durationMs }`

- [ ] **Step 4: Add video worker dispatch**

In `video.worker.ts`, add:

```ts
case TASK_TYPE.AI_EDIT_TRANSITION_BRIDGE:
  return await handleAiEditTransitionBridgeTask(job)
```

Keep `VIDEO_PANEL` logic untouched.

- [ ] **Step 5: Run focused tests**

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/worker/ai-edit-transition-bridge.test.ts tests/unit/worker/video-worker.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/novel-promotion/ai-editing/bridge.ts src/lib/workers/handlers/ai-edit-transition-bridge.ts src/lib/workers/video.worker.ts tests/unit/worker/ai-edit-transition-bridge.test.ts
git commit -m "Add AI editing transition bridge worker"
```

## Task 8: Render API And Worker

**Files:**

- Create: `src/lib/novel-promotion/ai-editing/render-snapshot.ts`
- Create: `src/lib/novel-promotion/ai-editing/render-worker.ts`
- Modify: `src/lib/workers/render.worker.ts`
- Create: `src/app/api/novel-promotion/[projectId]/editor/render/route.ts`
- Modify: `src/features/video-editor/remotion/VideoComposition.tsx`
- Test: `tests/unit/worker/render-worker.test.ts`
- Test: `tests/integration/api/specific/editor-render-api.test.ts`

- [ ] **Step 1: Write failing render API test**

Create `tests/integration/api/specific/editor-render-api.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/novel-promotion/[projectId]/editor/render/route'
import { callRoute } from '../helpers/call-route'

vi.mock('@/lib/api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-auth')>('@/lib/api-auth')
  return {
    ...actual,
    requireProjectAuthLight: vi.fn(async () => ({ session: { user: { id: 'user-1' } } })),
    isErrorResponse: actual.isErrorResponse,
  }
})

vi.mock('@/lib/task/submitter', () => ({
  submitTask: vi.fn(async () => ({ success: true, async: true, taskId: 'render-task-1' })),
}))

describe('editor render route', () => {
  it('requires editorProjectId and forwards burnSubtitles', async () => {
    const res = await callRoute(POST, 'POST', {
      editorProjectId: 'editor-1',
      burnSubtitles: true,
      quality: 'draft',
      format: 'mp4',
    }, {
      params: { projectId: 'project-1' },
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ taskId: 'render-task-1' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cross-env BILLING_TEST_BOOTSTRAP=1 vitest run tests/integration/api/specific/editor-render-api.test.ts
```

Expected: FAIL because render route is missing.

- [ ] **Step 3: Add render route**

The route validates editor project ownership and submits `EDITOR_RENDER`:

```ts
payload: {
  editorProjectId,
  burnSubtitles,
  quality,
  format: 'mp4',
}
```

Target type is `VideoEditorProject`; target id is `editorProjectId`.

- [ ] **Step 4: Add render snapshot**

`createRenderSnapshot` loads `VideoEditorProject`, migrates projectData to `1.2`, resolves editor asset URLs through durable media refs, and returns:

```ts
export type RenderSnapshot = {
  editorProjectId: string
  episodeId: string
  fps: number
  width: number
  height: number
  burnSubtitles: boolean
  projectData: VideoEditorProject
  createdAt: string
}
```

- [ ] **Step 5: Implement render worker with injectable renderer**

In `src/lib/novel-promotion/ai-editing/render-worker.ts`, export:

```ts
export async function renderEditorProject(input: {
  taskId: string
  projectId: string
  userId: string
  editorProjectId: string
  burnSubtitles: boolean
  quality: 'draft' | 'high'
  renderer?: (snapshot: RenderSnapshot) => Promise<{ storageKey: string; durationMs?: number }>
}) {
  const snapshot = await createRenderSnapshot(input)
  const renderResult = input.renderer
    ? await input.renderer(snapshot)
    : await renderWithRemotion(snapshot, input.quality)
  const media = await ensureMediaObjectFromStorageKey(renderResult.storageKey, {
    mimeType: 'video/mp4',
    durationMs: renderResult.durationMs,
    width: snapshot.width,
    height: snapshot.height,
  })
  await completeRenderOutputAsset({ editorProjectId: input.editorProjectId, mediaObjectId: media.id, url: media.url, taskId: input.taskId })
  return { outputUrl: media.url, editorProjectId: input.editorProjectId }
}
```

Use a mock renderer in unit tests. Add real Remotion renderer only after the mock path passes. If `@remotion/renderer` is not a direct dependency, add it to `package.json` with the same version as Remotion packages.

- [ ] **Step 6: Update composition for burn subtitles**

Change `VideoComposition` props to include `subtitleCues`, `audioTrack`, and `burnSubtitles`. Render subtitle cues only when `burnSubtitles` is true. Render audio from `audioTrack` instead of legacy clip attachment.

- [ ] **Step 7: Run focused tests**

```bash
cross-env BILLING_TEST_BOOTSTRAP=1 vitest run tests/unit/worker/render-worker.test.ts tests/integration/api/specific/editor-render-api.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/novel-promotion/ai-editing/render* src/lib/workers/render.worker.ts src/app/api/novel-promotion/[projectId]/editor/render src/features/video-editor/remotion/VideoComposition.tsx tests/unit/worker/render-worker.test.ts tests/integration/api/specific/editor-render-api.test.ts package.json package-lock.json
git commit -m "Add editor render task pipeline"
```

## Task 9: Editor UI, AI Button, Refine Drawer, Export Dialog

**Files:**

- Modify: `src/lib/query/keys.ts`
- Create: `src/lib/query/hooks/useEditorProject.ts`
- Create: `src/lib/query/hooks/useAiEditing.ts`
- Modify: `src/lib/query/hooks/useSSE.ts`
- Modify: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/EditorStageRoute.tsx`
- Modify: `src/features/video-editor/hooks/useEditorActions.ts`
- Modify: `src/features/video-editor/hooks/useEditorState.ts`
- Modify: `src/features/video-editor/components/VideoEditorStage.tsx`
- Create: `src/features/video-editor/components/AiEditDrawer.tsx`
- Create: `src/features/video-editor/components/ExportDialog.tsx`
- Create: `src/features/video-editor/components/VersionHistoryPanel.tsx`
- Test: `tests/unit/workspace/editor-stage-open.test.ts`
- Test: `tests/unit/components/ai-video-editor-controls.test.tsx`

- [ ] **Step 1: Add editor query keys**

In `queryKeys`, add:

```ts
editorProject: (projectId: string, episodeId: string) =>
  ['editor-project', projectId, episodeId] as const,
editorVersions: (projectId: string, episodeId: string) =>
  ['editor-project', projectId, episodeId, 'versions'] as const,
```

- [ ] **Step 2: Add editor hooks**

`useEditorProject` loads `/editor?episodeId=...`, returns migrated project data, and exposes `saveProject`.

`useAiEditing` exposes:

```ts
startAiEdit({ episodeId })
startRefine({ episodeId, instruction, targetDurationSeconds, selectedClipId })
applyPendingVersion({ episodeId, pendingVersionId })
rollback({ episodeId, versionId })
startRender({ editorProjectId, burnSubtitles, quality })
```

- [ ] **Step 3: Update SSE invalidation**

In `useSSE`, when target type is `VideoEditorProject` or `VideoEditorAsset`, invalidate:

```ts
queryClient.invalidateQueries({ queryKey: queryKeys.editorProject(projectId, resolvedEpisodeId) })
queryClient.invalidateQueries({ queryKey: queryKeys.editorVersions(projectId, resolvedEpisodeId) })
```

- [ ] **Step 4: Load saved project before fallback**

Update `EditorStageRoute`:

1. call `useEditorProject(projectId, episodeId)`
2. if saved project exists, pass it as `initialProject`
3. if no saved project exists, call `createProjectFromPanels`
4. set `exportEnabled={true}`

- [ ] **Step 5: Add AI edit button and progress**

In `VideoEditorStage`, add an `AI剪辑` button near Save/Export. It calls `startAiEdit` for the current episode. Disable while an AI edit task is running for `VideoEditorProject`.

- [ ] **Step 6: Add refine drawer**

`AiEditDrawer` contains:

- text area for instruction
- optional target duration input
- submit button
- pending summary view
- Apply and Discard buttons

No BGM controls in MVP.

- [ ] **Step 7: Add export dialog**

`ExportDialog` has:

- `burnSubtitles` checkbox
- quality segmented control: `draft` and `high`
- MP4 fixed format label
- Export button calling render route

- [ ] **Step 8: Add version history panel**

Display newest 10 versions with reason, created time, summary, and rollback button.

- [ ] **Step 9: Run UI focused tests**

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/workspace/editor-stage-open.test.ts tests/unit/components/ai-video-editor-controls.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/query src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/EditorStageRoute.tsx src/features/video-editor tests/unit/workspace/editor-stage-open.test.ts tests/unit/components/ai-video-editor-controls.test.tsx
git commit -m "Add AI editing editor UI controls"
```

## Task 10: System Tests, Guards, Final Verification

**Files:**

- Create: `tests/system/ai-editing.system.test.ts`
- Modify: `tests/contracts/route-catalog.ts`
- Modify: task coverage guard fixtures if new task types require explicit coverage.
- Modify: locale messages only for labels shown in UI.

- [ ] **Step 1: Add system test**

Create `tests/system/ai-editing.system.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'

describe('system - AI editing', () => {
  it('assembles current episode timeline, stores version, and leaves panel videoUrl unchanged for bridge assets', async () => {
    const projectId = 'system-ai-edit-project'
    const episodeId = 'system-ai-edit-episode'

    const editor = await prisma.videoEditorProject.findUnique({ where: { episodeId } })
    expect(editor?.projectData).toContain('"schemaVersion":"1.2"')

    const versions = await prisma.videoEditorProjectVersion.findMany({ where: { editorProjectId: editor?.id } })
    expect(versions.length).toBeGreaterThanOrEqual(1)

    const bridgeAssets = await prisma.videoEditorAsset.findMany({
      where: { editorProjectId: editor?.id, kind: 'transition_bridge' },
    })
    for (const asset of bridgeAssets) {
      expect(asset.status).toMatch(/completed|failed|canceled/)
    }

    expect(projectId).toBe('system-ai-edit-project')
  })
})
```

Seed the test with the existing system helpers. Mock LLM and media providers the same way existing system tests mock image/video/voice generation. The final assertions must check database state, not UI.

- [ ] **Step 2: Update route and task coverage contracts**

Add new routes to `tests/contracts/route-catalog.ts`:

```ts
'src/app/api/novel-promotion/[projectId]/editor/ai-edit/route.ts',
'src/app/api/novel-promotion/[projectId]/editor/refine/route.ts',
'src/app/api/novel-promotion/[projectId]/editor/refine/apply/route.ts',
'src/app/api/novel-promotion/[projectId]/editor/versions/route.ts',
'src/app/api/novel-promotion/[projectId]/editor/rollback/route.ts',
'src/app/api/novel-promotion/[projectId]/editor/render/route.ts',
```

Ensure new task types are covered by behavior or tasktype guards.

- [ ] **Step 3: Run changed feature checks**

```bash
npm run typecheck
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/ai-editing tests/unit/worker/ai-edit-assemble.test.ts tests/unit/worker/ai-edit-refine.test.ts tests/unit/worker/ai-edit-transition-bridge.test.ts tests/unit/worker/render-worker.test.ts
cross-env BILLING_TEST_BOOTSTRAP=1 vitest run tests/integration/api/specific/editor-project-auth.test.ts tests/integration/api/specific/editor-ai-edit-api.test.ts tests/integration/api/specific/editor-refine-api.test.ts tests/integration/api/specific/editor-render-api.test.ts
cross-env SYSTEM_TEST_BOOTSTRAP=1 vitest run tests/system/ai-editing.system.test.ts
```

Expected: all commands exit 0.

- [ ] **Step 4: Run full verification**

```bash
npm run lint:all
npm run typecheck
npm run test:all
npm run build
```

Expected: all commands exit 0. Existing lint warnings can remain only if the command exits 0.

- [ ] **Step 5: Commit final verification adjustments**

```bash
git add tests/contracts tests/system src
git commit -m "Verify AI editing workflow"
```

## Self-Review Checklist

- Spec coverage:
  - Transition bridge persistence: Task 1, Task 4, Task 7.
  - Media probing and frame timing: Task 2, Task 3, Task 4.
  - Subtitle and voice cue alignment: Task 2, Task 3, Task 8.
  - Deterministic material analysis: Task 3.
  - Task, queue, SSE, billing, retry: Task 1, Task 6, Task 9.
  - Version storage outside JSON: Task 1, Task 4, Task 5.
  - Project/episode auth: Task 5.
  - Render snapshot and export: Task 8.
  - UI entry, refine, rollback, export dialog: Task 9.
  - System verification: Task 10.

- Execution order:
  - Do not implement Task 6 before Tasks 1-4.
  - Do not implement Task 9 before the API routes in Task 5.
  - Do not implement Task 10 before Tasks 1-9 are complete.

- Final success criteria:
  - User can click `AI剪辑` for the selected episode.
  - Missing media tasks are submitted and awaited.
  - Saved editor project uses schema `1.2`.
  - Timeline keeps story order by default.
  - Natural-language refine creates a pending version and requires confirmation.
  - Rollback restores a saved version.
  - Render creates an MP4 output URL and respects `burnSubtitles`.
  - Full `npm run test:all` and `npm run build` pass.
