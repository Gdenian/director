import { describe, expect, it } from 'vitest'
import { canLightTestCreativeModel } from '@/app/[locale]/profile/components/creative-engine/model-light-test'

describe('creative engine model light-test support', () => {
  it('allows only openai-compatible text models with connection details', () => {
    expect(canLightTestCreativeModel({
      model: {
        modelId: 'gpt-example',
        modelKey: 'openai-compatible:engine-1::gpt-example',
        name: 'GPT Example',
        type: 'llm',
        provider: 'openai-compatible:engine-1',
        price: 0,
        enabled: true,
      },
      provider: {
        id: 'openai-compatible:engine-1',
        name: 'OpenAI Compatible',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'key',
      },
    })).toBe(true)

    expect(canLightTestCreativeModel({
      model: {
        modelId: 'gpt-example',
        modelKey: 'openai-compatible:engine-2::gpt-example',
        name: 'GPT Example',
        type: 'llm',
        provider: 'openai-compatible:engine-2',
        price: 0,
        enabled: true,
      },
      provider: {
        id: 'openai-compatible:engine-2',
        name: 'OpenAI Compatible',
        baseUrl: 'https://api.example.com/v1',
        hasApiKey: true,
      },
    })).toBe(true)

    expect(canLightTestCreativeModel({
      model: {
        modelId: 'gpt-example',
        modelKey: 'gemini-compatible:engine-1::gpt-example',
        name: 'Gemini Example',
        type: 'llm',
        provider: 'gemini-compatible:engine-1',
        price: 0,
        enabled: true,
      },
      provider: {
        id: 'gemini-compatible:engine-1',
        name: 'Gemini Compatible',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: 'key',
      },
    })).toBe(false)

    expect(canLightTestCreativeModel({
      model: {
        modelId: 'image-example',
        modelKey: 'openai-compatible:engine-1::image-example',
        name: 'Image Example',
        type: 'image',
        provider: 'openai-compatible:engine-1',
        price: 0,
        enabled: true,
      },
      provider: {
        id: 'openai-compatible:engine-1',
        name: 'OpenAI Compatible',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'key',
      },
    })).toBe(false)

    expect(canLightTestCreativeModel({
      model: {
        modelId: 'checked-model',
        modelKey: 'openai-compatible:engine-1::checked-model',
        name: 'Checked Model',
        type: 'llm',
        provider: 'openai-compatible:engine-1',
        price: 0,
        enabled: true,
        status: 'available',
      },
      provider: {
        id: 'openai-compatible:engine-1',
        name: 'OpenAI Compatible',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'key',
      },
    })).toBe(false)

    expect(canLightTestCreativeModel({
      model: {
        modelId: 'disabled-model',
        modelKey: 'openai-compatible:engine-1::disabled-model',
        name: 'Disabled Model',
        type: 'llm',
        provider: 'openai-compatible:engine-1',
        price: 0,
        enabled: false,
        status: 'unchecked',
      },
      provider: {
        id: 'openai-compatible:engine-1',
        name: 'OpenAI Compatible',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'key',
      },
    })).toBe(false)
  })
})
