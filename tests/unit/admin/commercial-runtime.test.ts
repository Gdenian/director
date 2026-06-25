import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  adminCommercialPackage: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  adminCommercialOrder: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  adminFeatureFlag: {
    findUnique: vi.fn(),
  },
  adminRedeemCode: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  adminRedeemRedemption: {
    count: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  userBalance: {
    upsert: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  balanceTransaction: {
    create: vi.fn(),
  },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import {
  createCommercialOrderForUser,
  getCommercialOrderForUser,
  listAvailablePackages,
  redeemCodeForUser,
} from '@/lib/admin/commercial-runtime'

describe('commercial runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.adminFeatureFlag.findUnique.mockResolvedValue(null)
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', role: 'user', adminGroupKey: 'vip' })
  })

  it('lists only active packages for user group and time window without admin targeting fields', async () => {
    const now = new Date('2026-06-24T10:00:00.000Z')
    prismaMock.adminCommercialPackage.findMany.mockResolvedValue([
      {
        key: 'vip-100',
        name: 'VIP 100',
        description: 'VIP package',
        status: 'active',
        price: '10',
        currency: 'CNY',
        credits: '100',
        bonusCredits: '10',
        durationDays: null,
        groupKeys: 'vip',
        userGroupKey: null,
        startsAt: null,
        endsAt: null,
        sortOrder: 1,
        createdBy: 'admin-1',
        updatedBy: 'admin-1',
      },
      {
        key: 'free-100',
        name: 'Free 100',
        description: null,
        status: 'active',
        price: '10',
        currency: 'CNY',
        credits: '100',
        bonusCredits: '0',
        durationDays: null,
        groupKeys: 'free',
        userGroupKey: null,
        startsAt: null,
        endsAt: null,
        sortOrder: 2,
      },
      {
        key: 'future',
        name: 'Future',
        description: null,
        status: 'active',
        price: '10',
        currency: 'CNY',
        credits: '100',
        bonusCredits: '0',
        durationDays: null,
        groupKeys: null,
        userGroupKey: null,
        startsAt: new Date('2026-06-25T00:00:00.000Z'),
        endsAt: null,
        sortOrder: 3,
      },
    ])

    const result = await listAvailablePackages({ userId: 'u1', now })

    expect(result).toEqual([{
      key: 'vip-100',
      name: 'VIP 100',
      description: 'VIP package',
      price: '10',
      currency: 'CNY',
      credits: '100',
      bonusCredits: '10',
      durationDays: null,
    }])
    expect(JSON.stringify(result)).not.toContain('groupKeys')
    expect(JSON.stringify(result)).not.toContain('createdBy')
  })

  it('rejects package listing when payment feature is disabled for the user group', async () => {
    prismaMock.adminFeatureFlag.findUnique.mockResolvedValue({
      key: 'payment',
      enabled: false,
      audience: 'group',
      rolloutPercent: 100,
      startsAt: null,
      endsAt: null,
      userMessage: 'payment disabled',
      groupKeys: 'vip',
      ruleJson: null,
    })

    await expect(listAvailablePackages({ userId: 'u1' }))
      .rejects.toMatchObject({ code: 'FEATURE_DISABLED' })
    expect(prismaMock.adminCommercialPackage.findMany).not.toHaveBeenCalled()
  })

  it('redeems active code once per idempotency key', async () => {
    prismaMock.adminRedeemCode.findUnique.mockResolvedValue({
      code: 'WELCOME',
      status: 'active',
      credits: '5',
      redeemedCount: 0,
      maxRedemptions: 10,
      singleUserLimit: 1,
      startsAt: null,
      endsAt: null,
      groupKeys: null,
      userGroupKey: null,
      targetUserIds: null,
    })
    prismaMock.adminRedeemRedemption.findFirst.mockResolvedValue(null)
    prismaMock.adminRedeemRedemption.count.mockResolvedValue(0)
    prismaMock.userBalance.upsert.mockResolvedValue({ balance: '5' })
    prismaMock.userBalance.findUniqueOrThrow.mockResolvedValue({ balance: '5' })
    prismaMock.balanceTransaction.create.mockResolvedValue({ id: 'tx1' })
    prismaMock.adminRedeemRedemption.create.mockResolvedValue({ id: 'redemption1' })
    prismaMock.adminRedeemCode.updateMany.mockResolvedValue({ count: 1 })

    await expect(redeemCodeForUser({
      code: ' welcome ',
      userId: 'u1',
      idempotencyKey: 'idem-1',
    })).resolves.toMatchObject({ redeemed: true, duplicated: false, credits: '5' })

    expect(prismaMock.adminRedeemCode.updateMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.adminRedeemCode.update).not.toHaveBeenCalled()
    expect(prismaMock.balanceTransaction.create).toHaveBeenCalledTimes(1)
  })

  it('serializes redeem checks by locking the code row before counting user redemptions', async () => {
    prismaMock.adminRedeemCode.findUnique.mockResolvedValue({
      code: 'WELCOME',
      status: 'active',
      credits: '5',
      redeemedCount: 0,
      maxRedemptions: 10,
      singleUserLimit: 1,
      startsAt: null,
      endsAt: null,
      groupKeys: null,
      userGroupKey: null,
      targetUserIds: null,
    })
    prismaMock.adminRedeemRedemption.findFirst.mockResolvedValue(null)
    prismaMock.adminRedeemRedemption.count.mockResolvedValue(0)
    prismaMock.adminRedeemCode.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.userBalance.upsert.mockResolvedValue({ balance: '5' })
    prismaMock.balanceTransaction.create.mockResolvedValue({ id: 'tx-lock' })
    prismaMock.adminRedeemRedemption.create.mockResolvedValue({ id: 'redemption-lock' })

    await redeemCodeForUser({
      code: 'WELCOME',
      userId: 'u1',
      idempotencyKey: 'idem-lock',
    })

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1)
    expect(prismaMock.$queryRaw.mock.invocationCallOrder[0])
      .toBeLessThan(prismaMock.adminRedeemRedemption.findFirst.mock.invocationCallOrder[0])
    expect(prismaMock.$queryRaw.mock.invocationCallOrder[0])
      .toBeLessThan(prismaMock.adminRedeemRedemption.count.mock.invocationCallOrder[0])
  })

  it('rejects redeem when redeem_code feature is disabled for the user group', async () => {
    prismaMock.adminFeatureFlag.findUnique.mockResolvedValue({
      key: 'redeem_code',
      enabled: false,
      audience: 'group',
      rolloutPercent: 100,
      startsAt: null,
      endsAt: null,
      userMessage: 'redeem disabled',
      groupKeys: 'vip',
      ruleJson: null,
    })

    await expect(redeemCodeForUser({
      code: 'WELCOME',
      userId: 'u1',
      idempotencyKey: 'idem-disabled',
    })).rejects.toMatchObject({ code: 'FEATURE_DISABLED' })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(prismaMock.adminRedeemCode.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.balanceTransaction.create).not.toHaveBeenCalled()
  })

  it('does not credit or write redemption when redeem slot reservation fails', async () => {
    prismaMock.adminRedeemCode.findUnique.mockResolvedValue({
      code: 'WELCOME',
      status: 'active',
      credits: '5',
      redeemedCount: 0,
      maxRedemptions: 10,
      singleUserLimit: 1,
      startsAt: null,
      endsAt: null,
      groupKeys: null,
      userGroupKey: null,
      targetUserIds: null,
    })
    prismaMock.adminRedeemRedemption.findFirst.mockResolvedValue(null)
    prismaMock.adminRedeemRedemption.count.mockResolvedValue(0)
    prismaMock.adminRedeemCode.updateMany.mockResolvedValue({ count: 0 })

    await expect(redeemCodeForUser({
      code: 'WELCOME',
      userId: 'u1',
      idempotencyKey: 'idem-atomic-1',
    })).rejects.toMatchObject({ code: 'REDEEM_CODE_UNAVAILABLE' })

    expect(prismaMock.adminRedeemCode.updateMany).toHaveBeenCalledWith({
      where: {
        code: 'WELCOME',
        status: 'active',
        redeemedCount: { lt: 10 },
      },
      data: { redeemedCount: { increment: 1 } },
    })
    expect(prismaMock.userBalance.upsert).not.toHaveBeenCalled()
    expect(prismaMock.balanceTransaction.create).not.toHaveBeenCalled()
    expect(prismaMock.adminRedeemRedemption.create).not.toHaveBeenCalled()
    expect(prismaMock.adminRedeemCode.update).not.toHaveBeenCalled()
  })

  it('returns existing redemption for duplicate idempotency key without double crediting', async () => {
    prismaMock.adminRedeemRedemption.findFirst.mockResolvedValue({ id: 'redemption1' })

    await expect(redeemCodeForUser({
      code: 'WELCOME',
      userId: 'u1',
      idempotencyKey: 'idem-1',
    })).resolves.toMatchObject({ redeemed: true, duplicated: true, redemptionId: 'redemption1' })

    expect(prismaMock.adminRedeemCode.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.userBalance.upsert).not.toHaveBeenCalled()
    expect(prismaMock.balanceTransaction.create).not.toHaveBeenCalled()
    expect(prismaMock.adminRedeemCode.update).not.toHaveBeenCalled()
  })

  it('rejects redeem code outside target users', async () => {
    prismaMock.adminRedeemRedemption.findFirst.mockResolvedValue(null)
    prismaMock.adminRedeemCode.findUnique.mockResolvedValue({
      code: 'TARGET',
      status: 'active',
      credits: '5',
      redeemedCount: 0,
      maxRedemptions: 10,
      singleUserLimit: 1,
      startsAt: null,
      endsAt: null,
      groupKeys: null,
      userGroupKey: null,
      targetUserIds: 'u2',
    })

    await expect(redeemCodeForUser({
      code: 'TARGET',
      userId: 'u1',
      idempotencyKey: 'idem-2',
    })).rejects.toMatchObject({ code: 'REDEEM_CODE_UNAVAILABLE' })
    expect(prismaMock.balanceTransaction.create).not.toHaveBeenCalled()
  })

  it('creates pending commercial order without crediting balance', async () => {
    prismaMock.adminCommercialPackage.findUnique.mockResolvedValue({
      key: 'starter',
      name: 'Starter',
      description: null,
      status: 'active',
      price: '20',
      currency: 'CNY',
      credits: '200',
      bonusCredits: '0',
      durationDays: null,
      groupKeys: null,
      userGroupKey: null,
      startsAt: null,
      endsAt: null,
    })
    prismaMock.adminCommercialOrder.findFirst.mockResolvedValue(null)
    prismaMock.adminCommercialOrder.create.mockResolvedValue({
      id: 'order-1',
      userId: 'u1',
      packageKey: 'starter',
      status: 'pending',
      amount: '20',
      currency: 'CNY',
      credits: '200',
      bonusCredits: '0',
      externalOrderId: null,
      idempotencyKey: 'order-idem-1',
      paidAt: null,
      reconciledAt: null,
      refundedAt: null,
      createdAt: new Date('2026-06-24T10:00:00.000Z'),
      updatedAt: new Date('2026-06-24T10:00:00.000Z'),
    })

    const result = await createCommercialOrderForUser({
      userId: 'u1',
      packageKey: 'starter',
      idempotencyKey: 'order-idem-1',
    })

    expect(result).toMatchObject({ id: 'order-1', status: 'pending', paymentConfigured: false })
    expect(prismaMock.userBalance.upsert).not.toHaveBeenCalled()
    expect(prismaMock.balanceTransaction.create).not.toHaveBeenCalled()
  })

  it('returns existing order when concurrent creation hits the idempotency unique constraint', async () => {
    prismaMock.adminCommercialPackage.findUnique.mockResolvedValue({
      key: 'starter',
      name: 'Starter',
      description: null,
      status: 'active',
      price: '20',
      currency: 'CNY',
      credits: '200',
      bonusCredits: '0',
      durationDays: null,
      groupKeys: null,
      userGroupKey: null,
      startsAt: null,
      endsAt: null,
    })
    prismaMock.adminCommercialOrder.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'order-existing',
        userId: 'u1',
        packageKey: 'starter',
        status: 'pending',
        amount: '20',
        currency: 'CNY',
        credits: '200',
        bonusCredits: '0',
        paidAt: null,
        reconciledAt: null,
        refundedAt: null,
        createdAt: new Date('2026-06-24T10:00:00.000Z'),
      })
    prismaMock.adminCommercialOrder.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    )

    const result = await createCommercialOrderForUser({
      userId: 'u1',
      packageKey: 'starter',
      idempotencyKey: 'order-idem-race',
    })

    expect(result).toMatchObject({ id: 'order-existing', status: 'pending' })
    expect(prismaMock.adminCommercialOrder.findFirst).toHaveBeenCalledTimes(2)
    expect(prismaMock.userBalance.upsert).not.toHaveBeenCalled()
    expect(prismaMock.balanceTransaction.create).not.toHaveBeenCalled()
  })

  it('returns only the owner commercial order as a safe DTO', async () => {
    prismaMock.adminCommercialOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      userId: 'u1',
      packageKey: 'starter',
      status: 'pending',
      amount: '20',
      currency: 'CNY',
      credits: '200',
      bonusCredits: '0',
      externalOrderId: 'provider-secret',
      idempotencyKey: 'order-idem-1',
      paidAt: null,
      reconciledAt: null,
      refundedAt: null,
      createdAt: new Date('2026-06-24T10:00:00.000Z'),
      updatedAt: new Date('2026-06-24T10:00:00.000Z'),
    })

    const result = await getCommercialOrderForUser({ userId: 'u1', orderId: 'order-1' })

    expect(result).toMatchObject({ id: 'order-1', packageKey: 'starter', status: 'pending' })
    expect(JSON.stringify(result)).not.toContain('provider-secret')
    expect(JSON.stringify(result)).not.toContain('idempotencyKey')
  })
})
