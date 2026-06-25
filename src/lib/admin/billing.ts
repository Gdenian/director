import { prisma } from '@/lib/prisma'
import { roundMoney, toMoneyNumber, type MoneyValue } from '@/lib/billing/money'
import { Prisma } from '@prisma/client'

interface AdminBillingSummaryParams {
  page?: number | null
  pageSize?: number | null
}

function clampPage(value: number | null | undefined) {
  return Math.max(1, Math.floor(value || 1))
}

function clampPageSize(value: number | null | undefined) {
  return Math.min(100, Math.max(1, Math.floor(value || 20)))
}

function decimalToString(value: unknown) {
  return value && typeof value === 'object' && 'toString' in value
    ? value.toString()
    : '0'
}

function sanitizeTransactionDescription(value: string | null) {
  if (!value) return null
  const [summary] = value.split(/\s+\|\s+audit=/)
  const text = summary.trim()
  return text || null
}

function requirePositiveAmount(value: number) {
  const amount = roundMoney(Number(value), 6)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('amount must be positive')
  }
  return amount
}

function requireReason(value: string) {
  const reason = typeof value === 'string' ? value.trim() : ''
  if (!reason) throw new Error('reason is required')
  return reason
}

function requireIdempotencyKey(value: string | null | undefined) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new Error('idempotencyKey is required')
  return text
}

function auditDescription(label: string, reason: string, extra?: Record<string, unknown>) {
  return `${label} | audit=${JSON.stringify({ reason, ...(extra || {}) })}`
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

async function readBalanceTransactionResult(params: {
  userId: string
  type: string
  idempotencyKey: string
}) {
  const existing = await prisma.balanceTransaction.findUnique({
    where: {
      userId_type_idempotencyKey: params,
    },
  })
  if (!existing) throw new Error('idempotent transaction not found')
  return toBalanceOperationDto({
    transactionId: existing.id,
    duplicated: true,
    userId: params.userId,
    amount: toMoneyNumber(existing.amount),
    balanceAfter: existing.balanceAfter,
  })
}

async function findBalanceTransactionResult(params: {
  userId: string
  type: string
  idempotencyKey: string
}) {
  const existing = await prisma.balanceTransaction.findUnique({
    where: {
      userId_type_idempotencyKey: params,
    },
  })
  if (!existing) return null
  return toBalanceOperationDto({
    transactionId: existing.id,
    duplicated: true,
    userId: params.userId,
    amount: toMoneyNumber(existing.amount),
    balanceAfter: existing.balanceAfter,
  })
}

function toBalanceOperationDto(params: {
  transactionId: string
  duplicated: boolean
  userId: string
  amount: number
  balanceAfter: MoneyValue
}) {
  return {
    transactionId: params.transactionId,
    duplicated: params.duplicated,
    userId: params.userId,
    amount: params.amount,
    balanceAfter: toMoneyNumber(params.balanceAfter),
  }
}

export async function manualCreditBalance(params: {
  userId: string
  amount: number
  reason: string
  operatorId: string
  idempotencyKey?: string | null
}) {
  const amount = requirePositiveAmount(params.amount)
  const reason = requireReason(params.reason)
  const idempotencyKey = requireIdempotencyKey(params.idempotencyKey)

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.balanceTransaction.findUnique({
        where: {
          userId_type_idempotencyKey: {
            userId: params.userId,
            type: 'manual_credit',
            idempotencyKey,
          },
        },
      })
      if (existing) {
        return toBalanceOperationDto({
          transactionId: existing.id,
          duplicated: true,
          userId: params.userId,
          amount: toMoneyNumber(existing.amount),
          balanceAfter: existing.balanceAfter,
        })
      }

      const balance = await tx.userBalance.upsert({
        where: { userId: params.userId },
        create: { userId: params.userId, balance: amount, frozenAmount: 0, totalSpent: 0 },
        update: { balance: { increment: amount } },
      })
      const transaction = await tx.balanceTransaction.create({
        data: {
          userId: params.userId,
          type: 'manual_credit',
          amount,
          balanceAfter: balance.balance,
          description: auditDescription('manual credit', reason),
          operatorId: params.operatorId,
          idempotencyKey,
        },
      })

      return toBalanceOperationDto({
        transactionId: transaction.id,
        duplicated: false,
        userId: params.userId,
        amount,
        balanceAfter: balance.balance,
      })
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return await readBalanceTransactionResult({ userId: params.userId, type: 'manual_credit', idempotencyKey })
    }
    throw error
  }
}

