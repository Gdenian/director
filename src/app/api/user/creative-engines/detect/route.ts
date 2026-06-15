import { NextRequest, NextResponse } from 'next/server'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { detectCreativeEngine } from '@/lib/user-api/creative-engine-detection/orchestrator'

type DetectRequestBody = {
  serviceUrl?: unknown
  apiKey?: unknown
  allowKeyInInspector?: unknown
}

function readRequiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CREATIVE_ENGINE_DETECT_INVALID',
      field,
    })
  }
  return value
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => null) as DetectRequestBody | null
  if (!body) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CREATIVE_ENGINE_DETECT_INVALID',
      field: 'body',
    })
  }

  const result = await detectCreativeEngine({
    serviceUrl: readRequiredString(body.serviceUrl, 'serviceUrl'),
    apiKey: readRequiredString(body.apiKey, 'apiKey'),
    allowKeyInInspector: body.allowKeyInInspector !== false,
  })

  return NextResponse.json(result)
})
