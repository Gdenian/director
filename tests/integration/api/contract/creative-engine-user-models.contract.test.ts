import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/model-capabilities/catalog', () => ({
  findBuiltinCapabilities: vi.fn(() => undefined),
}))
vi.mock('@/lib/model-pricing/catalog', () => ({
  findBuiltinPricingCatalogEntry: vi.fn(() => undefined),
}))

describe('api contract - creative engine user models', () => {
  const routeContext = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes only selectable creative models with runtime model keys and purpose metadata', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValue({
      customProviders: JSON.stringify([
        {
          id: 'openai-compatible:abc',
          name: 'OpenAI Compatible',
          providerKey: 'openai-compatible',
          apiKey: 'enc-key',
          status: 'available',
        },
      ]),
      customModels: JSON.stringify([
        {
          id: 'text',
          engineId: 'openai-compatible:abc',
          name: 'Text',
          callName: 'gpt-5',
          modelKey: 'openai-compatible:abc::gpt-5',
          type: 'llm',
          purpose: 'text',
          enabled: true,
          status: 'available',
          detectionSource: 'provider-list',
          confidence: 'high',
        },
        {
          id: 'voice-design',
          engineId: 'openai-compatible:abc',
          name: 'Voice Design',
          callName: 'voice-design',
          modelKey: 'openai-compatible:abc::voice-design',
          type: 'audio',
          purpose: 'voice-design',
          enabled: true,
          status: 'unchecked',
        },
        {
          id: 'disabled',
          engineId: 'openai-compatible:abc',
          name: 'Disabled',
          callName: 'disabled',
          modelKey: 'openai-compatible:abc::disabled',
          type: 'llm',
          purpose: 'text',
          enabled: false,
          status: 'available',
        },
      ]),
    })

    const route = await import('@/app/api/user/models/route')
    const res = await route.GET(buildMockRequest({
      path: '/api/user/models',
      method: 'GET',
    }), routeContext)

    expect(res.status).toBe(200)
    const body = await res.json() as {
      llm: Array<{ value: string; provider: string; purpose?: string; source?: string; confidence?: string }>
      audio: Array<{ value: string }>
      voiceDesign: Array<{ value: string; purpose?: string; modelStatus?: string }>
    }

    expect(body.llm).toEqual([
      expect.objectContaining({
        value: 'openai-compatible:abc::gpt-5',
        provider: 'openai-compatible:abc',
        purpose: 'text',
        source: 'provider-list',
        confidence: 'high',
      }),
    ])
    expect(body.audio).toEqual([])
    expect(body.voiceDesign).toEqual([
      expect.objectContaining({
        value: 'openai-compatible:abc::voice-design',
        purpose: 'voice-design',
        modelStatus: 'unchecked',
      }),
    ])
  })
})
