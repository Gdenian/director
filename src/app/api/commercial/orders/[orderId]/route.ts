import { NextRequest, NextResponse } from 'next/server'

import { getCommercialOrderForUser } from '@/lib/admin/commercial-runtime'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'

export const GET = apiHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const { orderId } = await params
  const item = await getCommercialOrderForUser({
    userId: authResult.session.user.id,
    orderId,
  })
  return NextResponse.json({ item })
})
