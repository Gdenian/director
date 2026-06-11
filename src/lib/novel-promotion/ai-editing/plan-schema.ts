import type { EditPlan } from './types'

export type EditPlanParseError = {
  path: string
  message: string
}

export type EditPlanParseResult =
  | { ok: true; plan: EditPlan }
  | { ok: false; errors: EditPlanParseError[] }

type AnyRecord = Record<string, unknown>
type TransitionType = EditPlan['transitions'][number]['type']

function toRecord(value: unknown): AnyRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as AnyRecord
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readFrame(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.floor(value)
}

function requireArray(value: unknown, path: string, errors: EditPlanParseError[]): unknown[] {
  if (Array.isArray(value)) return value
  errors.push({ path, message: 'Expected an array.' })
  return []
}

function parseTransitionType(value: unknown): TransitionType | null {
  return value === 'none' || value === 'dissolve' || value === 'fade' || value === 'slide'
    ? value
    : null
}

export function parseEditPlan(value: unknown): EditPlanParseResult {
  const errors: EditPlanParseError[] = []
  const root = toRecord(value)
  if (!root) {
    return { ok: false, errors: [{ path: '', message: 'Expected an object.' }] }
  }

  const clips = requireArray(root.clips, 'clips', errors).map((item, index): EditPlan['clips'][number] | null => {
    const clip = toRecord(item)
    if (!clip) {
      errors.push({ path: `clips.${index}`, message: 'Expected an object.' })
      return null
    }
    const clipId = readString(clip.clipId)
    const kind = clip.kind === 'transition_bridge' ? 'transition_bridge' : 'source'
    const editorAssetId = readString(clip.editorAssetId) || undefined
    const sourcePanelId = readString(clip.sourcePanelId)
    const src = readString(clip.src)
    const trim = toRecord(clip.trim)
    const fromFrame = readFrame(trim?.fromFrame)
    const toFrame = readFrame(trim?.toFrame)
    if (!clipId) errors.push({ path: `clips.${index}.clipId`, message: 'Expected a non-empty string.' })
    if (kind === 'transition_bridge' && !editorAssetId) {
      errors.push({ path: `clips.${index}.editorAssetId`, message: 'Expected a non-empty string for transition bridge clips.' })
    }
    if (!sourcePanelId) errors.push({ path: `clips.${index}.sourcePanelId`, message: 'Expected a non-empty string.' })
    if (!src) errors.push({ path: `clips.${index}.src`, message: 'Expected a non-empty string.' })
    if (fromFrame === null || toFrame === null || toFrame <= fromFrame) {
      errors.push({ path: `clips.${index}.trim`, message: 'Expected a valid frame range.' })
    }

    const transitionInput = clip.transition === undefined ? null : toRecord(clip.transition)
    const transitionType = transitionInput ? parseTransitionType(transitionInput.type) : null
    const transitionDuration = transitionInput ? readFrame(transitionInput.durationInFrames) : null
    if (transitionInput && (!transitionType || transitionDuration === null || transitionDuration < 0)) {
      errors.push({ path: `clips.${index}.transition`, message: 'Expected a valid transition.' })
    }

    if (!clipId || !sourcePanelId || !src || fromFrame === null || toFrame === null || toFrame <= fromFrame) return null
    if (kind === 'transition_bridge' && !editorAssetId) return null
    return {
      clipId,
      kind,
      ...(editorAssetId ? { editorAssetId } : {}),
      sourcePanelId,
      src,
      trim: { fromFrame, toFrame },
      ...(transitionInput && transitionType && transitionDuration !== null
        ? { transition: { type: transitionType, durationInFrames: transitionDuration } }
        : {}),
    }
  }).filter((item): item is EditPlan['clips'][number] => Boolean(item))

  const audio = requireArray(root.audio, 'audio', errors).map((item, index): EditPlan['audio'][number] | null => {
    const audioItem = toRecord(item)
    if (!audioItem) {
      errors.push({ path: `audio.${index}`, message: 'Expected an object.' })
      return null
    }
    const sourceVoiceLineId = readString(audioItem.sourceVoiceLineId)
    const sourcePanelId = readString(audioItem.sourcePanelId) || undefined
    const startFrame = readFrame(audioItem.startFrame)
    const durationInFrames = readFrame(audioItem.durationInFrames)
    const src = readString(audioItem.src)
    if (!sourceVoiceLineId) errors.push({ path: `audio.${index}.sourceVoiceLineId`, message: 'Expected a non-empty string.' })
    if (startFrame === null || startFrame < 0) errors.push({ path: `audio.${index}.startFrame`, message: 'Expected a non-negative frame.' })
    if (durationInFrames === null || durationInFrames <= 0) errors.push({ path: `audio.${index}.durationInFrames`, message: 'Expected a positive frame duration.' })
    if (!src) errors.push({ path: `audio.${index}.src`, message: 'Expected a non-empty string.' })
    if (!sourceVoiceLineId || startFrame === null || durationInFrames === null || durationInFrames <= 0 || !src) return null
    return {
      sourceVoiceLineId,
      ...(sourcePanelId ? { sourcePanelId } : {}),
      startFrame,
      durationInFrames,
      src,
      ...(audioItem.truncated === true ? { truncated: true } : {}),
    }
  }).filter((item): item is EditPlan['audio'][number] => Boolean(item))

  const subtitles = requireArray(root.subtitles, 'subtitles', errors).map((item, index): EditPlan['subtitles'][number] | null => {
    const subtitle = toRecord(item)
    if (!subtitle) {
      errors.push({ path: `subtitles.${index}`, message: 'Expected an object.' })
      return null
    }
    const id = readString(subtitle.id)
    const text = readString(subtitle.text)
    const startFrame = readFrame(subtitle.startFrame)
    const endFrame = readFrame(subtitle.endFrame)
    const sourcePanelId = readString(subtitle.sourcePanelId) || undefined
    const sourceVoiceLineId = readString(subtitle.sourceVoiceLineId) || undefined
    if (!id) errors.push({ path: `subtitles.${index}.id`, message: 'Expected a non-empty string.' })
    if (!text) errors.push({ path: `subtitles.${index}.text`, message: 'Expected a non-empty string.' })
    if (startFrame === null || endFrame === null || endFrame <= startFrame) {
      errors.push({ path: `subtitles.${index}`, message: 'Expected a valid subtitle frame range.' })
    }
    if (!id || !text || startFrame === null || endFrame === null || endFrame <= startFrame) return null
    return {
      id,
      text,
      startFrame,
      endFrame,
      ...(sourcePanelId ? { sourcePanelId } : {}),
      ...(sourceVoiceLineId ? { sourceVoiceLineId } : {}),
      ...(subtitle.truncated === true ? { truncated: true } : {}),
    }
  }).filter((item): item is EditPlan['subtitles'][number] => Boolean(item))

  const transitions = requireArray(root.transitions, 'transitions', errors).map((item, index) => {
    const transition = toRecord(item)
    if (!transition) {
      errors.push({ path: `transitions.${index}`, message: 'Expected an object.' })
      return null
    }
    const afterClipId = readString(transition.afterClipId)
    const type = parseTransitionType(transition.type)
    const durationInFrames = readFrame(transition.durationInFrames)
    if (!afterClipId) errors.push({ path: `transitions.${index}.afterClipId`, message: 'Expected a non-empty string.' })
    if (!type || durationInFrames === null || durationInFrames < 0) {
      errors.push({ path: `transitions.${index}`, message: 'Expected a valid transition.' })
    }
    if (!afterClipId || !type || durationInFrames === null || durationInFrames < 0) return null
    return { afterClipId, type, durationInFrames }
  }).filter((item): item is EditPlan['transitions'][number] => Boolean(item))

  const summary = readString(root.summary)
  if (!summary) errors.push({ path: 'summary', message: 'Expected a non-empty string.' })

  const risksInput = requireArray(root.risks, 'risks', errors)
  const risks = risksInput.map((risk, index) => {
    const value = readString(risk)
    if (!value) errors.push({ path: `risks.${index}`, message: 'Expected a non-empty string.' })
    return value
  }).filter((risk): risk is string => Boolean(risk))

  if (errors.length > 0 || !summary) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    plan: {
      clips,
      audio,
      subtitles,
      transitions,
      summary,
      risks,
    },
  }
}
