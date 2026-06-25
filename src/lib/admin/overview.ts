import { prisma } from '@/lib/prisma'
import { TASK_STATUS } from '@/lib/task/types'

type AdminActionItem = {
  id: string
  severity: 'info' | 'warning' | 'critical'
  module: 'tasks'
  title: string
  action: string
  count?: number
}

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
    actionItems: [
      ...(failedTasks > 0 ? [{
        id: 'overview-failed-tasks',
        severity: 'warning',
        module: 'tasks',
        title: `${failedTasks} 个任务失败`,
        action: '进入任务事故模块查看失败任务，定位模型、队列或余额原因。',
        count: failedTasks,
      } satisfies AdminActionItem] : []),
      ...(queuedTasks > 20 ? [{
        id: 'overview-queued-tasks',
        severity: 'info',
        module: 'tasks',
        title: `${queuedTasks} 个任务排队中`,
        action: '进入任务事故模块检查队列积压和 worker 处理能力。',
        count: queuedTasks,
      } satisfies AdminActionItem] : []),
    ],
  }
}
