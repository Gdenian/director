import { beforeEach, describe, expect, it, vi } from 'vitest'
import { detectCreativeEngine } from '@/lib/user-api/creative-engine-detection/orchestrator'

const inspectCreativeEngineMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/user-api/creative-engine-detection/llm-inspector', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/user-api/creative-engine-detection/llm-inspector')>()
  return {
    ...actual,
    inspectCreativeEngine: inspectCreativeEngineMock,
  }
})

describe('creative engine detection orchestrator', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    inspectCreativeEngineMock.mockReset()
    delete process.env.CREATIVE_ENGINE_INSPECTOR_PROVIDER
    delete process.env.CREATIVE_ENGINE_INSPECTOR_MODEL
    delete process.env.CREATIVE_ENGINE_INSPECTOR_API_KEY
    delete process.env.CREATIVE_ENGINE_INSPECTOR_BASE_URL
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
          { id: 'gpt-image-2' },
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
      expect.objectContaining({ callName: 'gpt-image-2', purpose: 'image-generation' }),
    ])
    expect(result.models.find((model) => model.callName === 'gpt-image-2')?.mediaContract?.testStatus)
      .toEqual({ textToImage: 'unchecked' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses OpenAI-compatible model metadata before name-based classification', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [
        {
          id: 'agnes-1.5-flash',
          modalities: ['text'],
          capabilities: { chat: true },
        },
        {
          id: 'agnes-renderer',
          modalities: ['image'],
          capabilities: { image_generation: true },
        },
        {
          id: 'agnes-motion',
          modalities: ['video'],
          capabilities: { video_generation: true },
        },
      ],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await detectCreativeEngine({
      serviceUrl: 'https://apihub.agnes-ai.com/v1',
      apiKey: 'agnes-key',
      allowKeyInInspector: false,
    })

    expect(result.models).toEqual([
      expect.objectContaining({
        callName: 'agnes-1.5-flash',
        purpose: 'text',
        confidence: 'high',
      }),
      expect.objectContaining({
        callName: 'agnes-renderer',
        purpose: 'image-generation',
        confidence: 'high',
      }),
      expect.objectContaining({
        callName: 'agnes-motion',
        purpose: 'video-generation',
        confidence: 'high',
      }),
    ])
  })

  it('prefers video metadata when a model advertises both video and audio modalities', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [
        {
          id: 'c-dense-2.0-fast',
          modalities: ['video', 'audio'],
          capabilities: { video_generation: true },
        },
      ],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await detectCreativeEngine({
      serviceUrl: 'https://api.example.com/v1',
      apiKey: 'example-key',
      allowKeyInInspector: false,
    })

    expect(result.models).toEqual([
      expect.objectContaining({
        callName: 'c-dense-2.0-fast',
        purpose: 'video-generation',
        confidence: 'high',
      }),
    ])
  })

  it('uses provided API documentation to inspect non-standard video templates even when /models succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [{ id: 'agnes-video-v2.0' }],
    }), { status: 200 })))
    inspectCreativeEngineMock.mockResolvedValueOnce({
      source: 'agnes-docs',
      recommendedProviderKey: 'openai-compatible',
      protocolType: 'openai-compatible',
      normalizedBaseUrl: 'https://apihub.agnes-ai.com/v1',
      confidence: 'high',
      models: [{
        name: 'Agnes Video V2.0',
        callName: 'agnes-video-v2.0',
        purpose: 'video-generation',
        confidence: 'high',
        compatMediaTemplate: {
          version: 1,
          mediaType: 'video',
          mode: 'async',
          create: {
            method: 'POST',
            path: '/videos',
            contentType: 'application/json',
            bodyTemplate: {
              model: '{{model}}',
              prompt: '{{prompt}}',
              image: '{{image}}',
              num_frames: '{{num_frames}}',
              frame_rate: '{{frame_rate}}',
            },
          },
          status: {
            method: 'GET',
            path: 'https://apihub.agnes-ai.com/agnesapi?video_id={{task_id}}',
          },
          response: {
            taskIdPath: '$.video_id',
            statusPath: '$.status',
            outputUrlPath: '$.remixed_from_video_id',
            errorPath: '$.error.message',
          },
          polling: {
            intervalMs: 5000,
            timeoutMs: 600000,
            doneStates: ['completed'],
            failStates: ['failed'],
          },
        },
        compatMediaTemplateSource: 'ai',
        mediaContract: {
          version: 1,
          mediaType: 'video',
          executor: 'openai-compat-template',
          capabilities: ['image-to-video'],
          input: { image: 'publicUrl' },
          output: { kind: 'asyncTask', urlPath: '$.remixed_from_video_id' },
          testStatus: { imageToVideo: 'unchecked' },
          source: 'llm',
        },
        mediaContractSource: 'llm',
      }],
      warnings: ['DOCS_USED'],
      risks: [],
    })

    const documentationText = [
      'POST https://apihub.agnes-ai.com/v1/videos creates an async Agnes video task.',
      'Use Content-Type application/json with image URL fields.',
      'The create response returns video_id.',
      'GET https://apihub.agnes-ai.com/agnesapi?video_id=<VIDEO_ID> returns status and remixed_from_video_id.',
    ].join('\n')

    const result = await detectCreativeEngine({
      serviceUrl: 'https://apihub.agnes-ai.com/v1',
      apiKey: 'agnes-key',
      allowKeyInInspector: false,
      documentationText,
    })

    expect(inspectCreativeEngineMock).toHaveBeenCalledWith(expect.objectContaining({
      serviceUrl: 'https://apihub.agnes-ai.com/v1',
      apiKey: 'agnes-key',
      allowKeyInInspector: false,
      documentationText,
      probeLogs: expect.arrayContaining(['MODEL_LIST_READABLE']),
    }))
    expect(result).toEqual(expect.objectContaining({
      source: 'agnes-docs',
      recommendedProviderKey: 'openai-compatible',
      protocolType: 'openai-compatible',
      normalizedBaseUrl: 'https://apihub.agnes-ai.com/v1',
      confidence: 'high',
      requiresManualModelEntry: false,
      warnings: expect.arrayContaining(['DOCS_USED']),
    }))
    expect(result.models[0]).toMatchObject({
      callName: 'agnes-video-v2.0',
      purpose: 'video-generation',
      compatMediaTemplate: {
        create: {
          contentType: 'application/json',
          bodyTemplate: {
            image: '{{image}}',
          },
        },
        status: {
          path: 'https://apihub.agnes-ai.com/agnesapi?video_id={{task_id}}',
        },
        response: {
          taskIdPath: '$.video_id',
          outputUrlPath: '$.remixed_from_video_id',
        },
      },
      compatMediaTemplateSource: 'ai',
      mediaContract: {
        executor: 'openai-compat-template',
        input: { image: 'publicUrl' },
        testStatus: { imageToVideo: 'unchecked' },
      },
      mediaContractSource: 'llm',
    })
  })

  it('merges documentation-derived media templates without dropping other listed models', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [
        { id: 'agnes-chat-lite', modalities: ['text'] },
        { id: 'agnes-video-v2.0', modalities: ['video'] },
      ],
    }), { status: 200 })))
    inspectCreativeEngineMock.mockResolvedValueOnce({
      source: 'agnes-docs',
      recommendedProviderKey: 'openai-compatible',
      protocolType: 'openai-compatible',
      normalizedBaseUrl: 'https://apihub.agnes-ai.com/v1',
      confidence: 'high',
      models: [{
        name: 'Agnes Video V2.0',
        callName: 'agnes-video-v2.0',
        purpose: 'video-generation',
        confidence: 'high',
        mediaContract: {
          version: 1,
          mediaType: 'video',
          executor: 'openai-compat-template',
          capabilities: ['image-to-video'],
          input: { image: 'publicUrl' },
          output: { kind: 'asyncTask', urlPath: '$.remixed_from_video_id' },
          testStatus: { imageToVideo: 'unchecked' },
          source: 'llm',
        },
        mediaContractSource: 'llm',
      }],
      warnings: ['DOCS_USED'],
      risks: [],
    })

    const result = await detectCreativeEngine({
      serviceUrl: 'https://apihub.agnes-ai.com/v1',
      apiKey: 'agnes-key',
      allowKeyInInspector: false,
      documentationText: 'POST /videos returns video_id and remixed_from_video_id',
    })

    expect(result.models.map((model) => model.callName)).toEqual([
      'agnes-chat-lite',
      'agnes-video-v2.0',
    ])
    expect(result.models.find((model) => model.callName === 'agnes-video-v2.0')).toMatchObject({
      purpose: 'video-generation',
      mediaContract: {
        executor: 'openai-compat-template',
        testStatus: { imageToVideo: 'unchecked' },
      },
      mediaContractSource: 'llm',
    })
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

  it('uses Gemini supported generation methods before name-based classification', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      models: [
        {
          name: 'models/agnes-core',
          supportedGenerationMethods: ['generateContent', 'countTokens'],
        },
        {
          name: 'models/agnes-still',
          supportedGenerationMethods: ['generateImages'],
        },
      ],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await detectCreativeEngine({
      serviceUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'gemini-key',
      allowKeyInInspector: false,
    })

    expect(result.models).toEqual([
      expect.objectContaining({
        callName: 'models/agnes-core',
        purpose: 'text',
        confidence: 'high',
      }),
      expect.objectContaining({
        callName: 'models/agnes-still',
        purpose: 'image-generation',
        confidence: 'high',
      }),
    ])
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

  it('uses the LLM inspector as an env-gated fallback after deterministic probes fail', async () => {
    process.env.CREATIVE_ENGINE_INSPECTOR_PROVIDER = 'openai-compatible'
    process.env.CREATIVE_ENGINE_INSPECTOR_MODEL = 'gpt-5-mini'
    process.env.CREATIVE_ENGINE_INSPECTOR_API_KEY = 'inspector-key'
    process.env.CREATIVE_ENGINE_INSPECTOR_BASE_URL = 'https://inspector.example.com/v1'

    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })))
    inspectCreativeEngineMock.mockResolvedValueOnce({
      source: 'custom-inspected',
      recommendedProviderKey: 'openai-compatible',
      protocolType: 'openai-compatible',
      normalizedBaseUrl: 'https://api.example.com/v1',
      confidence: 'medium',
      models: [{
        name: 'Inspected Model',
        callName: 'vendor/model',
        purpose: 'text',
        confidence: 'medium',
      }],
      warnings: ['INSPECTOR_USED'],
    })

    const result = await detectCreativeEngine({
      serviceUrl: 'https://api.example.com',
      apiKey: 'user-key',
      allowKeyInInspector: false,
    })

    expect(inspectCreativeEngineMock).toHaveBeenCalledWith(expect.objectContaining({
      serviceUrl: 'https://api.example.com',
      apiKey: 'user-key',
      allowKeyInInspector: false,
      probeLogs: expect.arrayContaining(['MODEL_LIST_UNSUPPORTED', 'MODEL_LIST_UNREADABLE']),
    }))
    expect(result).toEqual(expect.objectContaining({
      source: 'custom-inspected',
      recommendedProviderKey: 'openai-compatible',
      protocolType: 'openai-compatible',
      normalizedBaseUrl: 'https://api.example.com/v1',
      confidence: 'medium',
      requiresManualModelEntry: false,
      warnings: expect.arrayContaining(['INSPECTOR_USED']),
    }))
  })

  it('preserves inspector template-backed media contracts instead of replacing them with rule drafts', async () => {
    process.env.CREATIVE_ENGINE_INSPECTOR_PROVIDER = 'openai-compatible'
    process.env.CREATIVE_ENGINE_INSPECTOR_MODEL = 'gpt-5-mini'
    process.env.CREATIVE_ENGINE_INSPECTOR_API_KEY = 'inspector-key'
    process.env.CREATIVE_ENGINE_INSPECTOR_BASE_URL = 'https://inspector.example.com/v1'

    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })))
    inspectCreativeEngineMock.mockResolvedValueOnce({
      source: 'custom-template',
      recommendedProviderKey: 'openai-compatible',
      protocolType: 'openai-compatible',
      normalizedBaseUrl: 'https://api.example.com/v1',
      confidence: 'medium',
      models: [{
        name: 'Template Video',
        callName: 'vendor/video',
        purpose: 'video-generation',
        confidence: 'medium',
        compatMediaTemplate: {
          version: 1,
          mediaType: 'video',
          mode: 'async',
          create: {
            method: 'POST',
            path: '/videos',
            contentType: 'application/json',
            bodyTemplate: { model: '{{model}}', prompt: '{{prompt}}' },
          },
          status: { method: 'GET', path: '/tasks/{{task_id}}' },
          response: {
            taskIdPath: '$.id',
            statusPath: '$.status',
            outputUrlPath: '$.video.url',
          },
          polling: {
            intervalMs: 1000,
            timeoutMs: 120000,
            doneStates: ['succeeded'],
            failStates: ['failed'],
          },
        },
        compatMediaTemplateSource: 'ai',
        mediaContract: {
          version: 1,
          mediaType: 'video',
          executor: 'openai-compat-template',
          capabilities: ['image-to-video'],
          input: { image: 'publicUrl' },
          output: { kind: 'asyncTask', urlPath: '$.video.url' },
          testStatus: { imageToVideo: 'unchecked' },
          source: 'llm',
        },
        mediaContractSource: 'llm',
      }],
      warnings: ['INSPECTOR_USED'],
    })

    const result = await detectCreativeEngine({
      serviceUrl: 'https://api.example.com',
      apiKey: 'user-key',
      allowKeyInInspector: false,
    })

    expect(result.models[0]).toMatchObject({
      callName: 'vendor/video',
      compatMediaTemplateSource: 'ai',
      mediaContractSource: 'llm',
      mediaContract: {
        executor: 'openai-compat-template',
        source: 'llm',
      },
    })
  })

  it('drops inspector media fields from non-media models during orchestration', async () => {
    process.env.CREATIVE_ENGINE_INSPECTOR_PROVIDER = 'openai-compatible'
    process.env.CREATIVE_ENGINE_INSPECTOR_MODEL = 'gpt-5-mini'
    process.env.CREATIVE_ENGINE_INSPECTOR_API_KEY = 'inspector-key'
    process.env.CREATIVE_ENGINE_INSPECTOR_BASE_URL = 'https://inspector.example.com/v1'

    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })))
    inspectCreativeEngineMock.mockResolvedValueOnce({
      source: 'custom-template',
      recommendedProviderKey: 'openai-compatible',
      protocolType: 'openai-compatible',
      normalizedBaseUrl: 'https://api.example.com/v1',
      confidence: 'medium',
      models: [{
        name: 'Text With Bad Media Fields',
        callName: 'vendor/text',
        purpose: 'text',
        confidence: 'medium',
        compatMediaTemplate: {
          version: 1,
          mediaType: 'video',
          mode: 'async',
          create: {
            method: 'POST',
            path: '/videos',
            contentType: 'application/json',
            bodyTemplate: { model: '{{model}}', prompt: '{{prompt}}' },
          },
          status: { method: 'GET', path: '/tasks/{{task_id}}' },
          response: {
            taskIdPath: '$.id',
            statusPath: '$.status',
            outputUrlPath: '$.video.url',
          },
          polling: {
            intervalMs: 1000,
            timeoutMs: 120000,
            doneStates: ['succeeded'],
            failStates: ['failed'],
          },
        },
        compatMediaTemplateSource: 'ai',
        mediaContract: {
          version: 1,
          mediaType: 'video',
          executor: 'openai-compat-template',
          capabilities: ['image-to-video'],
          input: { image: 'publicUrl' },
          output: { kind: 'asyncTask', urlPath: '$.video.url' },
          testStatus: { imageToVideo: 'unchecked' },
          source: 'llm',
        },
        mediaContractSource: 'llm',
      }],
      warnings: ['INSPECTOR_USED'],
    })

    const result = await detectCreativeEngine({
      serviceUrl: 'https://api.example.com',
      apiKey: 'user-key',
      allowKeyInInspector: false,
    })

    expect(result.models[0]).toMatchObject({
      callName: 'vendor/text',
      purpose: 'text',
    })
    expect(result.models[0]?.mediaContract).toBeUndefined()
    expect(result.models[0]?.mediaContractSource).toBeUndefined()
    expect(result.models[0]?.compatMediaTemplate).toBeUndefined()
    expect(result.models[0]?.compatMediaTemplateSource).toBeUndefined()
  })

  it('keeps manual-template inspector results in manual configuration mode', async () => {
    process.env.CREATIVE_ENGINE_INSPECTOR_PROVIDER = 'openai-compatible'
    process.env.CREATIVE_ENGINE_INSPECTOR_MODEL = 'gpt-5-mini'
    process.env.CREATIVE_ENGINE_INSPECTOR_API_KEY = 'inspector-key'
    process.env.CREATIVE_ENGINE_INSPECTOR_BASE_URL = 'https://inspector.example.com/v1'

    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })))
    inspectCreativeEngineMock.mockResolvedValueOnce({
      source: 'custom-template',
      recommendedProviderKey: 'openai-compatible',
      protocolType: 'manual-template',
      normalizedBaseUrl: 'https://api.example.com/v1',
      confidence: 'low',
      models: [{
        name: 'Draft model',
        callName: 'draft/model',
        purpose: 'unknown',
        confidence: 'low',
      }],
      warnings: ['INSPECTOR_USED'],
    })

    const result = await detectCreativeEngine({
      serviceUrl: 'https://api.example.com',
      apiKey: 'user-key',
      allowKeyInInspector: true,
    })

    expect(result).toEqual(expect.objectContaining({
      protocolType: 'manual-template',
      requiresManualModelEntry: true,
    }))
  })

  it('falls back to manual configuration when the LLM inspector is unavailable', async () => {
    process.env.CREATIVE_ENGINE_INSPECTOR_PROVIDER = 'openai-compatible'
    process.env.CREATIVE_ENGINE_INSPECTOR_MODEL = 'gpt-5-mini'
    process.env.CREATIVE_ENGINE_INSPECTOR_API_KEY = 'inspector-key'
    process.env.CREATIVE_ENGINE_INSPECTOR_BASE_URL = 'https://inspector.example.com/v1'

    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })))
    inspectCreativeEngineMock.mockRejectedValueOnce(new Error('inspector unavailable'))

    const result = await detectCreativeEngine({
      serviceUrl: 'https://api.example.com/v1',
      apiKey: 'user-key',
      allowKeyInInspector: true,
    })

    expect(result).toEqual(expect.objectContaining({
      source: 'custom-openai-compatible',
      recommendedProviderKey: 'openai-compatible',
      protocolType: 'openai-compatible',
      confidence: 'low',
      failureCategory: 'interface-unsupported',
      requiresManualModelEntry: true,
      warnings: expect.arrayContaining(['MODEL_LIST_UNREADABLE', 'INSPECTOR_UNAVAILABLE']),
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
