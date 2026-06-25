import { NextRequest, NextResponse } from 'next/server'

import { isErrorResponse, requireOwnerAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { createAdminCommercialPackage, summarizeAdminCommercialPackage } from '@/lib/admin/commercial'
import { getAuditReason, getRequestIp, readJsonObject, stripAuditFields } from '@/lib/admin/route-utils'

export const dynamic = 'force-dynamic'

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireOwnerAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await readJsonObject(request)
  const reason = getAuditReason(body)
  if (!reason) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 })
  }
  const actorId = authResult.session.user.id
  const input = stripAuditFields(body)

  let item: Awaited<ReturnType<typeof createAdminCommercialPackage>>
  try {
    item = await createAdminCommercialPackage({
      ...input,
      createdBy: actorId,
      updatedBy: actorId,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid commercial package' }, { status: 400 })
  }

  const after = summarizeAdminCommercialPackage(item)

  await writeAdminAuditLog({
    actor: {
      id: actorId,
      role: authResult.session.user.role,
    },
    action: 'commercial_package.create',
    targetType: 'commercial_package',
    targetId: item.key,
    before: null,
    after,
    reason,
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
  })

  return NextResponse.json(after)
})
