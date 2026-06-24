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
    models: [{
      name: 'Claude Sonnet',
      callName: 'anthropic/claude-sonnet-4.5',
      purpose: 'text',
      type: 'llm',
      status: 'available',
      confidence: 'high',
    }],
    warnings: [],
    risks: [],
    requiresManualModelEntry: false,
  })),
)

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    upsert: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('@/lib/user-api/creative-engine-detection/orchestrator', () => ({
  detectCreativeEngine: detectCreativeEngineMock,
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('api contract - creative engine detect route', () => {
  const routeContext = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resetAuthMockState()
  })

  it('returns a confirmable detection draft without saving user config', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/creative-engines/detect/route')

    const res = await route.POST(buildMockRequest({
      path: '/api/user/creative-engines/detect',
      method: 'POST',
      body: {
        serviceUrl: ' https://openrouter.ai ',
        apiKey: 'key-1',
        allowKeyInInspector: false,
        documentationText: ' POST /videos creates async tasks. ',
      },
    }), routeContext)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      source: 'openrouter',
      recommendedProviderKey: 'openrouter',
      protocolType: 'openai-compatible',
      normalizedBaseUrl: 'https://openrouter.ai/api/v1',
      confidence: 'high',
      models: [
        expect.objectContaining({
          callName: 'anthropic/claude-sonnet-4.5',
          purpose: 'text',
          status: 'available',
        }),
      ],
      requiresManualModelEntry: false,
    })
    expect(detectCreativeEngineMock).toHaveBeenCalledWith({
      serviceUrl: ' https://openrouter.ai ',
      apiKey: 'key-1',
      allowKeyInInspector: false,
      documentationText: 'POST /videos creates async tasks.',
    })
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
    expect(prismaMock.userPreference.update).not.toHaveBeenCalled()
  })
})
