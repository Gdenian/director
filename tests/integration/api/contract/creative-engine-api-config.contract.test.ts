import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import { installAuthMocks, mockAuthenticated, resetAuthMockState } from '../../../helpers/auth'

const defaultPreference = {
  customProviders: null,
  customModels: null,
  analysisModel: null,
  characterModel: null,
  locationModel: null,
  storyboardModel: null,
  editModel: null,
  videoModel: null,
  audioModel: null,
  lipSyncModel: null,
  voiceDesignModel: null,
  capabilityDefaults: null,
  analysisConcurrency: null,
  imageConcurrency: null,
  videoConcurrency: null,
}

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn<(...args: unknown[]) => Promise<Record<string, unknown> | null>>(
      async () => defaultPreference,
    ),
    upsert: vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(async () => ({ id: 'pref-1' })),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/crypto-utils', () => ({
  encryptApiKey: vi.fn((value: string) => `enc:${value}`),
  decryptApiKey: vi.fn((value: string) => value.replace(/^enc:/, '')),
}))
vi.mock('@/lib/billing/mode', () => ({ getBillingMode: vi.fn(async () => 'OFF') }))

describe('api contract - creative engine api-config', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resetAuthMockState()
  })

  it('GET exposes canonical engines while keeping existing config sections', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      ...defaultPreference,
      customProviders: JSON.stringify([{
        id: 'openai-compatible:abc',
        name: 'OpenRouter',
        providerKey: 'openai-compatible',
        serviceUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'enc:sk-test',
        protocolType: 'openai-compatible',
        status: 'available',
      }]),
      customModels: JSON.stringify([{
        id: 'model-1',
        engineId: 'openai-compatible:abc',
        name: 'Claude Sonnet',
        callName: 'anthropic/claude-sonnet-4.5',
        modelKey: 'openai-compatible:abc::anthropic/claude-sonnet-4.5',
        type: 'llm',
        purpose: 'text',
        enabled: true,
        status: 'available',
      }]),
      analysisModel: 'openai-compatible:abc::anthropic/claude-sonnet-4.5',
    })
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'GET',
    })

    const res = await route.GET(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.engines[0]).toMatchObject({
      id: 'openai-compatible:abc',
      providerKey: 'openai-compatible',
      serviceUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-test',
    })
    expect(body.providers).toBeUndefined()
    expect(body.models[0].modelKey).toBe('openai-compatible:abc::anthropic/claude-sonnet-4.5')
    expect(body.defaultModels.analysisModel).toBe('openai-compatible:abc::anthropic/claude-sonnet-4.5')
    expect(body.capabilityDefaults).toEqual({})
    expect(body.workflowConcurrency).toEqual({ analysis: 5, image: 5, video: 5 })
  })

  it('GET recovers historical unknown model purposes instead of failing config load', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      ...defaultPreference,
      customProviders: JSON.stringify([{
        id: 'openai-compatible:abc',
        name: 'OpenRouter',
        providerKey: 'openai-compatible',
        serviceUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'enc:sk-test',
        protocolType: 'openai-compatible',
        status: 'available',
      }]),
      customModels: JSON.stringify([{
        id: 'model-1',
        engineId: 'openai-compatible:abc',
        name: 'Mystery',
        callName: 'mystery-model',
        modelKey: 'openai-compatible:abc::mystery-model',
        type: 'llm',
        purpose: 'unknown',
        enabled: true,
        status: 'unchecked',
      }]),
    })
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'GET',
    })

    const res = await route.GET(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.models[0]).toMatchObject({
      modelKey: 'openai-compatible:abc::mystery-model',
      purpose: 'text',
    })
  })

  it('GET ignores historical invalid capability defaults instead of failing config load', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      ...defaultPreference,
      customProviders: JSON.stringify([{
        id: 'google',
        name: 'Google',
        providerKey: 'google',
        serviceUrl: 'https://generativelanguage.googleapis.com',
        apiKey: 'enc:sk-test',
        protocolType: 'official',
        status: 'available',
      }]),
      customModels: JSON.stringify([{
        id: 'google::gemini-2.5-flash-image',
        engineId: 'google',
        name: 'Gemini 2.5 Flash Image',
        callName: 'gemini-2.5-flash-image',
        modelKey: 'google::gemini-2.5-flash-image',
        type: 'image',
        purpose: 'image-generation',
        enabled: true,
        status: 'available',
      }]),
      capabilityDefaults: JSON.stringify({
        'google::gemini-2.5-flash-image': {
          aspectRatio: '16:9',
          resolution: '1K',
          legacyResolution: 'bad-resolution',
        },
        'google::unknown-model': {
          imageSize: '1K',
        },
        malformed: 'bad',
      }),
    })
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'GET',
    })

    const res = await route.GET(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.capabilityDefaults).toEqual({
      'google::gemini-2.5-flash-image': {
        resolution: '1K',
      },
    })
  })

  it('PUT accepts creative models without requiring engines in the same request', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      ...defaultPreference,
      customProviders: JSON.stringify([{
        id: 'openai-compatible:abc',
        name: 'OpenRouter',
        providerKey: 'openai-compatible',
        serviceUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'enc:sk-test',
        protocolType: 'openai-compatible',
        status: 'available',
      }]),
    })
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        models: [{
          id: 'model-1',
          engineId: 'openai-compatible:abc',
          name: 'Claude Sonnet',
          callName: 'anthropic/claude-sonnet-4.5',
          modelKey: 'openai-compatible:abc::anthropic/claude-sonnet-4.5',
          type: 'llm',
          purpose: 'text',
          enabled: true,
          status: 'available',
        }],
      },
    })

    const res = await route.PUT(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const payload = prismaMock.userPreference.upsert.mock.calls[0]?.[0] as {
      update: Record<string, unknown>
    }

    expect(payload.update.customProviders).toBeUndefined()
    expect(JSON.parse(payload.update.customModels as string)[0]).toMatchObject({
      engineId: 'openai-compatible:abc',
      callName: 'anthropic/claude-sonnet-4.5',
      purpose: 'text',
    })
  })

  it('PUT stores legacy provider and model payloads as creative engine config', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [{
          id: 'openai-compatible:abc',
          name: 'OpenRouter',
          baseUrl: 'https://openrouter.ai/api/v1',
          apiKey: 'sk-test',
        }],
        models: [{
          type: 'llm',
          provider: 'openai-compatible:abc',
          modelId: 'anthropic/claude-sonnet-4.5',
          modelKey: 'openai-compatible:abc::anthropic/claude-sonnet-4.5',
          name: 'Claude Sonnet',
          llmProtocol: 'responses',
        }],
      },
    })

    const res = await route.PUT(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const payload = prismaMock.userPreference.upsert.mock.calls[0]?.[0] as {
      update: Record<string, unknown>
    }

    const savedEngines = JSON.parse(payload.update.customProviders as string)
    const savedModels = JSON.parse(payload.update.customModels as string)
    expect(savedEngines[0]).toMatchObject({
      id: 'openai-compatible:abc',
      providerKey: 'openai-compatible',
      serviceUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'enc:sk-test',
      status: 'unchecked',
    })
    expect(savedEngines[0].baseUrl).toBeUndefined()
    expect(savedModels[0]).toMatchObject({
      engineId: 'openai-compatible:abc',
      callName: 'anthropic/claude-sonnet-4.5',
      modelKey: 'openai-compatible:abc::anthropic/claude-sonnet-4.5',
      purpose: 'text',
      status: 'unchecked',
      llmProtocol: 'responses',
    })
    expect(savedModels[0].provider).toBeUndefined()
    expect(savedModels[0].modelId).toBeUndefined()
  })

  it('PUT preserves existing creative metadata when a legacy client saves runtime config', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      ...defaultPreference,
      customProviders: JSON.stringify([{
        id: 'openai-compatible:abc',
        name: 'OpenRouter',
        providerKey: 'openai-compatible',
        serviceUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'enc:existing',
        status: 'available',
        confidence: 'high',
      }]),
      customModels: JSON.stringify([
        {
          id: 'openai-compatible:abc::gpt-image-edit',
          engineId: 'openai-compatible:abc',
          callName: 'gpt-image-edit',
          modelKey: 'openai-compatible:abc::gpt-image-edit',
          name: 'GPT Image Edit',
          type: 'image',
          purpose: 'image-edit',
          enabled: true,
          status: 'available',
          confidence: 'high',
          warningCodes: ['manual-review'],
        },
        {
          id: 'openai-compatible:abc::draft-video',
          engineId: 'openai-compatible:abc',
          callName: 'draft-video',
          modelKey: 'openai-compatible:abc::draft-video',
          name: 'Draft Video',
          type: 'video',
          purpose: 'video-generation',
          enabled: false,
          status: 'unchecked',
          confidence: 'low',
        },
      ]),
    })
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [{
          id: 'openai-compatible:abc',
          name: 'OpenRouter',
          baseUrl: 'https://openrouter.ai/api/v1',
        }],
        models: [{
          type: 'image',
          provider: 'openai-compatible:abc',
          modelId: 'gpt-image-edit',
          modelKey: 'openai-compatible:abc::gpt-image-edit',
          name: 'GPT Image Edit',
        }],
      },
    })

    const res = await route.PUT(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const payload = prismaMock.userPreference.upsert.mock.calls[0]?.[0] as {
      update: Record<string, unknown>
    }

    const savedEngines = JSON.parse(payload.update.customProviders as string)
    const savedModels = JSON.parse(payload.update.customModels as string)
    expect(savedEngines[0]).toMatchObject({
      id: 'openai-compatible:abc',
      status: 'available',
      confidence: 'high',
      apiKey: 'enc:existing',
    })
    expect(savedModels).toHaveLength(2)
    expect(savedModels.find((model: { modelKey?: string }) => model.modelKey === 'openai-compatible:abc::gpt-image-edit')).toMatchObject({
      purpose: 'image-edit',
      status: 'available',
      confidence: 'high',
      warningCodes: ['manual-review'],
    })
    expect(savedModels.find((model: { modelKey?: string }) => model.modelKey === 'openai-compatible:abc::draft-video')).toMatchObject({
      enabled: false,
      status: 'unchecked',
      confidence: 'low',
    })
  })

  it('PUT legacy clients can remove enabled models while disabled drafts stay persisted', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      ...defaultPreference,
      customProviders: JSON.stringify([{
        id: 'openai-compatible:abc',
        name: 'OpenRouter',
        providerKey: 'openai-compatible',
        serviceUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'enc:existing',
        status: 'available',
      }]),
      customModels: JSON.stringify([
        {
          id: 'openai-compatible:abc::gpt-image',
          engineId: 'openai-compatible:abc',
          callName: 'gpt-image',
          modelKey: 'openai-compatible:abc::gpt-image',
          name: 'GPT Image',
          type: 'image',
          purpose: 'image-generation',
          enabled: true,
          status: 'available',
        },
        {
          id: 'openai-compatible:abc::draft-video',
          engineId: 'openai-compatible:abc',
          callName: 'draft-video',
          modelKey: 'openai-compatible:abc::draft-video',
          name: 'Draft Video',
          type: 'video',
          purpose: 'video-generation',
          enabled: false,
          status: 'unchecked',
        },
      ]),
    })
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [{
          id: 'openai-compatible:abc',
          name: 'OpenRouter',
          baseUrl: 'https://openrouter.ai/api/v1',
        }],
        models: [],
      },
    })

    const res = await route.PUT(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const payload = prismaMock.userPreference.upsert.mock.calls[0]?.[0] as {
      update: Record<string, unknown>
    }

    const savedModels = JSON.parse(payload.update.customModels as string)
    expect(savedModels.find((model: { modelKey?: string }) => model.modelKey === 'openai-compatible:abc::gpt-image')).toBeUndefined()
    expect(savedModels.find((model: { modelKey?: string }) => model.modelKey === 'openai-compatible:abc::draft-video')).toMatchObject({
      enabled: false,
      status: 'unchecked',
    })
  })

  it('PUT rejects creative models whose engineId does not exactly match an engine id', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        engines: [{
          id: 'openai-compatible:abc',
          name: 'OpenRouter',
          providerKey: 'openai-compatible',
          serviceUrl: 'https://openrouter.ai/api/v1',
          apiKey: 'sk-test',
          protocolType: 'openai-compatible',
          status: 'available',
        }],
        models: [{
          id: 'model-1',
          engineId: 'openai-compatible',
          name: 'Claude Sonnet',
          callName: 'anthropic/claude-sonnet-4.5',
          modelKey: 'openai-compatible::anthropic/claude-sonnet-4.5',
          type: 'llm',
          purpose: 'text',
          enabled: true,
          status: 'available',
        }],
      },
    })

    const res = await route.PUT(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert.mock.calls).toHaveLength(0)
  })
})
