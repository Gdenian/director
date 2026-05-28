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
  globalLocation: {
    create: vi.fn(async () => ({ id: 'location-1' })),
    findUnique: vi.fn(async () => ({ id: 'location-1', images: [] })),
  },
  globalLocationImage: {
    createMany: vi.fn<(input: { data: Array<{ imageIndex: number }> }) => Promise<{ count: number }>>(
      async () => ({ count: 0 }),
    ),
  },
}))

const styleFixtures = vi.hoisted(() => ({
  styleSnapshot: {
    styleAssetId: 'style-1',
    name: '电影写实',
    promptZh: '电影写实中文提示词',
    promptEn: 'cinematic realistic prompt',
    snapshotUpdatedAt: '2026-05-28T01:00:00.000Z',
  },
}))

const styleServiceMock = vi.hoisted(() => ({
  resolveGlobalStyleSnapshot: vi.fn(async () => styleFixtures.styleSnapshot),
  resolveDefaultStyleSnapshot: vi.fn(async () => styleFixtures.styleSnapshot),
  styleSnapshotToColumns: vi.fn((snapshot: typeof styleFixtures.styleSnapshot) => ({
    styleAssetId: snapshot.styleAssetId,
    styleSnapshotName: snapshot.name,
    stylePromptZh: snapshot.promptZh,
    stylePromptEn: snapshot.promptEn,
    styleSnapshotUpdatedAt: new Date(snapshot.snapshotUpdatedAt),
  })),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/styles/service', () => styleServiceMock)

describe('api specific - asset hub location create', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not auto-generate images after creating location', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const mod = await import('@/app/api/asset-hub/locations/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/locations',
      method: 'POST',
      body: {
        name: 'Old Town',
        summary: '雨夜街道',
        styleAssetId: 'style-1',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    expect(styleServiceMock.resolveGlobalStyleSnapshot).toHaveBeenCalledWith('user-1', 'style-1')
    expect(prismaMock.globalLocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        styleAssetId: 'style-1',
        styleSnapshotName: '电影写实',
        stylePromptZh: '电影写实中文提示词',
      }),
    })
    const createManyArg = prismaMock.globalLocationImage.createMany.mock.calls[0]?.[0] as {
      data?: Array<{ imageIndex: number }>
    } | undefined
    expect(createManyArg?.data?.map((item) => item.imageIndex)).toEqual([0])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
