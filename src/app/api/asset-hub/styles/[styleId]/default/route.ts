import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { setDefaultStyle } from '@/lib/styles/service'

export const POST = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ styleId: string }> },
) => {
  const { styleId } = await context.params
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const result = await setDefaultStyle(authResult.session.user.id, styleId)

  return NextResponse.json(result)
})
