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

const capabilityCatalogMock = vi.hoisted(() => ({
  findBuiltinCapabilities: vi.fn((type: string, provider: string, modelId: string) => {
    if (type === 'llm' && provider === 'openrouter' && modelId === 'anthropic/claude-sonnet-4.5') {
      return { llm: { reasoningEffortOptions: ['builtin-low', 'builtin-high'] } }
    }
    return undefined
  }),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/model-capabilities/catalog', () => capabilityCatalogMock)
vi.mock('@/lib/model-pricing/catalog', () => ({
  findBuiltinPricingCatalogEntry: vi.fn(() => undefined),
}))

describe('api specific - creative engine user models', () => {
  const routeContext = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns only selectable canonical models and separates voice design options', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValue({
      customProviders: JSON.stringify([
        {
          id: 'engine-text',
          name: 'Text Engine',
          providerKey: 'openrouter',
          apiKey: 'k-text',
          status: 'available',
        },
        {
          id: 'engine-voice',
          name: 'Voice Engine',
          providerKey: 'bailian',
          apiKey: 'k-voice',
          status: 'available',
        },
        {
          id: 'engine-no-key',
          name: 'No Key Engine',
          providerKey: 'fal',
          apiKey: '',
          status: 'available',
        },
        {
          id: 'engine-failed',
          name: 'Failed Engine',
          providerKey: 'google',
          apiKey: 'k-failed',
          status: 'failed',
        },
      ]),
      customModels: JSON.stringify([
        {
          id: 'text-model',
          engineId: 'engine-text',
          name: 'Claude Sonnet 4.5',
          callName: 'anthropic/claude-sonnet-4.5',
          modelKey: 'engine-text::anthropic/claude-sonnet-4.5',
          type: 'llm',
          purpose: 'text',
          enabled: true,
          status: 'available',
          detectionSource: 'provider-list',
          confidence: 'high',
          capabilities: { llm: { reasoningEffortOptions: ['user-submitted'] } },
        },
        {
          id: 'voice-generation-model',
          engineId: 'engine-voice',
          name: 'Qwen3 TTS',
          callName: 'qwen3-tts-vd-2026-01-26',
          modelKey: 'engine-voice::qwen3-tts-vd-2026-01-26',
          type: 'audio',
          purpose: 'voice-generation',
          enabled: true,
          status: 'available',
          confidence: 'medium',
        },
        {
          id: 'voice-design-model',
          engineId: 'engine-voice',
          name: 'Qwen Voice Design',
          callName: 'qwen-voice-design',
          modelKey: 'engine-voice::qwen-voice-design',
          type: 'audio',
          purpose: 'voice-design',
          enabled: true,
          status: 'unchecked',
          detectionSource: 'manual',
        },
        {
          id: 'disabled-model',
          engineId: 'engine-text',
          name: 'Disabled Text',
          callName: 'disabled-text',
          modelKey: 'engine-text::disabled-text',
          type: 'llm',
          purpose: 'text',
          enabled: false,
          status: 'available',
        },
        {
          id: 'failed-model',
          engineId: 'engine-text',
          name: 'Failed Text',
          callName: 'failed-text',
          modelKey: 'engine-text::failed-text',
          type: 'llm',
          purpose: 'text',
          enabled: true,
          status: 'failed',
        },
        {
          id: 'no-key-model',
          engineId: 'engine-no-key',
          name: 'No Key Audio',
          callName: 'no-key-audio',
          modelKey: 'engine-no-key::no-key-audio',
          type: 'audio',
          purpose: 'voice-generation',
          enabled: true,
          status: 'available',
        },
        {
          id: 'failed-engine-model',
          engineId: 'engine-failed',
          name: 'Failed Engine Video',
          callName: 'veo-3.1-generate-preview',
          modelKey: 'engine-failed::veo-3.1-generate-preview',
          type: 'video',
          purpose: 'video-generation',
          enabled: true,
          status: 'available',
        },
      ]),
    })

    const mod = await import('@/app/api/user/models/route')
    const req = buildMockRequest({
      path: '/api/user/models',
      method: 'GET',
    })
    const res = await mod.GET(req, routeContext)

    expect(res.status).toBe(200)
    const body = await res.json() as {
      llm: Array<{
        value: string
        label: string
        provider: string
        providerName: string
        purpose?: string
        engineStatus?: string
        modelStatus?: string
        source?: string
        confidence?: string
        capabilities?: unknown
      }>
      audio: Array<{ value: string; purpose?: string }>
      voiceDesign: Array<{ value: string; purpose?: string; modelStatus?: string; source?: string }>
      video: Array<{ value: string }>
    }

    expect(body.llm).toEqual([
      expect.objectContaining({
        value: 'engine-text::anthropic/claude-sonnet-4.5',
        label: 'Claude Sonnet 4.5',
        provider: 'engine-text',
        providerName: 'Text Engine',
        purpose: 'text',
        engineStatus: 'available',
        modelStatus: 'available',
        source: 'provider-list',
        confidence: 'high',
        capabilities: { llm: { reasoningEffortOptions: ['builtin-low', 'builtin-high'] } },
      }),
    ])
    expect(body.audio).toEqual([
      expect.objectContaining({
        value: 'engine-voice::qwen3-tts-vd-2026-01-26',
        purpose: 'voice-generation',
      }),
    ])
    expect(body.voiceDesign).toEqual([
      expect.objectContaining({
        value: 'engine-voice::qwen-voice-design',
        purpose: 'voice-design',
        modelStatus: 'unchecked',
        source: 'manual',
      }),
    ])
    expect(body.video).toEqual([])
  })
})
