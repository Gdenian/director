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
  novelPromotionCharacter: {
    create: vi.fn(async () => ({ id: 'character-1' })),
    findUnique: vi.fn(async () => ({ id: 'character-1', appearances: [] })),
  },
  characterAppearance: {
    create: vi.fn(async () => ({ id: 'appearance-1' })),
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

const envMock = vi.hoisted(() => ({
  getBaseUrl: vi.fn(() => 'http://localhost:3000'),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/styles/service', () => styleServiceMock)
vi.mock('@/lib/env', () => envMock)
vi.mock('@/lib/task/resolve-locale', () => ({
  resolveTaskLocale: vi.fn(() => 'zh'),
}))

describe('api specific - novel promotion character style snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not auto-generate images when creating by text prompt', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const mod = await import('@/app/api/novel-promotion/[projectId]/character/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/character',
      method: 'POST',
      headers: {
        'accept-language': 'zh-CN,zh;q=0.9',
      },
      body: {
        name: 'Hero',
        description: '主角设定',
        count: 4,
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    expect(styleServiceMock.resolveProjectStyleSnapshot).toHaveBeenCalledWith('project-1')
    expect(prismaMock.characterAppearance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        styleAssetId: 'style-project',
        styleSnapshotName: '项目风格',
        stylePromptZh: '项目中文提示词',
        stylePromptEn: 'project english prompt',
        styleSnapshotUpdatedAt: new Date('2026-05-28T01:00:00.000Z'),
      }),
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses requested styleAssetId when creating a character', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const mod = await import('@/app/api/novel-promotion/[projectId]/character/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/character',
      method: 'POST',
      body: {
        name: 'Hero',
        description: '主角设定',
        styleAssetId: ' style-override ',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    expect(styleServiceMock.resolveGlobalStyleSnapshot).toHaveBeenCalledWith('user-1', 'style-override')
    expect(prismaMock.characterAppearance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        styleAssetId: 'style-override',
        styleSnapshotName: '覆盖风格',
        stylePromptZh: '覆盖中文提示词',
      }),
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
