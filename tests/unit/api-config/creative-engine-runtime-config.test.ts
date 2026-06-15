import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/crypto-utils', () => ({
  decryptApiKey: vi.fn((value: string) => value.replace(/^enc:/, '')),
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
})
