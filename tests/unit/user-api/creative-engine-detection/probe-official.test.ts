import { describe, expect, it, vi } from 'vitest'
import { probeOfficialCreativeEngine } from '@/lib/user-api/creative-engine-detection/probe-official'

describe('official creative engine probes', () => {
  it('uses the existing free FAL models probe without generation calls', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.fal.ai/v1/models?limit=1')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toEqual(expect.objectContaining({
        Authorization: 'Key fal-key',
      }))
      return new Response(JSON.stringify({
        models: [{ endpoint_id: 'fal-ai/veo3.1/fast/image-to-video' }],
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await probeOfficialCreativeEngine({
      fingerprint: {
        source: 'fal',
        providerKey: 'fal',
        protocolType: 'official',
        confidence: 'high',
      },
      normalizedBaseUrl: 'https://queue.fal.run',
      apiKey: 'fal-key',
    })

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      source: 'fal',
      providerKey: 'fal',
      protocolType: 'official',
      confidence: 'high',
      normalizedBaseUrl: 'https://queue.fal.run',
    }))
    expect(result.models).toEqual([
      expect.objectContaining({
        callName: 'fal-ai/veo3.1/fast/image-to-video',
        purpose: 'video-generation',
      }),
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
