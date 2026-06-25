import { NextResponse } from 'next/server'

import { listAvailablePackages } from '@/lib/admin/commercial-runtime'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'

export const GET = apiHandler(async () => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const items = await listAvailablePackages({ userId: authResult.session.user.id })
  return NextResponse.json({ items })
})
