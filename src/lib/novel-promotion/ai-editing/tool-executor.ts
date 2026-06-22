import type { VideoClip, VideoClipSource, VideoEditorProject } from '@/features/video-editor/types/editor.types'
import { computeClipPositions } from '@/features/video-editor/utils/time-utils'
import type {
  AiEditableMediaEntry,
  AiEditableMediaLibrary,
  EditorToolDraftResult,
  EditorToolOperation,
  InsertClipsInput,
} from './tool-types'

type ExecutorInput = {
  project: VideoEditorProject
  media: AiEditableMediaLibrary
}

type MutationSnapshot = {
  project: VideoEditorProject
  operations: EditorToolOperation[]
}

const MEDIA_NOT_ELIGIBLE_ERROR = 'EDITOR_TOOL_MEDIA_NOT_ELIGIBLE'
const TIMELINE_READ_REQUIRED_ERROR = 'EDITOR_TOOL_TIMELINE_READ_REQUIRED'
const MEDIA_READ_REQUIRED_ERROR = 'EDITOR_TOOL_MEDIA_READ_REQUIRED'

export class EditorToolExecutor {
  private project: VideoEditorProject
  private readonly media: AiEditableMediaLibrary
  private readonly warnings: string[] = []
  private readonly snapshots: MutationSnapshot[] = []
  private operations: EditorToolOperation[] = []
  private timelineRead = false
  private mediaRead = false

  constructor(input: ExecutorInput) {
    this.project = clone(input.project)
    this.media = clone(input.media)
  }

  getTimeline(): EditorToolDraftResult {
    this.timelineRead = true
    return this.result()
  }

  getMedia(): EditorToolDraftResult {
    this.mediaRead = true
    return this.result()
  }

  insertClips(input: InsertClipsInput): EditorToolDraftResult {
    this.requireTimelineRead()
    this.requireMediaRead()

    const mediaEntries = input.mediaIds.map((mediaId) => this.requireClipMedia(mediaId))

    const insertIndex = this.resolveInsertIndex(input)
    const insertionFrame = this.frameAtIndex(insertIndex)
    const clips = mediaEntries.map((entry) => this.createClip(entry))
    const insertedDuration = clips.reduce((total, clip) => total + clip.durationInFrames, 0)
    const previousProject = clone(this.project)
    const previousOperations = clone(this.operations)

    this.project.timeline = [
      ...this.project.timeline.slice(0, insertIndex),
      ...clips,
      ...this.project.timeline.slice(insertIndex),
    ]

    this.project.audioTrack = this.project.audioTrack.map((audio) => (
      audio.startFrame >= insertionFrame
        ? { ...audio, startFrame: audio.startFrame + insertedDuration }
        : audio
    ))

    this.project.subtitleCues = this.project.subtitleCues.map((cue) => (
      cue.startFrame >= insertionFrame
        ? { ...cue, startFrame: cue.startFrame + insertedDuration, endFrame: cue.endFrame + insertedDuration }
        : cue
    ))

    this.snapshots.push({ project: previousProject, operations: previousOperations })
    this.operations = [
      ...this.operations,
      {
        tool: 'insertClips',
        targetIds: clips.map((clip) => clip.id),
        before: { insertionFrame, insertIndex },
        after: { mediaIds: input.mediaIds },
        warnings: [],
      },
    ]

    return this.result()
  }

  undo(): EditorToolDraftResult {
    const snapshot = this.snapshots.pop()
    if (!snapshot) return this.result()

    this.project = clone(snapshot.project)
    this.operations = clone(snapshot.operations)

    return this.result()
  }

  private requireTimelineRead(): void {
    if (!this.timelineRead) throw new Error(TIMELINE_READ_REQUIRED_ERROR)
  }

  private requireMediaRead(): void {
    if (!this.mediaRead) throw new Error(MEDIA_READ_REQUIRED_ERROR)
  }

  private requireClipMedia(mediaId: string): AiEditableMediaEntry {
    const entry = this.media.entries.find((item) => item.id === mediaId)
    if (!entry || !entry.eligibleForTimeline || entry.status !== 'completed' || !entry.url) {
      throw new Error(MEDIA_NOT_ELIGIBLE_ERROR)
    }

    if (entry.kind !== 'video' && entry.kind !== 'image') {
      throw new Error(MEDIA_NOT_ELIGIBLE_ERROR)
    }

    return entry
  }

  private resolveInsertIndex(input: InsertClipsInput): number {
    if (typeof input.atIndex === 'number') {
      return Math.max(0, Math.min(this.project.timeline.length, Math.floor(input.atIndex)))
    }

    if (input.beforeClipId) {
      const index = this.project.timeline.findIndex((clip) => clip.id === input.beforeClipId)
      if (index >= 0) return index
    }

    if (input.afterClipId) {
      const index = this.project.timeline.findIndex((clip) => clip.id === input.afterClipId)
      if (index >= 0) return index + 1
    }

    if (input.end) {
      return this.project.timeline.length
    }

    return this.project.timeline.length
  }

  private frameAtIndex(index: number): number {
    const positions = computeClipPositions(this.project.timeline)
    if (index >= positions.length) {
      return positions[positions.length - 1]?.endFrame ?? 0
    }

    return positions[index]?.startFrame ?? 0
  }

  private createClip(entry: AiEditableMediaEntry): VideoClip {
    const assetId = entry.assetId || entry.id.split(':').at(1) || entry.id

    return {
      id: `clip_${assetId}`,
      kind: entry.sourceType === 'generated_transition_bridge' ? 'transition_bridge' : 'source',
      src: entry.url || '',
      durationInFrames: entry.durationInFrames || this.media.fps * 3,
      metadata: {
        storyboardId: entry.storyboardId || '',
        sourcePanelId: entry.sourcePanelId,
        voiceLineId: entry.voiceLineId,
        storyOrder: entry.storyOrder,
        source: clipSourceFor(entry),
        description: entry.description,
        editorAssetId: assetId,
      },
    }
  }

  private result(): EditorToolDraftResult {
    return {
      project: clone(this.project),
      operations: clone(this.operations),
      warnings: [...this.warnings],
      changed: this.snapshots.length > 0,
    }
  }
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function clipSourceFor(entry: AiEditableMediaEntry): VideoClipSource {
  if (
    entry.sourceType === 'generated_panel_video' ||
    entry.sourceType === 'generated_lip_sync_video' ||
    entry.sourceType === 'generated_transition_bridge' ||
    entry.sourceType === 'user_import_video' ||
    entry.sourceType === 'user_import_image' ||
    entry.sourceType === 'render_output'
  ) {
    return entry.sourceType
  }

  throw new Error(MEDIA_NOT_ELIGIBLE_ERROR)
}
