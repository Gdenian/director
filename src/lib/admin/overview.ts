import { prisma } from '@/lib/prisma'
import { TASK_STATUS } from '@/lib/task/types'

function startOfToday() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function decimalSumToString(value: unknown) {
  return value && typeof value === 'object' && 'toString' in value
    ? value.toString()
    : '0'
}

export async function getAdminOverview() {
  const today = startOfToday()
  const [
    totalUsers,
    newUsersToday,
    tasksToday,
    failedTasks,
    queuedTasks,
    runningTasks,
    usageCostToday,
    balanceTotals,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: today } } }),
    prisma.task.count({ where: { createdAt: { gte: today } } }),
    prisma.task.count({ where: { status: TASK_STATUS.FAILED } }),
    prisma.task.count({ where: { status: TASK_STATUS.QUEUED } }),
    prisma.task.count({ where: { status: TASK_STATUS.PROCESSING } }),
    prisma.usageCost.aggregate({
      where: { createdAt: { gte: today } },
      _sum: { cost: true },
    }),
    prisma.userBalance.aggregate({
      _sum: {
        balance: true,
        frozenAmount: true,
        totalSpent: true,
      },
    }),
  ])

  return {
    totalUsers,
    newUsersToday,
    tasksToday,
    failedTasks,
    queuedTasks,
    runningTasks,
    usageCostToday: decimalSumToString(usageCostToday._sum.cost),
    totalBalance: decimalSumToString(balanceTotals._sum.balance),
    totalFrozen: decimalSumToString(balanceTotals._sum.frozenAmount),
    totalSpent: decimalSumToString(balanceTotals._sum.totalSpent),
  }
}
