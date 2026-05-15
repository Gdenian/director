import { describe, expect, it } from 'vitest'
import { bgmScorePlanSchema } from '@/lib/bgm-score/types'

const basePlan = {
  durationSeconds: 30,
  global: {
    mood: 'dark suspense',
    genre: 'cinematic minimal score',
    bpm: 72,
    key: 'D minor',
    intensityCurve: [{ timeSec: 0, intensity: 30 }],
  },
  stems: [
    {
      role: 'atmosphere',
      reason: 'Continuous glue for the full scene.',
      startSec: 0,
      durationSec: 30,
      gainDb: -12,
      fadeInSec: 1,
      fadeOutSec: 2,
      density: 20,
      tension: 40,
      brightness: 25,
      motion: 20,
      prompt: 'Generate an isolated atmosphere stem only.',
      negativePrompt: 'no vocals',
    },
  ],
}

describe('bgm score plan schema', () => {
  it('accepts a valid dynamic multi-stem plan', () => {
    const result = bgmScorePlanSchema.safeParse(basePlan)
    expect(result.success).toBe(true)
  })

  it('rejects duplicate stem roles', () => {
    const result = bgmScorePlanSchema.safeParse({
      ...basePlan,
      stems: [
        basePlan.stems[0],
        { ...basePlan.stems[0], reason: 'Duplicate role should fail.' },
      ],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.some((issue) => issue.message === 'BGM_SCORE_DUPLICATE_STEM_ROLE')).toBe(true)
  })

  it('rejects stems that exceed the plan duration', () => {
    const result = bgmScorePlanSchema.safeParse({
      ...basePlan,
      stems: [{ ...basePlan.stems[0], startSec: 20, durationSec: 20 }],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.some((issue) => issue.message === 'BGM_SCORE_STEM_TIMING_OUT_OF_RANGE')).toBe(true)
  })

  it('rejects invalid gain ranges', () => {
    const result = bgmScorePlanSchema.safeParse({
      ...basePlan,
      stems: [{ ...basePlan.stems[0], gainDb: 12 }],
    })
    expect(result.success).toBe(false)
  })
})
