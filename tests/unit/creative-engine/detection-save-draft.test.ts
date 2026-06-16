import { describe, expect, it } from 'vitest'
import {
  buildDetectedEngineProviderDraft,
  buildDetectedModelDrafts,
  resolveCreativeEngineDisplayName,
} from '@/app/[locale]/profile/components/creative-engine/detection-save-draft'
import type { MediaContract } from '@/lib/media-contract/types'
import type { OpenAICompatMediaTemplate } from '@/lib/openai-compat-media-template'

describe('creative engine detection save draft', () => {
  it('uses the user supplied service name before detected or fallback names', () => {
    expect(resolveCreativeEngineDisplayName({
      serviceName: '  My API  ',
      detectedSource: 'custom-openai-compatible',
      fallbackName: 'Example Service',
    })).toBe('My API')

    expect(resolveCreativeEngineDisplayName({
      serviceName: '  ',
      detectedSource: 'OpenRouter',
      fallbackName: 'Example Service',
    })).toBe('OpenRouter')

    expect(resolveCreativeEngineDisplayName({
      serviceName: '',
      detectedSource: 'unknown',
      fallbackName: 'Example Service',
    })).toBe('Example Service')
  })

  it('keeps unknown purpose entries as low-confidence unchecked text fallback drafts', () => {
    const drafts = buildDetectedModelDrafts('openai-compatible:abc', [
      {
        id: 'text-1',
        name: 'Text One',
        callName: 'gpt-example',
        purpose: 'text',
        status: 'available',
      },
      {
        id: 'img-1',
        name: 'Image One',
        callName: 'image-example',
        purpose: 'image-generation',
        status: 'unchecked',
      },
      {
        id: 'mystery',
        name: 'Mystery',
        callName: 'mystery-model',
        purpose: 'unknown',
        confidence: 'high',
        status: 'unchecked',
      },
    ])

    expect(drafts).toEqual([
      {
        modelId: 'gpt-example',
        modelKey: 'openai-compatible:abc::gpt-example',
        name: 'Text One',
        type: 'llm',
        provider: 'openai-compatible:abc',
        llmProtocol: 'chat-completions',
        llmProtocolCheckedAt: expect.any(String),
        purpose: 'text',
        status: 'available',
        price: 0,
      },
      {
        modelId: 'image-example',
        modelKey: 'openai-compatible:abc::image-example',
        name: 'Image One',
        type: 'image',
        provider: 'openai-compatible:abc',
        purpose: 'image-generation',
        status: 'unchecked',
        price: 0,
      },
      {
        modelId: 'mystery-model',
        modelKey: 'openai-compatible:abc::mystery-model',
        name: 'Mystery',
        type: 'llm',
        provider: 'openai-compatible:abc',
        llmProtocol: 'chat-completions',
        llmProtocolCheckedAt: expect.any(String),
        purpose: 'text',
        confidence: 'low',
        status: 'unchecked',
        price: 0,
      },
    ])
  })

  it('keeps detected media contract and template fields on model drafts', () => {
    const mediaContract: MediaContract = {
      version: 1,
      mediaType: 'video',
      executor: 'openai-compat-template',
      capabilities: ['image-to-video'],
      input: { image: 'publicUrl' },
      output: { kind: 'asyncTask', urlPath: '$.video.url' },
      testStatus: { imageToVideo: 'unchecked' },
      source: 'llm',
    }
    const compatMediaTemplate: OpenAICompatMediaTemplate = {
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

    const drafts = buildDetectedModelDrafts('openai-compatible:abc', [
      {
        id: 'video-1',
        name: 'Video One',
        callName: 'video-example',
        purpose: 'video-generation',
        status: 'unchecked',
        mediaContract,
        mediaContractSource: 'llm',
        compatMediaTemplate,
        compatMediaTemplateSource: 'ai',
      },
    ])

    expect(drafts[0]).toMatchObject({
      modelId: 'video-example',
      mediaContract,
      mediaContractSource: 'llm',
      compatMediaTemplate,
      compatMediaTemplateSource: 'ai',
    })
  })

  it('keeps detected protocol routing when building the provider draft', () => {
    expect(buildDetectedEngineProviderDraft({
      recommendedProviderKey: 'google',
      protocolType: 'gemini-compatible',
      name: 'Google AI Studio',
      serviceUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'gemini-key',
    })).toMatchObject({
      id: expect.stringMatching(/^gemini-compatible:/),
      name: 'Google AI Studio',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'gemini-key',
      protocolType: 'gemini-compatible',
      apiMode: 'gemini-sdk',
      gatewayRoute: 'official',
    })

    expect(buildDetectedEngineProviderDraft({
      recommendedProviderKey: 'fal',
      protocolType: 'official',
      name: 'FAL',
      serviceUrl: 'https://fal.ai',
      apiKey: 'fal-key',
    })).toMatchObject({
      id: expect.stringMatching(/^fal:/),
      name: 'FAL',
      baseUrl: 'https://fal.ai',
      apiKey: 'fal-key',
      protocolType: 'official',
      gatewayRoute: 'official',
    })

    expect(buildDetectedEngineProviderDraft({
      recommendedProviderKey: 'openrouter',
      protocolType: 'openai-compatible',
      name: 'OpenRouter',
      serviceUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'openrouter-key',
    })).toMatchObject({
      id: expect.stringMatching(/^openai-compatible:/),
      protocolType: 'openai-compatible',
      apiMode: 'openai-official',
      gatewayRoute: 'openai-compat',
    })
  })
})
