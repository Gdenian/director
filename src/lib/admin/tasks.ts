import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { removeTaskJob } from '@/lib/task/queues'
import { publishTaskEvent } from '@/lib/task/publisher'
import { cancelTask } from '@/lib/task/service'
import { TASK_EVENT_TYPE, type TaskStatus } from '@/lib/task/types'
import { redactTaskForAdmin } from './redaction'

interface ListAdminTasksParams {
  status?: TaskStatus | TaskStatus[] | null
  type?: string | string[] | null
  userId?: string | null
  projectId?: string | null
  page?: number | null
  pageSize?: number | null
}

type TaskIncidentAction = 'cancel' | 'retry' | 'release_freeze'
type TaskIncidentItemStatus = 'pending' | 'completed' | 'failed'

interface CreateTaskIncidentParams {
  title: string
  action: TaskIncidentAction
  reason: string
  createdBy: string
  filter: {
    status?: string[] | null
    type?: string[] | null
    userId?: string | null
    projectId?: string | null
    olderThanMinutes?: number | null
    limit?: number | null
  }
}

function clampPage(value: number | null | undefined) {
  return Math.max(1, Math.floor(value || 1))
}

function clampPageSize(value: number | null | undefined) {
  return Math.min(200, Math.max(1, Math.floor(value || 50)))
}

function clampIncidentLimit(value: number | null | undefined) {
  return Math.min(200, Math.max(1, Math.floor(value || 50)))
}

