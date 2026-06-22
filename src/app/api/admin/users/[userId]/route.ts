import { NextRequest, NextResponse } from 'next/server'

import { isErrorResponse, requireOwnerAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { updateAdminUserAccess } from '@/lib/admin/users'

export const dynamic = 'force-dynamic'

type UserAccessBody = {
  role?: string | null
  status?: string | null
  reason?: string | null
}

export const PATCH = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) => {
  const authResult = await requireOwnerAuth()
  if (isErrorResponse(authResult)) return authResult

  const { userId } = await params
  const body = await request.json().catch(() => ({})) as UserAccessBody
  const input = {
    ...('role' in body ? { role: body.role } : {}),
    ...('status' in body ? { status: body.status } : {}),
  }
  const user = await updateAdminUserAccess(userId, input)

  await writeAdminAuditLog({
    actor: {
      id: authResult.session.user.id,
      role: authResult.session.user.role,
    },
    action: 'user.access.update',
    targetType: 'user',
    targetId: userId,
    before: null,
    after: {
      role: user.role,
      status: user.status,
    },
    reason: body.reason,
  })

  return NextResponse.json(user)
})
