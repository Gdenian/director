import type { PrepareMediaInputsResult } from '@/lib/media-contract/input-preparation'
import type { MediaContract } from '@/lib/media-contract/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveConfigMock = vi.hoisted(() => vi.fn(async () => ({
  providerId: 'openai-compatible:test-provider',
  baseUrl: 'https://compat.example.com/v1',
  apiKey: 'sk-test',
})))

const prepareMediaInputsMock = vi.hoisted(() => vi.fn(async (): Promise<PrepareMediaInputsResult> => ({
  ok: true,
  values: {
    image: 'https://signed.test/source.png',
    images: ['https://signed.test/source.png'],
  },
  diagnostics: [],
})))

vi.mock('@/lib/model-gateway/openai-compat/common', () => ({
  resolveOpenAICompatClientConfig: resolveConfigMock,
}))

vi.mock('@/lib/media-contract/input-preparation', () => ({
  prepareMediaInputs: prepareMediaInputsMock,
}))

import { generateVideoViaOpenAICompatTemplate } from '@/lib/model-gateway/openai-compat/template-video'

const imageToVideoContract: MediaContract = {
  version: 1,
  mediaType: 'video',
  executor: 'openai-compat-template',
  capabilities: ['image-to-video'],
  input: { image: 'publicUrl' },
  output: { kind: 'asyncTask', urlPath: '$.remixed_from_video_id' },
  testStatus: { imageToVideo: 'passed' },
}

describe('openai-compat template video media contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders prepared public URL image and returns Agnes async task id', async () => {
    let fetchBody: BodyInit | null | undefined
    globalThis.fetch = vi.fn(async (_url, init) => {
      fetchBody = init?.body
      return new Response(JSON.stringify({
        video_id: 'vid_123',
        status: 'pending',
      }), { status: 200 })
    }) as unknown as typeof fetch

    const result = await generateVideoViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'openai-compatible:test-provider',
      modelId: 'agnes-video-v2',
      modelKey: 'openai-compatible:test-provider::agnes-video-v2',
      imageUrl: 'asset://source.png',
      prompt: 'animate',
      options: {
        num_frames: 81,
        frame_rate: 16,
      },
      profile: 'openai-compatible',
      template: {
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
        status: { method: 'GET', path: '/agnesapi?video_id={{task_id}}' },
        response: {
          taskIdPath: '$.video_id',
          statusPath: '$.status',
          outputUrlPath: '$.remixed_from_video_id',
        },
        polling: {
          intervalMs: 5000,
          timeoutMs: 600000,
          doneStates: ['completed', 'succeeded'],
          failStates: ['failed'],
        },
      },
      mediaContract: imageToVideoContract,
    } as Parameters<typeof generateVideoViaOpenAICompatTemplate>[0])

    expect(prepareMediaInputsMock).toHaveBeenCalledWith({
      capability: 'image-to-video',
      contract: imageToVideoContract,
      image: 'asset://source.png',
      images: ['asset://source.png'],
      lastFrameImage: undefined,
    })
    expect(JSON.parse(String(fetchBody))).toMatchObject({
      model: 'agnes-video-v2',
      prompt: 'animate',
      image: 'https://signed.test/source.png',
      num_frames: 81,
      frame_rate: 16,
    })
    expect(result).toMatchObject({
      success: true,
      async: true,
      requestId: 'vid_123',
    })
  })

  it('throws the media preparation diagnostic code without video format wrapping', async () => {
    prepareMediaInputsMock.mockResolvedValueOnce({
      ok: false,
      values: {},
      diagnostics: [{
        code: 'MEDIA_INPUT_PUBLIC_URL_REQUIRED',
        field: 'image',
        message: 'public url required',
      }],
    })

    await expect(generateVideoViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'openai-compatible:test-provider',
      modelId: 'agnes-video-v2',
      modelKey: 'openai-compatible:test-provider::agnes-video-v2',
      imageUrl: 'asset://source.png',
      prompt: 'animate',
      profile: 'openai-compatible',
      template: {
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
          },
        },
        status: { method: 'GET', path: '/agnesapi?video_id={{task_id}}' },
        response: {
          taskIdPath: '$.video_id',
          statusPath: '$.status',
        },
        polling: {
          intervalMs: 5000,
          timeoutMs: 600000,
          doneStates: ['completed', 'succeeded'],
          failStates: ['failed'],
        },
      },
      mediaContract: imageToVideoContract,
    })).rejects.toThrow('MEDIA_INPUT_PREPARATION_FAILED: MEDIA_INPUT_PUBLIC_URL_REQUIRED')
  })
})