function asArray<T>(value: T | T[] | null | undefined) {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function toJson(value: unknown) {
  if (value === undefined || value === null) return Prisma.JsonNull
  return value as Prisma.InputJsonValue
}

function truncateErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error)
  return raw
    .replace(/\b(api[_-]?key|secret|token|password)\b\s*(?::|=)?\s*['"]?[^'"\s,;]+/gi, '$1=redacted')
    .replace(/\bbearer\s+[^'"\s,;]+/gi, 'Bearer redacted')
    .slice(0, 500)
}

function sanitizeIncidentJson(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if ('payload' in record || 'result' in record || 'billingInfo' in record || 'dedupeKey' in record) {
    return redactTaskForAdmin(record)
  }
  const copy: Record<string, unknown> = { ...record }
  delete copy.payload
  delete copy.result
  delete copy.billingInfo
  delete copy.dedupeKey
  return copy
}

function normalizeIncidentFilter(filter: CreateTaskIncidentParams['filter']) {
  const olderThanMinutes = typeof filter.olderThanMinutes === 'number' && Number.isFinite(filter.olderThanMinutes)
    ? Math.max(1, Math.floor(filter.olderThanMinutes))
    : null
  const status = filter.status?.filter(Boolean) || []
  const type = filter.type?.filter(Boolean) || []
  const hasEffectiveConstraint = Boolean(
    status.length
    || type.length
    || filter.userId
    || filter.projectId
    || olderThanMinutes,
  )
  if (!hasEffectiveConstraint) {
    throw new Error('filter must include at least one effective constraint')
  }

  return {
    ...(status.length ? { status } : {}),
    ...(type.length ? { type } : {}),
    ...(filter.userId ? { userId: filter.userId } : {}),
    ...(filter.projectId ? { projectId: filter.projectId } : {}),
    ...(olderThanMinutes ? { olderThanMinutes } : {}),
    limit: clampIncidentLimit(filter.limit),
  }
}

function buildIncidentDto(incident: {
  id: string
  title: string
  action: string
  status: string
  reason: string
  filterJson: unknown
  createdBy: string
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
  items: Array<{
    id: string
    incidentId: string
    taskId: string
    status: string
    beforeJson: unknown
    afterJson: unknown
    errorMessage: string | null
    createdAt: Date
    updatedAt: Date
  }>
}) {
  const items = incident.items.map(item => ({
    id: item.id,
    incidentId: item.incidentId,
    taskId: item.taskId,
    status: item.status,
    before: sanitizeIncidentJson(item.beforeJson),
    after: sanitizeIncidentJson(item.afterJson),
    errorMessage: item.errorMessage ? truncateErrorMessage(item.errorMessage) : null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }))
  const completed = items.filter(item => item.status === 'completed').length
  const failed = items.filter(item => item.status === 'failed').length

  return {
    id: incident.id,
    title: incident.title,
    action: incident.action,
    status: incident.status,
    reason: incident.reason,
    filter: sanitizeIncidentJson(incident.filterJson) ?? {},
    createdBy: incident.createdBy,
    completedAt: incident.completedAt?.toISOString() ?? null,
    createdAt: incident.createdAt.toISOString(),
    updatedAt: incident.updatedAt.toISOString(),
    counts: {
      total: items.length,
      completed,
      failed,
    },
    items,
  }
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
  const jobRemoved = await removeTaskJob(taskId).catch(() => false)

  if (result.cancelled && result.task) {
    await publishTaskEvent({
      taskId: result.task.id,
      userId: result.task.userId,
      projectId: result.task.projectId,
      type: TASK_EVENT_TYPE.FAILED,
      taskType: result.task.type,
      targetType: result.task.targetType,
      targetId: result.task.targetId,
      episodeId: result.task.episodeId,
      payload: {
        stage: 'cancelled',
        cancelled: true,
        reason,
        source: 'admin',
      },
    }).catch(() => null)
  }

  return {
    cancelled: result.cancelled,
    freezeRolledBack: result.billingRollback?.rolledBack ?? null,
    jobRemoved,
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

export async function createTaskIncident(params: CreateTaskIncidentParams) {
  if (params.action !== 'cancel') {
    throw new Error(`Batch action ${params.action} is not implemented`)
  }
  const filter = normalizeIncidentFilter(params.filter)
  const olderThanDate = typeof filter.olderThanMinutes === 'number'
    ? new Date(Date.now() - filter.olderThanMinutes * 60_000)
    : null
  const tasks = await prisma.task.findMany({
    where: {
      ...(filter.status?.length ? { status: { in: filter.status } } : {}),
      ...(filter.type?.length ? { type: { in: filter.type } } : {}),
      ...(filter.userId ? { userId: filter.userId } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(olderThanDate ? { updatedAt: { lt: olderThanDate } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: filter.limit,
    select: ADMIN_TASK_SELECT,
  })

  const incident = await prisma.adminTaskIncident.create({
    data: {
      title: params.title,
      action: params.action,
      reason: params.reason,
      createdBy: params.createdBy,
      filterJson: toJson(filter),
      items: {
        create: tasks.map(task => ({
          taskId: task.id,
          status: 'pending',
          beforeJson: toJson(redactTaskForAdmin(task)),
        })),
      },
    },
  })

  for (const task of tasks) {
    let status: TaskIncidentItemStatus = 'completed'
    let afterJson: Record<string, unknown> | null = null
    let errorMessage: string | null = null

    try {
      const result = await cancelAdminTask(task.id, params.reason)
      if (!result.cancelled) {
        throw new Error('Task was not cancelled')
      }
      afterJson = result.task ?? {
        cancelled: result.cancelled,
        freezeRolledBack: result.freezeRolledBack,
        jobRemoved: result.jobRemoved,
      }
    } catch (error) {
      status = 'failed'
      errorMessage = truncateErrorMessage(error)
    }

    await prisma.adminTaskIncidentItem.updateMany({
      where: { incidentId: incident.id, taskId: task.id },
      data: {
        status,
        afterJson: toJson(afterJson),
        errorMessage,
      },
    })
  }

  const failedItems = await prisma.adminTaskIncidentItem.count({
    where: { incidentId: incident.id, status: 'failed' },
  })
  const finalStatus = failedItems > 0 ? 'partial_failed' : 'completed'
  await prisma.adminTaskIncident.update({
    where: { id: incident.id },
    data: {
      status: finalStatus,
      completedAt: new Date(),
    },
  })

  const dto = await getTaskIncident(incident.id)
  if (!dto) throw new Error('Task incident not found after creation')
  return dto
}

export async function getTaskIncident(incidentId: string) {
  const incident = await prisma.adminTaskIncident.findUnique({
    where: { id: incidentId },
    include: {
      items: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!incident) return null
  return buildIncidentDto(incident)
}
