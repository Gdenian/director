import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
  adminUserGroup: {
    findUnique: vi.fn(),
  },
  adminModelChannel: {
    findMany: vi.fn(),
  },
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
    prismaMock.user.findUnique.mockResolvedValue(null)
    prismaMock.adminUserGroup.findUnique.mockResolvedValue(null)
    prismaMock.adminModelChannel.findMany.mockResolvedValue([])
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

  it('filters advanced models when user group disallows advanced models', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ adminGroupKey: 'free' })
    prismaMock.adminUserGroup.findUnique.mockResolvedValue({
      key: 'free',
      status: 'active',
      allowedModelTiers: 'basic',
      allowAdvancedModels: false,
      allowText: true,
      allowImage: true,
      allowVideo: true,
      allowVoice: true,
      allowLipSync: true,
    })
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
          id: 'basic',
          engineId: 'openai-compatible:abc',
          name: 'Basic Text',
          callName: 'basic-model',
          modelKey: 'openai-compatible:abc::basic-model',
          type: 'llm',
          purpose: 'text',
          enabled: true,
          status: 'available',
          tier: 'basic',
        },
        {
          id: 'advanced',
          engineId: 'openai-compatible:abc',
          name: 'Advanced Text',
          callName: 'advanced-model',
          modelKey: 'openai-compatible:abc::advanced-model',
          type: 'llm',
          purpose: 'text',
          enabled: true,
          status: 'available',
          tier: 'advanced',
          tags: ['advanced'],
        },
        {
          id: 'pro-only',
          engineId: 'openai-compatible:abc',
          name: 'Pro Only',
          callName: 'pro-only',
          modelKey: 'openai-compatible:abc::pro-only',
          type: 'llm',
          purpose: 'text',
          enabled: true,
          status: 'available',
          tier: 'basic',
        },
      ]),
    })

    const route = await import('@/app/api/user/models/route')
    const res = await route.GET(buildMockRequest({
      path: '/api/user/models',
      method: 'GET',
    }), routeContext)
    const body = await res.json()
    const text = JSON.stringify(body)

    expect(res.status).toBe(200)
    expect(text).toContain('basic-model')
    expect(text).not.toContain('advanced')
    expect(text).not.toContain('pro-only')
  })

  it('filters user model options by model governance status and group after entitlement filtering', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ adminGroupKey: 'default' })
    prismaMock.adminUserGroup.findUnique.mockResolvedValue({
      key: 'default',
      status: 'active',
      allowedModelTiers: null,
      allowAdvancedModels: true,
      allowText: true,
      allowImage: true,
      allowVideo: true,
      allowVoice: true,
      allowLipSync: true,
    })
    prismaMock.adminModelChannel.findMany.mockResolvedValue([
      {
        key: 'openai-compatible:abc::disabled-text',
        status: 'disabled',
        groupKeys: null,
        userMessage: '文本模型下线',
      },
      {
        key: 'openai-compatible:abc::maintenance-image',
        status: 'maintenance',
        groupKeys: null,
        userMessage: '图片模型维护中',
      },
      {
        key: 'openai-compatible:abc::vip-video',
        status: 'active',
        groupKeys: 'vip',
        userMessage: null,
      },
      {
        key: 'openai-compatible:abc::voice-design',
        status: 'active',
        groupKeys: 'default',
        userMessage: null,
      },
    ])
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
          id: 'text-ok',
          engineId: 'openai-compatible:abc',
          name: 'Text OK',
          callName: 'text-ok',
          modelKey: 'openai-compatible:abc::text-ok',
          type: 'llm',
          purpose: 'text',
          enabled: true,
          status: 'available',
        },
        {
          id: 'disabled-text',
          engineId: 'openai-compatible:abc',
          name: 'Disabled Text',
          callName: 'disabled-text',
          modelKey: 'openai-compatible:abc::disabled-text',
          type: 'llm',
          purpose: 'text',
          enabled: true,
          status: 'available',
        },
        {
          id: 'maintenance-image',
          engineId: 'openai-compatible:abc',
          name: 'Maintenance Image',
          callName: 'maintenance-image',
          modelKey: 'openai-compatible:abc::maintenance-image',
          type: 'image',
          purpose: 'image-generation',
          enabled: true,
          status: 'available',
        },
        {
          id: 'vip-video',
          engineId: 'openai-compatible:abc',
          name: 'VIP Video',
          callName: 'vip-video',
          modelKey: 'openai-compatible:abc::vip-video',
          type: 'video',
          purpose: 'video-generation',
          enabled: true,
          status: 'available',
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
          status: 'available',
        },
      ]),
    })

    const route = await import('@/app/api/user/models/route')
    const res = await route.GET(buildMockRequest({
      path: '/api/user/models',
      method: 'GET',
    }), routeContext)
    const body = await res.json() as {
      llm: Array<{ value: string }>
      image: Array<{ value: string }>
      video: Array<{ value: string }>
      voiceDesign: Array<{ value: string }>
    }

    expect(res.status).toBe(200)
    expect(body.llm.map((item) => item.value)).toEqual(['openai-compatible:abc::text-ok'])
    expect(body.image).toEqual([])
    expect(body.video).toEqual([])
    expect(body.voiceDesign.map((item) => item.value)).toEqual(['openai-compatible:abc::voice-design'])
  })
})
