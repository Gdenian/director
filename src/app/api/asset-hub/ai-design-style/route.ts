import { createHash } from 'crypto'
import { NextRequest } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { TASK_TYPE } from '@/lib/task/types'
import { maybeSubmitLLMTask } from '@/lib/llm-observe/route-task'
import { getUserModelConfig } from '@/lib/config-service'

function readReferenceImageUrl(body: Record<string, unknown>): string {
  return typeof body.referenceImageUrl === 'string' ? body.referenceImageUrl.trim() : ''
}

/**
 * 资产中心 - 根据风格参考图生成风格提示词（任务化）
 */
export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const referenceImageUrl = readReferenceImageUrl(body)
  if (!referenceImageUrl) {
    throw new ApiError('INVALID_PARAMS')
  }

  const userConfig = await getUserModelConfig(session.user.id)
  if (!userConfig.analysisModel) {
    throw new ApiError('MISSING_CONFIG')
  }

  const dedupeDigest = createHash('sha1')
    .update(`${session.user.id}:style:${referenceImageUrl}`)
    .digest('hex')
    .slice(0, 16)

  const payload = {
    referenceImageUrl,
    analysisModel: userConfig.analysisModel,
    displayMode: 'detail' as const,
  }

  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId: 'global-asset-hub',
    type: TASK_TYPE.ASSET_HUB_AI_DESIGN_STYLE,
    targetType: 'GlobalAssetHubStyleDesign',
    targetId: session.user.id,
    routePath: '/api/asset-hub/ai-design-style',
    body: payload,
    dedupeKey: `asset_hub_ai_design_style:${dedupeDigest}`,
  })
  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})
