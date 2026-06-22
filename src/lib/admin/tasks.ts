import { prisma } from '@/lib/prisma'
import { removeTaskJob } from '@/lib/task/queues'
import { cancelTask } from '@/lib/task/service'
import type { TaskStatus } from '@/lib/task/types'
import { redactTaskForAdmin } from './redaction'

interface ListAdminTasksParams {
  status?: TaskStatus | TaskStatus[] | null
  type?: string | string[] | null
  userId?: string | null
  projectId?: string | null
  page?: number | null
  pageSize?: number | null
}

function clampPage(value: number | null | undefined) {
  return Math.max(1, Math.floor(value || 1))
}

function clampPageSize(value: number | null | undefined) {
  return Math.min(200, Math.max(1, Math.floor(value || 50)))
}

function asArray<T>(value: T | T[] | null | undefined) {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

export async function listAdminTasks(params: ListAdminTasksParams = {}) {
  const page = clampPage(params.page)
  const pageSize = clampPageSize(params.pageSize)
  const statuses = asArray(params.status)
  const types = asArray(params.type)
  const where = {
    ...(statuses.length ? { status: { in: statuses } } : {}),
    ...(types.length ? { type: { in: types } } : {}),
    ...(params.userId ? { userId: params.userId } : {}),
    ...(params.projectId ? { projectId: params.projectId } : {}),
  }

  const [items, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.task.count({ where }),
  ])

  return {
    items: items.map(task => redactTaskForAdmin(task)),
    total,
    page,
    pageSize,
  }
}

export async function cancelAdminTask(taskId: string, reason: string) {
  const result = await cancelTask(taskId, reason)
  await removeTaskJob(taskId).catch(() => false)

  return {
    cancelled: result.cancelled,
    task: result.task ? redactTaskForAdmin(result.task) : null,
  }
}
