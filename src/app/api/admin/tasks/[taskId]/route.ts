import { NextRequest, NextResponse } from 'next/server'

import { isErrorResponse, requireOwnerAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { cancelAdminTask } from '@/lib/admin/tasks'

export const dynamic = 'force-dynamic'

type CancelTaskBody = {
  reason?: string | null
}

export const POST = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) => {
  const authResult = await requireOwnerAuth()
  if (isErrorResponse(authResult)) return authResult

  const { taskId } = await params
  const body = await request.json().catch(() => ({})) as CancelTaskBody
  const reason = typeof body.reason === 'string' ? body.reason : ''
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
    after: { cancelled: result.cancelled },
    reason: body.reason,
  })

  return NextResponse.json(result)
})
