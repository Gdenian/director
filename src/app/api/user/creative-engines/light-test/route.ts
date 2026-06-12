import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { ApiError, apiHandler } from '@/lib/api-errors'

type LightTestRequestBody = {
  protocolType?: unknown
  serviceUrl?: unknown
  apiKey?: unknown
  modelCallName?: unknown
  confirmedCostRisk?: unknown
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CREATIVE_ENGINE_LIGHT_TEST_INVALID',
      field,
    })
  }
  return value.trim()
}

function readProtocolType(value: unknown): 'openai-compatible' {
  if (value === 'openai-compatible') return value
  throw new ApiError('INVALID_PARAMS', {
    code: 'CREATIVE_ENGINE_LIGHT_TEST_UNSUPPORTED_PROTOCOL',
    field: 'protocolType',
  })
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => null) as LightTestRequestBody | null
  if (!body) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CREATIVE_ENGINE_LIGHT_TEST_INVALID',
      field: 'body',
    })
  }
  if (body.confirmedCostRisk !== true) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CREATIVE_ENGINE_LIGHT_TEST_CONFIRMATION_REQUIRED',
      field: 'confirmedCostRisk',
    })
  }

  readProtocolType(body.protocolType)
  const serviceUrl = readRequiredString(body.serviceUrl, 'serviceUrl').replace(/\/+$/, '')
  const apiKey = readRequiredString(body.apiKey, 'apiKey')
  const modelCallName = readRequiredString(body.modelCallName, 'modelCallName')

  const client = new OpenAI({
    apiKey,
    baseURL: serviceUrl,
    timeout: 30_000,
  })
  const response = await client.chat.completions.create({
    model: modelCallName,
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 1,
    temperature: 0,
  })

  const message = response.choices[0]?.message?.content?.trim() || ''
  return NextResponse.json({
    success: true,
    message: message || 'ok',
  })
})
