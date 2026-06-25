import { NextRequest, NextResponse } from 'next/server'

import { isErrorResponse, requireOwnerAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { updateAdminAnnouncement } from '@/lib/admin/announcements'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getAuditReason, getRequestIp, readJsonObject, stripAuditFields } from '@/lib/admin/route-utils'

export const dynamic = 'force-dynamic'

function auditActionForStatus(status: unknown) {
  if (status === 'published') return 'announcement.publish'
  if (status === 'paused') return 'announcement.pause'
  if (status === 'archived') return 'announcement.archive'
  return 'announcement.update'
}

export const PATCH = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ announcementId: string }> },
) => {
  const authResult = await requireOwnerAuth()
  if (isErrorResponse(authResult)) return authResult

  const { announcementId } = await params
  const body = await readJsonObject(request)
  const reason = getAuditReason(body)
  const input = stripAuditFields(body)
  const actorId = authResult.session.user.id

  let announcement: Awaited<ReturnType<typeof updateAdminAnnouncement>>
  try {
    announcement = await updateAdminAnnouncement(announcementId, {
      ...input,
      updatedBy: actorId,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid announcement update' }, { status: 400 })
  }

  await writeAdminAuditLog({
    actor: {
      id: actorId,
      role: authResult.session.user.role,
    },
    action: auditActionForStatus(input.status),
    targetType: 'announcement',
    targetId: announcementId,
    before: null,
    after: {
      title: announcement.title,
      status: announcement.status,
      severity: announcement.severity,
    },
    reason,
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
  })

  return NextResponse.json(announcement)
})
