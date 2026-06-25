import { NextRequest, NextResponse } from 'next/server'

import { isErrorResponse, requireOwnerAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getAuditReason, getRequestIp, readJsonObject, stripAuditFields } from '@/lib/admin/route-utils'
import { updateAdminUserGroup } from '@/lib/admin/user-groups'

export const dynamic = 'force-dynamic'

export const PATCH = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ groupKey: string }> },
) => {
  const authResult = await requireOwnerAuth()
  if (isErrorResponse(authResult)) return authResult

  const { groupKey } = await params
  const body = await readJsonObject(request)
  const reason = getAuditReason(body)
  const actorId = authResult.session.user.id
  const input = stripAuditFields(body)

  let group: Awaited<ReturnType<typeof updateAdminUserGroup>>
  try {
    group = await updateAdminUserGroup(groupKey, {
      ...input,
      updatedBy: actorId,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid user group update' }, { status: 400 })
  }

  await writeAdminAuditLog({
    actor: {
      id: actorId,
      role: authResult.session.user.role,
    },
    action: 'user_group.update',
    targetType: 'user_group',
    targetId: groupKey,
    before: null,
    after: {
      name: group.name,
      status: group.status,
      dailyTaskLimit: group.dailyTaskLimit,
      concurrentTaskLimit: group.concurrentTaskLimit,
    },
    reason,
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
  })

  return NextResponse.json(group)
})
