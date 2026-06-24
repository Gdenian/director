import { NextRequest, NextResponse } from 'next/server'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { decryptApiKey } from '@/lib/crypto-utils'
import { parseCreativeEngines, parseCreativeModels } from '@/lib/creative-engine/persisted-config'
import { prisma } from '@/lib/prisma'
import { runMediaContractTest } from '@/lib/user-api/media-contract-test/runner'
import { saveMediaContractTestResult } from '@/lib/user-api/media-contract-test/save-result'
import { isMediaContractCapabilitySupported } from '@/lib/user-api/media-contract-test/validate'
import type { MediaCapability } from '@/lib/media-contract/types'

type MediaTestRequestBody = {
  modelKey?: unknown
  capability?: unknown
  confirmedCost?: unknown
  sample?: {
    prompt?: unknown
    image?: unknown
    lastFrameImage?: unknown
  }
}

const CAPABILITIES = new Set<MediaCapability>([
  'text-to-image',
  'image-to-image',
  'image-edit',
  'text-to-video',
  'image-to-video',
  'first-last-frame-video',
])

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MEDIA_TEST_INVALID_REQUEST',
      field,
    })
  }
  return value.trim()
}

function readCapability(value: unknown): MediaCapability {
  const capability = readString(value, 'capability') as MediaCapability
  if (!CAPABILITIES.has(capability)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MEDIA_TEST_INVALID_CAPABILITY',
      field: 'capability',
    })
  }
  return capability
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function parseMediaTestModels(rawModels: string | null | undefined) {
  try {
    return parseCreativeModels(rawModels)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('CREATIVE_MODEL_MEDIA_CONTRACT_INVALID') && message.includes('mediaContract.executor')) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'MEDIA_TEST_COMPAT_TEMPLATE_REQUIRED',
        field: 'modelKey',
      })
    }
    throw error
  }
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => null) as MediaTestRequestBody | null
  if (!body) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MEDIA_TEST_INVALID_REQUEST',
      field: 'body',
    })
  }
  if (body.confirmedCost !== true) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MEDIA_TEST_CONFIRMATION_REQUIRED',
      field: 'confirmedCost',
    })
  }

  const modelKey = readString(body.modelKey, 'modelKey')
  const capability = readCapability(body.capability)
  const userId = authResult.session.user.id
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: {
      customProviders: true,
      customModels: true,
    },
  })
  const models = parseMediaTestModels(pref?.customModels)
  const model = models.find((candidate) => candidate.modelKey === modelKey)
  if (!model) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MEDIA_TEST_MODEL_NOT_FOUND',
      field: 'modelKey',
    })
  }
  if (model.type !== 'image' && model.type !== 'video') {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MEDIA_TEST_MISSING_MODEL',
      field: 'modelKey',
    })
  }
  if (!model.mediaContract) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MEDIA_TEST_MEDIA_CONTRACT_REQUIRED',
      field: 'modelKey',
    })
  }
  if (model.mediaContract.executor === 'openai-compat-template' && !model.compatMediaTemplate) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MEDIA_TEST_COMPAT_TEMPLATE_REQUIRED',
      field: 'modelKey',
    })
  }
  if (model.mediaContract.executor !== 'openai-compat-template') {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MEDIA_TEST_EXECUTOR_UNSUPPORTED',
      field: 'modelKey',
    })
  }
  if (!isMediaContractCapabilitySupported(model.mediaContract, capability)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MEDIA_TEST_CAPABILITY_UNSUPPORTED',
      field: 'capability',
    })
  }

  const providers = parseCreativeEngines(pref?.customProviders)
  const provider = providers.find((candidate) => candidate.id === model.engineId)
  if (!provider) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MEDIA_TEST_PROVIDER_NOT_FOUND',
      field: 'modelKey',
    })
  }
  if (!provider.serviceUrl) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MEDIA_TEST_BASE_URL_ERROR',
      field: 'modelKey',
    })
  }
  if (!isValidHttpUrl(provider.serviceUrl)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MEDIA_TEST_BASE_URL_ERROR',
      field: 'modelKey',
    })
  }

  const result = await runMediaContractTest({
    provider: {
      id: provider.id,
      baseUrl: provider.serviceUrl,
      apiKey: provider.apiKey ? decryptApiKey(provider.apiKey) : undefined,
    },
    model: {
      modelKey: model.modelKey,
      modelId: model.callName,
      mediaType: model.type,
      mediaContract: model.mediaContract,
      compatMediaTemplate: model.compatMediaTemplate,
    },
    capability,
    sample: {
      prompt: readOptionalString(body.sample?.prompt),
      image: readOptionalString(body.sample?.image),
      lastFrameImage: readOptionalString(body.sample?.lastFrameImage),
    },
    limits: {
      maxPollTimeoutMs: model.compatMediaTemplate?.polling?.timeoutMs,
      maxPollIntervalMs: model.compatMediaTemplate?.polling?.intervalMs,
    },
  })

  const saved = await saveMediaContractTestResult({
    userId,
    modelKey,
    capability,
    status: result.status,
    diagnostic: result.diagnostic,
  })

  return NextResponse.json({
    ...result,
    ...saved,
  })
})
