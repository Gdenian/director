import { describe, expect, it, vi } from 'vitest'
import { resolveDurationFrames } from '@/lib/novel-promotion/ai-editing/media-probe'

describe('AI editing media probe', () => {
  it('uses stored media duration before fallback duration', async () => {
    const result = await resolveDurationFrames({
      fps: 30,
      mediaDurationMs: 2500,
      fallbackSeconds: 10,
      probeUrl: '/m/video',
      probe: vi.fn(),
    })

    expect(result).toEqual({ durationInFrames: 75, source: 'media_object' })
  })

  it('falls back to panel duration when probing fails', async () => {
    const result = await resolveDurationFrames({
      fps: 30,
      mediaDurationMs: null,
      fallbackSeconds: 4,
      probeUrl: '/m/video',
      probe: vi.fn(async () => null),
    })

    expect(result).toEqual({ durationInFrames: 120, source: 'fallback' })
  })
})
