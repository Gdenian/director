import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callRoute } from '../helpers/call-route'

const prismaMock = vi.hoisted(() => ({
  adminFeatureFlag: { findUnique: vi.fn() },
  adminUserGroup: { findFirst: vi.fn(), findUnique: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  userBalance: { create: vi.fn() },
  project: { create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  novelPromotionProject: { create: vi.fn(), findMany: vi.fn() },
  userPreference: { findUnique: vi.fn() },
  usageCost: { groupBy: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)),
}))

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/styles/service', () => ({
  resolveDefaultStyleSnapshot: vi.fn(async () => ({
    styleAssetId: null,
    name: null,
    promptZh: null,
    promptEn: null,
    snapshotUpdatedAt: new Date('2026-06-24T00:00:00.000Z').toISOString(),
  })),
}))
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'hashed') } }))
vi.mock('@/lib/rate-limit', () => ({
  AUTH_REGISTER_LIMIT: { points: 1, duration: 1 },
  checkRateLimit: vi.fn(async () => ({ limited: false })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}))
vi.mock('@/lib/logging/semantic', () => ({ logAuthAction: vi.fn() }))

describe('api contract - admin policy user routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.adminFeatureFlag.findUnique.mockResolvedValue(null)
    prismaMock.adminUserGroup.findFirst.mockResolvedValue(null)
    prismaMock.adminUserGroup.findUnique.mockResolvedValue(null)
    prismaMock.user.findUnique.mockResolvedValue(null)
    prismaMock.user.create.mockResolvedValue({ id: 'new-user-id', name: 'new-user' })
    prismaMock.project.create.mockResolvedValue({ id: 'project-1', name: '作品 A', userId: 'u1' })
    prismaMock.novelPromotionProject.create.mockResolvedValue({ id: 'np-1', projectId: 'project-1' })
    authMock.requireUserAuth.mockResolvedValue({
      session: { user: { id: 'u1', role: 'user', status: 'active' } },
    })
  })

  it('blocks registration when registration flag is disabled before user creation', async () => {
    prismaMock.adminFeatureFlag.findUnique.mockResolvedValue({
      key: 'registration',
      enabled: false,
      audience: 'all',
      rolloutPercent: 100,
      startsAt: null,
      endsAt: null,
      userMessage: '注册暂不可用',
      groupKeys: null,
      ruleJson: null,
    })

    const route = await import('@/app/api/auth/register/route')
    const response = await callRoute(route.POST, 'POST', { name: 'new-user', password: '123456' })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      code: 'FEATURE_DISABLED',
      message: '注册暂不可用',
    })
    expect(prismaMock.user.create).not.toHaveBeenCalled()
    expect(prismaMock.userBalance.create).not.toHaveBeenCalled()
  })

  it('blocks project creation when create_work flag is disabled before project creation', async () => {
    prismaMock.adminFeatureFlag.findUnique.mockResolvedValue({
      key: 'create_work',
      enabled: false,
      audience: 'all',
      rolloutPercent: 100,
      startsAt: null,
      endsAt: null,
      userMessage: '创建作品维护中',
      groupKeys: null,
      ruleJson: null,
    })

    const route = await import('@/app/api/projects/route')
    const response = await callRoute(route.POST, 'POST', { name: '作品 A' })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      code: 'FEATURE_DISABLED',
      message: '创建作品维护中',
    })
    expect(prismaMock.project.create).not.toHaveBeenCalled()
    expect(prismaMock.novelPromotionProject.create).not.toHaveBeenCalled()
  })
})
