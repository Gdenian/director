import { beforeEach, describe, expect, it, vi } from 'vitest'
import { detectCreativeEngine } from '@/lib/user-api/creative-engine-detection/orchestrator'

describe('creative engine detection orchestrator', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('detects OpenAI-compatible services through the free models endpoint first', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://openrouter.ai/api/v1/models')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toEqual(expect.objectContaining({
        Authorization: 'Bearer key-openrouter',
      }))
      return new Response(JSON.stringify({
        data: [
          { id: 'openai/gpt-4.1-mini' },
          { id: 'black-forest-labs/flux-1.1-pro' },
        ],
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await detectCreativeEngine({
      serviceUrl: 'https://openrouter.ai',
      apiKey: 'key-openrouter',
      allowKeyInInspector: true,
    })

    expect(result).toEqual(expect.objectContaining({
      source: 'openrouter',
      recommendedProviderKey: 'openrouter',
      protocolType: 'openai-compatible',
      normalizedBaseUrl: 'https://openrouter.ai/api/v1',
      confidence: 'high',
      requiresManualModelEntry: false,
    }))
    expect(result.models).toEqual([
      expect.objectContaining({ callName: 'openai/gpt-4.1-mini', purpose: 'text' }),
      expect.objectContaining({ callName: 'black-forest-labs/flux-1.1-pro', purpose: 'image-generation' }),
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls through to Gemini-compatible model listing without generation calls', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models?key=gemini-key')
      return new Response(JSON.stringify({
        models: [
          { name: 'models/gemini-2.5-pro' },
          { name: 'models/veo-3.1-generate-preview' },
        ],
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await detectCreativeEngine({
      serviceUrl: 'https://aistudio.google.com',
      apiKey: 'gemini-key',
      allowKeyInInspector: false,
    })

    expect(result).toEqual(expect.objectContaining({
      source: 'google-ai-studio',
      recommendedProviderKey: 'google',
      protocolType: 'gemini-compatible',
      normalizedBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      confidence: 'high',
      requiresManualModelEntry: false,
    }))
    expect(result.models.map((model) => model.callName)).toEqual([
      'models/gemini-2.5-pro',
      'models/veo-3.1-generate-preview',
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns a manual fallback when model lists are unreadable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })))

    const result = await detectCreativeEngine({
      serviceUrl: 'https://api.example.com/v1',
      apiKey: 'example-key',
      allowKeyInInspector: true,
    })

    expect(result).toEqual(expect.objectContaining({
      source: 'custom-openai-compatible',
      recommendedProviderKey: 'openai-compatible',
      protocolType: 'openai-compatible',
      normalizedBaseUrl: 'https://api.example.com/v1',
      confidence: 'low',
      models: [],
      warnings: expect.arrayContaining(['MODEL_LIST_UNSUPPORTED', 'MODEL_LIST_UNREADABLE']),
      risks: ['这个服务没有开放模型列表接口。你仍然可以手动添加模型调用名。'],
      failureCategory: 'interface-unsupported',
      requiresManualModelEntry: true,
    }))
  })

  it('maps authentication failures to key-invalid manual fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unauthorized', { status: 401 })))

    const result = await detectCreativeEngine({
      serviceUrl: 'https://api.example.com/v1',
      apiKey: 'bad-key',
      allowKeyInInspector: true,
    })

    expect(result.failureCategory).toBe('key-invalid')
    expect(result.requiresManualModelEntry).toBe(true)
  })

  it('keeps key failures ahead of unsupported alternate OpenAI candidates', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://api.example.com/models') {
        return new Response('unauthorized', { status: 401 })
      }
      return new Response('not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await detectCreativeEngine({
      serviceUrl: 'https://api.example.com',
      apiKey: 'bad-key',
      allowKeyInInspector: true,
    })

    expect(result.failureCategory).toBe('key-invalid')
    expect(result.warnings).toEqual(expect.arrayContaining(['MODEL_LIST_UNSUPPORTED']))
    expect(result.requiresManualModelEntry).toBe(true)
  })

  it('keeps Gemini authentication failures when OpenAI probe has no applicable candidates', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unauthorized', { status: 401 })))

    const result = await detectCreativeEngine({
      serviceUrl: 'https://aistudio.google.com',
      apiKey: 'bad-gemini-key',
      allowKeyInInspector: true,
    })

    expect(result).toEqual(expect.objectContaining({
      source: 'google-ai-studio',
      protocolType: 'gemini-compatible',
      failureCategory: 'key-invalid',
      requiresManualModelEntry: true,
    }))
  })

  it('keeps official OpenAI protocol when the free model-list probe succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [{ id: 'gpt-4.1' }],
    }), { status: 200 })))

    const result = await detectCreativeEngine({
      serviceUrl: 'https://api.openai.com',
      apiKey: 'openai-key',
      allowKeyInInspector: true,
    })

    expect(result).toEqual(expect.objectContaining({
      source: 'openai',
      recommendedProviderKey: 'openai',
      protocolType: 'official',
      normalizedBaseUrl: 'https://api.openai.com/v1',
    }))
  })

  it('falls through to official free probes for known official providers', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://api.fal.ai/v1/models?limit=1') {
        expect(init?.headers).toEqual(expect.objectContaining({
          Authorization: 'Key fal-key',
        }))
        return new Response(JSON.stringify({
          models: [{ endpoint_id: 'fal-ai/veo3.1/fast/image-to-video' }],
        }), { status: 200 })
      }
      return new Response('not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await detectCreativeEngine({
      serviceUrl: 'https://queue.fal.run',
      apiKey: 'fal-key',
      allowKeyInInspector: true,
    })

    expect(result).toEqual(expect.objectContaining({
      source: 'fal',
      recommendedProviderKey: 'fal',
      protocolType: 'official',
      normalizedBaseUrl: 'https://queue.fal.run',
      confidence: 'high',
      requiresManualModelEntry: false,
    }))
    expect(result.models).toEqual([
      expect.objectContaining({
        callName: 'fal-ai/veo3.1/fast/image-to-video',
        purpose: 'video-generation',
      }),
    ])
    expect(fetchMock).toHaveBeenCalledWith('https://api.fal.ai/v1/models?limit=1', expect.any(Object))
  })

  it('prefers official provider failures over generic compatible probe failures', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://api.fal.ai/v1/models?limit=1') {
        return new Response('unauthorized', { status: 401 })
      }
      return new Response('not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await detectCreativeEngine({
      serviceUrl: 'https://queue.fal.run',
      apiKey: 'bad-fal-key',
      allowKeyInInspector: true,
    })

    expect(result).toEqual(expect.objectContaining({
      source: 'fal',
      recommendedProviderKey: 'fal',
      protocolType: 'official',
      failureCategory: 'key-invalid',
      requiresManualModelEntry: true,
    }))
  })

  it('keeps official unsupported failures ahead of generic probe rate limits for official providers', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://api.fal.ai/v1/models?limit=1') {
        return new Response('not found', { status: 404 })
      }
      return new Response('rate limited', { status: 429 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await detectCreativeEngine({
      serviceUrl: 'https://queue.fal.run',
      apiKey: 'fal-key',
      allowKeyInInspector: true,
    })

    expect(result).toEqual(expect.objectContaining({
      source: 'fal',
      recommendedProviderKey: 'fal',
      protocolType: 'official',
      failureCategory: 'interface-unsupported',
      requiresManualModelEntry: true,
    }))
  })

  it('uses abortable model-list probes so slow services return manual fallback', async () => {
    const abortController = new AbortController()
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(abortController.signal)
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      setTimeout(() => resolve(new Response('{}', { status: 200 })), 60_000)
    })))

    const detection = detectCreativeEngine({
      serviceUrl: 'https://api.example.com/v1',
      apiKey: 'slow-key',
      allowKeyInInspector: true,
    })

    abortController.abort()
    const result = await detection

    expect(timeoutSpy).toHaveBeenCalledWith(15_000)
    expect(result.failureCategory).toBe('service-unreachable')
    expect(result.requiresManualModelEntry).toBe(true)
  })
})
