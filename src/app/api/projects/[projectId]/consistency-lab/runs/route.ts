import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuth, requireProjectAuthLight } from '@/lib/api-auth'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import {
  createConsistencyExperimentRun,
  listConsistencyExperimentRuns,
} from '@/lib/consistency-lab/service'
import {
  createConsistencyExperimentRunRequestSchema,
  listConsistencyExperimentRunsRequestSchema,
} from '@/lib/consistency-lab/types'

export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const parsed = listConsistencyExperimentRunsRequestSchema.safeParse({
    episodeId: searchParams.get('episode'),
    editScriptId: searchParams.get('editScriptId'),
  })
  if (!parsed.success) throw new ApiError('INVALID_PARAMS')

  const runs = await listConsistencyExperimentRuns({
    projectId,
    episodeId: parsed.data.episodeId,
    editScriptId: parsed.data.editScriptId,
  })
  return NextResponse.json({ runs })
})

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({})) as unknown
  const parsed = createConsistencyExperimentRunRequestSchema.safeParse(body)
  if (!parsed.success) throw new ApiError('INVALID_PARAMS')

  const run = await createConsistencyExperimentRun({
    projectId,
    episodeId: parsed.data.episodeId,
    editScriptId: parsed.data.editScriptId,
    strategy: parsed.data.strategy,
    userId: authResult.session.user.id,
    locale: resolveRequiredTaskLocale(request, body),
  })
  return NextResponse.json({ run })
})
