import { NextRequest, NextResponse } from 'next/server'

import { isErrorResponse, requireAdminAuth, requireOwnerAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { createAdminAnnouncement, listAdminAnnouncements } from '@/lib/admin/announcements'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getAuditReason, getRequestIp, readJsonObject, stripAuditFields } from '@/lib/admin/route-utils'

export const dynamic = 'force-dynamic'

function intParam(value: string | null) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireAdminAuth()
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  return NextResponse.json(await listAdminAnnouncements({
    status: searchParams.get('status'),
    type: searchParams.get('type'),
    page: intParam(searchParams.get('page')),
    pageSize: intParam(searchParams.get('pageSize')),
  }))
})

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireOwnerAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await readJsonObject(request)
  const reason = getAuditReason(body)
  const input = stripAuditFields(body)
  const actorId = authResult.session.user.id

  let announcement: Awaited<ReturnType<typeof createAdminAnnouncement>>
  try {
    announcement = await createAdminAnnouncement({
      ...input,
      createdBy: actorId,
      updatedBy: actorId,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid announcement' }, { status: 400 })
  }

  await writeAdminAuditLog({
    actor: {
      id: actorId,
      role: authResult.session.user.role,
    },
    action: 'announcement.create',
    targetType: 'announcement',
    targetId: announcement.id,
    before: null,
    after: {
      title: announcement.title,
      type: announcement.type,
      severity: announcement.severity,
      status: announcement.status,
      locale: announcement.locale,
      surface: announcement.surface,
      audience: announcement.audience,
    },
    reason,
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
  })

  return NextResponse.json(announcement)
})
