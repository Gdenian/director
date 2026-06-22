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

const ADMIN_TASK_SELECT = {
  id: true,
  userId: true,
  projectId: true,
  episodeId: true,
  type: true,
  targetType: true,
  status: true,
  progress: true,
  attempt: true,
  maxAttempts: true,
  priority: true,
  errorCode: true,
  billingInfo: true,
  payload: true,
  result: true,
  queuedAt: true,
  startedAt: true,
  finishedAt: true,
  heartbeatAt: true,
  enqueuedAt: true,
  enqueueAttempts: true,
  createdAt: true,
  updatedAt: true,
} as const

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
      select: ADMIN_TASK_SELECT,
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
    task: result.task ? redactTaskForAdmin({
      id: result.task.id,
      userId: result.task.userId,
      projectId: result.task.projectId,
      episodeId: result.task.episodeId,
      type: result.task.type,
      targetType: result.task.targetType,
      status: result.task.status,
      progress: result.task.progress,
      attempt: result.task.attempt,
      maxAttempts: result.task.maxAttempts,
      priority: result.task.priority,
      errorCode: result.task.errorCode,
      billingInfo: result.task.billingInfo,
      payload: result.task.payload,
      result: result.task.result,
      queuedAt: result.task.queuedAt,
      startedAt: result.task.startedAt,
      finishedAt: result.task.finishedAt,
      heartbeatAt: result.task.heartbeatAt,
      enqueuedAt: result.task.enqueuedAt,
      enqueueAttempts: result.task.enqueueAttempts,
      createdAt: result.task.createdAt,
      updatedAt: result.task.updatedAt,
    }) : null,
  }
}
