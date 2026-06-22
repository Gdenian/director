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
})