export async function manualDebitBalance(params: {
  userId: string
  amount: number
  reason: string
  operatorId: string
  idempotencyKey?: string | null
}) {
  const amount = requirePositiveAmount(params.amount)
  const reason = requireReason(params.reason)
  const idempotencyKey = requireIdempotencyKey(params.idempotencyKey)

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.balanceTransaction.findUnique({
        where: {
          userId_type_idempotencyKey: {
            userId: params.userId,
            type: 'manual_debit',
            idempotencyKey,
          },
        },
      })
      if (existing) {
        return toBalanceOperationDto({
          transactionId: existing.id,
          duplicated: true,
          userId: params.userId,
          amount: toMoneyNumber(existing.amount),
          balanceAfter: existing.balanceAfter,
        })
      }

      const updated = await tx.userBalance.updateMany({
        where: {
          userId: params.userId,
          balance: { gte: amount },
        },
        data: {
          balance: { decrement: amount },
        },
      })
      if (updated.count === 0) {
        const existing = await tx.balanceTransaction.findUnique({
          where: {
            userId_type_idempotencyKey: {
              userId: params.userId,
              type: 'manual_debit',
              idempotencyKey,
            },
          },
        })
        if (existing) {
          return toBalanceOperationDto({
            transactionId: existing.id,
            duplicated: true,
            userId: params.userId,
            amount: toMoneyNumber(existing.amount),
            balanceAfter: existing.balanceAfter,
          })
        }
        throw new Error('insufficient balance')
      }

      const balance = await tx.userBalance.findUniqueOrThrow({ where: { userId: params.userId } })
      const transaction = await tx.balanceTransaction.create({
        data: {
          userId: params.userId,
          type: 'manual_debit',
          amount: -amount,
          balanceAfter: balance.balance,
          description: auditDescription('manual debit', reason),
          operatorId: params.operatorId,
          idempotencyKey,
        },
      })

      return toBalanceOperationDto({
        transactionId: transaction.id,
        duplicated: false,
        userId: params.userId,
        amount: -amount,
        balanceAfter: balance.balance,
      })
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return await readBalanceTransactionResult({ userId: params.userId, type: 'manual_debit', idempotencyKey })
    }
    if (error instanceof Error && error.message === 'insufficient balance') {
      const existing = await findBalanceTransactionResult({ userId: params.userId, type: 'manual_debit', idempotencyKey })
      if (existing) return existing
    }
    throw error
  }
}

export async function releaseAdminFreeze(params: {
  freezeId: string
  reason: string
  operatorId: string
}) {
  const reason = requireReason(params.reason)

  return await prisma.$transaction(async (tx) => {
    const freeze = await tx.balanceFreeze.findUnique({ where: { id: params.freezeId } })
    if (!freeze || freeze.status !== 'pending') return { released: false }

    const switched = await tx.balanceFreeze.updateMany({
      where: { id: params.freezeId, status: 'pending' },
      data: { status: 'rolled_back' },
    })
    if (switched.count === 0) return { released: false }

    const amount = toMoneyNumber(freeze.amount)
    const balance = await tx.userBalance.update({
      where: { userId: freeze.userId },
      data: {
        balance: { increment: amount },
        frozenAmount: { decrement: amount },
      },
    })
    const transaction = await tx.balanceTransaction.create({
      data: {
        userId: freeze.userId,
        type: 'freeze_release',
        amount: freeze.amount,
        balanceAfter: balance.balance,
        description: auditDescription('freeze release', reason),
        freezeId: freeze.id,
        operatorId: params.operatorId,
        idempotencyKey: `freeze_release:${freeze.id}`,
      },
    })

    return {
      released: true,
      transactionId: transaction.id,
      userId: freeze.userId,
      amount,
      balanceAfter: toMoneyNumber(balance.balance),
    }
  })
}

function orderCreditAmount(order: { credits: MoneyValue, bonusCredits: MoneyValue }) {
  return requirePositiveAmount(toMoneyNumber(order.credits) + toMoneyNumber(order.bonusCredits))
}

export async function reconcileAdminOrder(params: {
  orderId: string
  reason: string
  operatorId: string
}) {
  const reason = requireReason(params.reason)

  return await prisma.$transaction(async (tx) => {
    const order = await tx.adminCommercialOrder.findUniqueOrThrow({ where: { id: params.orderId } })
    if (order.reconciledAt) {
      return {
        reconciled: false,
        orderId: order.id,
        userId: order.userId,
      }
    }
    if (order.status !== 'paid') throw new Error('order is not paid')

    const amount = orderCreditAmount(order)
    const idempotencyKey = `order_reconcile:${order.id}`
    const existing = await tx.balanceTransaction.findUnique({
      where: {
        userId_type_idempotencyKey: {
          userId: order.userId,
          type: 'order_reconcile',
          idempotencyKey,
        },
      },
    })
    if (existing) {
      await tx.adminCommercialOrder.update({
        where: { id: order.id },
        data: { reconciledAt: order.reconciledAt || new Date(), updatedBy: params.operatorId },
      })
      return {
        reconciled: false,
        orderId: order.id,
        userId: order.userId,
        transactionId: existing.id,
        balanceAfter: toMoneyNumber(existing.balanceAfter),
      }
    }

    const balance = await tx.userBalance.upsert({
      where: { userId: order.userId },
      create: { userId: order.userId, balance: amount, frozenAmount: 0, totalSpent: 0 },
      update: { balance: { increment: amount } },
    })
    const transaction = await tx.balanceTransaction.create({
      data: {
        userId: order.userId,
        type: 'order_reconcile',
        amount,
        balanceAfter: balance.balance,
        description: auditDescription('order reconcile', reason, { orderId: order.id }),
        operatorId: params.operatorId,
        externalOrderId: order.externalOrderId,
        relatedId: order.id,
        idempotencyKey,
      },
    })
    await tx.adminCommercialOrder.update({
      where: { id: order.id },
      data: { reconciledAt: new Date(), updatedBy: params.operatorId },
    })

    return {
      reconciled: true,
      orderId: order.id,
      userId: order.userId,
      transactionId: transaction.id,
      balanceAfter: toMoneyNumber(balance.balance),
    }
  })
}

