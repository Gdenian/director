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
})
