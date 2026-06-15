import { describe, expect, it } from 'vitest'
import { validateMediaContract } from '@/lib/media-contract/validator'

describe('media contract validator', () => {
  it('accepts template-backed AISENYU-style image contract', () => {
    const result = validateMediaContract({
      version: 1,
      mediaType: 'image',
      executor: 'openai-compat-template',
      capabilities: ['text-to-image', 'image-to-image', 'image-edit'],
      input: {
        image: 'dataUrlBase64',
        images: 'dataUrlBase64Array',
      },
      output: {
        kind: 'url',
        urlPath: '$.data[0].url',
        base64Path: '$.data[0].b64_json',
      },
      testStatus: {
        textToImage: 'unchecked',
        imageToImage: 'unchecked',
        imageEdit: 'unchecked',
      },
      source: 'manual',
    }, {
      modelMediaType: 'image',
      hasCompatMediaTemplate: true,
    })

    expect(result.ok).toBe(true)
    expect(result.contract?.executor).toBe('openai-compat-template')
  })

  it('rejects video capability on image contract', () => {
    const result = validateMediaContract({
      version: 1,
      mediaType: 'image',
      executor: 'openai-standard',
      capabilities: ['image-to-video'],
      input: {},
      output: { kind: 'url', urlPath: '$.data[0].url' },
    }, {
      modelMediaType: 'image',
      hasCompatMediaTemplate: false,
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'MEDIA_CONTRACT_CAPABILITY_MEDIA_TYPE_MISMATCH',
      field: 'capabilities[0]',
    }))
  })

  it('requires compatMediaTemplate for template executor', () => {
    const result = validateMediaContract({
      version: 1,
      mediaType: 'video',
      executor: 'openai-compat-template',
      capabilities: ['image-to-video'],
      input: { image: 'publicUrl' },
      output: { kind: 'asyncTask', urlPath: '$.remixed_from_video_id' },
    }, {
      modelMediaType: 'video',
      hasCompatMediaTemplate: false,
    })

    expect(result.ok).toBe(false)
    expect(result.issues[0]).toMatchObject({
      code: 'MEDIA_CONTRACT_TEMPLATE_REQUIRED',
      field: 'executor',
    })
  })
})
