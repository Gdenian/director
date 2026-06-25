import { beforeEach, describe, expect, it } from 'vitest'

import {
  manualCreditBalance,
  manualDebitBalance,
  reconcileAdminOrder,
  refundAdminOrder,
  releaseAdminFreeze,
} from '@/lib/admin/billing'
import { freezeBalance } from '@/lib/billing/ledger'
import { resetBillingState } from '../../helpers/db-reset'
import { createTestUser, seedBalance } from '../../helpers/billing-fixtures'
import { prisma } from '../../helpers/prisma'

describe('admin billing operations', () => {
  beforeEach(async () => {
    await prisma.adminCommercialOrder.deleteMany()
    await resetBillingState()
  })

  it('credits and debits balance with idempotent transactions', async () => {
    const user = await createTestUser()
    await seedBalance(user.id, 0)

    const firstCredit = await manualCreditBalance({
      userId: user.id,
      amount: 10,
      reason: '客服补偿',
      operatorId: 'owner-1',
      idempotencyKey: 'credit-1',
    })
    const secondCredit = await manualCreditBalance({
      userId: user.id,
      amount: 10,
      reason: '客服补偿',
      operatorId: 'owner-1',
      idempotencyKey: 'credit-1',
    })
    const debit = await manualDebitBalance({
      userId: user.id,
      amount: 3,
      reason: '误充值扣回',
      operatorId: 'owner-1',
      idempotencyKey: 'debit-1',
    })

    const balance = await prisma.userBalance.findUnique({ where: { userId: user.id } })
    expect(Number(balance?.balance)).toBe(7)
    expect(firstCredit.duplicated).toBe(false)
    expect(secondCredit.duplicated).toBe(true)
    expect(debit.balanceAfter).toBe(7)
    expect(await prisma.balanceTransaction.count({ where: { userId: user.id, idempotencyKey: 'credit-1' } })).toBe(1)
    expect(await prisma.balanceTransaction.count({ where: { userId: user.id, type: 'manual_debit' } })).toBe(1)
  })

  it('rejects manual debit when balance is insufficient without writing a transaction', async () => {
    const user = await createTestUser()
    await seedBalance(user.id, 2)

    await expect(manualDebitBalance({
      userId: user.id,
      amount: 3,
      reason: '误充值扣回',
      operatorId: 'owner-1',
      idempotencyKey: 'debit-insufficient',
    })).rejects.toThrow('insufficient balance')

    const balance = await prisma.userBalance.findUnique({ where: { userId: user.id } })
    expect(Number(balance?.balance)).toBe(2)
    expect(await prisma.balanceTransaction.count({ where: { userId: user.id } })).toBe(0)
  })

  it('treats concurrent manual debit with the same idempotency key as one debit', async () => {
    const user = await createTestUser()
    await seedBalance(user.id, 3)

    const results = await Promise.allSettled([
      manualDebitBalance({
        userId: user.id,
        amount: 3,
        reason: '重复扣款测试',
        operatorId: 'owner-1',
        idempotencyKey: 'debit-concurrent',
      }),
      manualDebitBalance({
        userId: user.id,
        amount: 3,
        reason: '重复扣款测试',
        operatorId: 'owner-1',
        idempotencyKey: 'debit-concurrent',
      }),
    ])

    expect(results.every(result => result.status === 'fulfilled')).toBe(true)
    const values = results.map(result => {
      if (result.status === 'rejected') throw result.reason
      return result.value
    })
    expect(values.some(value => value.duplicated)).toBe(true)
    const balance = await prisma.userBalance.findUnique({ where: { userId: user.id } })
    expect(Number(balance?.balance)).toBe(0)
    expect(await prisma.balanceTransaction.count({ where: { userId: user.id, type: 'manual_debit' } })).toBe(1)
  })

  it('requires explicit idempotency keys for manual balance operations', async () => {
    const user = await createTestUser()
    await seedBalance(user.id, 10)

    await expect(manualCreditBalance({
      userId: user.id,
      amount: 10,
      reason: '客服补偿',
      operatorId: 'owner-1',
    })).rejects.toThrow('idempotencyKey is required')

    await expect(manualDebitBalance({
      userId: user.id,
      amount: 3,
      reason: '误充值扣回',
      operatorId: 'owner-1',
    })).rejects.toThrow('idempotencyKey is required')
  })

  it('releases pending freeze exactly once and records one release transaction', async () => {
    const user = await createTestUser()
    await seedBalance(user.id, 8)
    const freezeId = await freezeBalance(user.id, 4, { source: 'task', idempotencyKey: 'freeze-release' })

    const first = await releaseAdminFreeze({ freezeId: freezeId!, reason: '任务失败释放', operatorId: 'owner-1' })
    const second = await releaseAdminFreeze({ freezeId: freezeId!, reason: '重复点击', operatorId: 'owner-1' })

    expect(first.released).toBe(true)
    expect(second.released).toBe(false)
    const balance = await prisma.userBalance.findUnique({ where: { userId: user.id } })
    expect(Number(balance?.balance)).toBe(8)
    expect(Number(balance?.frozenAmount)).toBe(0)
    expect(await prisma.balanceTransaction.count({ where: { userId: user.id, type: 'freeze_release', freezeId } })).toBe(1)
  })

  it('reconciles paid commercial orders once and credits total order credits', async () => {
    const user = await createTestUser()
    const order = await prisma.adminCommercialOrder.create({
      data: {
        userId: user.id,
        packageKey: 'starter',
        status: 'paid',
        amount: 99,
        credits: 120,
        bonusCredits: 10,
        externalOrderId: 'pay-1',
        idempotencyKey: 'order-1',
        paidAt: new Date(),
      },
    })

    const first = await reconcileAdminOrder({ orderId: order.id, reason: '支付回调补单', operatorId: 'owner-1' })
    const second = await reconcileAdminOrder({ orderId: order.id, reason: '重复补单', operatorId: 'owner-1' })

    const balance = await prisma.userBalance.findUnique({ where: { userId: user.id } })
    const updatedOrder = await prisma.adminCommercialOrder.findUniqueOrThrow({ where: { id: order.id } })
    expect(first.reconciled).toBe(true)
    expect(second.reconciled).toBe(false)
    expect(Number(balance?.balance)).toBe(130)
    expect(updatedOrder.reconciledAt).toBeTruthy()
    expect(await prisma.balanceTransaction.count({ where: { userId: user.id, type: 'order_reconcile', externalOrderId: 'pay-1' } })).toBe(1)
  })

  it('refunds reconciled commercial orders once and debits credited amount', async () => {
    const user = await createTestUser()
    await seedBalance(user.id, 0)
    const order = await prisma.adminCommercialOrder.create({
      data: {
        userId: user.id,
        packageKey: 'starter',
        status: 'paid',
        amount: 99,
        credits: 120,
        bonusCredits: 10,
        externalOrderId: 'pay-refund-1',
        idempotencyKey: 'order-refund-1',
        paidAt: new Date(),
      },
    })
    await reconcileAdminOrder({ orderId: order.id, reason: '支付回调补单', operatorId: 'owner-1' })

    const first = await refundAdminOrder({ orderId: order.id, reason: '用户退款', operatorId: 'owner-1' })
    const second = await refundAdminOrder({ orderId: order.id, reason: '重复退款', operatorId: 'owner-1' })

    const balance = await prisma.userBalance.findUnique({ where: { userId: user.id } })
    const updatedOrder = await prisma.adminCommercialOrder.findUniqueOrThrow({ where: { id: order.id } })
    expect(first.refunded).toBe(true)
    expect(second.refunded).toBe(false)
    expect(Number(balance?.balance)).toBe(0)
    expect(updatedOrder.status).toBe('refunded')
    expect(updatedOrder.refundedAt).toBeTruthy()
    expect(await prisma.balanceTransaction.count({ where: { userId: user.id, type: 'order_refund', externalOrderId: 'pay-refund-1' } })).toBe(1)
  })
})
