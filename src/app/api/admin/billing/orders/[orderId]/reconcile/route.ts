import { NextRequest, NextResponse } from 'next/server'

import { reconcileAdminOrder } from '@/lib/admin/billing'
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
  { params }: { params: Promise<{ orderId: string }> },
) => {
  const context = await requireOwnerBillingContext(request)
  if (isBillingContextResponse(context)) return context

  const { orderId } = await params
  let result: Awaited<ReturnType<typeof reconcileAdminOrder>>
  try {
    result = await reconcileAdminOrder({
      orderId,
      reason: context.reason,
      operatorId: context.actorId,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid order reconcile' }, { status: 400 })
  }

  await auditBillingAction({
    context,
    action: 'billing.order.reconcile',
    targetType: 'admin_commercial_order',
    targetId: orderId,
    after: result,
  })

  return safeJson(result)
})
