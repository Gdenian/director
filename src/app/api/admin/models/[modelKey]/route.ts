import { NextRequest, NextResponse } from 'next/server'

import { writeAdminAuditLog } from '@/lib/admin/audit'
import { AdminModelChannelInputError, getAdminModelChannelBefore, updateAdminModelChannel } from '@/lib/admin/models'
import { getAuditReason, getRequestIp, readJsonObject, stripAuditFields } from '@/lib/admin/route-utils'
import { isErrorResponse, requireOwnerAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'

export const dynamic = 'force-dynamic'

function decodeModelKey(value: string) {
  return decodeURIComponent(value)
}

function sanitizeModelChannelInput(body: Record<string, unknown>) {
  const input = stripAuditFields(body)
  delete input.apiKey
  delete input.prompt
  delete input.media
  return input
}

function safeModelChannelDto(channel: Awaited<ReturnType<typeof updateAdminModelChannel>>) {
  return {
    key: channel.key,
    provider: channel.provider,
    model: channel.model,
    modelType: channel.modelType,
    status: channel.status,
    isAdvanced: channel.isAdvanced,
    isDefault: channel.isDefault,
    groupKeys: channel.groupKeys,
    costMultiplier: channel.costMultiplier,
    userMessage: channel.userMessage,
    lastTestStatus: channel.lastTestStatus,
    lastTestMessage: channel.lastTestMessage,
    lastTestAt: channel.lastTestAt,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
    createdBy: channel.createdBy,
    updatedBy: channel.updatedBy,
  }
}

export const PATCH = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ modelKey: string }> },
) => {
  const authResult = await requireOwnerAuth()
  if (isErrorResponse(authResult)) return authResult

  const { modelKey: rawModelKey } = await params
  const modelKey = decodeModelKey(rawModelKey)
  const body = await readJsonObject(request)
  const reason = getAuditReason(body)
  if (!reason) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 })
  }

  const actorId = authResult.session.user.id
  const before = await getAdminModelChannelBefore(modelKey)
  let channel: Awaited<ReturnType<typeof updateAdminModelChannel>>
  try {
    channel = await updateAdminModelChannel(modelKey, {
      ...sanitizeModelChannelInput(body),
      updatedBy: actorId,
    })
  } catch (error) {
    if (error instanceof AdminModelChannelInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }
  const after = safeModelChannelDto(channel)

  await writeAdminAuditLog({
    actor: {
      id: actorId,
      role: authResult.session.user.role,
    },
    action: after.status === 'disabled' ? 'model_channel.disable' : 'model_channel.update',
    targetType: 'model_channel',
    targetId: modelKey,
    before,
    after,
    reason,
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
  })

  return NextResponse.json(after)
})
