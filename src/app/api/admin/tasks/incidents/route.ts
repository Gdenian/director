import { NextRequest, NextResponse } from 'next/server'

import { isErrorResponse, requireOwnerAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getAuditReason, getRequestIp, readJsonObject } from '@/lib/admin/route-utils'
import { createTaskIncident } from '@/lib/admin/tasks'
import { TASK_STATUS } from '@/lib/task/types'

export const dynamic = 'force-dynamic'

const INCIDENT_ACTIONS = new Set(['cancel'])
const INVALID_FILTER = Symbol('invalid-filter')

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function optionalPositiveInt(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(1, Math.floor(number)) : null
}

function parseStringArray(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : undefined
  }
  if (!Array.isArray(value)) return undefined
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
  return items.length ? items : undefined
}

function parseFilter(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const statuses = parseStringArray(input.status)
  const allowedStatuses = new Set<string>(Object.values(TASK_STATUS))
  if (statuses?.some(item => !allowedStatuses.has(item))) return INVALID_FILTER
  const status = statuses?.filter(item => allowedStatuses.has(item))
  const type = parseStringArray(input.type)

  const filter = {
    ...(status?.length ? { status } : {}),
    ...(type?.length ? { type } : {}),
    ...(optionalString(input.userId) ? { userId: optionalString(input.userId) } : {}),
    ...(optionalString(input.projectId) ? { projectId: optionalString(input.projectId) } : {}),
    ...(optionalPositiveInt(input.olderThanMinutes) ? { olderThanMinutes: optionalPositiveInt(input.olderThanMinutes) } : {}),
    ...(optionalPositiveInt(input.limit) ? { limit: optionalPositiveInt(input.limit) } : {}),
  }
  const hasEffectiveConstraint = Boolean(
    filter.status?.length
    || filter.type?.length
    || filter.userId
    || filter.projectId
    || filter.olderThanMinutes,
  )
  return hasEffectiveConstraint ? filter : null
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireOwnerAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await readJsonObject(request)
  const title = optionalString(body.title)
  const action = optionalString(body.action)
  const reason = getAuditReason(body)
  const filter = parseFilter(body.filter)

  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })
  if (!action || !INCIDENT_ACTIONS.has(action)) return NextResponse.json({ error: 'action is invalid' }, { status: 400 })
  if (filter === INVALID_FILTER) return NextResponse.json({ error: 'filter is invalid' }, { status: 400 })
  if (!filter) return NextResponse.json({ error: 'filter is required' }, { status: 400 })
  if (!reason) return NextResponse.json({ error: 'reason is required' }, { status: 400 })

  const incident = await createTaskIncident({
    title,
    action: 'cancel',
    reason,
    createdBy: authResult.session.user.id,
    filter,
  })

  await writeAdminAuditLog({
    actor: {
      id: authResult.session.user.id,
      role: authResult.session.user.role,
    },
    action: 'task.incident.batch_resolve',
    targetType: 'task_incident',
    targetId: incident.id,
    after: {
      id: incident.id,
      action: incident.action,
      status: incident.status,
      counts: incident.counts,
    },
    reason,
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
  })

  return NextResponse.json(incident)
})
