import { NextRequest, NextResponse } from 'next/server'

import { isErrorResponse, requireAdminAuth, requireOwnerAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { createAdminUserGroup, listAdminUserGroups } from '@/lib/admin/user-groups'
import { getAuditReason, getRequestIp, readJsonObject, stripAuditFields } from '@/lib/admin/route-utils'

export const dynamic = 'force-dynamic'

export const GET = apiHandler(async () => {
  const authResult = await requireAdminAuth()
  if (isErrorResponse(authResult)) return authResult

  return NextResponse.json(await listAdminUserGroups())
})

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireOwnerAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await readJsonObject(request)
  const reason = getAuditReason(body)
  const actorId = authResult.session.user.id
  const input = stripAuditFields(body)

  let group: Awaited<ReturnType<typeof createAdminUserGroup>>
  try {
    group = await createAdminUserGroup({
      ...input,
      createdBy: actorId,
      updatedBy: actorId,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid user group' }, { status: 400 })
  }

  await writeAdminAuditLog({
    actor: {
      id: actorId,
      role: authResult.session.user.role,
    },
    action: 'user_group.create',
    targetType: 'user_group',
    targetId: group.key,
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
