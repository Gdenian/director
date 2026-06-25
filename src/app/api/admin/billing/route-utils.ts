import { NextRequest, NextResponse } from 'next/server'

import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getRequestIp, readJsonObject } from '@/lib/admin/route-utils'
import { isErrorResponse, requireOwnerAuth } from '@/lib/api-auth'

export async function requireOwnerBillingContext(request: NextRequest) {
  const authResult = await requireOwnerAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await readJsonObject(request)
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!reason) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 })
  }

  return {
    authResult,
    body,
    reason,
    actorId: authResult.session.user.id,
    actorRole: authResult.session.user.role,
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
  }
}

export function isBillingContextResponse(value: unknown): value is Response {
  return value instanceof Response
}

export function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function requiredString(value: unknown, field: string) {
  const text = optionalString(value)
  if (!text) throw new Error(`${field} is required`)
  return text
}

export function requiredAmount(value: unknown) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('amount must be positive')
  }
  return amount
}

export function safeJson<T extends Record<string, unknown>>(result: T) {
  return NextResponse.json(result)
}

export async function auditBillingAction(params: {
  context: Exclude<Awaited<ReturnType<typeof requireOwnerBillingContext>>, Response>
  action: string
  targetType: string
  targetId: string
  after: Record<string, unknown> | null
}) {
  await writeAdminAuditLog({
    actor: {
      id: params.context.actorId,
      role: params.context.actorRole,
    },
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    before: null,
    after: params.after,
    reason: params.context.reason,
    ip: params.context.ip,
    userAgent: params.context.userAgent,
  })
}
