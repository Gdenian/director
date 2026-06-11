import type { AudioAttachment, SubtitleCue, VideoEditorProject, VideoClip } from '@/features/video-editor/types/editor.types'
import type { EditPlan, EditorManifest, EditorManifestClip } from './types'

export type ValidationError = { code: string; message: string; path?: string }
export type ValidationResult =
  | { ok: true; project: VideoEditorProject; warnings: string[] }
  | { ok: false; errors: ValidationError[] }

export function validateEditPlan(manifest: EditorManifest, plan: EditPlan): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: string[] = []
  const clipsById = new Map(manifest.clips.map((clip) => [clip.clipId, clip]))
  const editorAssetsById = new Map(manifest.editorAssets.map((asset) => [asset.id, asset]))
  const panels = new Set(manifest.clips.map((clip) => clip.sourcePanelId))
  const voiceLinesById = new Map(manifest.voiceLines.map((line) => [line.id, line]))
  const allowedUrls = new Set([
    ...manifest.clips.map((clip) => clip.videoUrl),
    ...manifest.voiceLines.flatMap((line) => (line.audioUrl ? [line.audioUrl] : [])),
    ...manifest.editorAssets.map((asset) => asset.url),
  ])

  plan.clips.forEach((clip, index) => {
    const kind = clip.kind ?? 'source'
    const sourceClip = kind === 'source' ? clipsById.get(clip.clipId) : undefined
    const editorAsset = kind === 'transition_bridge' && clip.editorAssetId
      ? editorAssetsById.get(clip.editorAssetId)
      : undefined
    if (kind === 'source' && !sourceClip) {
      errors.push({ code: 'CLIP_NOT_IN_MANIFEST', message: 'Clip does not exist in manifest.', path: `clips.${index}.clipId` })
    }
    if (kind === 'transition_bridge') {
      if (!clip.editorAssetId || !editorAsset || editorAsset.kind !== 'transition_bridge') {
        errors.push({
          code: 'EDITOR_ASSET_NOT_IN_MANIFEST',
          message: 'Transition bridge editor asset does not exist in manifest.',
          path: `clips.${index}.editorAssetId`,
        })
      }
    }

    if (!panels.has(clip.sourcePanelId)) {
      errors.push({
        code: 'PANEL_NOT_IN_MANIFEST',
        message: 'Clip source panel does not exist in manifest.',
        path: `clips.${index}.sourcePanelId`,
      })
    }

    if (!allowedUrls.has(clip.src)) {
      errors.push({
        code: 'MEDIA_URL_NOT_IN_MANIFEST',
        message: 'Clip media URL does not exist in manifest.',
        path: `clips.${index}.src`,
      })
    }

    if (sourceClip) {
      validateTrimRange(errors, clip.trim.fromFrame, clip.trim.toFrame, sourceClip, `clips.${index}.trim`)
    } else if (editorAsset) {
      validateEditorAssetTrimRange(errors, clip.trim.fromFrame, clip.trim.toFrame, editorAsset.durationInFrames, `clips.${index}.trim`)
    }
    if (clip.transition) {
      validateTransitionDuration(errors, clip.transition.durationInFrames, manifest.fps, `clips.${index}.transition.durationInFrames`)
    }
  })

  plan.audio.forEach((audio, index) => {
    if (!voiceLinesById.has(audio.sourceVoiceLineId)) {
      errors.push({
        code: 'VOICE_LINE_NOT_IN_MANIFEST',
        message: 'Audio source voice line does not exist in manifest.',
        path: `audio.${index}.sourceVoiceLineId`,
      })
    }
    if (audio.sourcePanelId && !panels.has(audio.sourcePanelId)) {
      errors.push({
        code: 'AUDIO_SOURCE_NOT_IN_EPISODE',
        message: 'Audio source panel does not exist in episode.',
        path: `audio.${index}.sourcePanelId`,
      })
    }
    if (!allowedUrls.has(audio.src)) {
      errors.push({
        code: 'MEDIA_URL_NOT_IN_MANIFEST',
        message: 'Audio media URL does not exist in manifest.',
        path: `audio.${index}.src`,
      })
    }
  })

  plan.subtitles.forEach((subtitle, index) => {
    if (subtitle.sourcePanelId && !panels.has(subtitle.sourcePanelId)) {
      errors.push({
        code: 'SUBTITLE_SOURCE_NOT_IN_EPISODE',
        message: 'Subtitle source panel does not exist in episode.',
        path: `subtitles.${index}.sourcePanelId`,
      })
    }
    if (subtitle.endFrame <= subtitle.startFrame) {
      errors.push({
        code: 'SUBTITLE_RANGE_INVALID',
        message: 'Subtitle end frame must be after start frame.',
        path: `subtitles.${index}`,
      })
    }
    if (subtitle.sourceVoiceLineId && !voiceLinesById.has(subtitle.sourceVoiceLineId)) {
      errors.push({
        code: 'VOICE_LINE_NOT_IN_MANIFEST',
        message: 'Subtitle source voice line does not exist in manifest.',
        path: `subtitles.${index}.sourceVoiceLineId`,
      })
    }
  })

  plan.transitions.forEach((transition, index) => {
    if (!clipsById.has(transition.afterClipId)) {
      errors.push({
        code: 'TRANSITION_CLIP_NOT_IN_MANIFEST',
        message: 'Transition target clip does not exist in manifest.',
        path: `transitions.${index}.afterClipId`,
      })
    }
    validateTransitionDuration(errors, transition.durationInFrames, manifest.fps, `transitions.${index}.durationInFrames`)
  })

  validateLocalReorder(errors, manifest.clips, plan)
  validateAttachmentRanges(errors, manifest, plan)

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    project: buildProjectFromPlan(manifest, plan),
    warnings,
  }
}

