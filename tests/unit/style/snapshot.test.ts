import { describe, expect, it } from 'vitest'
import {
  createStylePromptSnapshot,
  normalizeStylePromptSnapshot,
  type ResolvedStyleContext,
} from '@/lib/style'

function buildResolvedContext(): ResolvedStyleContext {
  return {
    source: 'style-asset',
    fallbackReason: 'none',
    styleAssetId: 'style-1',
    legacyKey: null,
    label: '电影黑金',
    positivePrompt: 'cinematic gold and black',
    negativePrompt: 'low quality',
    sourceUpdatedAt: '2026-04-18T03:00:00.000Z',
  }
}

describe('style prompt snapshots', () => {
  it('creates a versioned JSON-serializable snapshot with separated prompts', () => {
    const context = buildResolvedContext()
    const snapshot = createStylePromptSnapshot(context, new Date('2026-04-18T03:10:00.000Z'))

    expect(snapshot).toMatchObject({
      version: 1,
      source: 'style-asset',
      fallbackReason: 'none',
      styleAssetId: 'style-1',
      legacyKey: null,
      label: '电影黑金',
      positivePrompt: 'cinematic gold and black',
      negativePrompt: 'low quality',
      capturedAt: '2026-04-18T03:10:00.000Z',
    })
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
  })

  it('does not drift when the original resolved context is mutated after capture', () => {
    const context = buildResolvedContext()
    const snapshot = createStylePromptSnapshot(context)

    context.label = 'mutated'
    context.positivePrompt = 'mutated prompt'
    context.negativePrompt = null

    expect(snapshot.label).toBe('电影黑金')
    expect(snapshot.positivePrompt).toBe('cinematic gold and black')
    expect(snapshot.negativePrompt).toBe('low quality')
  })

  it('normalizes valid unknown payloads and rejects malformed snapshots', () => {
    const snapshot = createStylePromptSnapshot(buildResolvedContext())

    expect(normalizeStylePromptSnapshot(snapshot)).toEqual(snapshot)
    expect(normalizeStylePromptSnapshot({ ...snapshot, version: 2 })).toBeNull()
    expect(normalizeStylePromptSnapshot({ ...snapshot, positivePrompt: null })).toBeNull()
    expect(normalizeStylePromptSnapshot({ ...snapshot, negativePrompt: 123 })).toBeNull()
    expect(normalizeStylePromptSnapshot({ ...snapshot, source: 'unsafe-source' })).toBeNull()
    expect(normalizeStylePromptSnapshot(null)).toBeNull()
  })
})
