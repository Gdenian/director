import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareMediaInputs } from '@/lib/media-contract/input-preparation'

const normalizeToOriginalMediaUrl = vi.hoisted(() => vi.fn(async (input: string) => `https://signed.test/${input}`))
const normalizeToBase64ForGeneration = vi.hoisted(() => vi.fn(async () => 'data:image/png;base64,QUJD'))

vi.mock('@/lib/media/outbound-image', () => ({
  normalizeToOriginalMediaUrl,
  normalizeToBase64ForGeneration,
}))

describe('prepareMediaInputs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('prepares public URL image for Agnes-style image-to-video', async () => {
    const result = await prepareMediaInputs({
      capability: 'image-to-video',
      contract: {
        version: 1,
        mediaType: 'video',
        executor: 'openai-compat-template',
        capabilities: ['image-to-video'],
        input: { image: 'publicUrl' },
        output: { kind: 'asyncTask', urlPath: '$.remixed_from_video_id' },
      },
      image: 'images/panel.png',
    })

    expect(result.values.image).toBe('https://signed.test/images/panel.png')
    expect(result.diagnostics).toEqual([])
  })

  it('prepares data URL and raw base64 variants', async () => {
    const dataUrl = await prepareMediaInputs({
      capability: 'image-to-image',
      contract: {
        version: 1,
        mediaType: 'image',
        executor: 'openai-compat-template',
        capabilities: ['image-to-image'],
        input: { image: 'dataUrlBase64' },
        output: { kind: 'url', urlPath: '$.data[0].url' },
      },
      image: 'images/ref.png',
    })
    expect(dataUrl.values.image).toBe('data:image/png;base64,QUJD')

    const raw = await prepareMediaInputs({
      capability: 'image-to-image',
      contract: {
        version: 1,
        mediaType: 'image',
        executor: 'openai-compat-template',
        capabilities: ['image-to-image'],
        input: { image: 'rawBase64' },
        output: { kind: 'url', urlPath: '$.data[0].url' },
      },
      image: 'images/ref.png',
    })
    expect(raw.values.image).toBe('QUJD')
  })

  it('fails before provider call when public URL input is missing', async () => {
    const result = await prepareMediaInputs({
      capability: 'image-to-video',
      contract: {
        version: 1,
        mediaType: 'video',
        executor: 'openai-compat-template',
        capabilities: ['image-to-video'],
        input: { image: 'publicUrl' },
        output: { kind: 'asyncTask', urlPath: '$.video_url' },
      },
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]).toMatchObject({
      code: 'MEDIA_INPUT_PUBLIC_URL_REQUIRED',
      field: 'image',
    })
  })

  it('prepares array image inputs', async () => {
    const result = await prepareMediaInputs({
      capability: 'image-to-image',
      contract: {
        version: 1,
        mediaType: 'image',
        executor: 'openai-compat-template',
        capabilities: ['image-to-image'],
        input: { images: 'dataUrlBase64Array' },
        output: { kind: 'url', urlPath: '$.data[0].url' },
      },
      images: ['images/ref-a.png', 'images/ref-b.png'],
    })

    expect(result.values.images).toEqual([
      'data:image/png;base64,QUJD',
      'data:image/png;base64,QUJD',
    ])
  })

  it('prepares last frame image for first-last-frame video', async () => {
    const result = await prepareMediaInputs({
      capability: 'first-last-frame-video',
      contract: {
        version: 1,
        mediaType: 'video',
        executor: 'openai-compat-template',
        capabilities: ['first-last-frame-video'],
        input: { image: 'publicUrl', lastFrameImage: 'publicUrl' },
        output: { kind: 'asyncTask', urlPath: '$.video_url' },
      },
      image: 'images/start.png',
      lastFrameImage: 'images/end.png',
    })

    expect(result.values.lastFrameImage).toBe('https://signed.test/images/end.png')
  })
})
