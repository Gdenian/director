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
    findFirst: vi.fn(async () => ({
      id: 'style-1',
      name: '冷峻赛博',
      positivePrompt: 'cyberpunk neon city',
      negativePrompt: 'blurry',
      legacyKey: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })),
  },
  globalCharacter: {
    create: vi.fn(async () => ({ id: 'character-1' })),
    findUnique: vi.fn(async () => ({ id: 'character-1', appearances: [] })),
  },
  globalCharacterAppearance: {
    create: vi.fn(async () => ({ id: 'appearance-1' })),
  },
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/media/attach', () => ({
  attachMediaFieldsToGlobalCharacter: vi.fn(async (value: unknown) => value),
}))
vi.mock('@/lib/media/service', () => ({
  resolveMediaRefFromLegacyValue: vi.fn(async () => null),
}))

describe('api specific - asset hub character style asset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts styleAssetId without legacy artStyle and persists it on the primary appearance', async () => {
    const mod = await import('@/app/api/asset-hub/characters/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/characters',
      method: 'POST',
      body: {
        name: 'Hero',
        description: '冷峻黑发角色',
        styleAssetId: 'style-1',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    expect(prismaMock.globalStyle.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'style-1',
      }),
    }))
    expect(prismaMock.globalCharacterAppearance.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        styleAssetId: 'style-1',
        artStyle: null,
      }),
    }))
  })
})
