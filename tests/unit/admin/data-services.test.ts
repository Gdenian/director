import { beforeEach, describe, expect, it, vi } from 'vitest'

type MockUserRecord = {
  id: string
  role: string
  status: string
  adminGroupKey: string | null
}

const prismaMock = vi.hoisted(() => ({
  adminAnnouncement: {
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
      id: 'announcement-1',
      title: args.data.title,
      body: args.data.body,
      type: args.data.type,
      severity: args.data.severity,
      status: args.data.status,
      locale: args.data.locale,
      surface: args.data.surface,
      audience: args.data.audience,
      startsAt: args.data.startsAt ?? null,
      endsAt: args.data.endsAt ?? null,
      dismissible: args.data.dismissible,
      ctaLabel: args.data.ctaLabel ?? null,
      ctaHref: args.data.ctaHref ?? null,
      groupKeys: args.data.groupKeys ?? null,
      targetUserIds: args.data.targetUserIds ?? null,
      ctaVariant: args.data.ctaVariant ?? null,
      publishedAt: args.data.publishedAt ?? null,
      archivedAt: args.data.archivedAt ?? null,
      createdBy: args.data.createdBy ?? null,
      updatedBy: args.data.updatedBy ?? null,
      createdAt: new Date('2026-06-24T00:00:00.000Z'),
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    })),
    update: vi.fn(async (args: { data: Record<string, unknown> }) => ({
      id: 'announcement-1',
      title: args.data.title ?? '公告',
      body: args.data.body ?? 'body',
      type: args.data.type ?? 'general',
      severity: args.data.severity ?? 'info',
      status: args.data.status ?? 'draft',
      locale: args.data.locale ?? 'zh',
      surface: args.data.surface ?? 'top_banner',
      audience: args.data.audience ?? 'all',
      startsAt: args.data.startsAt ?? null,
      endsAt: args.data.endsAt ?? null,
      dismissible: args.data.dismissible ?? true,
      ctaLabel: args.data.ctaLabel ?? null,
      ctaHref: args.data.ctaHref ?? null,
      groupKeys: args.data.groupKeys ?? null,
      targetUserIds: args.data.targetUserIds ?? null,
      ctaVariant: args.data.ctaVariant ?? null,
      publishedAt: args.data.publishedAt ?? null,
      archivedAt: args.data.archivedAt ?? null,
      createdBy: args.data.createdBy ?? null,
      updatedBy: args.data.updatedBy ?? null,
      createdAt: new Date('2026-06-24T00:00:00.000Z'),
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    })),
  },
  adminFeatureFlag: {
    upsert: vi.fn(async (args: { create: Record<string, unknown>, update: Record<string, unknown> }) => ({
      ...args.create,
      ...args.update,
      startsAt: args.update.startsAt ?? args.create.startsAt ?? null,
      endsAt: args.update.endsAt ?? args.create.endsAt ?? null,
      createdAt: new Date('2026-06-24T00:00:00.000Z'),
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    })),
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
  },
  task: {
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
  },
  user: {
    findUnique: vi.fn(async (): Promise<MockUserRecord | null> => null),
    update: vi.fn(async () => ({
      id: 'user-1',
      name: null,
      email: null,
      role: 'admin',
      status: 'active',
      adminGroupKey: 'vip',
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    })),
  },
  adminUserGroup: {
    findUnique: vi.fn(async () => ({ key: 'vip', status: 'active' })),
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
    count: vi.fn(async () => 0),
  },
  adminCommercialPackage: {
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
      key: args.data.key,
      name: args.data.name,
      description: args.data.description ?? null,
      status: args.data.status,
      price: args.data.price,
      currency: args.data.currency,
      credits: args.data.credits,
      bonusCredits: args.data.bonusCredits,
      durationDays: args.data.durationDays ?? null,
      userGroupKey: args.data.userGroupKey ?? null,
      groupKeys: args.data.groupKeys ?? null,
      startsAt: args.data.startsAt ?? null,
      endsAt: args.data.endsAt ?? null,
      purchaseLimitPerUser: args.data.purchaseLimitPerUser ?? null,
      sortOrder: args.data.sortOrder,
      createdBy: args.data.createdBy ?? null,
      updatedBy: args.data.updatedBy ?? null,
      createdAt: new Date('2026-06-24T00:00:00.000Z'),
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    })),
  },
  adminRedeemCode: {
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
      code: args.data.code,
      status: args.data.status,
      credits: args.data.credits,
      maxRedemptions: args.data.maxRedemptions,
      redeemedCount: args.data.redeemedCount,
      singleUserLimit: args.data.singleUserLimit,
      startsAt: args.data.startsAt ?? null,
      endsAt: args.data.endsAt ?? null,
      userGroupKey: args.data.userGroupKey ?? null,
      groupKeys: args.data.groupKeys ?? null,
      targetUserIds: args.data.targetUserIds ?? null,
      createdBy: args.data.createdBy ?? null,
      updatedBy: args.data.updatedBy ?? null,
      createdAt: new Date('2026-06-24T00:00:00.000Z'),
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    })),
  },
  adminModelChannel: {
    count: vi.fn(async () => 0),
    upsert: vi.fn(async (args: { create: Record<string, unknown>, update: Record<string, unknown> }) => ({
      key: args.create.key,
      provider: args.create.provider,
      model: args.create.model,
      modelType: args.create.modelType,
      status: args.update.status ?? args.create.status,
      isAdvanced: args.update.isAdvanced ?? args.create.isAdvanced ?? false,
      isDefault: args.update.isDefault ?? args.create.isDefault ?? false,
      groupKeys: args.update.groupKeys ?? args.create.groupKeys ?? null,
      costMultiplier: args.update.costMultiplier ?? args.create.costMultiplier ?? null,
      userMessage: args.update.userMessage ?? args.create.userMessage ?? null,
      lastTestStatus: null,
      lastTestMessage: null,
      lastTestAt: null,
      createdBy: args.create.createdBy ?? null,
      updatedBy: args.update.updatedBy ?? null,
      createdAt: new Date('2026-06-24T00:00:00.000Z'),
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    })),
  },
  adminHealthCheckSnapshot: {
    count: vi.fn(async () => 0),
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

  it('increments user session version only when role or status actually changes', async () => {
    const { updateAdminUserAccess } = await import('@/lib/admin/users')

    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      role: 'admin',
      status: 'active',
      adminGroupKey: 'free',
    })
    await updateAdminUserAccess('user-1', { role: 'admin' })
    expect(prismaMock.user.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({
        sessionVersion: expect.anything(),
      }),
    }))

    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      role: 'admin',
      status: 'active',
      adminGroupKey: 'free',
    })
    await updateAdminUserAccess('user-1', { adminGroupKey: 'vip' })
    expect(prismaMock.user.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({
        sessionVersion: expect.anything(),
      }),
    }))

    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      role: 'user',
      status: 'active',
      adminGroupKey: 'free',
    })
    await updateAdminUserAccess('user-1', { role: 'admin' })
    expect(prismaMock.user.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sessionVersion: { increment: 1 },
      }),
    }))
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

  it('sets publish and archive timestamps for announcement status transitions', async () => {
    const { createAdminAnnouncement, updateAdminAnnouncement } = await import('@/lib/admin/announcements')

    await createAdminAnnouncement({
      title: '发布公告',
      body: 'body',
      status: 'published',
    })
    expect(prismaMock.adminAnnouncement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'published',
        publishedAt: expect.any(Date),
      }),
    }))

    await updateAdminAnnouncement('announcement-1', { status: 'archived' })
    expect(prismaMock.adminAnnouncement.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'announcement-1' },
      data: expect.objectContaining({
        status: 'archived',
        archivedAt: expect.any(Date),
      }),
    }))
  })

  it('returns announcement impact summary for admin while public DTO keeps targeting internals hidden', async () => {
    prismaMock.adminAnnouncement.findMany.mockResolvedValueOnce([{
      id: 'announcement-1',
      title: 'VIP 维护公告',
      body: '今晚维护',
      type: 'maintenance',
      severity: 'warning',
      status: 'published',
      locale: 'zh',
      surface: 'modal',
      audience: 'group',
      startsAt: null,
      endsAt: null,
      dismissible: true,
      ctaLabel: null,
      ctaHref: null,
      groupKeys: 'vip, internal',
      targetUserIds: 'u1,u2',
      ctaVariant: null,
      publishedAt: new Date('2026-06-24T00:00:00.000Z'),
      archivedAt: null,
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
      createdAt: new Date('2026-06-24T00:00:00.000Z'),
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    }] as never)
    prismaMock.adminAnnouncement.count.mockResolvedValueOnce(1)
    const { listAdminAnnouncements } = await import('@/lib/admin/announcements')

    const adminResult = await listAdminAnnouncements({ page: 1, pageSize: 20 })
    expect(adminResult.items[0]).toMatchObject({
      groupKeys: 'vip, internal',
      targetUserIds: 'u1,u2',
      impactSummary: {
        surfaces: ['modal'],
        groupKeys: ['vip', 'internal'],
        targetUserCount: 2,
      },
    })

    const publicJson = JSON.stringify({
      id: adminResult.items[0].id,
      title: adminResult.items[0].title,
      body: adminResult.items[0].body,
      severity: adminResult.items[0].severity,
      dismissible: adminResult.items[0].dismissible,
      ctaLabel: adminResult.items[0].ctaLabel,
      ctaHref: adminResult.items[0].ctaHref,
    })
    expect(publicJson).not.toContain('groupKeys')
    expect(publicJson).not.toContain('targetUserIds')
    expect(publicJson).not.toContain('ruleJson')
  })

  it('returns feature flag impact summary and user message for admin DTOs', async () => {
    prismaMock.adminFeatureFlag.findMany.mockResolvedValueOnce([{
      key: 'video_generation',
      name: '视频生成',
      description: '暂停视频生成',
      category: 'generation',
      enabled: false,
      audience: 'target_users',
      rolloutPercent: 100,
      startsAt: null,
      endsAt: null,
      userMessage: '视频生成维护中',
      surfaces: 'workspace,api',
      groupKeys: 'vip, internal',
      ruleJson: { targetUserIds: ['u2', 'u3'] },
      updatedBy: 'owner-1',
      createdAt: new Date('2026-06-24T00:00:00.000Z'),
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    }] as never)
    const { listAdminFeatureFlags } = await import('@/lib/admin/feature-flags')

    const result = await listAdminFeatureFlags()
    expect(result.items[0]).toMatchObject({
      userMessage: '视频生成维护中',
      impactSummary: {
        surfaces: ['workspace', 'api'],
        groupKeys: ['vip', 'internal'],
        targetUserCount: 2,
      },
    })
  })

  it('returns commercial package and redeem impact summaries for admin DTOs', async () => {
    prismaMock.adminCommercialPackage.findMany.mockResolvedValueOnce([{
      key: 'vip-pack',
      name: 'VIP Pack',
      description: null,
      status: 'active',
      price: '99',
      currency: 'CNY',
      credits: '120',
      bonusCredits: '8',
      durationDays: null,
      userGroupKey: 'vip',
      groupKeys: 'vip, internal',
      startsAt: null,
      endsAt: null,
      purchaseLimitPerUser: 1,
      sortOrder: 10,
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
      createdAt: new Date('2026-06-24T00:00:00.000Z'),
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    }] as never)
    prismaMock.adminRedeemCode.findMany.mockResolvedValueOnce([{
      code: 'VIP100',
      status: 'active',
      credits: '100',
      maxRedemptions: 50,
      redeemedCount: 0,
      singleUserLimit: 1,
      startsAt: null,
      endsAt: null,
      userGroupKey: null,
      groupKeys: 'internal',
      targetUserIds: 'u2,u3',
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
      createdAt: new Date('2026-06-24T00:00:00.000Z'),
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    }] as never)
    const { getAdminCommercial } = await import('@/lib/admin/commercial')

    const result = await getAdminCommercial()
    expect(result.packages[0]).toMatchObject({
      impactSummary: {
        surfaces: ['commercial'],
        groupKeys: ['vip', 'internal'],
        targetUserCount: 0,
      },
    })
    expect(result.redeemCodes[0]).toMatchObject({
      impactSummary: {
        surfaces: ['redeem_code'],
        groupKeys: ['internal'],
        targetUserCount: 2,
      },
    })
  })

  it('keeps serialized commercial money values in audit summaries', async () => {
    const {
      createAdminCommercialPackage,
      createAdminRedeemCode,
      summarizeAdminCommercialPackage,
      summarizeAdminRedeemCode,
    } = await import('@/lib/admin/commercial')

    const commercialPackage = await createAdminCommercialPackage({
      key: 'starter',
      name: 'Starter',
      price: '99.5',
      credits: '120',
      bonusCredits: '8',
    })
    const redeemCode = await createAdminRedeemCode({
      code: 'WELCOME100',
      credits: '100',
      maxRedemptions: 50,
    })

    expect(summarizeAdminCommercialPackage(commercialPackage)).toMatchObject({
      price: '99.5',
      credits: '120',
      bonusCredits: '8',
    })
    expect(summarizeAdminRedeemCode(redeemCode)).toMatchObject({
      credits: '100',
    })
  })

  it('rejects negative commercial money values before saving', async () => {
    const {
      createAdminCommercialPackage,
      createAdminRedeemCode,
      updateAdminCommercialPackage,
      updateAdminRedeemCode,
    } = await import('@/lib/admin/commercial')

    await expect(createAdminCommercialPackage({
      key: 'negative-package',
      name: 'Negative Package',
      price: '-1',
      credits: '10',
    })).rejects.toThrow('price must be non-negative')
    await expect(updateAdminCommercialPackage('starter', {
      bonusCredits: '-1',
    })).rejects.toThrow('bonusCredits must be non-negative')
    await expect(createAdminRedeemCode({
      code: 'NEGATIVE',
      credits: '-5',
    })).rejects.toThrow('credits must be non-negative')
    await expect(updateAdminRedeemCode('WELCOME100', {
      credits: '-5',
    })).rejects.toThrow('credits must be non-negative')

    expect(prismaMock.adminCommercialPackage.create).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ key: 'negative-package' }),
    }))
  })

  it('rejects invalid model channel enums before saving', async () => {
    const { updateAdminModelChannel } = await import('@/lib/admin/models')

    await expect(updateAdminModelChannel('openai::gpt-5', {
      status: 'offline',
    })).rejects.toThrow('Invalid status')
    await expect(updateAdminModelChannel('openai::gpt-5', {
      modelType: 'creative',
    })).rejects.toThrow('Invalid modelType')

    expect(prismaMock.adminModelChannel.upsert).not.toHaveBeenCalled()
  })

  it('returns operations action items for every admin risk bucket', async () => {
    prismaMock.adminAnnouncement.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
    prismaMock.adminFeatureFlag.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
    prismaMock.adminUserGroup.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
    prismaMock.task.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(2)
    prismaMock.balanceFreeze.count.mockResolvedValueOnce(3)
    prismaMock.adminModelChannel.count.mockResolvedValueOnce(2)
    prismaMock.adminHealthCheckSnapshot.count.mockResolvedValueOnce(1)
    const { getAdminOperations } = await import('@/lib/admin/operations')

    const result = await getAdminOperations()
    expect(result.featureFlags.disabled).toBe(2)
    expect(result.actionItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ module: 'featureFlags', action: expect.any(String), count: 2, title: expect.stringContaining('功能开关') }),
      expect.objectContaining({ module: 'tasks', action: expect.any(String), count: 2, title: expect.stringContaining('卡死') }),
      expect.objectContaining({ module: 'billing', action: expect.any(String), count: 3, title: expect.stringContaining('冻结') }),
      expect.objectContaining({ module: 'models', action: expect.any(String), count: 2, title: expect.stringContaining('模型') }),
      expect.objectContaining({ module: 'health', action: expect.any(String), count: 1, title: expect.stringContaining('健康') }),
      expect.objectContaining({ module: 'announcements', action: expect.any(String), count: 1, title: expect.stringContaining('维护公告') }),
    ]))
  })
})
