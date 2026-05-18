import { beforeEach, describe, expect, it, vi } from 'vitest'
import type OpenAI from 'openai'

const resolveModelSelectionMock = vi.hoisted(() => vi.fn(async () => ({
  provider: 'openrouter',
  modelId: 'vision-model',
  modelKey: 'openrouter::vision-model',
  mediaType: 'llm',
  variantSubKind: 'official',
})))

const getProviderConfigMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'openrouter',
  name: 'OpenRouter',
  apiKey: 'sk-test',
  baseUrl: 'https://openrouter.example/v1',
})))

const visionCompletionMock = vi.hoisted(() => vi.fn(async () => ({
  completion: {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 0,
    model: 'vision-model',
    choices: [{
      index: 0,
      finish_reason: 'stop',
      logprobs: null,
      message: { role: 'assistant', content: 'vision ok', refusal: null },
    }],
    usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
  } as OpenAI.Chat.Completions.ChatCompletion,
  logProvider: 'openrouter',
  text: 'vision ok',
  reasoning: '',
  usage: { promptTokens: 10, completionTokens: 2 },
})))

const resolveAiProviderAdapterMock = vi.hoisted(() => vi.fn(() => ({
  providerKey: 'openrouter',
  completeVision: visionCompletionMock,
})))

vi.mock('@/lib/user-api/runtime-config', () => ({
  resolveModelSelection: resolveModelSelectionMock,
  getProviderConfig: getProviderConfigMock,
}))

vi.mock('@/lib/ai-providers', () => ({
  resolveAiProviderAdapter: resolveAiProviderAdapterMock,
}))

import { runChatCompletionWithVision } from '@/lib/ai-exec/llm/vision-runner'

describe('vision provider support', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes OpenRouter vision calls through the provider adapter', async () => {
    const completion = await runChatCompletionWithVision(
      'user-1',
      'openrouter::vision-model',
      'describe image',
      ['https://example.com/image.png'],
    )

    expect(completion.choices[0]?.message.content).toBe('vision ok')
    expect(resolveAiProviderAdapterMock).toHaveBeenCalledWith('openrouter')
    expect(getProviderConfigMock).toHaveBeenCalledWith('user-1', 'openrouter')
    expect(visionCompletionMock).toHaveBeenCalledWith(expect.objectContaining({
      textPrompt: 'describe image',
      imageUrls: ['https://example.com/image.png'],
      providerKey: 'openrouter',
    }))
  })
})
