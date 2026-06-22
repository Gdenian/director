import type { EditorManifest } from './types'
import type {
  AiEditableMediaEntry,
  AiEditableMediaKind,
  AiEditableMediaLibrary,
  AiEditableMediaSourceType,
  AiEditableMediaStatus,
} from './tool-types'

type ImportedAssetRow = {
  id: string
  kind: string
  status: string
  url: string | null
  mediaObjectId: string | null
  metadata: string | null
}

type ImportedAssetMetadata = {
  durationMs?: unknown
  width?: unknown
  height?: unknown
  label?: unknown
  description?: unknown
}

const COMPLETED_STATUS: AiEditableMediaStatus = 'completed'
const PENDING_STATUS: AiEditableMediaStatus = 'pending'

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
      status: COMPLETED_STATUS,
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
    const hasAudio = Boolean(line.audioUrl)
    entries.push({
      id: `voice_audio:${line.id}`,
      sourceType: 'voice_audio',
      kind: 'audio',
      status: hasAudio ? COMPLETED_STATUS : 'failed',
      eligibleForTimeline: hasAudio,
      url: line.audioUrl || null,
      durationInFrames: line.durationInFrames,
      sourcePanelId: line.sourcePanelId,
      voiceLineId: line.id,
      label: '配音',
      description: line.text,
    })
  }

  for (const asset of input.manifest.editorAssets) {
    const sourceType = asset.kind === 'transition_bridge' ? 'generated_transition_bridge' : 'render_output'
    entries.push({
      id: `${sourceType}:${asset.id}`,
      assetId: asset.id,
      sourceType,
      kind: 'video',
      status: COMPLETED_STATUS,
      eligibleForTimeline: asset.kind === 'transition_bridge',
      url: asset.url,
      durationInFrames: asset.durationInFrames,
      label: asset.kind === 'transition_bridge' ? '转场补帧' : '历史导出',
    })
  }

  for (const asset of input.importedAssets) {
    const sourceType = toImportedSourceType(asset.kind)
    if (!sourceType) continue

    const metadata = parseMetadata(asset.metadata)
    const status = normalizeStatus(asset.status)
    const url = asset.url

    entries.push({
      id: `${sourceType}:${asset.id}`,
      assetId: asset.id,
      mediaObjectId: asset.mediaObjectId,
      sourceType,
      kind: kindForSourceType(sourceType),
      status,
      eligibleForTimeline: status === COMPLETED_STATUS && Boolean(url),
      url,
      durationInFrames: durationMsToFrames(metadata.durationMs, input.fps),
      width: numberOrNull(metadata.width),
      height: numberOrNull(metadata.height),
      label: labelFromMetadata(metadata),
      description: typeof metadata.description === 'string' ? metadata.description : undefined,
    })
  }

  return {
    fps: input.fps,
    entries,
  }
}

function toImportedSourceType(kind: string): AiEditableMediaSourceType | null {
  if (
    kind === 'user_import_video' ||
    kind === 'user_import_audio' ||
    kind === 'user_import_image' ||
    kind === 'render_output'
  ) {
    return kind
  }

  if (kind === 'transition_bridge') {
    return 'generated_transition_bridge'
  }

  return null
}

function normalizeStatus(status: string): AiEditableMediaStatus {
  if (status === 'completed' || status === 'failed' || status === 'canceled') {
    return status
  }

  return PENDING_STATUS
}

function kindForSourceType(sourceType: AiEditableMediaSourceType): AiEditableMediaKind {
  if (sourceType === 'user_import_audio' || sourceType === 'voice_audio') return 'audio'
  if (sourceType === 'user_import_image') return 'image'
  if (sourceType === 'subtitle_source') return 'subtitle'

  return 'video'
}

function parseMetadata(metadata: string | null): ImportedAssetMetadata {
  if (!metadata) return {}

  try {
    const parsed = JSON.parse(metadata)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function durationMsToFrames(durationMs: unknown, fps: number): number | undefined {
  const value = numericValue(durationMs)
  if (value == null) return undefined

  return Math.round((value / 1000) * fps)
}

function numberOrNull(value: unknown): number | null {
  return numericValue(value)
}

function numericValue(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null

  return value
}

function labelFromMetadata(metadata: ImportedAssetMetadata): string {
  if (typeof metadata.label !== 'string') return '导入素材'

  const label = metadata.label.trim()
  return label || '导入素材'
}