export async function refundAdminOrder(params: {
  orderId: string
  reason: string
  operatorId: string
}) {
  const reason = requireReason(params.reason)

  return await prisma.$transaction(async (tx) => {
    const order = await tx.adminCommercialOrder.findUniqueOrThrow({ where: { id: params.orderId } })
    if (order.refundedAt) {
      return {
        refunded: false,
        orderId: order.id,
        userId: order.userId,
      }
    }
    if (!order.reconciledAt) throw new Error('order is not reconciled')

    const amount = orderCreditAmount(order)
    const idempotencyKey = `order_refund:${order.id}`
    const existing = await tx.balanceTransaction.findUnique({
      where: {
        userId_type_idempotencyKey: {
          userId: order.userId,
          type: 'order_refund',
          idempotencyKey,
        },
      },
    })
    if (existing) {
      await tx.adminCommercialOrder.update({
        where: { id: order.id },
        data: { status: 'refunded', refundedAt: order.refundedAt || new Date(), updatedBy: params.operatorId },
      })
      return {
        refunded: false,
        orderId: order.id,
        userId: order.userId,
        transactionId: existing.id,
        balanceAfter: toMoneyNumber(existing.balanceAfter),
      }
    }

    const updated = await tx.userBalance.updateMany({
      where: {
        userId: order.userId,
        balance: { gte: amount },
      },
      data: {
        balance: { decrement: amount },
      },
    })
    if (updated.count === 0) throw new Error('insufficient balance')

    const balance = await tx.userBalance.findUniqueOrThrow({ where: { userId: order.userId } })
    const transaction = await tx.balanceTransaction.create({
      data: {
        userId: order.userId,
        type: 'order_refund',
        amount: -amount,
        balanceAfter: balance.balance,
        description: auditDescription('order refund', reason, { orderId: order.id }),
        operatorId: params.operatorId,
        externalOrderId: order.externalOrderId,
        relatedId: order.id,
        idempotencyKey,
      },
    })
    await tx.adminCommercialOrder.update({
      where: { id: order.id },
      data: { status: 'refunded', refundedAt: new Date(), updatedBy: params.operatorId },
    })

    return {
      refunded: true,
      orderId: order.id,
      userId: order.userId,
      transactionId: transaction.id,
      balanceAfter: toMoneyNumber(balance.balance),
    }
  })
}

export async function getAdminBillingSummary(params: AdminBillingSummaryParams = {}) {
  const page = clampPage(params.page)
  const pageSize = clampPageSize(params.pageSize)
  const [balanceTotals, transactions, transactionTotal, freezeGroups] = await Promise.all([
    prisma.userBalance.aggregate({
      _sum: {
        balance: true,
        frozenAmount: true,
        totalSpent: true,
      },
    }),
    prisma.balanceTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
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
    }),
    prisma.balanceTransaction.count(),
    prisma.balanceFreeze.groupBy({
      by: ['status'],
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ])

  return {
    totals: {
      balance: decimalToString(balanceTotals._sum.balance),
      frozenAmount: decimalToString(balanceTotals._sum.frozenAmount),
      totalSpent: decimalToString(balanceTotals._sum.totalSpent),
    },
    recentTransactions: {
      items: transactions.map(transaction => ({
        id: transaction.id,
        userId: transaction.userId,
        type: transaction.type,
        amount: transaction.amount.toString(),
        balanceAfter: transaction.balanceAfter.toString(),
        description: sanitizeTransactionDescription(transaction.description),
        projectId: transaction.projectId,
        episodeId: transaction.episodeId,
        taskType: transaction.taskType,
        createdAt: transaction.createdAt,
      })),
      total: transactionTotal,
      page,
      pageSize,
    },
    freezesByStatus: freezeGroups.map(group => ({
      status: group.status,
      amount: decimalToString(group._sum.amount),
      count: group._count._all,
    })),
  }
}