function totalPlanDuration(plan: EditPlan) {
  return plan.clips.reduce((total, clip) => total + Math.max(0, clip.trim.toFrame - clip.trim.fromFrame), 0)
}

function validateTrimRange(
  errors: ValidationError[],
  fromFrame: number,
  toFrame: number,
  sourceClip: EditorManifestClip,
  path: string,
) {
  if (fromFrame < 0 || toFrame <= fromFrame || toFrame > sourceClip.durationInFrames) {
    errors.push({
      code: 'TRIM_RANGE_INVALID',
      message: 'Trim range must be non-negative and inside the source clip duration.',
      path,
    })
  }
}

function validateTransitionDuration(errors: ValidationError[], durationInFrames: number, fps: number, path: string) {
  if (durationInFrames < 0 || durationInFrames > fps) {
    errors.push({
      code: 'TRANSITION_DURATION_INVALID',
      message: 'Transition duration must be between 0 and 1 second.',
      path,
    })
  }
}

function validateEditorAssetTrimRange(
  errors: ValidationError[],
  fromFrame: number,
  toFrame: number,
  durationInFrames: number | undefined,
  path: string,
) {
  if (fromFrame < 0 || toFrame <= fromFrame) {
    errors.push({
      code: 'TRIM_RANGE_INVALID',
      message: 'Trim range must be non-negative and have a positive duration.',
      path,
    })
    return
  }

  if (typeof durationInFrames === 'number' && toFrame > durationInFrames) {
    errors.push({
      code: 'TRIM_RANGE_INVALID',
      message: 'Trim range must be inside the editor asset duration.',
      path,
    })
  }
}

function validateAttachmentRanges(errors: ValidationError[], manifest: EditorManifest, plan: EditPlan) {
  const timelineDuration = totalPlanDuration(plan)
  const voiceLinesById = new Map(manifest.voiceLines.map((line) => [line.id, line]))

  plan.audio.forEach((audio, index) => {
    if (audio.startFrame < 0 || audio.durationInFrames <= 0) {
      errors.push({
        code: 'AUDIO_RANGE_INVALID',
        message: 'Audio range must be non-negative and have a positive duration.',
        path: `audio.${index}`,
      })
      return
    }

    const absoluteEnd = audio.startFrame + audio.durationInFrames
    if (absoluteEnd > timelineDuration) {
      errors.push({
        code: 'AUDIO_RANGE_OUTSIDE_TIMELINE',
        message: 'Audio range must fit inside the final timeline.',
        path: `audio.${index}`,
      })
    }
  })

  plan.subtitles.forEach((subtitle, index) => {
    if (subtitle.startFrame < 0 || subtitle.endFrame <= subtitle.startFrame) {
      errors.push({
        code: 'SUBTITLE_RANGE_INVALID',
        message: 'Subtitle range must be non-negative and have a positive duration.',
        path: `subtitles.${index}`,
      })
      return
    }

    if (subtitle.endFrame > timelineDuration) {
      errors.push({
        code: 'SUBTITLE_RANGE_OUTSIDE_TIMELINE',
        message: 'Subtitle range must fit inside the final timeline.',
        path: `subtitles.${index}`,
      })
    }
  })
}

