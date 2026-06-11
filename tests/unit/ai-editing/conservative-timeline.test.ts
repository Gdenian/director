import { describe, expect, it } from 'vitest'
import { buildConservativeTimeline } from '@/lib/novel-promotion/ai-editing/conservative-timeline'

describe('AI editing conservative timeline', () => {
  it('builds a story-order timeline with source clips, voice attachments, subtitles, and dissolve transitions', () => {
    const project = buildConservativeTimeline({
      episodeId: 'episode-1',
      fps: 30,
      dimensions: { width: 1080, height: 1920 },
      clips: [
        {
          clipId: 'clip-2',
          sourcePanelId: 'panel-2',
          storyboardId: 'storyboard-2',
          storyOrder: 1,
          videoUrl: '/m/video-2',
          durationInFrames: 45,
        },
        {
          clipId: 'clip-1',
          sourcePanelId: 'panel-1',
          storyboardId: 'storyboard-1',
          storyOrder: 0,
          videoUrl: '/m/video-1',
          durationInFrames: 60,
          description: 'opening',
        },
      ],
      voiceLines: [
        {
          id: 'voice-1',
          sourcePanelId: 'panel-1',
          audioUrl: '/m/audio-1',
          durationInFrames: 48,
          text: 'first line',
        },
      ],
      editorAssets: [],
    })

    expect(project.timeline.map((clip) => clip.id)).toEqual(['clip-1', 'clip-2'])
    expect(project.timeline[0]).toMatchObject({
      kind: 'source',
      src: '/m/video-1',
      durationInFrames: 60,
      transition: { type: 'dissolve', durationInFrames: 15 },
      metadata: { sourcePanelId: 'panel-1', storyboardId: 'storyboard-1', storyOrder: 0, source: 'panel', description: 'opening' },
    })
    expect(project.audioTrack).toEqual([
      expect.objectContaining({ src: '/m/audio-1', startFrame: 0, durationInFrames: 48, sourceVoiceLineId: 'voice-1', clipId: 'clip-1' }),
    ])
    expect(project.subtitleCues).toEqual([
      expect.objectContaining({ text: 'first line', startFrame: 0, endFrame: 48, sourcePanelId: 'panel-1', sourceVoiceLineId: 'voice-1' }),
    ])
    expect(project.timeline[1].transition).toBeUndefined()
  })
})
