import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
  mockUnauthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'

const runnerState = vi.hoisted(() => ({
  runMediaContractTest: vi.fn(async () => ({
    status: 'passed',
    preview: {
      method: 'POST',
      endpointUrl: 'https://api.aisenyu.test/v1/images/generations',
      contentType: 'application/json',
      bodyPreview: '{"model":"gpt-image-2","prompt":"生成一张简单测试图"}',
    },
    output: { url: 'https://cdn.test/image.png' },
    diagnostic: {
      code: 'MEDIA_TEST_OUTPUT_URL_MISSING',
      message: 'ok',
    },
  })),
  saveMediaContractTestResult: vi.fn(async () => undefined),
}))

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(async () => ({
      customProviders: JSON.stringify([{
        id: 'openai-compatible:relay',
        name: 'Relay',
        providerKey: 'openai-compatible',
        serviceUrl: 'https://api.aisenyu.test/v1',
        apiKey: 'enc:sk-route-secret',
        protocolType: 'openai-compatible',
        status: 'available',
      }]),
      customModels: JSON.stringify([{
        id: 'model-1',
        engineId: 'openai-compatible:relay',
        name: 'GPT Image 2',
        callName: 'gpt-image-2',
        modelKey: 'openai-compatible:relay::gpt-image-2',
        type: 'image',
        purpose: 'image-generation',
        enabled: true,
        status: 'available',
        compatMediaTemplate: {
          version: 1,
          mediaType: 'image',
          mode: 'sync',
          create: {
            method: 'POST',
            path: '/images/generations',
            contentType: 'application/json',
            bodyTemplate: {
              model: '{{model}}',
              prompt: '{{prompt}}',
            },
          },
          response: {
            outputUrlPath: '$.data[0].url',
          },
        },
        compatMediaTemplateSource: 'manual',
        mediaContract: {
          version: 1,
          mediaType: 'image',
          executor: 'openai-compat-template',
          capabilities: ['text-to-image'],
          input: {},
          output: {
            kind: 'url',
            urlPath: '$.data[0].url',
          },
        },
        mediaContractSource: 'manual',
      }]),
    })),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/crypto-utils', () => ({
  decryptApiKey: vi.fn((value: string) => value.replace(/^enc:/, '')),
}))
vi.mock('@/lib/user-api/media-contract-test/runner', () => ({
  runMediaContractTest: runnerState.runMediaContractTest,
}))
vi.mock('@/lib/user-api/media-contract-test/save-result', () => ({
  saveMediaContractTestResult: runnerState.saveMediaContractTestResult,
}))

describe('api specific - creative engine media-test route', () => {
  const routeContext = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resetAuthMockState()
  })

  it('requires user auth', async () => {
    installAuthMocks()
    mockUnauthenticated()
    const route = await import('@/app/api/user/creative-engines/media-test/route')

    const res = await route.POST(buildMockRequest({
      path: '/api/user/creative-engines/media-test',
      method: 'POST',
      body: {
        modelKey: 'openai-compatible:relay::gpt-image-2',
        capability: 'text-to-image',
        confirmedCost: true,
        sample: { prompt: '生成一张简单测试图' },
      },
    }), routeContext)

    expect(res.status).toBe(401)
    expect(runnerState.runMediaContractTest).not.toHaveBeenCalled()
  })

  it('requires explicit confirmation before a paid media test', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/creative-engines/media-test/route')

    const res = await route.POST(buildMockRequest({
      path: '/api/user/creative-engines/media-test',
      method: 'POST',
      body: {
        modelKey: 'openai-compatible:relay::gpt-image-2',
        capability: 'text-to-image',
        confirmedCost: false,
        sample: { prompt: '生成一张简单测试图' },
      },
    }), routeContext)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error?.details).toMatchObject({
      code: 'MEDIA_TEST_CONFIRMATION_REQUIRED',
      field: 'confirmedCost',
    })
    expect(runnerState.runMediaContractTest).not.toHaveBeenCalled()
  })

  it('runs media test with saved model config and never echoes a full api key', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/creative-engines/media-test/route')

    const res = await route.POST(buildMockRequest({
      path: '/api/user/creative-engines/media-test',
      method: 'POST',
      body: {
        modelKey: 'openai-compatible:relay::gpt-image-2',
        capability: 'text-to-image',
        confirmedCost: true,
        sample: {
          prompt: '生成一张简单测试图',
          image: 'https://example.test/ref.png',
          lastFrameImage: 'https://example.test/end.png',
        },
      },
    }), routeContext)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      status: 'passed',
      preview: {
        method: 'POST',
        endpointUrl: 'https://api.aisenyu.test/v1/images/generations',
        contentType: 'application/json',
      },
      output: { url: 'https://cdn.test/image.png' },
    })
    expect(JSON.stringify(body)).not.toContain('sk-route-secret')
    expect(runnerState.runMediaContractTest).toHaveBeenCalledWith(expect.objectContaining({
      provider: expect.objectContaining({
        id: 'openai-compatible:relay',
        apiKey: 'sk-route-secret',
      }),
      model: expect.objectContaining({
        modelKey: 'openai-compatible:relay::gpt-image-2',
        mediaContract: expect.objectContaining({ executor: 'openai-compat-template' }),
      }),
      capability: 'text-to-image',
    }))
    expect(runnerState.saveMediaContractTestResult).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      modelKey: 'openai-compatible:relay::gpt-image-2',
      capability: 'text-to-image',
      status: 'passed',
    }))
  })
})
