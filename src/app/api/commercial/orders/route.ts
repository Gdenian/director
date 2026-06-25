import { NextRequest, NextResponse } from 'next/server'

import { createCommercialOrderForUser } from '@/lib/admin/commercial-runtime'
import { OperationPolicyError, operationErrorToApiPayload } from '@/lib/admin/operation-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { apiHandler, getIdempotencyKey } from '@/lib/api-errors'

function makeIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `order_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const order = await createCommercialOrderForUser({
    userId: authResult.session.user.id,
    packageKey: typeof body.packageKey === 'string' ? body.packageKey : '',
    idempotencyKey:
      (typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim())
      || getIdempotencyKey(request)
      || makeIdempotencyKey(),
  })

  if (!order.paymentConfigured) {
    const error = new OperationPolicyError('PACKAGE_UNAVAILABLE', { message: '支付暂未配置' })
    return NextResponse.json({
      ...operationErrorToApiPayload(error),
      order,
    }, { status: error.httpStatus })
  }

  return NextResponse.json({ item: order }, { status: 201 })
})
