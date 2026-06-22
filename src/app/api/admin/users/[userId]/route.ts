import { NextRequest, NextResponse } from 'next/server'

import { isErrorResponse, requireOwnerAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { updateAdminUserAccess } from '@/lib/admin/users'

export const dynamic = 'force-dynamic'

type UserAccessBody = {
  role?: string | null
  status?: string | null
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
  const reason = typeof body.reason === 'string' ? body.reason : null
  const input = {
    ...('role' in body ? { role: body.role } : {}),
    ...('status' in body ? { status: body.status } : {}),
  }
  const user = await updateAdminUserAccess(userId, input)

  await writeAdminAuditLog({
    actor: {
      id: authResult.session.user.id,
      role: authResult.session.user.role,
    },
    action: 'user.access.update',
    targetType: 'user',
    targetId: userId,
    before: null,
    after: {
      role: user.role,
      status: user.status,
    },
    reason,
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
  })

  return NextResponse.json(user)
})