function validateLocalReorder(errors: ValidationError[], manifestClips: readonly EditorManifestClip[], plan: EditPlan) {
  if (plan.risks.some((risk) => risk.includes('local_reorder_accepted'))) {
    return
  }

  const storyPositions = new Map(
    [...manifestClips]
      .sort((left, right) => left.storyOrder - right.storyOrder)
      .map((clip, index) => [clip.clipId, index]),
  )

  plan.clips.forEach((clip, index) => {
    if ((clip.kind ?? 'source') !== 'source') return
    const originalPosition = storyPositions.get(clip.clipId)
    if (typeof originalPosition === 'number' && Math.abs(originalPosition - index) > 2) {
      errors.push({
        code: 'REORDER_TOO_LARGE',
        message: 'Plan reorders a clip by more than 2 positions without explicit risk acceptance.',
        path: `clips.${index}.clipId`,
      })
    }
  })
}

function buildProjectFromPlan(manifest: EditorManifest, plan: EditPlan): VideoEditorProject {
  const clipsById = new Map(manifest.clips.map((clip) => [clip.clipId, clip]))
  const editorAssetsById = new Map(manifest.editorAssets.map((asset) => [asset.id, asset]))
  const transitionsByClipId = new Map(plan.transitions.map((transition) => [transition.afterClipId, transition]))
  const startFramesByPanel = new Map<string, { startFrame: number; clipId: string }>()
  let currentFrame = 0

  const timeline: VideoClip[] = plan.clips.map((clip) => {
    const kind = clip.kind ?? 'source'
    const sourceClip = kind === 'source' ? clipsById.get(clip.clipId) : undefined
    const editorAsset = kind === 'transition_bridge' && clip.editorAssetId
      ? editorAssetsById.get(clip.editorAssetId)
      : undefined
    const transition = clip.transition ?? transitionsByClipId.get(clip.clipId)
    if (kind === 'source' && !startFramesByPanel.has(clip.sourcePanelId)) {
      startFramesByPanel.set(clip.sourcePanelId, { startFrame: currentFrame, clipId: clip.clipId })
    }
    currentFrame += clip.trim.toFrame - clip.trim.fromFrame

    return {
      id: clip.clipId,
      kind,
      src: clip.src,
      durationInFrames: clip.trim.toFrame - clip.trim.fromFrame,
      sourceTrim: {
        fromFrame: clip.trim.fromFrame,
        toFrame: clip.trim.toFrame,
      },
      transition: transition
        ? {
            type: transition.type,
            durationInFrames: transition.durationInFrames,
          }
        : undefined,
      metadata: {
        sourcePanelId: clip.sourcePanelId,
        storyboardId: sourceClip?.storyboardId ?? '',
        storyOrder: sourceClip?.storyOrder,
        source: kind === 'transition_bridge' ? 'ai_transition' : 'panel',
        description: sourceClip?.description,
        editorAssetId: editorAsset?.id,
      },
    }
  })
  const audioTrack: AudioAttachment[] = plan.audio.map((audio) => {
    const anchor = audio.sourcePanelId ? startFramesByPanel.get(audio.sourcePanelId) : undefined
    return {
      id: `audio-${audio.sourceVoiceLineId}`,
      src: audio.src,
      startFrame: (anchor?.startFrame ?? 0) + audio.startFrame,
      durationInFrames: audio.durationInFrames,
      sourceVoiceLineId: audio.sourceVoiceLineId,
      sourcePanelId: audio.sourcePanelId,
      clipId: anchor?.clipId,
      volume: 1,
      truncated: audio.truncated,
    }
  })
  const subtitleCues: SubtitleCue[] = plan.subtitles.map((subtitle) => {
    const anchor = subtitle.sourcePanelId ? startFramesByPanel.get(subtitle.sourcePanelId) : undefined
    return {
      id: subtitle.id,
      text: subtitle.text,
      startFrame: (anchor?.startFrame ?? 0) + subtitle.startFrame,
      endFrame: (anchor?.startFrame ?? 0) + subtitle.endFrame,
      sourcePanelId: subtitle.sourcePanelId,
      sourceVoiceLineId: subtitle.sourceVoiceLineId,
      style: 'default',
      truncated: subtitle.truncated,
    }
  })

  return {
    id: `ai-edit-${manifest.episodeId}`,
    episodeId: manifest.episodeId,
    schemaVersion: '1.2',
    config: {
      fps: manifest.fps,
      width: manifest.dimensions.width,
      height: manifest.dimensions.height,
      videoRatio: inferVideoRatio(manifest.dimensions.width, manifest.dimensions.height),
      burnSubtitlesDefault: true,
    },
    timeline,
    audioTrack,
    subtitleCues,
    editorAssets: manifest.editorAssets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      url: asset.url,
      status: 'completed',
    })),
    bgmTrack: [],
    pendingVersion: null,
  }
}

function inferVideoRatio(width: number, height: number) {
  if (width === height) return '1:1'
  if (height > width) return '9:16'
  if (Math.abs(width / height - 4 / 3) < 0.02) return '4:3'
  return '16:9'
}
