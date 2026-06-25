import { NextRequest, NextResponse } from 'next/server'

import { isErrorResponse, requireOwnerAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { cancelAdminTask } from '@/lib/admin/tasks'

export const dynamic = 'force-dynamic'

type CancelTaskBody = {
  reason?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

async function readJsonObject(request: NextRequest): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => ({}))
  return isRecord(body) ? body : {}
}

function getRequestIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || request.headers.get('x-real-ip') || null
}

export const POST = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) => {
  const authResult = await requireOwnerAuth()
  if (isErrorResponse(authResult)) return authResult

  const { taskId } = await params
  const body = await readJsonObject(request) as CancelTaskBody
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!reason) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 })
  }
  const result = await cancelAdminTask(taskId, reason)

  await writeAdminAuditLog({
    actor: {
      id: authResult.session.user.id,
      role: authResult.session.user.role,
    },
    action: 'task.cancel',
    targetType: 'task',
    targetId: taskId,
    before: null,
    after: {
      cancelled: result.cancelled,
      status: result.task?.status ?? null,
      freezeRolledBack: result.freezeRolledBack ?? null,
    },
    reason,
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
  })

  return NextResponse.json(result)
})
