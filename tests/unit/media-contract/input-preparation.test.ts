import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareMediaInputs } from '@/lib/media-contract/input-preparation'

type PrepareMediaInputsArgs = Parameters<typeof prepareMediaInputs>[0]

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

  it('fails explicitly when the contract image input format is unsupported', async () => {
    const contract = {
      version: 1,
      mediaType: 'image',
      executor: 'openai-compat-template',
      capabilities: ['image-to-image'],
      input: { image: 'unknownImageFormat' },
      output: { kind: 'url', urlPath: '$.data[0].url' },
    } as unknown as PrepareMediaInputsArgs['contract']

    const result = await prepareMediaInputs({
      capability: 'image-to-image',
      contract,
      image: 'images/ref.png',
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]).toMatchObject({
      code: 'MEDIA_INPUT_FORMAT_UNSUPPORTED_BY_CONTRACT',
      field: 'image',
    })
  })

  it('fails explicitly when the contract images input format is unsupported', async () => {
    const contract = {
      version: 1,
      mediaType: 'image',
      executor: 'openai-compat-template',
      capabilities: ['image-to-image'],
      input: { images: 'unknownImagesFormat' },
      output: { kind: 'url', urlPath: '$.data[0].url' },
    } as unknown as PrepareMediaInputsArgs['contract']

    const result = await prepareMediaInputs({
      capability: 'image-to-image',
      contract,
      images: ['images/ref-a.png'],
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]).toMatchObject({
      code: 'MEDIA_INPUT_FORMAT_UNSUPPORTED_BY_CONTRACT',
      field: 'images',
    })
  })

  it('does not require image for text-to-image on a multi-capability image contract', async () => {
    const result = await prepareMediaInputs({
      capability: 'text-to-image',
      contract: {
        version: 1,
        mediaType: 'image',
        executor: 'openai-compat-template',
        capabilities: ['text-to-image', 'image-to-image'],
        input: { image: 'dataUrlBase64' },
        output: { kind: 'url', urlPath: '$.data[0].url' },
      },
    })

    expect(result.ok).toBe(true)
    expect(result.diagnostics).toEqual([])
  })

  it('does not require last frame for image-to-video on a multi-capability video contract', async () => {
    const result = await prepareMediaInputs({
      capability: 'image-to-video',
      contract: {
        version: 1,
        mediaType: 'video',
        executor: 'openai-compat-template',
        capabilities: ['image-to-video', 'first-last-frame-video'],
        input: { image: 'publicUrl', lastFrameImage: 'publicUrl' },
        output: { kind: 'asyncTask', urlPath: '$.video_url' },
      },
      image: 'images/start.png',
    })

    expect(result.ok).toBe(true)
    expect(result.values.image).toBe('https://signed.test/images/start.png')
    expect(result.diagnostics).toEqual([])
  })

  it('requires images for image-to-image when the contract declares images input', async () => {
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
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]).toMatchObject({
      field: 'images',
    })
  })

  it('reports unsupported image format before missing image input', async () => {
    const contract = {
      version: 1,
      mediaType: 'image',
      executor: 'openai-compat-template',
      capabilities: ['image-to-image'],
      input: { image: 'unknownImageFormat' },
      output: { kind: 'url', urlPath: '$.data[0].url' },
    } as unknown as PrepareMediaInputsArgs['contract']

    const result = await prepareMediaInputs({
      capability: 'image-to-image',
      contract,
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]).toMatchObject({
      code: 'MEDIA_INPUT_FORMAT_UNSUPPORTED_BY_CONTRACT',
      field: 'image',
    })
  })

  it('reports unsupported last frame format before missing last frame input', async () => {
    const contract = {
      version: 1,
      mediaType: 'video',
      executor: 'openai-compat-template',
      capabilities: ['first-last-frame-video'],
      input: { image: 'publicUrl', lastFrameImage: 'unknownLastFrameFormat' },
      output: { kind: 'asyncTask', urlPath: '$.video_url' },
    } as unknown as PrepareMediaInputsArgs['contract']

    const result = await prepareMediaInputs({
      capability: 'first-last-frame-video',
      contract,
      image: 'images/start.png',
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]).toMatchObject({
      code: 'MEDIA_INPUT_FORMAT_UNSUPPORTED_BY_CONTRACT',
      field: 'lastFrameImage',
    })
  })

  it('prepares multipart file inputs as data URLs', async () => {
    const result = await prepareMediaInputs({
      capability: 'image-to-image',
      contract: {
        version: 1,
        mediaType: 'image',
        executor: 'openai-compat-template',
        capabilities: ['image-to-image'],
        input: { image: 'multipartFile' },
        output: { kind: 'url', urlPath: '$.data[0].url' },
      },
      image: 'images/ref.png',
    })

    expect(result.values.image).toBe('data:image/png;base64,QUJD')
  })

  it('prepares multipart file arrays as data URL arrays', async () => {
    const result = await prepareMediaInputs({
      capability: 'image-to-image',
      contract: {
        version: 1,
        mediaType: 'image',
        executor: 'openai-compat-template',
        capabilities: ['image-to-image'],
        input: { images: 'multipartFiles' },
        output: { kind: 'url', urlPath: '$.data[0].url' },
      },
      images: ['images/ref-a.png', 'images/ref-b.png'],
    })

    expect(result.values.images).toEqual([
      'data:image/png;base64,QUJD',
      'data:image/png;base64,QUJD',
    ])
  })

  it('returns diagnostics instead of throwing when original URL normalization fails', async () => {
    normalizeToOriginalMediaUrl.mockRejectedValueOnce(new Error('sign failed'))

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
      image: 'images/start.png',
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]).toMatchObject({
      code: 'MEDIA_INPUT_PUBLIC_URL_REQUIRED',
      field: 'image',
    })
  })

  it('returns diagnostics instead of throwing when base64 normalization fails', async () => {
    normalizeToBase64ForGeneration.mockRejectedValueOnce(new Error('fetch failed'))

    const result = await prepareMediaInputs({
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

    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]).toMatchObject({
      code: 'MEDIA_INPUT_BASE64_CONVERSION_FAILED',
      field: 'image',
    })
  })

  it('requires last frame image for first-last-frame video', async () => {
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
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]).toMatchObject({
      code: 'MEDIA_INPUT_LAST_FRAME_REQUIRED',
      field: 'lastFrameImage',
    })
  })
})
