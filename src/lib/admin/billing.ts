import { prisma } from '@/lib/prisma'

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
