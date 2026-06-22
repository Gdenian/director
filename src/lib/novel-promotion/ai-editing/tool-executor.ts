import type { AudioAttachment, ClipMediaSourceType, SubtitleCue, VideoClip, VideoClipSource, VideoEditorProject } from '@/features/video-editor/types/editor.types'
import { calculateTimelineDuration, computeClipPositions } from '@/features/video-editor/utils/time-utils'
import type {
  AiEditableMediaEntry,
  AiEditableMediaLibrary,
  EditorToolDraftResult,
  EditorToolOperation,
  EditorTimelineToolResult,
  InsertClipsInput,
  MoveClipsInput,
  ReplaceClipInput,
  RippleDeleteRangesInput,
  SetClipPropertiesInput,
  SplitClipInput,
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
const CLIP_NOT_FOUND_ERROR = 'EDITOR_TOOL_CLIP_NOT_FOUND'
const EMPTY_MEDIA_IDS_ERROR = 'EDITOR_TOOL_EMPTY_MEDIA_IDS'
const MEDIA_NOT_FOUND_ERROR = 'EDITOR_TOOL_MEDIA_NOT_FOUND'
const INVALID_DURATION_ERROR = 'EDITOR_TOOL_INVALID_DURATION'
const INVALID_SOURCE_TRIM_ERROR = 'EDITOR_TOOL_INVALID_SOURCE_TRIM'
const INVALID_TRANSITION_ERROR = 'EDITOR_TOOL_INVALID_TRANSITION'
const INVALID_SPLIT_ERROR = 'EDITOR_TOOL_INVALID_SPLIT'
const INVALID_RANGES_ERROR = 'EDITOR_TOOL_INVALID_RANGES'

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

  getTimeline(): EditorTimelineToolResult {
    this.timelineRead = true
    return {
      config: clone(this.project.config),
      clips: clone(computeClipPositions(this.project.timeline)),
      audioTrack: clone(this.project.audioTrack),
      subtitleCues: clone(this.project.subtitleCues),
      totalFrames: calculateTimelineDuration(this.project.timeline),
    }
  }

  getMedia(): AiEditableMediaLibrary {
    this.mediaRead = true
    return clone(this.media)
  }

  insertClips(input: InsertClipsInput): EditorToolDraftResult {
    this.requireTimelineRead()
    this.requireMediaRead()

    if (input.mediaIds.length === 0) {
      throw new Error(EMPTY_MEDIA_IDS_ERROR)
    }

    const mediaEntries = input.mediaIds.map((mediaId) => this.requireClipMedia(mediaId))

    const insertIndex = this.resolveInsertIndex(input)
    const insertionFrame = this.frameAtIndex(insertIndex)
    const reservedClipIds = new Set(this.project.timeline.map((clip) => clip.id))
    const clips = mediaEntries.map((entry) => this.createClip(entry, reservedClipIds))
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
        tool: 'insert_clips',
        targetIds: clips.map((clip) => clip.id),
        before: { insertionFrame, insertIndex },
        after: { mediaIds: input.mediaIds },
        warnings: [],
      },
    ]

    return this.result()
  }

  replaceClip(input: ReplaceClipInput): EditorToolDraftResult {
    this.requireTimelineRead()
    this.requireMediaRead()

    const clipIndex = this.findClipIndex(input.clipId)
    const oldClip = this.project.timeline[clipIndex]
    const mediaEntry = this.requireClipMedia(input.mediaId)
    const previousProject = clone(this.project)
    const previousOperations = clone(this.operations)
    const positions = computeClipPositions(this.project.timeline)
    const clipStart = positions[clipIndex]?.startFrame ?? this.frameAtIndex(clipIndex)
    const reservedClipIds = new Set(this.project.timeline.map((clip) => clip.id))
    reservedClipIds.delete(oldClip.id)
    const newClip = this.createClip(mediaEntry, reservedClipIds)

    if (oldClip.transition) {
      newClip.transition = clone(oldClip.transition)
    }

    this.project.timeline = [
      ...this.project.timeline.slice(0, clipIndex),
      newClip,
      ...this.project.timeline.slice(clipIndex + 1),
    ]
    this.clampLinkedAttachments(oldClip, newClip, clipStart)

    this.recordMutation(previousProject, previousOperations, {
      tool: 'replace_clip',
      targetIds: [newClip.id],
      before: { clipId: oldClip.id, mediaId: oldClip.metadata.editorAssetId },
      after: { clipId: newClip.id, mediaId: input.mediaId },
      warnings: [],
    })

    return this.result()
  }

  setClipProperties(input: SetClipPropertiesInput): EditorToolDraftResult {
    this.requireTimelineRead()
    this.requireMediaRead()

    const clipIndex = this.findClipIndex(input.clipId)
    const clip = this.project.timeline[clipIndex]
    const fps = this.project.config.fps

    if (typeof input.durationInFrames === 'number' && (input.durationInFrames < 1 || input.durationInFrames > fps * 600)) {
      throw new Error(INVALID_DURATION_ERROR)
    }

    if (input.sourceTrim && (input.sourceTrim.fromFrame < 0 || input.sourceTrim.toFrame <= input.sourceTrim.fromFrame)) {
      throw new Error(INVALID_SOURCE_TRIM_ERROR)
    }

    if (input.transition && (input.transition.durationInFrames < 0 || input.transition.durationInFrames > fps)) {
      throw new Error(INVALID_TRANSITION_ERROR)
    }

    const previousProject = clone(this.project)
    const previousOperations = clone(this.operations)
    const positions = computeClipPositions(this.project.timeline)
    const clipStart = positions[clipIndex]?.startFrame ?? this.frameAtIndex(clipIndex)
    const nextClip = clone(clip)

    if (typeof input.durationInFrames === 'number') {
      nextClip.durationInFrames = Math.floor(input.durationInFrames)
    }

    if (input.sourceTrim) {
      nextClip.sourceTrim = {
        fromFrame: Math.floor(input.sourceTrim.fromFrame),
        toFrame: Math.floor(input.sourceTrim.toFrame),
      }
    }

    if (input.transition) {
      nextClip.transition = {
        type: input.transition.type,
        durationInFrames: Math.floor(input.transition.durationInFrames),
      }
    }

    this.project.timeline[clipIndex] = nextClip

    if (typeof input.durationInFrames === 'number') {
      this.clampLinkedAttachments(clip, nextClip, clipStart)
    }

    this.recordMutation(previousProject, previousOperations, {
      tool: 'set_clip_properties',
      targetIds: [nextClip.id],
      before: { clip },
      after: { durationInFrames: input.durationInFrames, sourceTrim: input.sourceTrim, transition: input.transition },
      warnings: [],
    })

    return this.result()
  }

  moveClips(input: MoveClipsInput): EditorToolDraftResult {
    this.requireTimelineRead()
    this.requireMediaRead()

    const selectedIds = new Set(input.clipIds)
    const movingClips = this.project.timeline.filter((clip) => selectedIds.has(clip.id))
    if (movingClips.length !== input.clipIds.length) {
      throw new Error(CLIP_NOT_FOUND_ERROR)
    }

    const previousProject = clone(this.project)
    const previousOperations = clone(this.operations)
    const beforeAnchors = this.clipAnchorMap()
    const remainingClips = this.project.timeline.filter((clip) => !selectedIds.has(clip.id))
    const insertIndex = Math.max(0, Math.min(remainingClips.length, Math.floor(input.toIndex)))

    this.project.timeline = [
      ...remainingClips.slice(0, insertIndex),
      ...movingClips,
      ...remainingClips.slice(insertIndex),
    ]

    this.reanchorAttachments(beforeAnchors, this.clipAnchorMap())

    this.recordMutation(previousProject, previousOperations, {
      tool: 'move_clips',
      targetIds: movingClips.map((clip) => clip.id),
      before: { clipIds: input.clipIds },
      after: { toIndex: insertIndex },
      warnings: [],
    })

    return this.result()
  }

  splitClip(input: SplitClipInput): EditorToolDraftResult {
    this.requireTimelineRead()
    this.requireMediaRead()

    const clipIndex = this.findClipIndex(input.clipId)
    const clip = this.project.timeline[clipIndex]
    const atFrame = Math.floor(input.atFrame)
    if (atFrame < 1 || atFrame >= clip.durationInFrames) {
      throw new Error(INVALID_SPLIT_ERROR)
    }

    const previousProject = clone(this.project)
    const previousOperations = clone(this.operations)
    const firstClip = clone(clip)
    const secondClip = clone(clip)
    const reservedClipIds = new Set(this.project.timeline.map((item) => item.id))

    firstClip.durationInFrames = atFrame
    secondClip.id = this.uniqueClipId(`${clip.id}_split_${atFrame}`, reservedClipIds)
    secondClip.durationInFrames = clip.durationInFrames - atFrame

    const sourceStart = clip.sourceTrim?.fromFrame ?? 0
    firstClip.sourceTrim = {
      fromFrame: sourceStart,
      toFrame: sourceStart + atFrame,
    }
    secondClip.sourceTrim = {
      fromFrame: sourceStart + atFrame,
      toFrame: sourceStart + clip.durationInFrames,
    }

    this.project.timeline = [
      ...this.project.timeline.slice(0, clipIndex),
      firstClip,
      secondClip,
      ...this.project.timeline.slice(clipIndex + 1),
    ]

    this.recordMutation(previousProject, previousOperations, {
      tool: 'split_clip',
      targetIds: [firstClip.id, secondClip.id],
      before: { clipId: clip.id, durationInFrames: clip.durationInFrames },
      after: { atFrame },
      warnings: [],
    })

    return this.result()
  }

  rippleDeleteRanges(input: RippleDeleteRangesInput): EditorToolDraftResult {
    this.requireTimelineRead()
    this.requireMediaRead()

    const ranges = this.validateDeleteRanges(input.ranges)
    if (ranges.length === 0) return this.result()

    const previousProject = clone(this.project)
    const previousOperations = clone(this.operations)
    const positions = computeClipPositions(this.project.timeline)
    const nextTimeline: VideoClip[] = []
    const reservedClipIds = new Set(this.project.timeline.map((clip) => clip.id))
    let previousContributionEnd = 0

    positions.forEach((clip) => {
      const contributionStart = Math.max(clip.startFrame, previousContributionEnd)
      const contributionEnd = Math.max(contributionStart, clip.endFrame)
      previousContributionEnd = Math.max(previousContributionEnd, clip.endFrame)
      const localDeleteRanges = ranges
        .map((range) => ({
          startFrame: Math.max(contributionStart, range.startFrame) - clip.startFrame,
          endFrame: Math.min(contributionEnd, range.endFrame) - clip.startFrame,
        }))
        .filter((range) => range.endFrame > range.startFrame)
      const remainingIntervals = removeRangesFromInterval(0, clip.durationInFrames, localDeleteRanges)
      if (remainingIntervals.length === 0) return

      const sourceStart = clip.sourceTrim?.fromFrame ?? 0
      const clipWithoutPosition: VideoClip & { startFrame?: number; endFrame?: number } = clone(clip)
      delete clipWithoutPosition.startFrame
      delete clipWithoutPosition.endFrame

      remainingIntervals.forEach((interval, intervalIndex) => {
        const nextClip: VideoClip = clone(clipWithoutPosition)
        if (intervalIndex > 0) {
          nextClip.id = this.uniqueClipId(`${clip.id}_ripple_${clip.startFrame + interval.startFrame}`, reservedClipIds)
        }
        reservedClipIds.add(nextClip.id)
        nextClip.durationInFrames = interval.endFrame - interval.startFrame
        nextClip.sourceTrim = {
          fromFrame: sourceStart + interval.startFrame,
          toFrame: sourceStart + interval.endFrame,
        }
        if (intervalIndex < remainingIntervals.length - 1) {
          delete nextClip.transition
        }

        nextTimeline.push(nextClip)
      })
    })

    this.project.timeline = nextTimeline
    this.project.audioTrack = this.project.audioTrack.flatMap((audio) => transformAudioAttachment(audio, ranges))
    this.project.subtitleCues = this.project.subtitleCues.flatMap((cue) => transformSubtitleCue(cue, ranges))

    this.recordMutation(previousProject, previousOperations, {
      tool: 'ripple_delete_ranges',
      targetIds: ranges.map((range) => `${range.startFrame}-${range.endFrame}`),
      before: { totalFrames: calculateTimelineDuration(previousProject.timeline) },
      after: { ranges },
      warnings: [],
    })

    return this.result()
  }

  getTranscript(): Array<{ text: string; startFrame: number; endFrame: number; sourcePanelId?: string; sourceVoiceLineId?: string }> {
    return [...this.project.subtitleCues]
      .sort((left, right) => left.startFrame - right.startFrame)
      .map((cue) => ({
        text: cue.text,
        startFrame: cue.startFrame,
        endFrame: cue.endFrame,
        ...(cue.sourcePanelId ? { sourcePanelId: cue.sourcePanelId } : {}),
        ...(cue.sourceVoiceLineId ? { sourceVoiceLineId: cue.sourceVoiceLineId } : {}),
      }))
  }

  addCaptions(_input: { placement?: 'bottom' | 'lower' | 'middle' }): EditorToolDraftResult {
    this.requireTimelineRead()
    this.requireMediaRead()

    const existingVoiceLineIds = new Set(this.project.subtitleCues.map((cue) => cue.sourceVoiceLineId).filter(Boolean))
    const positions = computeClipPositions(this.project.timeline)
    const reservedIds = new Set(this.project.subtitleCues.map((cue) => cue.id))
    const newCues: SubtitleCue[] = []

    this.media.entries.forEach((entry) => {
      if (entry.sourceType !== 'voice_audio' || !entry.description || !entry.voiceLineId || existingVoiceLineIds.has(entry.voiceLineId)) {
        return
      }

      const anchorClip = positions.find((clip) => entry.sourcePanelId && clip.metadata.sourcePanelId === entry.sourcePanelId)
      const startFrame = anchorClip?.startFrame ?? 0
      const durationInFrames = entry.durationInFrames && entry.durationInFrames > 0 ? entry.durationInFrames : this.media.fps * 3
      const cueId = uniqueId(`caption_${entry.voiceLineId}`, reservedIds)
      reservedIds.add(cueId)
      existingVoiceLineIds.add(entry.voiceLineId)
      newCues.push({
        id: cueId,
        text: entry.description,
        startFrame,
        endFrame: startFrame + durationInFrames,
        sourcePanelId: entry.sourcePanelId,
        sourceVoiceLineId: entry.voiceLineId,
        style: 'default',
      })
    })

    if (newCues.length === 0) return this.result()

    const previousProject = clone(this.project)
    const previousOperations = clone(this.operations)
    this.project.subtitleCues = [...this.project.subtitleCues, ...newCues].sort((left, right) => left.startFrame - right.startFrame)

    this.recordMutation(previousProject, previousOperations, {
      tool: 'add_captions',
      targetIds: newCues.map((cue) => cue.id),
      after: { sourceVoiceLineIds: newCues.map((cue) => cue.sourceVoiceLineId) },
      warnings: [],
    })

    return this.result()
  }

  inspectMedia(input: { mediaId: string }): AiEditableMediaEntry {
    this.requireMediaRead()
    const entry = this.media.entries.find((item) => item.id === input.mediaId)
    if (!entry) throw new Error(MEDIA_NOT_FOUND_ERROR)

    return clone(entry)
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

  private findClipIndex(clipId: string): number {
    const index = this.project.timeline.findIndex((clip) => clip.id === clipId)
    if (index < 0) throw new Error(CLIP_NOT_FOUND_ERROR)
    return index
  }

  private resolveInsertIndex(input: InsertClipsInput): number {
    if (typeof input.atIndex === 'number') {
      return Math.max(0, Math.min(this.project.timeline.length, Math.floor(input.atIndex)))
    }

    if (input.beforeClipId) {
      const index = this.project.timeline.findIndex((clip) => clip.id === input.beforeClipId)
      if (index >= 0) return index
      throw new Error(CLIP_NOT_FOUND_ERROR)
    }

    if (input.afterClipId) {
      const index = this.project.timeline.findIndex((clip) => clip.id === input.afterClipId)
      if (index >= 0) return index + 1
      throw new Error(CLIP_NOT_FOUND_ERROR)
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

  private createClip(entry: AiEditableMediaEntry, reservedClipIds?: Set<string>): VideoClip {
    const assetId = entry.assetId || entry.id.split(':').at(1) || entry.id
    const clipId = this.uniqueClipId(`clip_${assetId}`, reservedClipIds)
    reservedClipIds?.add(clipId)

    return {
      id: clipId,
      kind: entry.sourceType === 'generated_transition_bridge' ? 'transition_bridge' : 'source',
      src: entry.url || '',
      durationInFrames: entry.durationInFrames || this.media.fps * 3,
      metadata: {
        storyboardId: entry.storyboardId || '',
        sourcePanelId: entry.sourcePanelId,
        voiceLineId: entry.voiceLineId,
        storyOrder: entry.storyOrder,
        source: clipSourceFor(entry),
        mediaSourceType: clipMediaSourceTypeFor(entry),
        description: entry.description,
        editorAssetId: assetId,
      },
    }
  }

  private uniqueClipId(baseId: string, reservedClipIds?: Set<string>): string {
    const existingIds = reservedClipIds || new Set(this.project.timeline.map((clip) => clip.id))
    if (!existingIds.has(baseId)) return baseId

    let suffix = 2
    let candidate = `${baseId}_${suffix}`
    while (existingIds.has(candidate)) {
      suffix += 1
      candidate = `${baseId}_${suffix}`
    }

    return candidate
  }

  private clampLinkedAttachments(oldClip: VideoClip, newClip: VideoClip, clipStart: number): void {
    const clipEnd = clipStart + newClip.durationInFrames
    const oldPanelId = oldClip.metadata.sourcePanelId
    const oldVoiceLineId = oldClip.metadata.voiceLineId

    this.project.audioTrack = this.project.audioTrack.map((audio) => {
      if (!isLinkedAttachment(audio, oldClip.id, oldPanelId, oldVoiceLineId)) return audio

      return {
        ...audio,
        clipId: audio.clipId === oldClip.id ? newClip.id : audio.clipId,
        durationInFrames: Math.max(0, Math.min(audio.startFrame + audio.durationInFrames, clipEnd) - audio.startFrame),
      }
    })

    this.project.subtitleCues = this.project.subtitleCues.map((cue) => {
      if (!isLinkedAttachment(cue, oldClip.id, oldPanelId, oldVoiceLineId)) return cue

      return {
        ...cue,
        endFrame: Math.max(cue.startFrame, Math.min(cue.endFrame, clipEnd)),
      }
    })
  }

  private clipAnchorMap(): Map<string, { startFrame: number; endFrame: number }> {
    const anchors = new Map<string, { startFrame: number; endFrame: number }>()
    computeClipPositions(this.project.timeline).forEach((clip) => {
      anchors.set(`clip:${clip.id}`, { startFrame: clip.startFrame, endFrame: clip.endFrame })
      if (clip.metadata.sourcePanelId) {
        anchors.set(`panel:${clip.metadata.sourcePanelId}`, { startFrame: clip.startFrame, endFrame: clip.endFrame })
      }
    })
    return anchors
  }

  private reanchorAttachments(beforeAnchors: Map<string, { startFrame: number; endFrame: number }>, afterAnchors: Map<string, { startFrame: number; endFrame: number }>): void {
    this.project.audioTrack = this.project.audioTrack.map((audio) => {
      const anchor = findAttachmentAnchor(audio, beforeAnchors, afterAnchors)
      if (!anchor) return audio

      return {
        ...audio,
        startFrame: anchor.after.startFrame + (audio.startFrame - anchor.before.startFrame),
      }
    })

    this.project.subtitleCues = this.project.subtitleCues.map((cue) => {
      const anchor = findAttachmentAnchor(cue, beforeAnchors, afterAnchors)
      if (!anchor) return cue

      const durationInFrames = cue.endFrame - cue.startFrame
      const startFrame = anchor.after.startFrame + (cue.startFrame - anchor.before.startFrame)
      return {
        ...cue,
        startFrame,
        endFrame: startFrame + durationInFrames,
      }
    })
  }

  private validateDeleteRanges(ranges: RippleDeleteRangesInput['ranges']): Array<{ startFrame: number; endFrame: number }> {
    const totalFrames = calculateTimelineDuration(this.project.timeline)
    const normalizedRanges = ranges
      .map((range) => ({ startFrame: Math.floor(range.startFrame), endFrame: Math.floor(range.endFrame) }))

    let previousEnd = 0
    normalizedRanges.forEach((range) => {
      if (range.startFrame < 0 || range.endFrame <= range.startFrame || range.endFrame > totalFrames || range.startFrame < previousEnd) {
        throw new Error(INVALID_RANGES_ERROR)
      }
      previousEnd = range.endFrame
    })

    return normalizedRanges
  }

  private recordMutation(previousProject: VideoEditorProject, previousOperations: EditorToolOperation[], operation: EditorToolOperation): void {
    this.snapshots.push({ project: previousProject, operations: previousOperations })
    this.operations = [...this.operations, operation]
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

function isLinkedAttachment(
  attachment: { clipId?: string; sourcePanelId?: string; sourceVoiceLineId?: string },
  clipId: string,
  oldPanelId?: string,
  oldVoiceLineId?: string,
): boolean {
  return attachment.clipId === clipId
    || Boolean(oldPanelId && attachment.sourcePanelId === oldPanelId)
    || Boolean(oldVoiceLineId && attachment.sourceVoiceLineId === oldVoiceLineId)
}

function findAttachmentAnchor(
  attachment: { clipId?: string; sourcePanelId?: string },
  beforeAnchors: Map<string, { startFrame: number; endFrame: number }>,
  afterAnchors: Map<string, { startFrame: number; endFrame: number }>,
): { before: { startFrame: number; endFrame: number }; after: { startFrame: number; endFrame: number } } | null {
  const keys = [
    attachment.clipId ? `clip:${attachment.clipId}` : null,
    attachment.sourcePanelId ? `panel:${attachment.sourcePanelId}` : null,
  ].filter((key): key is string => Boolean(key))

  for (const key of keys) {
    const before = beforeAnchors.get(key)
    const after = afterAnchors.get(key)
    if (before && after) return { before, after }
  }

  return null
}

function overlapLength(startFrame: number, endFrame: number, rangeStart: number, rangeEnd: number): number {
  return Math.max(0, Math.min(endFrame, rangeEnd) - Math.max(startFrame, rangeStart))
}

function removeRangesFromInterval(startFrame: number, endFrame: number, ranges: Array<{ startFrame: number; endFrame: number }>): Array<{ startFrame: number; endFrame: number }> {
  let remainingIntervals = [{ startFrame, endFrame }]

  ranges.forEach((range) => {
    remainingIntervals = remainingIntervals.flatMap((interval) => {
      const overlap = overlapLength(interval.startFrame, interval.endFrame, range.startFrame, range.endFrame)
      if (overlap <= 0) return [interval]

      const intervals: Array<{ startFrame: number; endFrame: number }> = []
      if (interval.startFrame < range.startFrame) {
        intervals.push({ startFrame: interval.startFrame, endFrame: Math.min(interval.endFrame, range.startFrame) })
      }
      if (interval.endFrame > range.endFrame) {
        intervals.push({ startFrame: Math.max(interval.startFrame, range.endFrame), endFrame: interval.endFrame })
      }
      return intervals
    })
  })

  return remainingIntervals
}

function transformAudioAttachment(audio: AudioAttachment, ranges: Array<{ startFrame: number; endFrame: number }>): AudioAttachment[] {
  const transformed = transformSegment(audio.startFrame, audio.startFrame + audio.durationInFrames, ranges)
  if (!transformed) return []

  return [{
    ...audio,
    startFrame: transformed.startFrame,
    durationInFrames: transformed.endFrame - transformed.startFrame,
    truncated: audio.truncated || transformed.truncated || undefined,
  }]
}

function transformSubtitleCue(cue: SubtitleCue, ranges: Array<{ startFrame: number; endFrame: number }>): SubtitleCue[] {
  const transformed = transformSegment(cue.startFrame, cue.endFrame, ranges)
  if (!transformed) return []

  return [{
    ...cue,
    startFrame: transformed.startFrame,
    endFrame: transformed.endFrame,
    truncated: cue.truncated || transformed.truncated || undefined,
  }]
}

function transformSegment(startFrame: number, endFrame: number, ranges: Array<{ startFrame: number; endFrame: number }>): { startFrame: number; endFrame: number; truncated: boolean } | null {
  let remainingIntervals = [{ startFrame, endFrame }]
  let truncated = false

  ranges.forEach((range) => {
    remainingIntervals = remainingIntervals.flatMap((interval) => {
      const overlap = overlapLength(interval.startFrame, interval.endFrame, range.startFrame, range.endFrame)
      if (overlap <= 0) return [interval]

      truncated = true
      const intervals: Array<{ startFrame: number; endFrame: number }> = []
      if (interval.startFrame < range.startFrame) {
        intervals.push({ startFrame: interval.startFrame, endFrame: Math.min(interval.endFrame, range.startFrame) })
      }
      if (interval.endFrame > range.endFrame) {
        intervals.push({ startFrame: Math.max(interval.startFrame, range.endFrame), endFrame: interval.endFrame })
      }
      return intervals
    })
  })

  if (remainingIntervals.length === 0) return null

  const firstInterval = remainingIntervals[0]
  const lastInterval = remainingIntervals[remainingIntervals.length - 1]
  const start = mapFrameAfterDeletes(firstInterval.startFrame, ranges)
  const end = mapFrameAfterDeletes(lastInterval.endFrame, ranges)

  if (end <= start) return null
  return { startFrame: start, endFrame: end, truncated }
}

function mapFrameAfterDeletes(frame: number, ranges: Array<{ startFrame: number; endFrame: number }>): number {
  const deletedBeforeFrame = ranges.reduce((total, range) => {
    if (range.endFrame <= frame) return total + (range.endFrame - range.startFrame)
    if (range.startFrame < frame) return total + (frame - range.startFrame)
    return total
  }, 0)

  return frame - deletedBeforeFrame
}

function uniqueId(baseId: string, reservedIds: Set<string>): string {
  if (!reservedIds.has(baseId)) return baseId

  let suffix = 2
  let candidate = `${baseId}_${suffix}`
  while (reservedIds.has(candidate)) {
    suffix += 1
    candidate = `${baseId}_${suffix}`
  }
  return candidate
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function clipSourceFor(entry: AiEditableMediaEntry): VideoClipSource {
  if (entry.sourceType === 'generated_panel_video') return 'panel'
  if (entry.sourceType === 'generated_lip_sync_video') return 'lip_sync'
  if (entry.sourceType === 'generated_transition_bridge') return 'ai_transition'
  if (entry.sourceType === 'user_import_video' || entry.sourceType === 'user_import_image' || entry.sourceType === 'render_output') return 'imported'

  throw new Error(MEDIA_NOT_ELIGIBLE_ERROR)
}

function clipMediaSourceTypeFor(entry: AiEditableMediaEntry): ClipMediaSourceType {
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
