import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import { installAuthMocks, mockAuthenticated, resetAuthMockState } from '../../../helpers/auth'

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn<(...args: unknown[]) => Promise<{ customProviders: string | null; customModels: string | null }>>(
      async () => ({ customProviders: null, customModels: null }),
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

describe('creative engine api-config PUT', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resetAuthMockState()
  })

  it('stores engines and models without changing default model selections', async () => {
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
          confidence: 'high',
        }],
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
    expect(payload.update.analysisModel).toBeUndefined()
    expect(JSON.parse(payload.update.customProviders as string)[0]).toMatchObject({
      id: 'openai-compatible:abc',
      serviceUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'enc:sk-test',
    })
    expect(JSON.parse(payload.update.customModels as string)[0]).toMatchObject({
      engineId: 'openai-compatible:abc',
      callName: 'anthropic/claude-sonnet-4.5',
      modelKey: 'openai-compatible:abc::anthropic/claude-sonnet-4.5',
      purpose: 'text',
    })
  })

  it('stores creative models when only models are submitted', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      customProviders: JSON.stringify([{
        id: 'openai-compatible:abc',
        name: 'OpenRouter',
        providerKey: 'openai-compatible',
        serviceUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'enc:existing',
        protocolType: 'openai-compatible',
        status: 'available',
      }]),
      customModels: null,
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
    expect(payload.update.analysisModel).toBeUndefined()
    expect(payload.update.customProviders).toBeUndefined()
    expect(JSON.parse(payload.update.customModels as string)[0]).toMatchObject({
      engineId: 'openai-compatible:abc',
      callName: 'anthropic/claude-sonnet-4.5',
      modelKey: 'openai-compatible:abc::anthropic/claude-sonnet-4.5',
      purpose: 'text',
    })
  })

  it('rejects creative models whose engineId is only a provider key match', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      customProviders: null,
      customModels: null,
    })
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

  it('rejects creative engines with invalid provider routing', async () => {
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
          gatewayRoute: 'official',
          status: 'available',
        }],
      },
    })

    const res = await route.PUT(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert.mock.calls).toHaveLength(0)
  })

  it('rejects invalid creative model pricing instead of dropping it', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      customProviders: JSON.stringify([{
        id: 'openai-compatible:abc',
        name: 'OpenRouter',
        providerKey: 'openai-compatible',
        serviceUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'enc:existing',
        protocolType: 'openai-compatible',
        status: 'available',
      }]),
      customModels: null,
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
          name: 'Image Model',
          callName: 'gpt-image-1',
          modelKey: 'openai-compatible:abc::gpt-image-1',
          type: 'image',
          purpose: 'image-generation',
          enabled: true,
          status: 'available',
          pricing: {
            image: {
              basePrice: -1,
            },
          },
        }],
      },
    })

    const res = await route.PUT(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert.mock.calls).toHaveLength(0)
  })
})
