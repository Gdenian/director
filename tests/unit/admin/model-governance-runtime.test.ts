import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OperationPolicyError } from '@/lib/admin/operation-errors'

const prismaMock = vi.hoisted(() => ({
  adminModelChannel: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('model governance runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.adminModelChannel.findMany.mockResolvedValue([])
    prismaMock.adminModelChannel.findUnique.mockResolvedValue(null)
  })

  it('filters disabled, maintenance, and group-mismatched model options while allowing unconfigured models', async () => {
    prismaMock.adminModelChannel.findMany.mockResolvedValue([
      {
        key: 'openai::active',
        status: 'active',
        groupKeys: 'vip, default',
        userMessage: null,
      },
      {
        key: 'openai::disabled',
        status: 'disabled',
        groupKeys: null,
        userMessage: '模型已下线',
      },
      {
        key: 'openai::maintenance',
        status: 'maintenance',
        groupKeys: null,
        userMessage: '模型维护中',
      },
      {
        key: 'openai::vip-only',
        status: 'active',
        groupKeys: 'vip',
        userMessage: null,
      },
    ])

    const { filterModelOptionsForGovernance } = await import('@/lib/admin/model-governance-runtime')
    const unconfigured = { value: 'openai::unconfigured', label: 'Unconfigured' }
    const active = { value: 'openai::active', label: 'Active' }
    const options = [
      active,
      { value: 'openai::disabled', label: 'Disabled' },
      { value: 'openai::maintenance', label: 'Maintenance' },
      { value: 'openai::vip-only', label: 'VIP only' },
      unconfigured,
    ]

    await expect(filterModelOptionsForGovernance({
      userId: 'user-1',
      groupKey: 'default',
      options,
    })).resolves.toEqual([active, unconfigured])
  })

  it('allows task usage when no governance channel is configured', async () => {
    const { assertModelUsableForTask } = await import('@/lib/admin/model-governance-runtime')

    await expect(assertModelUsableForTask({
      modelKey: 'openai::unconfigured',
      userId: 'user-1',
      groupKey: 'default',
    })).resolves.toEqual({ allowed: true })
  })

  it('rejects non-active task models with MODEL_DISABLED and the configured user message', async () => {
    prismaMock.adminModelChannel.findUnique.mockResolvedValue({
      key: 'openai::maintenance',
      status: 'maintenance',
      groupKeys: null,
      userMessage: '模型维护中，请稍后再试',
    })

    const { assertModelUsableForTask } = await import('@/lib/admin/model-governance-runtime')

    await expect(assertModelUsableForTask({
      modelKey: 'openai::maintenance',
      userId: 'user-1',
      groupKey: 'default',
    })).rejects.toMatchObject({
      code: 'MODEL_DISABLED',
      message: '模型维护中，请稍后再试',
      details: { target: 'openai::maintenance' },
    } satisfies Partial<OperationPolicyError>)
  })

  it('rejects task models outside the caller group with MODEL_NOT_ALLOWED', async () => {
    prismaMock.adminModelChannel.findUnique.mockResolvedValue({
      key: 'openai::vip-only',
      status: 'active',
      groupKeys: 'vip, enterprise',
      userMessage: null,
    })

    const { assertModelUsableForTask } = await import('@/lib/admin/model-governance-runtime')

    await expect(assertModelUsableForTask({
      modelKey: 'openai::vip-only',
      userId: 'user-1',
      groupKey: 'default',
    })).rejects.toMatchObject({
      code: 'MODEL_NOT_ALLOWED',
      details: { target: 'openai::vip-only' },
    } satisfies Partial<OperationPolicyError>)
  })
})
