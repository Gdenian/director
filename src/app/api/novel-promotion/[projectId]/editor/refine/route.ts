import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { findScopedEditorProject } from '@/lib/novel-promotion/ai-editing/editor-auth'
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
  const editorProjectId = typeof body?.editorProjectId === 'string' ? body.editorProjectId.trim() : null
  const instruction = typeof body?.instruction === 'string' ? body.instruction.trim() : ''
  if (!episodeId || !instruction) throw new ApiError('INVALID_PARAMS')

  const editorProject = await findScopedEditorProject({ projectId, episodeId, editorProjectId })
  if (!editorProject) throw new ApiError('NOT_FOUND')

  const locale = resolveRequiredTaskLocale(request, body)
  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    episodeId,
    type: TASK_TYPE.AI_EDIT_REFINE,
    targetType: 'VideoEditorProject',
    targetId: editorProject.id,
    payload: {
      episodeId,
      editorProjectId: editorProject.id,
      instruction,
      targetDurationSeconds: typeof body?.targetDurationSeconds === 'number' ? body.targetDurationSeconds : undefined,
      selectedClipId: typeof body?.selectedClipId === 'string' ? body.selectedClipId : undefined,
    },
    dedupeKey: `ai_edit_refine:${editorProject.id}`,
  })

  return NextResponse.json(result, { status: 202 })
})
