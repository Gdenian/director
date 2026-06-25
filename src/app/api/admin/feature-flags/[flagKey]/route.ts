import { NextRequest, NextResponse } from 'next/server'

import { isErrorResponse, requireOwnerAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { updateAdminFeatureFlag } from '@/lib/admin/feature-flags'
import { getAuditReason, getRequestIp, readJsonObject, stripAuditFields } from '@/lib/admin/route-utils'

export const dynamic = 'force-dynamic'

export const PATCH = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ flagKey: string }> },
) => {
  const authResult = await requireOwnerAuth()
  if (isErrorResponse(authResult)) return authResult

  const { flagKey } = await params
  const body = await readJsonObject(request)
  const reason = getAuditReason(body)
  const actorId = authResult.session.user.id
  const input = stripAuditFields(body)

  let flag: Awaited<ReturnType<typeof updateAdminFeatureFlag>>
  try {
    flag = await updateAdminFeatureFlag(flagKey, {
      ...input,
      updatedBy: actorId,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid feature flag update' }, { status: 400 })
  }

  await writeAdminAuditLog({
    actor: {
      id: actorId,
      role: authResult.session.user.role,
    },
    action: 'feature_flag.update',
    targetType: 'feature_flag',
    targetId: flagKey,
    before: null,
    after: {
      enabled: flag.enabled,
      audience: flag.audience,
      rolloutPercent: flag.rolloutPercent,
    },
    reason,
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
  })

  return NextResponse.json(flag)
})
