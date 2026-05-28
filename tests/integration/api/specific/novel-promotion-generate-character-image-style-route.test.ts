import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const submitAssetGenerateTaskMock = vi.hoisted(() => vi.fn(async () => ({
  success: true,
  async: true,
  taskId: 'task-character-image-1',
})))

const prismaMock = vi.hoisted(() => ({
  novelPromotionCharacter: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/assets/services/asset-actions', () => ({
  submitAssetGenerateTask: submitAssetGenerateTaskMock,
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/task/resolve-locale', () => ({
  resolveTaskLocale: vi.fn(() => 'zh'),
}))

describe('api specific - generate character image style route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards requested styleAssetId into asset generation body', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/generate-character-image/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/generate-character-image',
      method: 'POST',
      body: {
        characterId: 'character-1',
        appearanceId: 'appearance-1',
        styleAssetId: ' style-override ',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })

    expect(res.status).toBe(200)
    expect(submitAssetGenerateTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'character',
      assetId: 'character-1',
      body: expect.objectContaining({
        appearanceId: 'appearance-1',
        styleAssetId: 'style-override',
      }),
      access: expect.objectContaining({
        scope: 'project',
        userId: 'user-1',
        projectId: 'project-1',
      }),
    }))
  })
})
