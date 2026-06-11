import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { assertEpisodeInProject } from '@/lib/novel-promotion/ai-editing/editor-auth'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'

export const POST = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json()
  const episodeId = typeof body?.episodeId === 'string' ? body.episodeId.trim() : ''
  if (!episodeId) throw new ApiError('INVALID_PARAMS')

  const episode = await assertEpisodeInProject(projectId, episodeId)
  if (!episode) throw new ApiError('NOT_FOUND')

  const locale = resolveRequiredTaskLocale(request, body)
  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    episodeId,
    type: TASK_TYPE.AI_EDIT_ASSEMBLE,
    targetType: 'VideoEditorProject',
    targetId: episodeId,
    payload: { episodeId },
    dedupeKey: `ai_edit_assemble:${episodeId}`,
  })

  return NextResponse.json(result, { status: 202 })
})
