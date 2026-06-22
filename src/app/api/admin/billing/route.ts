import { NextRequest, NextResponse } from 'next/server'

import { isErrorResponse, requireAdminAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { getAdminBillingSummary } from '@/lib/admin/billing'

export const dynamic = 'force-dynamic'

function parsePositiveInt(value: string | null) {
  if (!value) return null
  const number = Number(value)
  return Number.isFinite(number) ? Math.floor(number) : null
}

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireAdminAuth()
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = request.nextUrl
  return NextResponse.json(await getAdminBillingSummary({
    page: parsePositiveInt(searchParams.get('page')),
    pageSize: parsePositiveInt(searchParams.get('pageSize')),
  }))
})
