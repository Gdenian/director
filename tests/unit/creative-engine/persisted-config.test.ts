import { describe, expect, it } from 'vitest'
import { composeModelKey } from '@/lib/model-config-contract'
import {
  normalizeCreativeEngineInput,
  normalizeCreativeModelInput,
  toRuntimeModel,
  toRuntimeProvider,
} from '@/lib/creative-engine/persisted-config'

describe('creative engine persisted config', () => {
  it('normalizes engine storage fields and keeps runtime provider identity', () => {
    const engine = normalizeCreativeEngineInput({
      id: 'openai-compatible:abc',
      name: 'OpenRouter',
      source: 'OpenRouter',
      providerKey: 'openai-compatible',
      serviceUrl: ' https://openrouter.ai/api/v1/ ',
      apiKey: ' sk-test ',
      protocolType: 'openai-compatible',
      status: 'available',
      confidence: 'high',
      allowKeyInInspector: true,
    }, 0)

    expect(engine).toMatchObject({
      id: 'openai-compatible:abc',
      providerKey: 'openai-compatible',
      serviceUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-test',
      status: 'available',
      confidence: 'high',
      allowKeyInInspector: true,
    })

    expect(toRuntimeProvider(engine)).toMatchObject({
      id: 'openai-compatible:abc',
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-test',
      gatewayRoute: 'openai-compat',
    })
  })

  it('normalizes model storage fields and preserves provider::modelId', () => {
    const model = normalizeCreativeModelInput({
      id: 'm-1',
      engineId: 'openai-compatible:abc',
      name: 'Claude Sonnet',
      callName: 'anthropic/claude-sonnet-4.5',
      type: 'llm',
      purpose: 'text',
      enabled: true,
      status: 'available',
      confidence: 'high',
    }, 0)

    expect(model.modelKey).toBe(composeModelKey('openai-compatible:abc', 'anthropic/claude-sonnet-4.5'))
    expect(toRuntimeModel(model)).toMatchObject({
      provider: 'openai-compatible:abc',
      modelId: 'anthropic/claude-sonnet-4.5',
      modelKey: 'openai-compatible:abc::anthropic/claude-sonnet-4.5',
      type: 'llm',
    })
  })

  it('normalizes historical unknown purpose by falling back to the model type', () => {
    const model = normalizeCreativeModelInput({
      id: 'm-1',
      engineId: 'openai-compatible:abc',
      name: 'Mystery',
      callName: 'mystery',
      type: 'llm',
      purpose: 'unknown',
      enabled: true,
      status: 'available',
    }, 0)

    expect(model.purpose).toBe('text')
    expect(model.status).toBe('available')
  })

  it('keeps creative model drafts disabled until the user enables them', () => {
    const model = normalizeCreativeModelInput({
      id: 'm-1',
      engineId: 'openai-compatible:abc',
      name: 'Claude Sonnet',
      callName: 'anthropic/claude-sonnet-4.5',
      type: 'llm',
      purpose: 'text',
      status: 'available',
    }, 0)

    expect(model.enabled).toBe(false)
  })

  it('normalizes and exposes media contracts to runtime models', () => {
    const model = normalizeCreativeModelInput({
      id: 'm-1',
      engineId: 'openai-compatible:abc',
      name: 'Image Model',
      callName: 'image-model',
      type: 'image',
      purpose: 'image-generation',
      enabled: true,
      status: 'available',
      mediaContract: {
        version: 1,
        mediaType: 'image',
        executor: 'openai-standard',
        capabilities: ['text-to-image', 'text-to-image', 'image-to-image'],
        input: { image: 'dataUrlBase64' },
        output: { kind: 'url', urlPath: '$.data[0].url' },
        testStatus: { textToImage: 'passed', imageToImage: 'unchecked' },
        checkedAt: '2026-06-15T00:00:00.000Z',
        source: 'manual',
      },
    }, 0)

    expect(model.mediaContract).toMatchObject({
      capabilities: ['text-to-image', 'image-to-image'],
      checkedAt: '2026-06-15T00:00:00.000Z',
      source: 'manual',
    })
    expect(model.mediaContractCheckedAt).toBe('2026-06-15T00:00:00.000Z')
    expect(model.mediaContractSource).toBe('manual')
    expect(toRuntimeModel(model)).toMatchObject({
      mediaContract: {
        mediaType: 'image',
        capabilities: ['text-to-image', 'image-to-image'],
      },
      mediaContractCheckedAt: '2026-06-15T00:00:00.000Z',
      mediaContractSource: 'manual',
    })
  })
})
