import type { AudioAttachment, ComputedClip, EditorConfig, SubtitleCue, VideoEditorProject } from '@/features/video-editor/types/editor.types'

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

export type EditorTimelineToolResult = {
  config: EditorConfig
  clips: ComputedClip[]
  audioTrack: AudioAttachment[]
  subtitleCues: SubtitleCue[]
  totalFrames: number
}

export type InsertClipsInput = { afterClipId?: string; beforeClipId?: string; atIndex?: number; end?: boolean; mediaIds: string[] }
export type ReplaceClipInput = { clipId: string; mediaId: string }
export type SetClipPropertiesInput = { clipId: string; durationInFrames?: number; sourceTrim?: { fromFrame: number; toFrame: number }; transition?: { type: 'none' | 'dissolve' | 'fade' | 'slide'; durationInFrames: number }; subtitlePlacement?: 'bottom' | 'lower' | 'middle' }
export type MoveClipsInput = { clipIds: string[]; toIndex: number }
export type SplitClipInput = { clipId: string; atFrame: number }
export type RemoveClipsInput = { clipIds: string[]; removeLinkedAudioAndSubtitles?: boolean }
export type RippleDeleteRangesInput = { ranges: Array<{ startFrame: number; endFrame: number }> }
