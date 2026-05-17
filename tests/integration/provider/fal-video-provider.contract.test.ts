import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startScenarioServer } from '../../helpers/fakes/scenario-server'

const getProviderConfigMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'fal',
  name: 'fal',
  apiKey: 'fal-key',
  gatewayRoute: 'official' as const,
})))

vi.mock('@/lib/user-api/runtime-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

import { executeFalVideoGeneration } from '@/lib/ai-providers/fal/video'

describe('provider contract - fal video', () => {
  let server: Awaited<ReturnType<typeof startScenarioServer>> | null = null

  beforeEach(async () => {
    vi.clearAllMocks()
    server = await startScenarioServer()
    process.env.FAL_QUEUE_BASE_URL = `${server.baseUrl}/fal`
  })

  afterEach(async () => {
    delete process.env.FAL_QUEUE_BASE_URL
    await server?.close()
    server = null
  })

  it('submits Happy Horse image-to-video payload to the documented fal endpoint', async () => {
    server!.defineScenario({
      method: 'POST',
      path: '/fal/alibaba/happy-horse/image-to-video',
      mode: 'success',
      submitResponse: {
        status: 200,
        body: { request_id: 'req_happy_horse_1' },
      },
    })

    const result = await executeFalVideoGeneration({
      userId: 'user-1',
      selection: {
        provider: 'fal',
        modelId: 'alibaba/happy-horse/image-to-video',
        modelKey: 'fal::alibaba/happy-horse/image-to-video',
        variantSubKind: 'official',
      },
      imageUrl: 'https://example.com/frame.png',
      options: {
        prompt: 'Bring the scene to life with natural motion and sound.',
        resolution: '1080p',
        duration: 5,
        aspectRatio: '16:9',
      },
    })

    expect(result).toMatchObject({
      success: true,
      async: true,
      requestId: 'req_happy_horse_1',
      endpoint: 'alibaba/happy-horse/image-to-video',
      externalId: 'FAL:VIDEO:alibaba/happy-horse/image-to-video:req_happy_horse_1',
    })

    const requests = server!.getRequests('POST', '/fal/alibaba/happy-horse/image-to-video')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.headers.authorization).toBe('Key fal-key')
    expect(JSON.parse(requests[0]?.bodyText || '{}')).toEqual({
      image_url: 'https://example.com/frame.png',
      prompt: 'Bring the scene to life with natural motion and sound.',
      resolution: '1080p',
      duration: 5,
    })
  })

  it('submits Seedance 2.0 single-image requests to image-to-video', async () => {
    server!.defineScenario({
      method: 'POST',
      path: '/fal/bytedance/seedance-2.0/image-to-video',
      mode: 'success',
      submitResponse: {
        status: 200,
        body: { request_id: 'req_seedance_i2v_1' },
      },
    })

    const result = await executeFalVideoGeneration({
      userId: 'user-1',
      selection: {
        provider: 'fal',
        modelId: 'bytedance/seedance-2.0',
        modelKey: 'fal::bytedance/seedance-2.0',
        variantSubKind: 'official',
      },
      imageUrl: 'https://example.com/start.png',
      options: {
        prompt: 'A slow cinematic dolly in.',
        resolution: '1080p',
        duration: 8,
        aspectRatio: '16:9',
        generateAudio: true,
      },
    })

    expect(result).toMatchObject({
      endpoint: 'bytedance/seedance-2.0/image-to-video',
      externalId: 'FAL:VIDEO:bytedance/seedance-2.0/image-to-video:req_seedance_i2v_1',
    })
    const requests = server!.getRequests('POST', '/fal/bytedance/seedance-2.0/image-to-video')
    expect(requests).toHaveLength(1)
    expect(JSON.parse(requests[0]?.bodyText || '{}')).toEqual({
      prompt: 'A slow cinematic dolly in.',
      image_url: 'https://example.com/start.png',
      resolution: '1080p',
      duration: '8',
      aspect_ratio: '16:9',
      generate_audio: true,
    })
  })

  it('submits Seedance 2.0 multi-reference requests to reference-to-video', async () => {
    server!.defineScenario({
      method: 'POST',
      path: '/fal/bytedance/seedance-2.0/reference-to-video',
      mode: 'success',
      submitResponse: {
        status: 200,
        body: { request_id: 'req_seedance_ref_1' },
      },
    })

    const result = await executeFalVideoGeneration({
      userId: 'user-1',
      selection: {
        provider: 'fal',
        modelId: 'bytedance/seedance-2.0',
        modelKey: 'fal::bytedance/seedance-2.0',
        variantSubKind: 'official',
      },
      imageUrl: 'https://example.com/hero.png',
      options: {
        prompt: 'Use @Image1 as the hero and @Image2 as the location.',
        referenceImages: ['https://example.com/hero.png', 'https://example.com/location.png'],
        resolution: '720p',
        duration: 6,
        aspectRatio: 'auto',
        generateAudio: false,
      },
    })

    expect(result).toMatchObject({
      endpoint: 'bytedance/seedance-2.0/reference-to-video',
      externalId: 'FAL:VIDEO:bytedance/seedance-2.0/reference-to-video:req_seedance_ref_1',
    })
    const requests = server!.getRequests('POST', '/fal/bytedance/seedance-2.0/reference-to-video')
    expect(requests).toHaveLength(1)
    expect(JSON.parse(requests[0]?.bodyText || '{}')).toEqual({
      prompt: 'Use @Image1 as the hero and @Image2 as the location.',
      image_urls: ['https://example.com/hero.png', 'https://example.com/location.png'],
      resolution: '720p',
      duration: '6',
      aspect_ratio: 'auto',
      generate_audio: false,
    })
  })
})
