import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import {
  edgeRulerVisionLabRequestSchema,
  runEdgeRulerVisionLab,
} from '@/lib/edit-script/storyboard-consistency/edge-ruler-vision-lab'

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => null) as unknown
  const parsed = edgeRulerVisionLabRequestSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INVALID_EDGE_RULER_VISION_TEST_REQUEST',
      field: 'body',
      message: 'invalid edge ruler vision test request',
    })
  }

  const result = await runEdgeRulerVisionLab({
    userId: authResult.session.user.id,
    request: parsed.data,
  })

  return NextResponse.json(result)
})
