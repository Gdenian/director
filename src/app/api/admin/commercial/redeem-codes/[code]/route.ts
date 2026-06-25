import { NextRequest, NextResponse } from 'next/server'

import { isErrorResponse, requireOwnerAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import {
  getAdminRedeemCodeBefore,
  summarizeAdminRedeemCode,
  updateAdminRedeemCode,
} from '@/lib/admin/commercial'
import { getAuditReason, getRequestIp, readJsonObject, stripAuditFields } from '@/lib/admin/route-utils'

export const dynamic = 'force-dynamic'

export const PATCH = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) => {
  const authResult = await requireOwnerAuth()
  if (isErrorResponse(authResult)) return authResult

  const { code } = await params
  const body = await readJsonObject(request)
  const reason = getAuditReason(body)
  if (!reason) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 })
  }
  const actorId = authResult.session.user.id
  const input = stripAuditFields(body)
  const before = await getAdminRedeemCodeBefore(code)

  let item: Awaited<ReturnType<typeof updateAdminRedeemCode>>
  try {
    item = await updateAdminRedeemCode(code, {
      ...input,
      updatedBy: actorId,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid redeem code update' }, { status: 400 })
  }

  const after = summarizeAdminRedeemCode(item)

  await writeAdminAuditLog({
    actor: {
      id: actorId,
      role: authResult.session.user.role,
    },
    action: 'redeem_code.update',
    targetType: 'redeem_code',
    targetId: item.code,
    before,
    after,
    reason,
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
  })

  return NextResponse.json(after)
})
