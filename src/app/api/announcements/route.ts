import { NextRequest, NextResponse } from 'next/server'

import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { getPublicAnnouncements, normalizePublicAnnouncementSurface } from '@/lib/announcements/public'

export const dynamic = 'force-dynamic'

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const locale = searchParams.get('locale') || 'zh'
  const surface = normalizePublicAnnouncementSurface(searchParams.get('surface'))

  return NextResponse.json(await getPublicAnnouncements({
    userId: authResult.session.user.id,
    locale,
    surface,
  }))
})
