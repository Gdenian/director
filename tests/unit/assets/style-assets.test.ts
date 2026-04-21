import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-errors'
import { getArtStylePrompt } from '@/lib/constants'

const prismaMock = vi.hoisted(() => ({
  globalStyle: {
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

describe('style assets service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists global style assets with user scope and runtime system styles', async () => {
    prismaMock.globalStyle.findMany.mockResolvedValue([
      {
        id: 'style-1',
        userId: 'user-1',
        folderId: null,
        name: '冷峻赛博',
        description: '蓝紫霓虹夜景',
        positivePrompt: 'cyberpunk neon city',
        negativePrompt: 'blurry',
        tags: '["赛博","冷色"]',
        source: 'user',
        legacyKey: null,
        previewMedia: {
          id: 'media-1',
          publicId: 'style-preview',
          storageKey: 'internal/style-preview.png',
          mimeType: 'image/png',
          sizeBytes: 1024,
          width: 512,
          height: 512,
          durationMs: null,
        },
      },
    ])

    const { listReadableGlobalStyleAssets } = await import('@/lib/assets/services/style-assets')
    const assets = await listReadableGlobalStyleAssets({
      userId: 'user-1',
      folderId: null,
    })

    expect(prismaMock.globalStyle.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
      },
      include: {
        previewMedia: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })
    expect(assets.some((asset) => asset.id === 'style-1')).toBe(true)
    expect(assets.some((asset) => asset.id === 'system:american-comic')).toBe(true)
  })

  it('localizes runtime system styles with the requested locale', async () => {
    prismaMock.globalStyle.findMany.mockResolvedValue([])

    const { listReadableGlobalStyleAssets } = await import('@/lib/assets/services/style-assets')
    const assets = await listReadableGlobalStyleAssets({
      userId: 'user-1',
      locale: 'en',
    })

    expect(assets.find((asset) => asset.id === 'system:american-comic')?.name).toBe('Comic Style')
    expect(assets.find((asset) => asset.id === 'system:american-comic')?.positivePrompt).toBe(
      getArtStylePrompt('american-comic', 'en'),
    )
  })

  it('omits runtime system styles when filtering by folder', async () => {
    prismaMock.globalStyle.findMany.mockResolvedValue([
      {
        id: 'style-2',
        userId: 'user-1',
        folderId: 'folder-1',
        name: '写实纪实',
        description: null,
        positivePrompt: 'documentary realism',
        negativePrompt: null,
        tags: null,
        source: 'user',
        legacyKey: null,
        previewMedia: null,
      },
    ])

    const { listReadableGlobalStyleAssets } = await import('@/lib/assets/services/style-assets')
    const assets = await listReadableGlobalStyleAssets({
      userId: 'user-1',
      folderId: 'folder-1',
    })

    expect(prismaMock.globalStyle.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        folderId: 'folder-1',
      },
      include: {
        previewMedia: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })
    expect(assets.map((asset) => asset.id)).toEqual(['style-2'])
  })

  it('creates a user-owned global style asset and only persists previewMediaId', async () => {
    prismaMock.globalStyle.create.mockResolvedValue({
      id: 'style-new',
    })

    const { createGlobalStyleAsset } = await import('@/lib/assets/services/style-assets')
    const result = await createGlobalStyleAsset({
      userId: 'user-1',
      name: '  冷峻赛博  ',
      description: '  蓝紫霓虹夜景  ',
      positivePrompt: '  cyberpunk neon city  ',
      negativePrompt: '  blurry  ',
      tags: ['赛博', '冷色', ''],
      folderId: '  folder-1  ',
      previewMediaId: '  media-1  ',
      previewUrl: 'https://example.com/private.png',
      previewStorageKey: 'internal/key.png',
      signedUrl: 'https://signed.example.com',
    })

    expect(prismaMock.globalStyle.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        source: 'user',
        name: '冷峻赛博',
        description: '蓝紫霓虹夜景',
        positivePrompt: 'cyberpunk neon city',
        negativePrompt: 'blurry',
        tags: '["赛博","冷色"]',
        folderId: 'folder-1',
        previewMediaId: 'media-1',
      },
    })
    expect(prismaMock.globalStyle.create.mock.calls[0]?.[0]?.data).not.toHaveProperty('previewUrl')
    expect(prismaMock.globalStyle.create.mock.calls[0]?.[0]?.data).not.toHaveProperty('previewStorageKey')
    expect(prismaMock.globalStyle.create.mock.calls[0]?.[0]?.data).not.toHaveProperty('signedUrl')
    expect(result).toEqual({ success: true, assetId: 'style-new' })
  })

  it('updates only user-owned style rows and throws NOT_FOUND for system or cross-user assets', async () => {
    prismaMock.globalStyle.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })

    const { updateGlobalStyleAsset } = await import('@/lib/assets/services/style-assets')

    await expect(updateGlobalStyleAsset({
      assetId: 'style-1',
      userId: 'user-1',
      name: '  冷峻赛博  ',
      description: '  蓝紫霓虹夜景  ',
      positivePrompt: '  cyberpunk neon city  ',
      negativePrompt: '  blurry  ',
      tags: ['赛博', '冷色'],
      folderId: '  folder-1  ',
      previewMediaId: '  media-1  ',
      previewUrl: 'https://example.com/private.png',
      previewStorageKey: 'internal/key.png',
      signedUrl: 'https://signed.example.com',
    })).resolves.toEqual({ success: true })

    expect(prismaMock.globalStyle.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'style-1',
        userId: 'user-1',
        source: 'user',
      },
      data: {
        name: '冷峻赛博',
        description: '蓝紫霓虹夜景',
        positivePrompt: 'cyberpunk neon city',
        negativePrompt: 'blurry',
        tags: '["赛博","冷色"]',
        folderId: 'folder-1',
        previewMediaId: 'media-1',
      },
    })
    expect(prismaMock.globalStyle.updateMany.mock.calls[0]?.[0]?.data).not.toHaveProperty('previewUrl')
    expect(prismaMock.globalStyle.updateMany.mock.calls[0]?.[0]?.data).not.toHaveProperty('previewStorageKey')
    expect(prismaMock.globalStyle.updateMany.mock.calls[0]?.[0]?.data).not.toHaveProperty('signedUrl')

    await expect(updateGlobalStyleAsset({
      assetId: 'system:american-comic',
      userId: 'user-1',
      name: '冷峻赛博',
      positivePrompt: 'cyberpunk neon city',
    })).rejects.toEqual(new ApiError('NOT_FOUND'))
  })

  it('deletes only user-owned style rows and throws NOT_FOUND when nothing is removed', async () => {
    prismaMock.globalStyle.deleteMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })

    const { deleteGlobalStyleAsset } = await import('@/lib/assets/services/style-assets')

    await expect(deleteGlobalStyleAsset({
      assetId: 'style-1',
      userId: 'user-1',
    })).resolves.toEqual({ success: true })

    expect(prismaMock.globalStyle.deleteMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'style-1',
        userId: 'user-1',
        source: 'user',
      },
    })

    await expect(deleteGlobalStyleAsset({
      assetId: 'style-2',
      userId: 'user-2',
    })).rejects.toEqual(new ApiError('NOT_FOUND'))
  })
})
