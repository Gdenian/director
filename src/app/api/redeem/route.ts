import { NextRequest, NextResponse } from 'next/server'

import { redeemCodeForUser } from '@/lib/admin/commercial-runtime'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { apiHandler, getIdempotencyKey } from '@/lib/api-errors'

function makeIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `redeem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const result = await redeemCodeForUser({
    code: typeof body.code === 'string' ? body.code : '',
    userId: authResult.session.user.id,
    idempotencyKey:
      (typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim())
      || getIdempotencyKey(request)
      || makeIdempotencyKey(),
  })

  return NextResponse.json(result)
})
