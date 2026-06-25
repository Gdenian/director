import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isModelTierAllowed,
  resolveUserRuntimeGroup,
} from '@/lib/admin/user-groups-runtime'

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  adminUserGroup: { findUnique: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('runtime user groups', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns configured group entitlements', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ adminGroupKey: 'restricted' })
    prismaMock.adminUserGroup.findUnique.mockResolvedValue({
      key: 'restricted',
      status: 'active',
      signupCredits: 0,
      dailyTaskLimit: 2,
      concurrentTaskLimit: 1,
      monthlyCredits: 0,
      allowedModelTiers: 'basic',
      allowText: true,
      allowImage: false,
      allowVideo: false,
      allowVoice: true,
      allowLipSync: false,
      allowAdvancedModels: false,
      maxTaskCost: '1.5',
      maxFrozenAmount: '3',
    })

    await expect(resolveUserRuntimeGroup('u1')).resolves.toMatchObject({
      key: 'restricted',
      dailyTaskLimit: 2,
      allowImage: false,
      maxTaskCost: 1.5,
      maxFrozenAmount: 3,
    })
  })

  it('does not expand permissions when an assigned group is inactive', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ adminGroupKey: 'restricted' })
    prismaMock.adminUserGroup.findUnique.mockResolvedValue({
      key: 'restricted',
      status: 'paused',
      allowText: true,
      allowImage: true,
      allowVideo: true,
      allowVoice: true,
      allowLipSync: true,
      allowAdvancedModels: true,
    })

    await expect(resolveUserRuntimeGroup('u1')).resolves.toMatchObject({
      key: 'restricted',
      status: 'inactive',
      allowText: false,
      allowImage: false,
      allowVideo: false,
      allowVoice: false,
      allowLipSync: false,
      allowAdvancedModels: false,
      dailyTaskLimit: 0,
      concurrentTaskLimit: 0,
      maxTaskCost: 0,
      maxFrozenAmount: 0,
    })
  })

  it('denies advanced or unlisted model tiers', () => {
    const group = {
      key: 'restricted',
      status: 'active',
      signupCredits: 0,
      dailyTaskLimit: null,
      concurrentTaskLimit: null,
      monthlyCredits: 0,
      allowedModelTiers: 'basic,standard',
      allowText: true,
      allowImage: true,
      allowVideo: true,
      allowVoice: true,
      allowLipSync: true,
      allowAdvancedModels: false,
      maxTaskCost: null,
      maxFrozenAmount: null,
    }

    expect(isModelTierAllowed(group, { tier: 'basic' })).toBe(true)
    expect(isModelTierAllowed(group, { tier: 'premium' })).toBe(false)
    expect(isModelTierAllowed(group, { isAdvanced: true, tier: 'basic' })).toBe(false)
  })
})
