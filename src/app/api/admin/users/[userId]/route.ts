import { NextRequest, NextResponse } from 'next/server'

import { isErrorResponse, requireOwnerAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getAdminUserAccessBefore, parseAdminUserAccessUpdate, updateAdminUserAccess } from '@/lib/admin/users'

export const dynamic = 'force-dynamic'

type UserAccessBody = {
  role?: string | null
  status?: string | null
  adminGroupKey?: string | null
  adminNote?: string | null
  revokeSession?: boolean
  reason?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

async function readJsonObject(request: NextRequest): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => ({}))
  return isRecord(body) ? body : {}
}

function getRequestIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || request.headers.get('x-real-ip') || null
}

export const PATCH = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) => {
  const authResult = await requireOwnerAuth()
  if (isErrorResponse(authResult)) return authResult

  const { userId } = await params
  const body = await readJsonObject(request) as UserAccessBody
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!reason) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 })
  }
  const input = {
    ...('role' in body ? { role: body.role } : {}),
    ...('status' in body ? { status: body.status } : {}),
    ...('adminGroupKey' in body ? { adminGroupKey: body.adminGroupKey } : {}),
    ...('adminNote' in body ? { adminNote: body.adminNote } : {}),
    ...('revokeSession' in body ? { revokeSession: body.revokeSession } : {}),
  }

  let accessUpdate: ReturnType<typeof parseAdminUserAccessUpdate>
  try {
    accessUpdate = parseAdminUserAccessUpdate(input)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid access update'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const before = await getAdminUserAccessBefore(userId)
  if (!before) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  let user: Awaited<ReturnType<typeof updateAdminUserAccess>>
  try {
    user = await updateAdminUserAccess(userId, accessUpdate, { actorId: authResult.session.user.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid access update'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const auditBase = {
    actor: {
      id: authResult.session.user.id,
      role: authResult.session.user.role,
    },
    targetType: 'user' as const,
    targetId: userId,
    reason,
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
  }

  if ('status' in accessUpdate && before.status !== user.status) {
    const action = user.status === 'disabled'
      ? 'user.access.disable'
      : before.status === 'disabled' && user.status === 'active'
        ? 'user.access.enable'
        : null
    if (action) {
      await writeAdminAuditLog({
        ...auditBase,
        action,
        before: { status: before.status },
        after: { status: user.status },
      })
    }
  }

  if ('role' in accessUpdate && before.role !== user.role) {
    await writeAdminAuditLog({
      ...auditBase,
      action: 'user.role.update',
      before: { role: before.role },
      after: { role: user.role },
    })
  }

  if ('adminGroupKey' in accessUpdate && before.adminGroupKey !== user.adminGroupKey) {
    await writeAdminAuditLog({
      ...auditBase,
      action: 'user.group.assign',
      before: { adminGroupKey: before.adminGroupKey },
      after: { adminGroupKey: user.adminGroupKey },
    })
  }

  if ('adminNote' in accessUpdate && before.adminNote !== user.adminNote) {
    await writeAdminAuditLog({
      ...auditBase,
      action: 'user.note.create',
      before: { adminNote: before.adminNote },
      after: { adminNote: user.adminNote },
    })
  }

  if (accessUpdate.revokeSession) {
    await writeAdminAuditLog({
      ...auditBase,
      action: 'user.session.revoke',
      before: { sessionVersion: before.sessionVersion },
      after: { sessionVersion: user.sessionVersion },
    })
  }

  return NextResponse.json(user)
})
