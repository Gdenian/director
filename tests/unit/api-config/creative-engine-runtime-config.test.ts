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
    )).resolves.toMatchObject({
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
})
