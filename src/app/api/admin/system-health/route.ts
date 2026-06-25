import { NextRequest, NextResponse } from 'next/server'

import { isErrorResponse, requireAdminAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import {
  getAdminSystemHealth,
  sanitizeAdminSystemHealthForResponse,
  sanitizeHealthChecksForSnapshot,
} from '@/lib/admin/system-health'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getAuditReason, getRequestIp, readJsonObject } from '@/lib/admin/route-utils'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export const GET = apiHandler(async () => {
  const authResult = await requireAdminAuth()
  if (isErrorResponse(authResult)) return authResult

  const health = await getAdminSystemHealth()
  return NextResponse.json(sanitizeAdminSystemHealthForResponse(health))
})

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireAdminAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await readJsonObject(request)
  const reason = getAuditReason(body)
  if (!reason) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 })
  }
  const health = sanitizeAdminSystemHealthForResponse(await getAdminSystemHealth())

  await prisma.adminHealthCheckSnapshot.create({
    data: {
      status: health.status,
      summary: [
        health.impactedFeatures.length ? `impacted: ${health.impactedFeatures.join(', ')}` : null,
        health.recommendedActions.length ? `actions: ${health.recommendedActions.join(', ')}` : null,
      ].filter(Boolean).join('\n') || null,
      checksJson: sanitizeHealthChecksForSnapshot(health.checks),
      createdBy: authResult.session.user.id,
    },
  })

  await writeAdminAuditLog({
    actor: {
      id: authResult.session.user.id,
      role: authResult.session.user.role,
    },
    action: 'system_health.check',
    targetType: 'system_health',
    targetId: null,
    before: null,
    after: {
      status: health.status,
      impactedFeatures: health.impactedFeatures,
      recommendedActions: health.recommendedActions,
    },
    reason,
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
  })

  return NextResponse.json(health)
})
