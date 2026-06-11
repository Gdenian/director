import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  novelPromotionEpisode: {
    findFirst: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { buildEditorManifest } from '@/lib/novel-promotion/ai-editing/manifest'

describe('AI editing manifest builder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves voice line panel ownership from storyboard id and panel index', async () => {
    prismaMock.novelPromotionEpisode.findFirst.mockResolvedValue({
      id: 'episode-1',
      novelPromotionProject: { videoRatio: '9:16' },
      storyboards: [
        {
          id: 'storyboard-1',
          clip: { summary: 'scene' },
          panels: [
            {
              id: 'panel-1',
              panelIndex: 0,
              videoUrl: '/m/video.mp4',
              lipSyncVideoUrl: null,
              videoMedia: { durationMs: 2000 },
              lipSyncVideoMedia: null,
              duration: 2,
              linkedToNextPanel: false,
              description: 'panel',
            },
          ],
        },
      ],
      voiceLines: [
        {
          id: 'voice-1',
          matchedPanelId: null,
          matchedStoryboardId: 'storyboard-1',
          matchedPanelIndex: 0,
          audioUrl: '/m/audio.wav',
          audioDuration: 1500,
          audioMedia: null,
          content: 'line',
        },
      ],
      editorProject: { assets: [] },
    })

    const manifest = await buildEditorManifest({ projectId: 'project-1', episodeId: 'episode-1' })

    expect(manifest.voiceLines).toEqual([
      expect.objectContaining({
        id: 'voice-1',
        sourcePanelId: 'panel-1',
      }),
    ])
    expect(manifest.clips[0]).toEqual(expect.objectContaining({
      clipId: 'panel-1',
      voiceDurationInFrames: 45,
    }))
  })
})
