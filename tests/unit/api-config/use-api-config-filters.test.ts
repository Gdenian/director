import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useMemo: <T,>(factory: () => T) => factory(),
  }
})

import { useApiConfigFilters } from '@/app/[locale]/profile/components/api-config-tab/hooks/useApiConfigFilters'
import type { CustomModel, Provider } from '@/app/[locale]/profile/components/api-config/types'

describe('api config filters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('merges audio providers into modelProviders and removes audioProviders output', () => {
    const providers: Provider[] = [
      { id: 'fal', name: 'FAL', hasApiKey: true, apiKey: 'k-fal' },
      { id: 'bailian', name: 'Alibaba Bailian', hasApiKey: true, apiKey: 'k-bl' },
    ]
    const models: CustomModel[] = [
      {
        modelId: 'fal-ai/index-tts-2/text-to-speech',
        modelKey: 'fal::fal-ai/index-tts-2/text-to-speech',
        name: 'IndexTTS 2',
        type: 'audio',
        provider: 'fal',
        price: 0,
        enabled: true,
      },
      {
        modelId: 'qwen3-tts-vd-2026-01-26',
        modelKey: 'bailian::qwen3-tts-vd-2026-01-26',
        name: 'Qwen3 TTS',
        type: 'audio',
        provider: 'bailian',
        price: 0,
        enabled: true,
      },
      {
        modelId: 'qwen-voice-design',
        modelKey: 'bailian::qwen-voice-design',
        name: 'Qwen Voice Design',
        type: 'audio',
        provider: 'bailian',
        price: 0,
        enabled: true,
      },
      {
        modelId: 'qwen3.5-flash',
        modelKey: 'bailian::qwen3.5-flash',
        name: 'Qwen 3.5 Flash',
        type: 'llm',
        provider: 'bailian',
        price: 0,
        enabled: true,
      },
    ]

    const result = useApiConfigFilters({ providers, models })
    const providerIds = result.modelProviders.map((provider) => provider.id)
    const audioDefaultIds = result.getEnabledModelsByType('audio').map((model) => model.modelId)

    expect(providerIds).toEqual(['fal', 'bailian'])
    expect(audioDefaultIds).toEqual(expect.arrayContaining([
      'fal-ai/index-tts-2/text-to-speech',
      'qwen3-tts-vd-2026-01-26',
    ]))
    expect(audioDefaultIds).not.toContain('qwen-voice-design')
    expect(Object.prototype.hasOwnProperty.call(result, 'audioProviders')).toBe(false)
  })

  it('keeps modelProviders order aligned with providers input order', () => {
    const providers: Provider[] = [
      { id: 'google', name: 'Google AI Studio', hasApiKey: true, apiKey: 'k-google' },
      { id: 'openai-compatible:oa-2', name: 'OpenAI B', hasApiKey: true, apiKey: 'k-oa2' },
      { id: 'ark', name: 'Volcengine Ark', hasApiKey: true, apiKey: 'k-ark' },
    ]
    const models: CustomModel[] = [
      {
        modelId: 'gemini-3.1-pro-preview',
        modelKey: 'google::gemini-3.1-pro-preview',
        name: 'Gemini 3.1 Pro',
        type: 'llm',
        provider: 'google',
        price: 0,
        enabled: true,
      },
      {
        modelId: 'gpt-4.1',
        modelKey: 'openai-compatible:oa-2::gpt-4.1',
        name: 'GPT 4.1',
        type: 'llm',
        provider: 'openai-compatible:oa-2',
        price: 0,
        enabled: true,
      },
      {
        modelId: 'doubao-seed-2-0-pro-260215',
        modelKey: 'ark::doubao-seed-2-0-pro-260215',
        name: 'Doubao Seed 2.0 Pro',
        type: 'llm',
        provider: 'ark',
        price: 0,
        enabled: true,
      },
    ]

    const result = useApiConfigFilters({ providers, models })
    expect(result.modelProviders.map((provider) => provider.id)).toEqual([
      'google',
      'openai-compatible:oa-2',
      'ark',
    ])
  })

  it('excludes failed and disabled creative models from default selectors', () => {
    const providers: Provider[] = [
      { id: 'engine-text', name: 'Text Engine', hasApiKey: true, apiKey: 'k-text' },
      { id: 'engine-voice', name: 'Voice Engine', hasApiKey: true, apiKey: 'k-voice' },
    ]
    const models: CustomModel[] = [
      {
        modelId: 'available-text',
        modelKey: 'engine-text::available-text',
        name: 'Available Text',
        type: 'llm',
        provider: 'engine-text',
        price: 0,
        enabled: true,
        purpose: 'text',
        status: 'available',
      },
      {
        modelId: 'unchecked-text',
        modelKey: 'engine-text::unchecked-text',
        name: 'Unchecked Text',
        type: 'llm',
        provider: 'engine-text',
        price: 0,
        enabled: true,
        purpose: 'text',
        status: 'unchecked',
      },
      {
        modelId: 'failed-text',
        modelKey: 'engine-text::failed-text',
        name: 'Failed Text',
        type: 'llm',
        provider: 'engine-text',
        price: 0,
        enabled: true,
        purpose: 'text',
        status: 'failed',
      },
      {
        modelId: 'disabled-voice-design',
        modelKey: 'engine-voice::disabled-voice-design',
        name: 'Disabled Voice Design',
        type: 'audio',
        provider: 'engine-voice',
        price: 0,
        enabled: true,
        purpose: 'voice-design',
        status: 'disabled',
      },
    ]

    const result = useApiConfigFilters({ providers, models })

    expect(result.getEnabledModelsByType('llm').map((model) => model.modelId)).toEqual([
      'available-text',
      'unchecked-text',
    ])
    expect(result.getEnabledModelsByType('voicedesign').map((model) => model.modelId)).toEqual([])
  })

  it('filters image models by default field purpose', () => {
    const providers: Provider[] = [
      { id: 'engine-image', name: 'Image Engine', hasApiKey: true, apiKey: 'k-image' },
    ]
    const models: CustomModel[] = [
      {
        modelId: 'seedream',
        modelKey: 'engine-image::seedream',
        name: 'Seedream',
        type: 'image',
        provider: 'engine-image',
        price: 0,
        enabled: true,
        purpose: 'image-generation',
        status: 'available',
      },
      {
        modelId: 'gpt-image-edit',
        modelKey: 'engine-image::gpt-image-edit',
        name: 'GPT Image Edit',
        type: 'image',
        provider: 'engine-image',
        price: 0,
        enabled: true,
        purpose: 'image-edit',
        status: 'available',
      },
    ]

    const result = useApiConfigFilters({ providers, models })

    expect(result.getEnabledModelsByType('image', 'characterModel').map((model) => model.modelId)).toEqual(['seedream'])
    expect(result.getEnabledModelsByType('image', 'locationModel').map((model) => model.modelId)).toEqual(['seedream'])
    expect(result.getEnabledModelsByType('image', 'storyboardModel').map((model) => model.modelId)).toEqual(['seedream'])
    expect(result.getEnabledModelsByType('image', 'editModel').map((model) => model.modelId)).toEqual(['gpt-image-edit'])
  })
})
