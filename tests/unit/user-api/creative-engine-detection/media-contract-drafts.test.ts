import { describe, expect, it } from 'vitest'
import type { MediaContract } from '@/lib/media-contract/types'
import type { OpenAICompatMediaTemplate } from '@/lib/openai-compat-media-template'
import { buildMediaContractDraftForDetectedModel } from '@/lib/user-api/creative-engine-detection/media-contract-drafts'

describe('creative engine media contract drafts', () => {
  const videoContract: MediaContract = {
    version: 1,
    mediaType: 'video',
    executor: 'openai-compat-template',
    capabilities: ['image-to-video'],
    input: { image: 'publicUrl' },
    output: { kind: 'asyncTask', urlPath: '$.video.url' },
    testStatus: { imageToVideo: 'unchecked' },
    source: 'llm',
  }
  const videoTemplate: OpenAICompatMediaTemplate = {
    version: 1,
    mediaType: 'video',
    mode: 'async',
    create: {
      method: 'POST',
      path: '/videos',
      contentType: 'application/json',
      bodyTemplate: { model: '{{model}}', prompt: '{{prompt}}' },
    },
    status: { method: 'GET', path: '/tasks/{{task_id}}' },
    response: {
      taskIdPath: '$.id',
      statusPath: '$.status',
      outputUrlPath: '$.video.url',
    },
    polling: {
      intervalMs: 1000,
      timeoutMs: 120000,
      doneStates: ['succeeded'],
      failStates: ['failed'],
    },
  }

  it('creates unchecked OpenAI-compatible image draft', () => {
    const draft = buildMediaContractDraftForDetectedModel({
      protocolType: 'openai-compatible',
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
      model: {
        name: 'Relay Video',
        callName: 'relay/video',
        purpose: 'video-generation',
        confidence: 'medium',
      },
    })

    expect(draft.mediaContract).toBeUndefined()
  })

  it('creates an Agnes video template draft from documentation evidence', () => {
    const draft = buildMediaContractDraftForDetectedModel({
      protocolType: 'openai-compatible',
      documentationText: [
        'Endpoint https://apihub.agnes-ai.com/v1/videos',
        'Content-Type application/json',
        'model agnes-video-v2.0',
        'image string / array',
        '创建任务响应包含 video_id',
        '查询 https://apihub.agnes-ai.com/agnesapi?video_id=<VIDEO_ID>',
        'status completed',
        'remixed_from_video_id 为最终生成的视频 URL',
      ].join('\n'),
      model: {
        name: 'agnes-video-v2.0',
        callName: 'agnes-video-v2.0',
        purpose: 'video-generation',
        confidence: 'medium',
      },
    })

    expect(draft.compatMediaTemplate).toMatchObject({
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
          num_frames: 121,
          frame_rate: 24,
        },
      },
      status: {
        method: 'GET',
        path: 'https://apihub.agnes-ai.com/agnesapi?video_id={{task_id}}',
      },
      response: {
        taskIdPath: '$.video_id',
        statusPath: '$.status',
        outputUrlPath: '$.remixed_from_video_id',
      },
      polling: {
        intervalMs: 5000,
        timeoutMs: 600000,
        doneStates: ['completed'],
        failStates: ['failed'],
      },
    })
    expect(draft.mediaContract).toMatchObject({
      mediaType: 'video',
      executor: 'openai-compat-template',
      capabilities: ['image-to-video'],
      input: { image: 'publicUrl' },
      output: { kind: 'asyncTask', urlPath: '$.remixed_from_video_id' },
      testStatus: { imageToVideo: 'unchecked' },
      source: 'llm',
    })
    expect(draft.compatMediaTemplateSource).toBe('ai')
    expect(draft.mediaContractSource).toBe('llm')
  })

  it('keeps assistant-provided template-backed contracts unchanged', () => {
    const draft = buildMediaContractDraftForDetectedModel({
      protocolType: 'openai-compatible',
      model: {
        name: 'Template Video',
        callName: 'template/video',
        purpose: 'video-generation',
        confidence: 'medium',
        mediaContract: videoContract,
        compatMediaTemplate: videoTemplate,
        compatMediaTemplateSource: 'ai',
      },
    })

    expect(draft.mediaContract).toMatchObject({
      executor: 'openai-compat-template',
      source: 'llm',
    })
    expect(draft.mediaContractSource).toBe('llm')
    expect(draft.compatMediaTemplate).toBe(videoTemplate)
    expect(draft.compatMediaTemplateSource).toBe('ai')
  })

  it('drops upstream media contracts from non-media model drafts', () => {
    const textDraft = buildMediaContractDraftForDetectedModel({
      protocolType: 'openai-compatible',
      model: {
        name: 'Text Model',
        callName: 'text/model',
        purpose: 'text',
        confidence: 'high',
        mediaContract: videoContract,
        mediaContractSource: 'llm',
      },
    })
    const voiceDraft = buildMediaContractDraftForDetectedModel({
      protocolType: 'openai-compatible',
      model: {
        name: 'Voice Model',
        callName: 'voice/model',
        purpose: 'voice-generation',
        confidence: 'medium',
        mediaContract: videoContract,
        mediaContractSource: 'llm',
      },
    })

    expect(textDraft.mediaContract).toBeUndefined()
    expect(textDraft.mediaContractSource).toBeUndefined()
    expect(voiceDraft.mediaContract).toBeUndefined()
    expect(voiceDraft.mediaContractSource).toBeUndefined()
  })

  it('creates Gemini-standard video draft for Gemini-compatible Veo model', () => {
    const draft = buildMediaContractDraftForDetectedModel({
      protocolType: 'gemini-compatible',
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
      model: {
        name: 'Imagen',
        callName: 'models/imagen-4',
        purpose: 'image-generation',
        confidence: 'medium',
      },
    })
    const textDraft = buildMediaContractDraftForDetectedModel({
      protocolType: 'gemini-compatible',
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
