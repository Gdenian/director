import { prisma } from '@/lib/prisma'

export async function getAdminModelHealth() {
  const [usageGroups, taskGroups] = await Promise.all([
    prisma.usageCost.groupBy({
      by: ['apiType', 'model'],
      _sum: {
        cost: true,
        quantity: true,
      },
      _count: {
        _all: true,
      },
      orderBy: [
        { apiType: 'asc' },
        { model: 'asc' },
      ],
    }),
    prisma.task.groupBy({
      by: ['type', 'status'],
      _count: {
        _all: true,
      },
      orderBy: [
        { type: 'asc' },
        { status: 'asc' },
      ],
    }),
  ])

  return {
    usageByModel: usageGroups.map(group => ({
      apiType: group.apiType,
      model: group.model,
      cost: group._sum.cost?.toString() ?? '0',
      quantity: group._sum.quantity ?? 0,
      count: group._count._all,
    })),
    taskHealthByType: taskGroups.map(group => ({
      type: group.type,
      status: group.status,
      count: group._count._all,
    })),
  }
}
