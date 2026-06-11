import { describe, expect, it } from 'vitest'
import { dimensionsForVideoRatio } from '@/features/video-editor/utils/dimensions'

describe('editor dimensions', () => {
  it.each([
    ['16:9', 1920, 1080],
    ['9:16', 1080, 1920],
    ['1:1', 1080, 1080],
    ['4:3', 1440, 1080],
  ])('maps %s to stable render dimensions', (ratio, width, height) => {
    expect(dimensionsForVideoRatio(ratio)).toEqual({ width, height })
  })

  it('falls back to 16:9 for unknown ratios', () => {
    expect(dimensionsForVideoRatio('unknown')).toEqual({ width: 1920, height: 1080 })
  })
})
