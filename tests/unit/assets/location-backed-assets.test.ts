import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
  locationImage: { createMany: vi.fn() },
  globalLocationImage: { createMany: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

describe('location-backed assets service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 'location-1',
          novelPromotionProjectId: 'novel-project-1',
          name: 'Bronze Dagger',
          summary: 'Old bronze dagger',
          selectedImageId: null,
          sourceGlobalLocationId: null,
          assetKind: 'prop',
        },
      ])
      .mockResolvedValueOnce([])
  })

  it('queries project location-backed assets with real schema column names', async () => {
    const mod = await import('@/lib/assets/services/location-backed-assets')

    await mod.listProjectLocationBackedAssets('novel-project-1', 'prop')

    const assetQuery = prismaMock.$queryRaw.mock.calls[0]?.[0] as { strings?: ReadonlyArray<string>; sql?: string }
    const imageQuery = prismaMock.$queryRaw.mock.calls[1]?.[0] as { strings?: ReadonlyArray<string>; sql?: string }
    const assetSql = assetQuery.strings?.join(' ') ?? assetQuery.sql ?? ''
    const imageSql = imageQuery.strings?.join(' ') ?? imageQuery.sql ?? ''

    expect(assetSql).toContain('FROM novel_promotion_locations')
    expect(assetSql).toContain('novelPromotionProjectId')
    expect(assetSql).not.toContain('projectId')
    expect(imageSql).toContain('FROM location_images')
    expect(imageSql).toContain('NULL AS previousImageMediaId')
  })

  it('seeds an initial project image slot when creating a prop asset', async () => {
    const mod = await import('@/lib/assets/services/location-backed-assets')

    const result = await mod.createProjectLocationBackedAsset({
      novelPromotionProjectId: 'novel-project-1',
      name: 'Bronze Dagger',
      summary: 'Old bronze dagger',
      initialDescription: 'A bronze dagger with a carved handle and weathered blade',
      kind: 'prop',
    })

    expect(prismaMock.locationImage.createMany).toHaveBeenCalledWith({
      data: [
        {
          locationId: result.id,
          imageIndex: 0,
          description: 'A bronze dagger with a carved handle and weathered blade',
          availableSlots: '[]',
        },
      ],
    })
  })

  it('writes project style snapshot columns when creating a prop asset', async () => {
    const mod = await import('@/lib/assets/services/location-backed-assets')

    await mod.createProjectLocationBackedAsset({
      novelPromotionProjectId: 'novel-project-1',
      name: 'Bronze Dagger',
      summary: 'Old bronze dagger',
      initialDescription: 'A bronze dagger',
      kind: 'prop',
      styleSnapshot: {
        styleAssetId: 'style-1',
        name: '电影写实',
        promptZh: '电影写实中文提示词',
        promptEn: 'cinematic realistic prompt',
        snapshotUpdatedAt: '2026-05-28T01:00:00.000Z',
      },
    })

    const insertQuery = prismaMock.$executeRaw.mock.calls[0]?.[0] as { strings?: ReadonlyArray<string>; sql?: string }
    const insertSql = insertQuery.strings?.join(' ') ?? insertQuery.sql ?? ''
    expect(insertSql).toContain('styleAssetId')
    expect(insertSql).toContain('styleSnapshotName')
    expect(insertSql).toContain('stylePromptZh')
    expect(insertSql).toContain('stylePromptEn')
    expect(insertSql).toContain('styleSnapshotUpdatedAt')
  })

  it('seeds multiple project image slots when explicit descriptions are provided', async () => {
    const mod = await import('@/lib/assets/services/location-backed-assets')

    await mod.seedProjectLocationBackedImageSlots({
      locationId: 'location-1',
      descriptions: ['Night street', 'Rainy alley'],
      fallbackDescription: 'Night street',
    })

    expect(prismaMock.locationImage.createMany).toHaveBeenCalledWith({
      data: [
        {
          locationId: 'location-1',
          imageIndex: 0,
          description: 'Night street',
          availableSlots: '[]',
        },
        {
          locationId: 'location-1',
          imageIndex: 1,
          description: 'Rainy alley',
          availableSlots: '[]',
        },
      ],
    })
  })
})
