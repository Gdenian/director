import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'

const detectCreativeEngineMock = vi.hoisted(() =>
  vi.fn(async () => ({
    source: 'openrouter',
    recommendedProviderKey: 'openrouter',
    protocolType: 'openai-compatible',
    normalizedBaseUrl: 'https://openrouter.ai/api/v1',
    confidence: 'high',
    models: [],
    warnings: [],
    risks: [],
    requiresManualModelEntry: false,
  })),
)

vi.mock('@/lib/user-api/creative-engine-detection/orchestrator', () => ({
  detectCreativeEngine: detectCreativeEngineMock,
}))

describe('api specific - creative engine detect route', () => {
  const routeContext = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resetAuthMockState()
  })

  it('requires user auth and calls detection without saving anything', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/creative-engines/detect/route')

    const req = buildMockRequest({
      path: '/api/user/creative-engines/detect',
      method: 'POST',
      body: {
        serviceUrl: ' https://openrouter.ai ',
        apiKey: 'key-1',
        allowKeyInInspector: false,
      },
    })

    const res = await route.POST(req, routeContext)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(expect.objectContaining({
      source: 'openrouter',
      normalizedBaseUrl: 'https://openrouter.ai/api/v1',
    }))
    expect(detectCreativeEngineMock).toHaveBeenCalledWith({
      serviceUrl: ' https://openrouter.ai ',
      apiKey: 'key-1',
      allowKeyInInspector: false,
    })
  })

  it('defaults allowKeyInInspector to true unless explicitly false', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/creative-engines/detect/route')

    const req = buildMockRequest({
      path: '/api/user/creative-engines/detect',
      method: 'POST',
      body: {
        serviceUrl: 'https://openrouter.ai',
        apiKey: 'key-1',
      },
    })

    await route.POST(req, routeContext)
    expect(detectCreativeEngineMock).toHaveBeenCalledWith(expect.objectContaining({
      allowKeyInInspector: true,
    }))
  })

  it('rejects invalid payloads', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/creative-engines/detect/route')

    const req = buildMockRequest({
      path: '/api/user/creative-engines/detect',
      method: 'POST',
      body: {
        serviceUrl: '',
        apiKey: 'key-1',
      },
    })

    const res = await route.POST(req, routeContext)
    expect(res.status).toBe(400)
    expect(detectCreativeEngineMock).not.toHaveBeenCalled()
  })
})
