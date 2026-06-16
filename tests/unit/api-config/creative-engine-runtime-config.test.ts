import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/crypto-utils', () => ({
  decryptApiKey: vi.fn((value: string) => value.replace(/^enc:/, '')),
  encryptApiKey: vi.fn((value: string) => `enc:${value}`),
}))
vi.mock('@/lib/api-auth', () => ({
  requireUserAuth: vi.fn(async () => ({ session: { user: { id: 'user-1' } } })),
  isErrorResponse: vi.fn(() => false),
}))
vi.mock('@/lib/billing/mode', () => ({
  getBillingMode: vi.fn(async () => 'OFF'),
}))

describe('api-config creative engine runtime reader', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    prismaMock.userPreference.findUnique.mockResolvedValue({
      customProviders: JSON.stringify([{
        id: 'openai-compatible:abc',
        name: 'OpenRouter',
        providerKey: 'openai-compatible',
        serviceUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'enc:sk-test',
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
        llmProtocol: 'responses',
      }]),
    })
  })

  it('resolves providers and models from creative engine JSON shape', async () => {
    const {
      getProviderConfig,
      getUserModels,
      resolveModelSelection,
    } = await import('@/lib/api-config')

    await expect(getUserModels('user-1')).resolves.toMatchObject([{
      provider: 'openai-compatible:abc',
      modelId: 'anthropic/claude-sonnet-4.5',
      modelKey: 'openai-compatible:abc::anthropic/claude-sonnet-4.5',
      type: 'llm',
    }])
    await expect(resolveModelSelection(
      'user-1',
      'openai-compatible:abc::anthropic/claude-sonnet-4.5',
      'llm',
    )).resolves.toStrictEqual({
      provider: 'openai-compatible:abc',
      modelId: 'anthropic/claude-sonnet-4.5',
      modelKey: 'openai-compatible:abc::anthropic/claude-sonnet-4.5',
      mediaType: 'llm',
      llmProtocol: 'responses',
    })
    await expect(getProviderConfig('user-1', 'openai-compatible:abc')).resolves.toMatchObject({
      id: 'openai-compatible:abc',
      apiKey: 'sk-test',
      baseUrl: 'https://openrouter.ai/api/v1',
      gatewayRoute: 'openai-compat',
    })
  })

  it('reports unavailable selected models with creative engine preflight copy', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      customProviders: JSON.stringify([{
        id: 'openai-compatible:abc',
        name: 'OpenRouter',
        providerKey: 'openai-compatible',
        serviceUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'enc:sk-test',
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
        enabled: false,
        status: 'disabled',
      }]),
    })
    const { resolveModelSelection } = await import('@/lib/api-config')

    await expect(resolveModelSelection(
      'user-1',
      'openai-compatible:abc::anthropic/claude-sonnet-4.5',
      'llm',
    )).rejects.toThrow('当前选择的模型暂时不可用，请重新检测或更换模型。')
  })

  it('exposes image media contracts from resolved model selections', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      customProviders: JSON.stringify([{
        id: 'fal:official',
        name: 'FAL',
        providerKey: 'fal',
        apiKey: 'enc:sk-test',
        status: 'available',
      }]),
      customModels: JSON.stringify([{
        id: 'model-1',
        engineId: 'fal:official',
        name: 'FAL Image',
        callName: 'fal-image',
        modelKey: 'fal:official::fal-image',
        type: 'image',
        purpose: 'image-generation',
        enabled: true,
        status: 'available',
        mediaContract: {
          version: 1,
          mediaType: 'image',
          executor: 'official-adapter',
          capabilities: ['text-to-image'],
          input: {},
          output: { kind: 'url', urlPath: '$.images[0].url' },
          testStatus: { textToImage: 'passed' },
          checkedAt: '2026-06-15T00:00:00.000Z',
          source: 'official-adapter',
        },
      }]),
    })
    const { resolveModelSelection } = await import('@/lib/api-config')

    await expect(resolveModelSelection(
      'user-1',
      'fal:official::fal-image',
      'image',
    )).resolves.toMatchObject({
      provider: 'fal:official',
      modelId: 'fal-image',
      modelKey: 'fal:official::fal-image',
      mediaType: 'image',
      mediaContract: {
        mediaType: 'image',
        executor: 'official-adapter',
        capabilities: ['text-to-image'],
      },
    })
  })

  it('preserves compat media template and media contract through api config save/read', async () => {
    const compatMediaTemplate = {
      version: 1,
      mediaType: 'image',
      mode: 'sync',
      create: {
        method: 'POST',
        path: '/v1/images/generations',
        contentType: 'application/json',
        bodyTemplate: {
          model: '{{model}}',
          prompt: '{{prompt}}',
          image: '{{image}}',
        },
      },
      response: {
        outputUrlPath: '$.data[0].url',
      },
    }
    const mediaContract = {
      version: 1,
      mediaType: 'image',
      executor: 'openai-compat-template',
      capabilities: ['text-to-image', 'image-to-image'],
      input: {
        image: 'dataUrlBase64',
      },
      output: {
        kind: 'url',
        urlPath: '$.data[0].url',
      },
      testStatus: {
        textToImage: 'unchecked',
        imageToImage: 'unchecked',
      },
      checkedAt: '2026-06-15T00:00:00.000Z',
      source: 'llm',
    }
    prismaMock.userPreference.findUnique
      .mockResolvedValueOnce({
        customProviders: JSON.stringify([{
          id: 'openai-compatible:abc',
          name: 'OpenAI Compatible',
          providerKey: 'openai-compatible',
          serviceUrl: 'https://example.test/v1',
          apiKey: 'enc:sk-test',
          status: 'available',
        }]),
        customModels: JSON.stringify([]),
      })
      .mockResolvedValueOnce({
        customProviders: JSON.stringify([{
          id: 'openai-compatible:abc',
          name: 'OpenAI Compatible',
          providerKey: 'openai-compatible',
          serviceUrl: 'https://example.test/v1',
          apiKey: 'enc:sk-test',
          status: 'available',
        }]),
        customModels: JSON.stringify([{
          id: 'openai-compatible:abc::custom-image',
          engineId: 'openai-compatible:abc',
          name: 'Custom Image',
          callName: 'custom-image',
          modelKey: 'openai-compatible:abc::custom-image',
          type: 'image',
          purpose: 'image-generation',
          enabled: true,
          status: 'unchecked',
          compatMediaTemplate,
          compatMediaTemplateCheckedAt: '2026-06-15T00:00:00.000Z',
          compatMediaTemplateSource: 'manual',
          mediaContract,
          mediaContractCheckedAt: '2026-06-15T00:00:00.000Z',
          mediaContractSource: 'llm',
        }]),
      })
    const { PUT, GET } = await import('@/app/api/user/api-config/route')

    const { NextRequest } = await import('next/server')
    await PUT(new NextRequest('http://localhost/api/user/api-config', {
      method: 'PUT',
      body: JSON.stringify({
        models: [{
          modelId: 'custom-image',
          modelKey: 'openai-compatible:abc::custom-image',
          name: 'Custom Image',
          type: 'image',
          provider: 'openai-compatible:abc',
          compatMediaTemplate,
          mediaContract,
          mediaContractCheckedAt: '2026-06-15T00:00:00.000Z',
          mediaContractSource: 'llm',
        }],
      }),
    }) as never, { params: Promise.resolve({}) })

    const savedModels = JSON.parse(prismaMock.userPreference.upsert.mock.calls[0]?.[0].update.customModels)
    expect(savedModels[0]).toMatchObject({
      compatMediaTemplate,
      mediaContract,
      mediaContractCheckedAt: '2026-06-15T00:00:00.000Z',
      mediaContractSource: 'llm',
    })

    const response = await GET(new NextRequest('http://localhost/api/user/api-config') as never, { params: Promise.resolve({}) })
    const body = await response.json()
    expect(body.models[0]).toMatchObject({
      compatMediaTemplate,
      mediaContract,
      mediaContractCheckedAt: '2026-06-15T00:00:00.000Z',
      mediaContractSource: 'llm',
    })
  })

  it('reports invalid media contract on the top-level mediaContract field', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      customProviders: JSON.stringify([{
        id: 'openai-compatible:abc',
        name: 'OpenAI Compatible',
        providerKey: 'openai-compatible',
        serviceUrl: 'https://example.test/v1',
        apiKey: 'enc:sk-test',
        status: 'available',
      }]),
      customModels: JSON.stringify([]),
    })
    const { PUT } = await import('@/app/api/user/api-config/route')
    const { NextRequest } = await import('next/server')

    const response = await PUT(new NextRequest('http://localhost/api/user/api-config', {
      method: 'PUT',
      body: JSON.stringify({
        models: [{
          modelId: 'custom-image',
          modelKey: 'openai-compatible:abc::custom-image',
          name: 'Custom Image',
          type: 'image',
          provider: 'openai-compatible:abc',
          mediaContract: {
            version: 1,
            mediaType: 'image',
            executor: 'openai-standard',
            capabilities: ['image-to-video'],
            input: {},
            output: { kind: 'url', urlPath: '$.data[0].url' },
          },
        }],
      }),
    }) as never, { params: Promise.resolve({}) })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      code: 'MODEL_MEDIA_CONTRACT_INVALID',
      field: 'models[0].mediaContract',
    })
  })

  it('rejects invalid media contract source values', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      customProviders: JSON.stringify([{
        id: 'openai-compatible:abc',
        name: 'OpenAI Compatible',
        providerKey: 'openai-compatible',
        serviceUrl: 'https://example.test/v1',
        apiKey: 'enc:sk-test',
        status: 'available',
      }]),
      customModels: JSON.stringify([]),
    })
    const { PUT } = await import('@/app/api/user/api-config/route')
    const { NextRequest } = await import('next/server')

    const response = await PUT(new NextRequest('http://localhost/api/user/api-config', {
      method: 'PUT',
      body: JSON.stringify({
        models: [{
          modelId: 'custom-image',
          modelKey: 'openai-compatible:abc::custom-image',
          name: 'Custom Image',
          type: 'image',
          provider: 'openai-compatible:abc',
          mediaContract: {
            version: 1,
            mediaType: 'image',
            executor: 'openai-standard',
            capabilities: ['text-to-image'],
            input: {},
            output: { kind: 'url', urlPath: '$.data[0].url' },
          },
          mediaContractSource: 'assistant',
        }],
      }),
    }) as never, { params: Promise.resolve({}) })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      code: 'MODEL_MEDIA_CONTRACT_SOURCE_INVALID',
      field: 'models[0].mediaContractSource',
    })
  })
})
