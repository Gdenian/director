import { NextRequest, NextResponse } from 'next/server'

import { isErrorResponse, requireOwnerAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { createAdminRedeemCode, summarizeAdminRedeemCode } from '@/lib/admin/commercial'
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

  let item: Awaited<ReturnType<typeof createAdminRedeemCode>>
  try {
    item = await createAdminRedeemCode({
      ...input,
      createdBy: actorId,
      updatedBy: actorId,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid redeem code' }, { status: 400 })
  }

  const after = summarizeAdminRedeemCode(item)

  await writeAdminAuditLog({
    actor: {
      id: actorId,
      role: authResult.session.user.role,
    },
    action: 'redeem_code.create',
    targetType: 'redeem_code',
    targetId: item.code,
    before: null,
    after,
    reason,
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
  })

  return NextResponse.json(after)
})
