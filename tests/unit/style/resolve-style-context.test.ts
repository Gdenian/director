import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getArtStylePrompt } from '@/lib/constants'
import { resolveStyleContext, type StylePromptSnapshot } from '@/lib/style'

const prismaMock = vi.hoisted(() => ({
  novelPromotionProject: {
    findFirst: vi.fn(),
  },
  globalStyle: {
    findFirst: vi.fn(),
  },
  userPreference: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const baseInput = {
  userId: 'user-1',
  projectId: 'project-1',
  locale: 'zh' as const,
}

function makeSnapshot(): StylePromptSnapshot {
  return {
    version: 1,
    source: 'style-asset',
    fallbackReason: 'none',
    styleAssetId: 'style-1',
    legacyKey: null,
    label: '快照风格',
    positivePrompt: 'snapshot positive',
    negativePrompt: 'snapshot negative',
    sourceUpdatedAt: '2026-04-18T03:00:00.000Z',
    capturedAt: '2026-04-18T03:01:00.000Z',
  }
}

describe('resolveStyleContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.novelPromotionProject.findFirst.mockResolvedValue(null)
    prismaMock.globalStyle.findFirst.mockResolvedValue(null)
    prismaMock.userPreference.findUnique.mockResolvedValue(null)
  })

  it('uses a valid task-snapshot before reading project or user preference state', async () => {
    const result = await resolveStyleContext({
      ...baseInput,
      taskSnapshot: makeSnapshot(),
    })

    expect(result).toMatchObject({
      source: 'task-snapshot',
      fallbackReason: 'none',
      styleAssetId: 'style-1',
      label: '快照风格',
      positivePrompt: 'snapshot positive',
      negativePrompt: 'snapshot negative',
    })
    expect(prismaMock.novelPromotionProject.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.globalStyle.findFirst).not.toHaveBeenCalled()
  })

  it('resolves an accessible style asset with separated positive and negative prompts', async () => {
    prismaMock.novelPromotionProject.findFirst.mockResolvedValue({
      styleAssetId: 'style-asset-1',
      artStylePrompt: 'legacy custom prompt',
      artStyle: 'realistic',
    })
    prismaMock.globalStyle.findFirst.mockResolvedValue({
      id: 'style-asset-1',
      name: '电影黑金',
      positivePrompt: 'cinematic gold and black',
      negativePrompt: 'low quality',
      legacyKey: null,
      source: 'user',
      updatedAt: new Date('2026-04-18T03:00:00.000Z'),
    })

    const result = await resolveStyleContext(baseInput)

    expect(prismaMock.novelPromotionProject.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: 'project-1',
          project: { is: { userId: 'user-1' } },
        },
      }),
    )
    expect(prismaMock.globalStyle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'style-asset-1',
          OR: [{ userId: 'user-1' }, { source: 'system' }],
        }),
      }),
    )
    expect(result).toMatchObject({
      source: 'style-asset',
      fallbackReason: 'none',
      styleAssetId: 'style-asset-1',
      legacyKey: null,
      label: '电影黑金',
      positivePrompt: 'cinematic gold and black',
      negativePrompt: 'low quality',
      sourceUpdatedAt: '2026-04-18T03:00:00.000Z',
    })
  })

  it('resolves a runtime system styleAssetId without querying prisma.globalStyle', async () => {
    prismaMock.novelPromotionProject.findFirst.mockResolvedValue({
      styleAssetId: 'system:american-comic',
      artStylePrompt: null,
      artStyle: 'realistic',
    })

    const result = await resolveStyleContext({
      ...baseInput,
      locale: 'en',
    })

    expect(result).toMatchObject({
      source: 'style-asset',
      styleAssetId: 'system:american-comic',
      legacyKey: 'american-comic',
      positivePrompt: getArtStylePrompt('american-comic', 'en'),
    })
    expect(prismaMock.globalStyle.findFirst).not.toHaveBeenCalled()
  })

  it('falls back through project artStylePrompt, project artStyle, user-preference, and default', async () => {
    prismaMock.novelPromotionProject.findFirst.mockResolvedValueOnce({
      styleAssetId: null,
      artStylePrompt: '  custom visual prompt  ',
      artStyle: 'realistic',
    })
    await expect(resolveStyleContext(baseInput)).resolves.toMatchObject({
      source: 'project-art-style-prompt',
      positivePrompt: 'custom visual prompt',
    })

    prismaMock.novelPromotionProject.findFirst.mockResolvedValueOnce({
      styleAssetId: null,
      artStylePrompt: null,
      artStyle: 'realistic',
    })
    await expect(resolveStyleContext(baseInput)).resolves.toMatchObject({
      source: 'project-art-style',
      legacyKey: 'realistic',
      positivePrompt: getArtStylePrompt('realistic', 'zh'),
    })

    prismaMock.novelPromotionProject.findFirst.mockResolvedValueOnce(null)
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({ artStyle: 'chinese-comic' })
    await expect(resolveStyleContext(baseInput)).resolves.toMatchObject({
      source: 'user-preference',
      legacyKey: 'chinese-comic',
      positivePrompt: getArtStylePrompt('chinese-comic', 'zh'),
    })

    prismaMock.novelPromotionProject.findFirst.mockResolvedValueOnce(null)
    prismaMock.userPreference.findUnique.mockResolvedValueOnce(null)
    await expect(resolveStyleContext(baseInput)).resolves.toMatchObject({
      source: 'default',
      legacyKey: 'american-comic',
      positivePrompt: getArtStylePrompt('american-comic', 'zh'),
    })
  })

  it('uses identical generic fallback for missing, deleted, and inaccessible styleAssetId values', async () => {
    for (const styleAssetId of ['missing-style', 'deleted-style', 'private-style']) {
      prismaMock.novelPromotionProject.findFirst.mockResolvedValueOnce({
        styleAssetId,
        artStylePrompt: null,
        artStyle: 'american-comic',
      })
      prismaMock.globalStyle.findFirst.mockResolvedValueOnce(null)

      const result = await resolveStyleContext(baseInput)

      expect(result).toMatchObject({
        source: 'project-art-style',
        fallbackReason: 'style-asset-missing-or-inaccessible',
        legacyKey: 'american-comic',
      })
      expect(result.label).not.toContain('private')
      expect(result.label).not.toContain('other-user')
    }
  })
})
