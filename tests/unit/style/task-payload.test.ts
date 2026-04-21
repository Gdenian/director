import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildProjectStyleTaskPayload } from '@/lib/style/task-payload'

const resolveStyleContextMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/style/resolve-style-context', () => ({
  resolveStyleContext: resolveStyleContextMock,
}))

describe('buildProjectStyleTaskPayload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds a snapshot payload from a style asset context', async () => {
    resolveStyleContextMock.mockResolvedValueOnce({
      source: 'style-asset',
      fallbackReason: 'none',
      styleAssetId: 'style-1',
      legacyKey: null,
      label: '电影黑金',
      positivePrompt: 'cinematic gold and black',
      negativePrompt: 'no blur',
      sourceUpdatedAt: '2026-04-20T10:00:00.000Z',
    })

    const result = await buildProjectStyleTaskPayload({
      projectId: 'project-1',
      userId: 'user-1',
      locale: 'zh',
    })

    expect(resolveStyleContextMock).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      locale: 'zh',
    })
    expect(result.stylePromptSnapshot).toMatchObject({
      version: 1,
      source: 'style-asset',
      styleAssetId: 'style-1',
      positivePrompt: 'cinematic gold and black',
      negativePrompt: 'no blur',
    })
    expect(result.legacyArtStyle).toBeNull()
  })

  it('keeps legacyArtStyle when the resolved project style falls back to a legacy key', async () => {
    resolveStyleContextMock.mockResolvedValueOnce({
      source: 'project-art-style',
      fallbackReason: 'none',
      styleAssetId: null,
      legacyKey: 'realistic',
      label: '写实',
      positivePrompt: 'photorealistic',
      negativePrompt: null,
      sourceUpdatedAt: null,
    })

    const result = await buildProjectStyleTaskPayload({
      projectId: 'project-1',
      userId: 'user-1',
      locale: 'zh',
    })

    expect(result.stylePromptSnapshot).toMatchObject({
      source: 'project-art-style',
      legacyKey: 'realistic',
      positivePrompt: 'photorealistic',
    })
    expect(result.legacyArtStyle).toBe('realistic')
  })
})
