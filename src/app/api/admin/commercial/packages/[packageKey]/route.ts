import { NextRequest, NextResponse } from 'next/server'

import { isErrorResponse, requireOwnerAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import {
  getAdminCommercialPackageBefore,
  summarizeAdminCommercialPackage,
  updateAdminCommercialPackage,
} from '@/lib/admin/commercial'
import { getAuditReason, getRequestIp, readJsonObject, stripAuditFields } from '@/lib/admin/route-utils'

export const dynamic = 'force-dynamic'

export const PATCH = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ packageKey: string }> },
) => {
  const authResult = await requireOwnerAuth()
  if (isErrorResponse(authResult)) return authResult

  const { packageKey } = await params
  const body = await readJsonObject(request)
  const reason = getAuditReason(body)
  if (!reason) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 })
  }
  const actorId = authResult.session.user.id
  const input = stripAuditFields(body)
  const before = await getAdminCommercialPackageBefore(packageKey)

  let item: Awaited<ReturnType<typeof updateAdminCommercialPackage>>
  try {
    item = await updateAdminCommercialPackage(packageKey, {
      ...input,
      updatedBy: actorId,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid commercial package update' }, { status: 400 })
  }

  const after = summarizeAdminCommercialPackage(item)
  const action = after?.status === 'active' && before?.status !== 'active'
    ? 'commercial_package.publish'
    : after?.status === 'archived' && before?.status !== 'archived'
      ? 'commercial_package.archive'
      : 'commercial_package.update'

  await writeAdminAuditLog({
    actor: {
      id: actorId,
      role: authResult.session.user.role,
    },
    action,
    targetType: 'commercial_package',
    targetId: packageKey,
    before,
    after,
    reason,
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
  })

  return NextResponse.json(after)
})
