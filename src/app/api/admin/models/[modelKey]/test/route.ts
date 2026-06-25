import { NextRequest, NextResponse } from 'next/server'

import { writeAdminAuditLog } from '@/lib/admin/audit'
import { testAdminModelChannel } from '@/lib/admin/models'
import { getAuditReason, getRequestIp, readJsonObject } from '@/lib/admin/route-utils'
import { isErrorResponse, requireOwnerAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'

export const dynamic = 'force-dynamic'

function decodeModelKey(value: string) {
  return decodeURIComponent(value)
}

function safeTestDto(result: Awaited<ReturnType<typeof testAdminModelChannel>>) {
  return {
    key: result.key,
    dryRun: result.dryRun,
    status: result.status,
    message: result.message,
  }
}

export const POST = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ modelKey: string }> },
) => {
  const authResult = await requireOwnerAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await readJsonObject(request)
  const reason = getAuditReason(body)
  if (!reason) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 })
  }

  const { modelKey: rawModelKey } = await params
  const modelKey = decodeModelKey(rawModelKey)
  const actorId = authResult.session.user.id
  const result = safeTestDto(await testAdminModelChannel(modelKey, { actorId }))

  await writeAdminAuditLog({
    actor: {
      id: actorId,
      role: authResult.session.user.role,
    },
    action: 'model_channel.test',
    targetType: 'model_channel',
    targetId: modelKey,
    before: null,
    after: result,
    reason,
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
  })

  return NextResponse.json(result)
})
