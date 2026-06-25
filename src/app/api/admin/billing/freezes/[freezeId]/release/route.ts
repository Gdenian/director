import { NextRequest, NextResponse } from 'next/server'

import { releaseAdminFreeze } from '@/lib/admin/billing'
import { apiHandler } from '@/lib/api-errors'
import {
  auditBillingAction,
  isBillingContextResponse,
  requireOwnerBillingContext,
  safeJson,
} from '../../../route-utils'

export const dynamic = 'force-dynamic'

export const POST = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ freezeId: string }> },
) => {
  const context = await requireOwnerBillingContext(request)
  if (isBillingContextResponse(context)) return context

  const { freezeId } = await params
  let result: Awaited<ReturnType<typeof releaseAdminFreeze>>
  try {
    result = await releaseAdminFreeze({
      freezeId,
      reason: context.reason,
      operatorId: context.actorId,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid freeze release' }, { status: 400 })
  }

  await auditBillingAction({
    context,
    action: 'billing.freeze.release',
    targetType: 'balance_freeze',
    targetId: freezeId,
    after: result,
  })

  return safeJson(result)
})
