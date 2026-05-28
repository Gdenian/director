import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  globalCharacter: { findFirst: vi.fn() },
  novelPromotionCharacter: {
    findUnique: vi.fn(),
    update: vi.fn(async () => ({ id: 'character-1', appearances: [] })),
  },
  characterAppearance: {
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  globalLocation: { findFirst: vi.fn() },
  novelPromotionLocation: {
    findUnique: vi.fn(),
    update: vi.fn(async () => ({ id: 'location-1', images: [] })),
  },
  locationImage: {
    deleteMany: vi.fn(),
    create: vi.fn(async (args: { data: { imageIndex: number; imageUrl?: string | null } }) => ({
      id: `image-${args.data.imageIndex}`,
      imageIndex: args.data.imageIndex,
      imageUrl: args.data.imageUrl ?? null,
    })),
  },
}))

const imageLabelMock = vi.hoisted(() => ({
  createProjectCharacterLabeledCopies: vi.fn(async () => [{ imageUrl: null, imageUrls: '[]' }]),
  createProjectLocationLabeledCopies: vi.fn(async () => []),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/image-label', () => imageLabelMock)

describe('copyAssetFromGlobal style snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('copies global character appearance style snapshot into project appearances', async () => {
    prismaMock.globalCharacter.findFirst.mockResolvedValue({
      id: 'global-character-1',
      userId: 'user-1',
      name: 'Hero',
      appearances: [
        {
          id: 'appearance-global-1',
          appearanceIndex: 0,
          changeReason: '初始形象',
          styleAssetId: 'style-1',
          styleSnapshotName: '电影写实',
          stylePromptZh: '电影写实中文提示词',
          stylePromptEn: 'cinematic realistic prompt',
          styleSnapshotUpdatedAt: new Date('2026-05-28T01:00:00.000Z'),
          description: 'global description',
          descriptions: JSON.stringify(['global description']),
          imageUrl: null,
          imageUrls: '[]',
          selectedIndex: null,
        },
      ],
    })
    prismaMock.novelPromotionCharacter.findUnique.mockResolvedValue({
      id: 'character-1',
      name: 'Hero',
      appearances: [{ id: 'old-appearance' }],
    })

    const { copyAssetFromGlobal } = await import('@/lib/assets/services/asset-actions')
    await copyAssetFromGlobal({
      kind: 'character',
      targetId: 'character-1',
      globalAssetId: 'global-character-1',
      access: { userId: 'user-1', projectId: 'project-1' },
    })

    expect(prismaMock.characterAppearance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        styleAssetId: 'style-1',
        styleSnapshotName: '电影写实',
        stylePromptZh: '电影写实中文提示词',
        stylePromptEn: 'cinematic realistic prompt',
        styleSnapshotUpdatedAt: new Date('2026-05-28T01:00:00.000Z'),
      }),
    })
  })

  it('copies global location style snapshot into the project location', async () => {
    prismaMock.globalLocation.findFirst.mockResolvedValue({
      id: 'global-location-1',
      userId: 'user-1',
      name: 'Old Town',
      summary: '雨夜街道',
      styleAssetId: 'style-1',
      styleSnapshotName: '电影写实',
      stylePromptZh: '电影写实中文提示词',
      stylePromptEn: 'cinematic realistic prompt',
      styleSnapshotUpdatedAt: new Date('2026-05-28T01:00:00.000Z'),
      images: [],
    })
    prismaMock.novelPromotionLocation.findUnique.mockResolvedValue({
      id: 'location-1',
      name: 'Old Town',
      images: [],
    })

    const { copyAssetFromGlobal } = await import('@/lib/assets/services/asset-actions')
    await copyAssetFromGlobal({
      kind: 'location',
      targetId: 'location-1',
      globalAssetId: 'global-location-1',
      access: { userId: 'user-1', projectId: 'project-1' },
    })

    expect(prismaMock.novelPromotionLocation.update).toHaveBeenCalledWith({
      where: { id: 'location-1' },
      data: expect.objectContaining({
        styleAssetId: 'style-1',
        styleSnapshotName: '电影写实',
        stylePromptZh: '电影写实中文提示词',
        stylePromptEn: 'cinematic realistic prompt',
        styleSnapshotUpdatedAt: new Date('2026-05-28T01:00:00.000Z'),
      }),
      include: { images: true },
    })
  })
})
