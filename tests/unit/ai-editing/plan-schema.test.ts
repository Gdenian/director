import { describe, expect, it } from 'vitest'
import { parseEditPlan } from '@/lib/novel-promotion/ai-editing/plan-schema'

describe('AI editing edit plan schema', () => {
  it('parses a valid plan with explicit empty arrays', () => {
    const result = parseEditPlan({
      clips: [{ clipId: 'clip-1', sourcePanelId: 'panel-1', src: '/m/video', trim: { fromFrame: 0, toFrame: 60 } }],
      audio: [],
      subtitles: [],
      transitions: [],
      summary: 'valid plan',
      risks: [],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.clips[0].trim).toEqual({ fromFrame: 0, toFrame: 60 })
  })

  it('parses transition bridge clips with durable editor asset ids', () => {
    const result = parseEditPlan({
      clips: [{
        clipId: 'bridge-1',
        kind: 'transition_bridge',
        editorAssetId: 'asset-bridge-1',
        sourcePanelId: 'panel-1',
        src: '/m/bridge.mp4',
        trim: { fromFrame: 0, toFrame: 24 },
      }],
      audio: [],
      subtitles: [],
      transitions: [],
      summary: 'bridge plan',
      risks: [],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.clips[0]).toMatchObject({
      kind: 'transition_bridge',
      editorAssetId: 'asset-bridge-1',
    })
  })

  it('rejects missing arrays and invalid frame numbers', () => {
    const result = parseEditPlan({
      clips: [{ clipId: 'clip-1', sourcePanelId: 'panel-1', src: '/m/video', trim: { fromFrame: 20, toFrame: 10 } }],
      summary: '',
      risks: ['ok'],
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('Expected schema parser to reject malformed plans')
    }
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'audio' }),
      expect.objectContaining({ path: 'subtitles' }),
      expect.objectContaining({ path: 'transitions' }),
      expect.objectContaining({ path: 'clips.0.trim' }),
    ]))
  })
})
