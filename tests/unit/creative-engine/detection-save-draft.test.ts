import { describe, expect, it } from 'vitest'
import {
  buildDetectedEngineProviderDraft,
  buildDetectedModelDrafts,
} from '@/app/[locale]/profile/components/creative-engine/detection-save-draft'

describe('creative engine detection save draft', () => {
  it('converts confirmed detected models into config-center model drafts', () => {
    const drafts = buildDetectedModelDrafts('openai-compatible:abc', [
      {
        id: 'text-1',
        name: 'Text One',
        callName: 'gpt-example',
        purpose: 'text',
        status: 'available',
      },
      {
        id: 'img-1',
        name: 'Image One',
        callName: 'image-example',
        purpose: 'image-generation',
        status: 'unchecked',
      },
      {
        id: 'mystery',
        name: 'Mystery',
        callName: 'mystery-model',
        purpose: 'unknown',
        status: 'unchecked',
      },
    ])

    expect(drafts).toEqual([
      {
        modelId: 'gpt-example',
        modelKey: 'openai-compatible:abc::gpt-example',
        name: 'Text One',
        type: 'llm',
        provider: 'openai-compatible:abc',
        llmProtocol: 'chat-completions',
        llmProtocolCheckedAt: expect.any(String),
        purpose: 'text',
        status: 'available',
        price: 0,
      },
      {
        modelId: 'image-example',
        modelKey: 'openai-compatible:abc::image-example',
        name: 'Image One',
        type: 'image',
        provider: 'openai-compatible:abc',
        purpose: 'image-generation',
        status: 'unchecked',
        price: 0,
      },
    ])
  })

  it('keeps detected protocol routing when building the provider draft', () => {
    expect(buildDetectedEngineProviderDraft({
      recommendedProviderKey: 'google',
      protocolType: 'gemini-compatible',
      name: 'Google AI Studio',
      serviceUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'gemini-key',
    })).toMatchObject({
      id: expect.stringMatching(/^gemini-compatible:/),
      name: 'Google AI Studio',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'gemini-key',
      protocolType: 'gemini-compatible',
      apiMode: 'gemini-sdk',
      gatewayRoute: 'official',
    })

    expect(buildDetectedEngineProviderDraft({
      recommendedProviderKey: 'fal',
      protocolType: 'official',
      name: 'FAL',
      serviceUrl: 'https://fal.ai',
      apiKey: 'fal-key',
    })).toMatchObject({
      id: expect.stringMatching(/^fal:/),
      name: 'FAL',
      baseUrl: 'https://fal.ai',
      apiKey: 'fal-key',
      protocolType: 'official',
      gatewayRoute: 'official',
    })

    expect(buildDetectedEngineProviderDraft({
      recommendedProviderKey: 'openrouter',
      protocolType: 'openai-compatible',
      name: 'OpenRouter',
      serviceUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'openrouter-key',
    })).toMatchObject({
      id: expect.stringMatching(/^openai-compatible:/),
      protocolType: 'openai-compatible',
      apiMode: 'openai-official',
      gatewayRoute: 'openai-compat',
    })
  })
})
