import { NextResponse } from 'next/server'

import { isErrorResponse, requireAdminAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { getAdminModelHealth } from '@/lib/admin/models'

export const dynamic = 'force-dynamic'

export const GET = apiHandler(async () => {
  const authResult = await requireAdminAuth()
  if (isErrorResponse(authResult)) return authResult

  const health = await getAdminModelHealth()
  return NextResponse.json({
    usageByModel: Array.isArray(health.usageByModel) ? health.usageByModel : [],
    taskHealthByType: Array.isArray(health.taskHealthByType) ? health.taskHealthByType : [],
    channels: Array.isArray(health.channels)
      ? health.channels.map((channel) => ({
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
      }))
      : [],
  })
})
