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
    image: 'data:image/png;base64,QUJD',
    images: ['data:image/png;base64,QUJD'],
  },
  diagnostics: [],
})))

vi.mock('@/lib/model-gateway/openai-compat/common', () => ({
  resolveOpenAICompatClientConfig: resolveConfigMock,
}))

vi.mock('@/lib/media-contract/input-preparation', () => ({
  prepareMediaInputs: prepareMediaInputsMock,
}))

import { generateImageViaOpenAICompatTemplate } from '@/lib/model-gateway/openai-compat/template-image'

const imageToImageContract: MediaContract = {
  version: 1,
  mediaType: 'image',
  executor: 'openai-compat-template',
  capabilities: ['image-to-image'],
  input: { image: 'dataUrlBase64' },
  output: { kind: 'url', urlPath: '$.data[0].url' },
  testStatus: { imageToImage: 'passed' },
}

describe('openai-compat template image media contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders prepared data URL image into the JSON body', async () => {
    let fetchBody: BodyInit | null | undefined
    globalThis.fetch = vi.fn(async (_url, init) => {
      fetchBody = init?.body
      return new Response(JSON.stringify({
        data: [{ url: 'https://cdn.test/poster.png' }],
      }), { status: 200 })
    }) as unknown as typeof fetch

    await generateImageViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'openai-compatible:test-provider',
      modelId: 'gpt-image-2',
      modelKey: 'openai-compatible:test-provider::gpt-image-2',
      prompt: 'make poster',
      referenceImages: ['https://signed.test/raw.png'],
      profile: 'openai-compatible',
      template: {
        version: 1,
        mediaType: 'image',
        mode: 'sync',
        create: {
          method: 'POST',
          path: '/images/edits',
          contentType: 'application/json',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
            image: '{{image}}',
          },
        },
        response: {
          outputUrlPath: '$.data[0].url',
        },
      },
      mediaContract: imageToImageContract,
    } as Parameters<typeof generateImageViaOpenAICompatTemplate>[0])

    expect(prepareMediaInputsMock).toHaveBeenCalledWith({
      capability: 'image-to-image',
      contract: imageToImageContract,
      image: 'https://signed.test/raw.png',
      images: ['https://signed.test/raw.png'],
      lastFrameImage: undefined,
    })
    expect(JSON.parse(String(fetchBody))).toMatchObject({
      model: 'gpt-image-2',
      prompt: 'make poster',
      image: 'data:image/png;base64,QUJD',
    })
  })

  it('returns a data URL when contract output provides raw base64', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      data: [{ b64_json: 'QUJD' }],
    }), { status: 200 })) as unknown as typeof fetch

    const result = await generateImageViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'openai-compatible:test-provider',
      modelId: 'gpt-image-2',
      modelKey: 'openai-compatible:test-provider::gpt-image-2',
      prompt: 'make poster',
      profile: 'openai-compatible',
      template: {
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
        },
      },
      mediaContract: {
        ...imageToImageContract,
        capabilities: ['text-to-image'],
        input: {},
        output: { kind: 'base64', base64Path: '$.data[0].b64_json' },
        testStatus: { textToImage: 'passed' },
      },
    } as Parameters<typeof generateImageViaOpenAICompatTemplate>[0])

    expect(result).toMatchObject({
      success: true,
      imageBase64: 'QUJD',
    })
    expect(result.imageUrl).toMatch(/^data:image\/png;base64,/)
  })

  it('rejects URL or plain text values from contract base64 output path', async () => {
    for (const invalidBase64 of [
      'https://bad.example/image.png',
      'upstream returned an error',
    ]) {
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
        data: [{ b64_json: invalidBase64 }],
      }), { status: 200 })) as unknown as typeof fetch

      await expect(generateImageViaOpenAICompatTemplate({
        userId: 'user-1',
        providerId: 'openai-compatible:test-provider',
        modelId: 'gpt-image-2',
        modelKey: 'openai-compatible:test-provider::gpt-image-2',
        prompt: 'make poster',
        profile: 'openai-compatible',
        template: {
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
          },
        },
        mediaContract: {
          ...imageToImageContract,
          capabilities: ['text-to-image'],
          input: {},
          output: { kind: 'base64', base64Path: '$.data[0].b64_json' },
          testStatus: { textToImage: 'passed' },
        },
      } as Parameters<typeof generateImageViaOpenAICompatTemplate>[0]))
        .rejects.toThrow('OPENAI_COMPAT_IMAGE_TEMPLATE_OUTPUT_NOT_FOUND')
    }
  })

  it('rejects common error words from contract base64 output path', async () => {
    for (const invalidBase64 of ['error', 'failed']) {
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
        data: [{ b64_json: invalidBase64 }],
      }), { status: 200 })) as unknown as typeof fetch

      await expect(generateImageViaOpenAICompatTemplate({
        userId: 'user-1',
        providerId: 'openai-compatible:test-provider',
        modelId: 'gpt-image-2',
        modelKey: 'openai-compatible:test-provider::gpt-image-2',
        prompt: 'make poster',
        profile: 'openai-compatible',
        template: {
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
          },
        },
        mediaContract: {
          ...imageToImageContract,
          capabilities: ['text-to-image'],
          input: {},
          output: { kind: 'base64', base64Path: '$.data[0].b64_json' },
          testStatus: { textToImage: 'passed' },
        },
      } as Parameters<typeof generateImageViaOpenAICompatTemplate>[0]))
        .rejects.toThrow('OPENAI_COMPAT_IMAGE_TEMPLATE_OUTPUT_NOT_FOUND')
    }
  })
})
