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
  clips: readonly EditorManifestClip[]
  voiceLines: readonly {
    id: string
    sourcePanelId?: string
    audioUrl?: string | null
    durationInFrames?: number
    text: string
  }[]
  editorAssets: readonly {
    id: string
    kind: 'transition_bridge' | 'render_output'
    url: string
    durationInFrames?: number
  }[]
}

export type EditPlan = {
  clips: Array<{
    clipId: string
    kind?: 'source' | 'transition_bridge'
    editorAssetId?: string
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
    truncated?: boolean
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
  transitions: Array<{
    afterClipId: string
    type: 'none' | 'dissolve' | 'fade' | 'slide'
    durationInFrames: number
  }>
  summary: string
  risks: string[]
}
