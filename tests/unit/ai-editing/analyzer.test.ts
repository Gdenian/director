import { describe, expect, it } from 'vitest'
import { analyzeEditorManifest } from '@/lib/novel-promotion/ai-editing/analyzer'

describe('AI editing deterministic analyzer', () => {
  it('flags duration mismatch, duplicate media, and missing continuity', () => {
    const result = analyzeEditorManifest({
      fps: 30,
      clips: [
        {
          clipId: 'clip-1',
          sourcePanelId: 'panel-1',
          storyOrder: 0,
          durationInFrames: 300,
          videoUrl: '/m/a',
          voiceDurationInFrames: 60,
          linkedToNextPanel: false,
          description: 'same',
        },
        {
          clipId: 'clip-2',
          sourcePanelId: 'panel-2',
          storyOrder: 1,
          durationInFrames: 30,
          videoUrl: '/m/a',
          voiceDurationInFrames: 90,
          linkedToNextPanel: false,
          description: 'same',
        },
      ],
    })

    expect(result.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'duration_mismatch', clipId: 'clip-1' }),
        expect.objectContaining({ type: 'duplicate_source_url', clipId: 'clip-2' }),
        expect.objectContaining({ type: 'continuity_gap', clipId: 'clip-1' }),
      ]),
    )
  })
})
