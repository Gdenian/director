import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runMediaContractTest } from '@/lib/user-api/media-contract-test/runner'
import type { MediaContract } from '@/lib/media-contract/types'
import type { OpenAICompatMediaTemplate } from '@/lib/openai-compat-media-template'

const fetchMock = vi.fn()

vi.stubGlobal('fetch', fetchMock)

describe('media contract test runner', () => {
  const mediaContract: MediaContract = {
    version: 1,
    mediaType: 'image',
    executor: 'openai-compat-template',
    capabilities: ['text-to-image'],
    input: {},
    output: {
      kind: 'url',
      urlPath: '$.data[0].url',
    },
  }

  const compatMediaTemplate: OpenAICompatMediaTemplate = {
    version: 1,
    mediaType: 'image',
    mode: 'sync',
    create: {
      method: 'POST',
      path: '/images/generations',
      contentType: 'application/json',
      bodyTemplate: {
        model: '{{model}}',
        prompt: '{{prompt}}',
      },
    },
    response: {
      outputUrlPath: '$.data[0].url',
      errorPath: '$.error.message',
    },
  }

  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('renders an openai-compatible request and extracts downloadable output url', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ url: 'https://cdn.test/image.png' }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))

    const result = await runMediaContractTest({
      provider: {
        id: 'openai-compatible:relay',
        baseUrl: 'https://api.aisenyu.test/v1',
        apiKey: 'sk-secret-value',
      },
      model: {
        modelKey: 'openai-compatible:relay::gpt-image-2',
        modelId: 'gpt-image-2',
        mediaType: 'image',
        mediaContract,
        compatMediaTemplate,
      },
      capability: 'text-to-image',
      sample: {
        prompt: '生成一张简单测试图',
      },
      limits: { fetchTimeoutMs: 0 },
    })

    expect(result.status).toBe('passed')
    expect(result.preview).toMatchObject({
      method: 'POST',
      endpointUrl: 'https://api.aisenyu.test/v1/images/generations',
      contentType: 'application/json',
    })
    expect(result.output).toMatchObject({ url: 'https://cdn.test/image.png' })
    expect(JSON.stringify(result)).not.toContain('sk-secret-value')
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://api.aisenyu.test/v1/images/generations', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer sk-secret-value',
      }),
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://cdn.test/image.png', expect.objectContaining({
      method: 'HEAD',
    }))
  })

  it('rejects capabilities not listed by the selected media contract', async () => {
    const result = await runMediaContractTest({
      provider: {
        id: 'openai-compatible:relay',
        baseUrl: 'https://api.aisenyu.test/v1',
        apiKey: 'sk-secret-value',
      },
      model: {
        modelKey: 'openai-compatible:relay::gpt-image-2',
        modelId: 'gpt-image-2',
        mediaType: 'image',
        mediaContract,
        compatMediaTemplate,
      },
      capability: 'image-to-video',
      sample: { prompt: '生成一张简单测试图' },
      limits: { fetchTimeoutMs: 0 },
    })

    expect(result.status).toBe('failed')
    expect(result.diagnostic).toMatchObject({ code: 'MEDIA_TEST_REQUEST_SCHEMA_MISMATCH' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects malformed provider base url before fetching', async () => {
    const result = await runMediaContractTest({
      provider: {
        id: 'openai-compatible:relay',
        baseUrl: 'not a url',
        apiKey: 'sk-secret-value',
      },
      model: {
        modelKey: 'openai-compatible:relay::gpt-image-2',
        modelId: 'gpt-image-2',
        mediaType: 'image',
        mediaContract,
        compatMediaTemplate,
      },
      capability: 'text-to-image',
      sample: { prompt: '生成一张简单测试图' },
      limits: { fetchTimeoutMs: 0 },
    })

    expect(result.status).toBe('failed')
    expect(result.diagnostic).toMatchObject({ code: 'MEDIA_TEST_BASE_URL_ERROR' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('redacts secret query params and sk values from preview endpoint url', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ url: 'https://cdn.test/image.png' }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))

    const result = await runMediaContractTest({
      provider: {
        id: 'openai-compatible:relay',
        baseUrl: 'https://api.aisenyu.test/v1',
        apiKey: 'sk-secret-value',
      },
      model: {
        modelKey: 'openai-compatible:relay::gpt-image-2',
        modelId: 'gpt-image-2',
        mediaType: 'image',
        mediaContract,
        compatMediaTemplate: {
          ...compatMediaTemplate,
          create: {
            ...compatMediaTemplate.create,
            path: '/images/generations?api_key=plain-api-key&token=sk-token-secret&ok=1',
          },
        },
      },
      capability: 'text-to-image',
      sample: { prompt: '生成一张简单测试图' },
      limits: { fetchTimeoutMs: 0 },
    })

    expect(result.preview?.endpointUrl).toBe('https://api.aisenyu.test/v1/images/generations?api_key=%5BREDACTED%5D&token=%5BREDACTED%5D&ok=1')
    expect(JSON.stringify(result.preview)).not.toContain('plain-api-key')
    expect(JSON.stringify(result.preview)).not.toContain('sk-token-secret')
  })

  it('accepts output url when head fails but range get succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ url: 'https://cdn.test/image.png' }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 501 }))
      .mockResolvedValueOnce(new Response('', { status: 206 }))

    const result = await runMediaContractTest({
      provider: {
        id: 'openai-compatible:relay',
        baseUrl: 'https://api.aisenyu.test/v1',
        apiKey: 'sk-secret-value',
      },
      model: {
        modelKey: 'openai-compatible:relay::gpt-image-2',
        modelId: 'gpt-image-2',
        mediaType: 'image',
        mediaContract,
        compatMediaTemplate,
      },
      capability: 'text-to-image',
      sample: { prompt: '生成一张简单测试图' },
      limits: { fetchTimeoutMs: 0 },
    })

    expect(result.status).toBe('passed')
    expect(result.output).toMatchObject({ url: 'https://cdn.test/image.png' })
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://cdn.test/image.png', expect.objectContaining({
      method: 'HEAD',
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'https://cdn.test/image.png', expect.objectContaining({
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
    }))
  })

  it('includes multipart content type in preview without sending content-type header', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ url: 'https://cdn.test/image.png' }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))

    const result = await runMediaContractTest({
      provider: {
        id: 'openai-compatible:relay',
        baseUrl: 'https://api.aisenyu.test/v1',
        apiKey: 'sk-secret-value',
      },
      model: {
        modelKey: 'openai-compatible:relay::gpt-image-2',
        modelId: 'gpt-image-2',
        mediaType: 'image',
        mediaContract,
        compatMediaTemplate: {
          ...compatMediaTemplate,
          create: {
            method: 'POST',
            path: '/images/edits',
            contentType: 'multipart/form-data',
            bodyTemplate: {
              model: '{{model}}',
              prompt: '{{prompt}}',
              image: '{{image}}',
            },
            multipartFileFields: ['image'],
          },
        },
      },
      capability: 'text-to-image',
      sample: {
        prompt: '生成一张简单测试图',
        image: 'data:image/png;base64,aGVsbG8=',
      },
      limits: { fetchTimeoutMs: 0 },
    })

    expect(result.status).toBe('passed')
    expect(result.preview).toMatchObject({
      method: 'POST',
      endpointUrl: 'https://api.aisenyu.test/v1/images/edits',
      contentType: 'multipart/form-data',
      bodyPreview: '[multipart/form-data]',
    })
    const createCall = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(createCall.headers).not.toHaveProperty('Content-Type')
  })

  it('caps async polling timeout and interval for media tests', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'task-1' }), { status: 200 }))
      .mockImplementation(async () => new Response(JSON.stringify({ status: 'running' }), { status: 200 }))

    const resultPromise = runMediaContractTest({
      provider: {
        id: 'openai-compatible:relay',
        baseUrl: 'https://api.aisenyu.test/v1',
        apiKey: 'sk-secret-value',
      },
      model: {
        modelKey: 'openai-compatible:relay::video-1',
        modelId: 'video-1',
        mediaType: 'video',
        mediaContract: {
          version: 1,
          mediaType: 'video',
          executor: 'openai-compat-template',
          capabilities: ['text-to-video'],
          input: {},
          output: {
            kind: 'asyncTask',
            urlPath: '$.url',
          },
        },
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
            },
          },
          status: {
            method: 'GET',
            path: '/videos/{{task_id}}',
          },
          response: {
            taskIdPath: '$.id',
            statusPath: '$.status',
            outputUrlPath: '$.url',
          },
          polling: {
            intervalMs: 600_000,
            timeoutMs: 600_000,
            doneStates: ['done'],
            failStates: ['failed'],
          },
        },
      },
      capability: 'text-to-video',
      sample: { prompt: '生成一段简单测试视频' },
      limits: {
        maxPollTimeoutMs: 1,
        maxPollIntervalMs: 1,
        fetchTimeoutMs: 0,
      },
    })
    const result = await resultPromise

    expect(result).toMatchObject({
      status: 'failed',
      diagnostic: { code: 'MEDIA_TEST_PROVIDER_TIMEOUT' },
    })
  })

  it('clamps non-positive async polling interval before scheduling another poll', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'task-1' }), { status: 200 }))
      .mockResolvedValue(new Response(JSON.stringify({ status: 'running' }), { status: 200 }))

    let scheduledDelayMs: number | undefined
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler, timeout?: number) => {
      void handler
      scheduledDelayMs = Number(timeout ?? 0)
      throw new Error('stop after first polling delay')
    }) as unknown as typeof setTimeout)

    try {
      await runMediaContractTest({
        provider: {
          id: 'openai-compatible:relay',
          baseUrl: 'https://api.aisenyu.test/v1',
          apiKey: 'sk-secret-value',
        },
        model: {
          modelKey: 'openai-compatible:relay::video-1',
          modelId: 'video-1',
          mediaType: 'video',
          mediaContract: {
            version: 1,
            mediaType: 'video',
            executor: 'openai-compat-template',
            capabilities: ['text-to-video'],
            input: {},
            output: {
              kind: 'asyncTask',
              urlPath: '$.url',
            },
          },
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
              },
            },
            status: {
              method: 'GET',
              path: '/videos/{{task_id}}',
            },
            response: {
              taskIdPath: '$.id',
              statusPath: '$.status',
              outputUrlPath: '$.url',
            },
            polling: {
              intervalMs: 0,
              timeoutMs: 600_000,
              doneStates: ['done'],
              failStates: ['failed'],
            },
          },
        },
        capability: 'text-to-video',
        sample: { prompt: '生成一段简单测试视频' },
        limits: {
          maxPollTimeoutMs: 600_000,
          maxPollIntervalMs: 1_000,
          fetchTimeoutMs: 0,
        },
      })
    } finally {
      setTimeoutSpy.mockRestore()
    }

    expect(scheduledDelayMs).toBeGreaterThanOrEqual(250)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
