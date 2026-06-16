import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveConfigMock = vi.hoisted(() => vi.fn(async () => ({
  providerId: 'openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0',
  baseUrl: 'https://compat.example.com/v1',
  apiKey: 'sk-test',
})))

vi.mock('@/lib/model-gateway/openai-compat/common', () => ({
  resolveOpenAICompatClientConfig: resolveConfigMock,
}))

import { generateVideoViaOpenAICompatTemplate } from '@/lib/model-gateway/openai-compat/template-video'

describe('openai-compat template video externalId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('encodes compact modelId token for OCOMPAT externalId', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      id: 'veo3.1-fast:1772734762-6TuDIS8Vvr',
      status: 'pending',
    }), { status: 200 })) as unknown as typeof fetch

    const result = await generateVideoViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0',
      modelId: 'veo3.1-fast',
      modelKey: 'openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0::veo3.1-fast',
      imageUrl: 'https://example.com/seed.png',
      prompt: 'animate this image',
      profile: 'openai-compatible',
      template: {
        version: 1,
        mediaType: 'video',
        mode: 'async',
        create: {
          method: 'POST',
          path: '/video/create',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
          },
        },
        status: {
          method: 'GET',
          path: '/video/query?id={{task_id}}',
        },
        response: {
          taskIdPath: '$.id',
          statusPath: '$.status',
        },
        polling: {
          intervalMs: 5000,
          timeoutMs: 600000,
          doneStates: ['completed'],
          failStates: ['failed'],
        },
      },
    })

    expect(result.success).toBe(true)
    expect(result.async).toBe(true)
    expect(result.externalId).toContain(':u_33331fb0-2806-4da6-85ff-cd2433b587d0:')
    expect(result.externalId).toContain(`:${Buffer.from('veo3.1-fast', 'utf8').toString('base64url')}:`)
    expect(result.externalId).not.toContain(Buffer.from('openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0::veo3.1-fast', 'utf8').toString('base64url'))
    expect(result.externalId!.length).toBeLessThanOrEqual(128)
  })

  it('renders existing template variables when no mediaContract is supplied', async () => {
    let requestBody: BodyInit | null | undefined
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      requestBody = init?.body
      return new Response(JSON.stringify({
        video_url: 'https://cdn.test/video.mp4',
      }), { status: 200 })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await generateVideoViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0',
      modelId: 'veo3.1-fast',
      modelKey: 'openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0::veo3.1-fast',
      imageUrl: 'data:image/png;base64,RAW_IMAGE',
      prompt: 'animate this image',
      options: {
        duration: 6,
        aspectRatio: '16:9',
        resolution: '720p',
        lastFrameImageUrl: 'data:image/png;base64,LAST_FRAME',
      },
      profile: 'openai-compatible',
      template: {
        version: 1,
        mediaType: 'video',
        mode: 'sync',
        create: {
          method: 'POST',
          path: '/video/create',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
            image: '{{image}}',
            images: '{{images}}',
            duration: '{{duration}}',
            aspect_ratio: '{{aspect_ratio}}',
            resolution: '{{resolution}}',
            last_frame_image: '{{last_frame_image}}',
          },
        },
        response: {
          outputUrlPath: '$.video_url',
        },
      },
    })

    expect(result).toEqual({ success: true, videoUrl: 'https://cdn.test/video.mp4' })
    expect(JSON.parse(String(requestBody))).toEqual({
      model: 'veo3.1-fast',
      prompt: 'animate this image',
      image: 'data:image/png;base64,RAW_IMAGE',
      images: ['data:image/png;base64,RAW_IMAGE'],
      duration: 6,
      aspect_ratio: '16:9',
      resolution: '720p',
      last_frame_image: 'data:image/png;base64,LAST_FRAME',
    })
  })
})
