import { NextRequest, NextResponse } from 'next/server'

import { manualDebitBalance } from '@/lib/admin/billing'
import { apiHandler } from '@/lib/api-errors'
import {
  auditBillingAction,
  isBillingContextResponse,
  requireOwnerBillingContext,
  requiredAmount,
  requiredString,
  safeJson,
} from '../route-utils'

export const dynamic = 'force-dynamic'

export const POST = apiHandler(async (request: NextRequest) => {
  const context = await requireOwnerBillingContext(request)
  if (isBillingContextResponse(context)) return context

  let result: Awaited<ReturnType<typeof manualDebitBalance>>
  let userId: string
  try {
    userId = requiredString(context.body.userId, 'userId')
    result = await manualDebitBalance({
      userId,
      amount: requiredAmount(context.body.amount),
      reason: context.reason,
      operatorId: context.actorId,
      idempotencyKey: requiredString(context.body.idempotencyKey, 'idempotencyKey'),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid manual debit' }, { status: 400 })
  }

  await auditBillingAction({
    context,
    action: 'billing.balance.debit',
    targetType: 'user',
    targetId: userId,
    after: result,
  })

  return safeJson(result)
})
