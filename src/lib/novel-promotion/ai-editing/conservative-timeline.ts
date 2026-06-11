import type { AudioAttachment, SubtitleCue, VideoEditorProject, VideoClip } from '@/features/video-editor/types/editor.types'
import type { EditorManifest } from './types'

export function buildConservativeTimeline(manifest: EditorManifest): VideoEditorProject {
  const sortedClips = [...manifest.clips].sort((left, right) => left.storyOrder - right.storyOrder)
  const dissolveDuration = Math.round(manifest.fps / 2)
  let currentFrame = 0
  const audioTrack: AudioAttachment[] = []
  const subtitleCues: SubtitleCue[] = []

  const timeline: VideoClip[] = sortedClips.map((clip, index) => {
    const voiceLine = manifest.voiceLines.find((line) => line.sourcePanelId === clip.sourcePanelId && line.audioUrl)
    const startFrame = currentFrame
    currentFrame += clip.durationInFrames
    if (voiceLine?.audioUrl) {
      const durationInFrames = Math.min(voiceLine.durationInFrames ?? clip.durationInFrames, clip.durationInFrames)
      audioTrack.push({
        id: `audio-${voiceLine.id}`,
        src: voiceLine.audioUrl,
        startFrame,
        durationInFrames,
        sourceVoiceLineId: voiceLine.id,
        sourcePanelId: voiceLine.sourcePanelId,
        clipId: clip.clipId,
        volume: 1,
        truncated: typeof voiceLine.durationInFrames === 'number' ? voiceLine.durationInFrames > clip.durationInFrames : undefined,
      })
      subtitleCues.push({
        id: `subtitle-${voiceLine.id}`,
        text: voiceLine.text,
        startFrame,
        endFrame: startFrame + durationInFrames,
        sourcePanelId: voiceLine.sourcePanelId,
        sourceVoiceLineId: voiceLine.id,
        style: 'default',
        truncated: typeof voiceLine.durationInFrames === 'number' ? voiceLine.durationInFrames > clip.durationInFrames : undefined,
      })
    }

    return {
      id: clip.clipId,
      kind: 'source',
      src: clip.videoUrl,
      durationInFrames: clip.durationInFrames,
      transition:
        index < sortedClips.length - 1
          ? {
              type: 'dissolve',
              durationInFrames: dissolveDuration,
            }
          : undefined,
      metadata: {
        sourcePanelId: clip.sourcePanelId,
        storyboardId: clip.storyboardId ?? '',
        storyOrder: clip.storyOrder,
        source: 'panel',
        description: clip.description,
      },
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
    editorAssets: [],
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
