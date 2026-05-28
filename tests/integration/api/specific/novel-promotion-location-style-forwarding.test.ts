import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
    novelData: { id: 'novel-data-1' },
  })),
  requireProjectAuthLight: vi.fn(),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  novelPromotionLocation: {
    create: vi.fn(async () => ({ id: 'location-1' })),
    findUnique: vi.fn(async () => ({ id: 'location-1', images: [] })),
  },
  locationImage: {
    createMany: vi.fn<(input: { data: Array<{ imageIndex: number }> }) => Promise<{ count: number }>>(
      async () => ({ count: 0 }),
    ),
  },
}))

const styleFixtures = vi.hoisted(() => ({
  projectSnapshot: {
    styleAssetId: 'style-project',
    name: '项目风格',
    promptZh: '项目中文提示词',
    promptEn: 'project english prompt',
    snapshotUpdatedAt: '2026-05-28T01:00:00.000Z',
  },
  overrideSnapshot: {
    styleAssetId: 'style-override',
    name: '覆盖风格',
    promptZh: '覆盖中文提示词',
    promptEn: 'override english prompt',
    snapshotUpdatedAt: '2026-05-28T02:00:00.000Z',
  },
}))

const styleServiceMock = vi.hoisted(() => ({
  resolveProjectStyleSnapshot: vi.fn(async () => styleFixtures.projectSnapshot),
  resolveGlobalStyleSnapshot: vi.fn(async () => styleFixtures.overrideSnapshot),
  styleSnapshotToColumns: vi.fn((snapshot: typeof styleFixtures.projectSnapshot) => ({
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
vi.mock('@/lib/task/resolve-locale', () => ({
  resolveTaskLocale: vi.fn(() => 'zh'),
}))

describe('api specific - novel promotion location style snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not auto-generate images when creating location', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const mod = await import('@/app/api/novel-promotion/[projectId]/location/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/location',
      method: 'POST',
      headers: {
        'accept-language': 'zh-CN,zh;q=0.9',
      },
      body: {
        name: 'Old Town',
        description: '雨夜街道',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    expect(styleServiceMock.resolveProjectStyleSnapshot).toHaveBeenCalledWith('project-1')
    expect(prismaMock.novelPromotionLocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        styleAssetId: 'style-project',
        styleSnapshotName: '项目风格',
        stylePromptZh: '项目中文提示词',
      }),
    })
    const createManyArg = prismaMock.locationImage.createMany.mock.calls[0]?.[0] as {
      data?: Array<{ imageIndex: number }>
    } | undefined
    expect(createManyArg?.data?.map((item) => item.imageIndex)).toEqual([0])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses requested styleAssetId when creating location', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const mod = await import('@/app/api/novel-promotion/[projectId]/location/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/location',
      method: 'POST',
      body: {
        name: 'Old Town',
        description: '雨夜街道',
        styleAssetId: ' style-override ',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    expect(styleServiceMock.resolveGlobalStyleSnapshot).toHaveBeenCalledWith('user-1', 'style-override')
    expect(prismaMock.novelPromotionLocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        styleAssetId: 'style-override',
        styleSnapshotName: '覆盖风格',
        stylePromptZh: '覆盖中文提示词',
      }),
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('creates requested number of slots and forwards count', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const mod = await import('@/app/api/novel-promotion/[projectId]/location/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/location',
      method: 'POST',
      body: {
        name: 'Old Town',
        description: '雨夜街道',
        count: 5,
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    const createManyArg = prismaMock.locationImage.createMany.mock.calls[0]?.[0] as {
      data?: Array<{ imageIndex: number }>
    } | undefined
    expect(createManyArg?.data?.map((item) => item.imageIndex)).toEqual([0, 1, 2, 3, 4])

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
