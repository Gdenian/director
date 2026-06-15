import { describe, expect, it } from 'vitest'
import { buildMediaContractDraftForDetectedModel } from '@/lib/user-api/creative-engine-detection/media-contract-drafts'

describe('creative engine media contract drafts', () => {
  it('creates unchecked OpenAI-compatible image draft', () => {
    const draft = buildMediaContractDraftForDetectedModel({
      protocolType: 'openai-compatible',
      source: 'unknown-relay',
      normalizedBaseUrl: 'https://relay.test/v1',
      model: {
        name: 'GPT Image',
        callName: 'gpt-image-2',
        purpose: 'image-generation',
        confidence: 'medium',
      },
    })

    expect(draft.mediaContract).toMatchObject({
      mediaType: 'image',
      executor: 'openai-standard',
      capabilities: ['text-to-image'],
      testStatus: { textToImage: 'unchecked' },
    })
  })

  it('does not create video draft for relay text-only evidence', () => {
    const draft = buildMediaContractDraftForDetectedModel({
      protocolType: 'openai-compatible',
      source: 'unknown-relay',
      normalizedBaseUrl: 'https://relay.test/v1',
      model: {
        name: 'Text Model',
        callName: 'gpt-5.4',
        purpose: 'text',
        confidence: 'high',
      },
    })

    expect(draft.mediaContract).toBeUndefined()
  })

  it('does not create OpenAI-compatible video draft without template evidence', () => {
    const draft = buildMediaContractDraftForDetectedModel({
      protocolType: 'openai-compatible',
      source: 'unknown-relay',
      normalizedBaseUrl: 'https://relay.test/v1',
      model: {
        name: 'Relay Video',
        callName: 'relay/video',
        purpose: 'video-generation',
        confidence: 'medium',
      },
    })

    expect(draft.mediaContract).toBeUndefined()
  })

  it('keeps assistant-provided template-backed contracts unchanged', () => {
    const draft = buildMediaContractDraftForDetectedModel({
      protocolType: 'openai-compatible',
      source: 'custom-template',
      normalizedBaseUrl: 'https://relay.test/v1',
      model: {
        name: 'Template Video',
        callName: 'template/video',
        purpose: 'video-generation',
        confidence: 'medium',
        mediaContract: {
          version: 1,
          mediaType: 'video',
          executor: 'openai-compat-template',
          capabilities: ['image-to-video'],
          input: { image: 'publicUrl' },
          output: { kind: 'asyncTask', urlPath: '$.video.url' },
          testStatus: { imageToVideo: 'unchecked' },
          source: 'llm',
        },
      },
    })

    expect(draft.mediaContract).toMatchObject({
      executor: 'openai-compat-template',
      source: 'llm',
    })
    expect(draft.mediaContractSource).toBe('llm')
  })

  it('creates Gemini-standard video draft for Gemini-compatible Veo model', () => {
    const draft = buildMediaContractDraftForDetectedModel({
      protocolType: 'gemini-compatible',
      source: 'gemini-compatible',
      normalizedBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: {
        name: 'Veo',
        callName: 'veo-3.1-generate-preview',
        purpose: 'video-generation',
        confidence: 'medium',
      },
    })

    expect(draft.mediaContract).toMatchObject({
      executor: 'gemini-standard',
      capabilities: ['image-to-video'],
      testStatus: { imageToVideo: 'unchecked' },
    })
  })

  it('creates Gemini-standard image drafts and skips non-media Gemini models', () => {
    const imageDraft = buildMediaContractDraftForDetectedModel({
      protocolType: 'gemini-compatible',
      source: 'gemini-compatible',
      normalizedBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: {
        name: 'Imagen',
        callName: 'models/imagen-4',
        purpose: 'image-generation',
        confidence: 'medium',
      },
    })
    const textDraft = buildMediaContractDraftForDetectedModel({
      protocolType: 'gemini-compatible',
      source: 'gemini-compatible',
      normalizedBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: {
        name: 'Gemini',
        callName: 'models/gemini-2.5-pro',
        purpose: 'text',
        confidence: 'high',
      },
    })

    expect(imageDraft.mediaContract).toMatchObject({
      executor: 'gemini-standard',
      capabilities: ['text-to-image'],
      testStatus: { textToImage: 'unchecked' },
    })
    expect(textDraft.mediaContract).toBeUndefined()
  })

  it('creates official-adapter media drafts without passed test statuses', () => {
    const draft = buildMediaContractDraftForDetectedModel({
      protocolType: 'official',
      source: 'fal',
      normalizedBaseUrl: 'https://queue.fal.run',
      model: {
        name: 'Fal Video',
        callName: 'fal-ai/veo3.1/fast/image-to-video',
        purpose: 'video-generation',
        confidence: 'high',
      },
    })

    expect(draft.mediaContract).toMatchObject({
      executor: 'official-adapter',
      source: 'official-adapter',
      capabilities: ['image-to-video'],
    })
    expect(draft.mediaContract?.testStatus).toBeUndefined()
    expect(draft.mediaContractSource).toBe('official-adapter')
  })
})
