import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  globalAssetFolder: {
    findUnique: vi.fn(async () => null),
  },
  globalStyle: {
    findFirst: vi.fn(),
  },
  globalCharacter: {
    create: vi.fn(async () => ({ id: 'character-1', userId: 'user-1' })),
    findUnique: vi.fn(async () => ({
      id: 'character-1',
      userId: 'user-1',
      name: 'Hero',
      appearances: [],
    })),
  },
  globalCharacterAppearance: {
    create: vi.fn(async () => ({ id: 'appearance-1' })),
  },
  globalLocation: {
    create: vi.fn(async () => ({ id: 'location-1' })),
    findUnique: vi.fn(async () => ({ id: 'location-1', images: [] })),
  },
  globalLocationImage: {
    createMany: vi.fn(async () => ({ count: 1 })),
  },
}))

const mediaAttachMock = vi.hoisted(() => ({
  attachMediaFieldsToGlobalCharacter: vi.fn(async (value: unknown) => value),
  attachMediaFieldsToGlobalLocation: vi.fn(async (value: unknown) => value),
}))

const mediaServiceMock = vi.hoisted(() => ({
  resolveMediaRefFromLegacyValue: vi.fn(async () => null),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/media/attach', () => mediaAttachMock)
vi.mock('@/lib/media/service', () => mediaServiceMock)

describe('api contract - asset hub style asset creation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('POST /api/asset-hub/characters accepts styleAssetId and persists it on the primary appearance', async () => {
    prismaMock.globalStyle.findFirst.mockResolvedValueOnce({
      id: 'style-user-1',
      name: '霓虹赛博',
      positivePrompt: 'cyberpunk neon city',
      negativePrompt: 'blurry',
      legacyKey: null,
    })

    const mod = await import('@/app/api/asset-hub/characters/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/characters',
      method: 'POST',
      body: {
        name: 'Hero',
        description: '冷静黑发',
        styleAssetId: 'style-user-1',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    expect(prismaMock.globalCharacterAppearance.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        styleAssetId: 'style-user-1',
        artStyle: null,
      }),
    }))
  })

  it('POST /api/asset-hub/locations accepts styleAssetId and persists it on the location record', async () => {
    prismaMock.globalStyle.findFirst.mockResolvedValueOnce({
      id: 'style-user-1',
      name: '霓虹赛博',
      positivePrompt: 'cyberpunk neon city',
      negativePrompt: 'blurry',
      legacyKey: null,
    })

    const mod = await import('@/app/api/asset-hub/locations/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/locations',
      method: 'POST',
      body: {
        name: 'Old Town',
        summary: '雨夜街道',
        styleAssetId: 'style-user-1',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    expect(prismaMock.globalLocation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        styleAssetId: 'style-user-1',
        artStyle: null,
      }),
    }))
  })
})
