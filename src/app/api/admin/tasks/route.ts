import { NextRequest, NextResponse } from 'next/server'

import { isErrorResponse, requireAdminAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { listAdminTasks } from '@/lib/admin/tasks'
import { TASK_STATUS, type TaskStatus } from '@/lib/task/types'

export const dynamic = 'force-dynamic'

function parsePositiveInt(value: string | null) {
  if (!value) return null
  const number = Number(value)
  return Number.isFinite(number) ? Math.floor(number) : null
}

function parseList(value: string | null) {
  if (!value) return null
  const items = value.split(',').map(item => item.trim()).filter(Boolean)
  return items.length ? items : null
}

function parseTaskStatuses(value: string | null) {
  const items = parseList(value)
  if (!items) return null
  const allowed = new Set<string>(Object.values(TASK_STATUS))
  const statuses = items.filter((item): item is TaskStatus => allowed.has(item))
  return statuses.length ? statuses : null
}

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireAdminAuth()
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = request.nextUrl
  return NextResponse.json(await listAdminTasks({
    status: parseTaskStatuses(searchParams.get('status')),
    type: parseList(searchParams.get('type')),
    userId: searchParams.get('userId'),
    projectId: searchParams.get('projectId'),
    page: parsePositiveInt(searchParams.get('page')),
    pageSize: parsePositiveInt(searchParams.get('pageSize')),
  }))
})
