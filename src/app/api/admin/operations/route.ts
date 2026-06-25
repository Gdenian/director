import { NextResponse } from 'next/server'

import { isErrorResponse, requireAdminAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { getAdminOperations } from '@/lib/admin/operations'

export const dynamic = 'force-dynamic'

export const GET = apiHandler(async () => {
  const authResult = await requireAdminAuth()
  if (isErrorResponse(authResult)) return authResult

  return NextResponse.json(await getAdminOperations())
})
