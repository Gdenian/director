import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  task: {
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
  },
  balanceTransaction: {
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
  },
  userBalance: {
    aggregate: vi.fn(async () => ({
      _sum: { balance: null, frozenAmount: null, totalSpent: null },
    })),
  },
  balanceFreeze: {
    groupBy: vi.fn(async () => []),
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/task/queues', () => ({
  removeTaskJob: vi.fn(),
}))

vi.mock('@/lib/task/service', () => ({
  cancelTask: vi.fn(),
}))

describe('admin data services', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects invalid and empty user access updates before normalization', async () => {
    const { parseAdminUserAccessUpdate } = await import('@/lib/admin/users')

    expect(() => parseAdminUserAccessUpdate({})).toThrow('At least one access field is required')
    expect(() => parseAdminUserAccessUpdate({ role: 'superadmin' })).toThrow('Invalid user role')
    expect(() => parseAdminUserAccessUpdate({ status: 'disable' })).toThrow('Invalid user status')
    expect(parseAdminUserAccessUpdate({ role: 'admin', status: 'disabled' })).toEqual({
      role: 'admin',
      status: 'disabled',
    })
  })

  it('uses an explicit task select for admin task lists', async () => {
    const { listAdminTasks } = await import('@/lib/admin/tasks')

    await listAdminTasks({ page: 1, pageSize: 10 })

    expect(prismaMock.task.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        id: true,
        userId: true,
        projectId: true,
        type: true,
        status: true,
        progress: true,
        billingInfo: true,
        payload: true,
        result: true,
      }),
    }))
    expect(prismaMock.task.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.not.objectContaining({
        externalId: true,
        dedupeKey: true,
        errorMessage: true,
        lastEnqueueError: true,
      }),
    }))
  })

  it('uses an explicit billing transaction select for admin billing summaries', async () => {
    const { getAdminBillingSummary } = await import('@/lib/admin/billing')

    await getAdminBillingSummary({ page: 1, pageSize: 10 })

    expect(prismaMock.balanceTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: {
        id: true,
        userId: true,
        type: true,
        amount: true,
        balanceAfter: true,
        description: true,
        projectId: true,
        episodeId: true,
        taskType: true,
        createdAt: true,
      },
    }))
  })

  it('removes embedded audit metadata from admin billing descriptions', async () => {
    const amount = { toString: () => '12.340000' }
    const balanceAfter = { toString: () => '99.000000' }
    prismaMock.balanceTransaction.findMany.mockResolvedValueOnce([{
      id: 'tx-1',
      userId: 'user-1',
      type: 'recharge',
      amount,
      balanceAfter,
      description: 'manual recharge | audit={"reason":"manual recharge","operatorId":"owner-1","externalOrderId":"order-secret","idempotencyKey":"idem-secret"}',
      projectId: null,
      episodeId: null,
      taskType: null,
      createdAt: new Date('2026-06-22T00:00:00.000Z'),
    }] as never)
    const { getAdminBillingSummary } = await import('@/lib/admin/billing')

    const result = await getAdminBillingSummary({ page: 1, pageSize: 10 })
    const jsonText = JSON.stringify(result)

    expect(result.recentTransactions.items[0].description).toBe('manual recharge')
    expect(jsonText).not.toContain('operatorId')
    expect(jsonText).not.toContain('externalOrderId')
    expect(jsonText).not.toContain('idempotencyKey')
    expect(jsonText).not.toContain('owner-1')
    expect(jsonText).not.toContain('order-secret')
    expect(jsonText).not.toContain('idem-secret')
  })
})
