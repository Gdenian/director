import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuth } from '@/lib/api-auth'
import { deleteConsistencyExperimentRun } from '@/lib/consistency-lab/service'

export const DELETE = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string; runId: string }> },
) => {
  const { projectId, runId } = await context.params
  if (!runId) throw new ApiError('INVALID_PARAMS')

  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  const result = await deleteConsistencyExperimentRun({
    projectId,
    runId,
  })
  return NextResponse.json(result)
})
