import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuth } from '@/lib/api-auth'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { submitConsistencyExperimentFloorPlanGeneration } from '@/lib/consistency-lab/service'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; runId: string }> },
) => {
  const { projectId, runId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({})) as unknown
  const result = await submitConsistencyExperimentFloorPlanGeneration({
    projectId,
    runId,
    userId: authResult.session.user.id,
    locale: resolveRequiredTaskLocale(request, body),
    requestId: request.headers.get('x-request-id'),
  })
  return NextResponse.json(result)
})
