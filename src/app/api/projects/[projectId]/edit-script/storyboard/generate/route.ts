import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuth } from '@/lib/api-auth'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { generateProjectEditScriptStoryboard } from '@/lib/edit-script/service'
import { generateEditStoryboardRequestSchema } from '@/lib/edit-script/types'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({})) as unknown
  const parsed = generateEditStoryboardRequestSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await generateProjectEditScriptStoryboard({
    request,
    projectId,
    episodeId: parsed.data.episodeId,
    editScriptId: parsed.data.editScriptId,
    userId: authResult.session.user.id,
    locale: resolveRequiredTaskLocale(request, body),
  })

  return NextResponse.json(result)
})
