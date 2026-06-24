import { NextRequest } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { TASK_TYPE } from '@/lib/task/types'
import { maybeSubmitLLMTask } from '@/lib/llm-observe/route-task'
import {
  canRunDirectStoryToScript,
  DIRECT_STORY_TO_SCRIPT_MAX_CHARS,
} from '@/lib/novel-promotion/story-input-length'

/**
 * AI 分集 API（任务化）
 */
export const POST = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json().catch(() => ({}))
  const content = typeof body?.content === 'string' ? body.content : ''

  if (!content) {
    throw new ApiError('INVALID_PARAMS')
  }
  if (content.length < 100) {
    throw new ApiError('INVALID_PARAMS')
  }
  if (!canRunDirectStoryToScript(content)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CONTENT_TOO_LONG',
      message: `Content is too long for AI episode split. Use local split first. Max characters: ${DIRECT_STORY_TO_SCRIPT_MAX_CHARS}`,
      maxChars: DIRECT_STORY_TO_SCRIPT_MAX_CHARS,
      actualChars: content.length,
    })
  }

  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId,
    type: TASK_TYPE.EPISODE_SPLIT_LLM,
    targetType: 'NovelPromotionProject',
    targetId: projectId,
    routePath: `/api/novel-promotion/${projectId}/episodes/split`,
    body: { content },
    dedupeKey: `episode_split_llm:${projectId}:${content.length}`})
  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})
