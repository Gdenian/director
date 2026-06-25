import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OperationPolicyError } from '@/lib/admin/operation-errors'
import {
  assertFeatureEnabled,
  assertMaintenanceAllowsRequest,
  evaluateFeatureFlag,
} from '@/lib/admin/policy'

const prismaMock = vi.hoisted(() => ({
  adminFeatureFlag: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('admin operation policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows missing flags except maintenance mode', async () => {
    prismaMock.adminFeatureFlag.findUnique.mockResolvedValue(null)
    await expect(assertFeatureEnabled('registration', { userId: 'u1', role: 'user' })).resolves.toEqual({
      allowed: true,
    })
  })

  it('denies disabled feature with configured message', async () => {
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

    await expect(assertFeatureEnabled('registration', { userId: 'u1', role: 'user' }))
      .rejects.toMatchObject({
        code: 'FEATURE_DISABLED',
        message: '注册暂不可用',
      })
  })

  it('lets admins through maintenance mode but blocks ordinary writes', async () => {
    await expect(assertMaintenanceAllowsRequest({
      maintenanceEnabled: true,
      role: 'admin',
      write: true,
    })).resolves.toEqual({ allowed: true })

    await expect(assertMaintenanceAllowsRequest({
      maintenanceEnabled: true,
      role: 'user',
      write: true,
    })).rejects.toBeInstanceOf(OperationPolicyError)
  })

  it('evaluates inactive time window as allowed', () => {
    expect(evaluateFeatureFlag({
      key: 'payment',
      enabled: false,
      audience: 'all',
      rolloutPercent: 100,
      startsAt: new Date('2026-06-25T00:00:00.000Z'),
      endsAt: null,
      userMessage: '支付维护中',
      groupKeys: null,
      ruleJson: null,
    }, {
      now: new Date('2026-06-24T00:00:00.000Z'),
      userId: 'u1',
      role: 'user',
    })).toEqual({ allowed: true })
  })
})
