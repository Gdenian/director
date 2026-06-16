import { describe, expect, it } from 'vitest'
import {
  buildInspectorPayload,
  parseInspectorOutput,
  redactSecret,
} from '@/lib/user-api/creative-engine-detection/llm-inspector'

describe('creative engine inspector redaction', () => {
  const validAsyncVideoTemplate = {
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
  } as const

  const videoContract = {
    version: 1,
    mediaType: 'video',
    executor: 'openai-compat-template',
    capabilities: ['image-to-video'],
    input: { image: 'publicUrl' },
    output: { kind: 'asyncTask', urlPath: '$.video.url' },
    testStatus: { imageToVideo: 'unchecked' },
    source: 'llm',
  } as const

  it('omits the full key when allowKeyInInspector is false', () => {
    const payload = buildInspectorPayload({
      serviceUrl: 'https://api.example.com/v1',
      apiKey: 'sk-secret-full',
      allowKeyInInspector: false,
      probeLogs: ['401 sk-secret-full'],
      responseSamples: ['{"error":"bad sk-secret-full"}'],
    })

    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('sk-secret-full')
    expect(serialized).toContain('sk-...full')
  })

  it('may include the full key when explicitly allowed', () => {
    const payload = buildInspectorPayload({
      serviceUrl: 'https://api.example.com/v1',
      apiKey: 'sk-secret-full',
      allowKeyInInspector: true,
      probeLogs: [],
      responseSamples: [],
    })

    expect(JSON.stringify(payload)).toContain('sk-secret-full')
  })

  it('redacts secrets in normal logs', () => {
    expect(redactSecret('abc sk-secret-full xyz', 'sk-secret-full')).toBe('abc sk-...full xyz')
  })

  it('redacts key-like inspector output and coerces passed media statuses to unchecked', () => {
    const result = parseInspectorOutput(JSON.stringify({
      source: 'custom-template',
      recommendedProviderKey: 'openai-compatible',
      protocolType: 'manual-template',
      normalizedBaseUrl: 'https://api.example.com/v1',
      confidence: 'medium',
      models: [{
        name: 'Video Model sk-2475-test-secret',
        callName: 'vendor/video',
        purpose: 'video',
        confidence: 'medium',
        compatMediaTemplate: validAsyncVideoTemplate,
        compatMediaTemplateSource: 'ai',
        mediaContract: {
          version: 1,
          mediaType: 'video',
          executor: 'openai-compat-template',
          capabilities: ['image-to-video'],
          input: { image: 'publicUrl' },
          output: { kind: 'asyncTask', urlPath: 'data.video.url' },
          testStatus: { imageToVideo: 'passed' },
          source: 'llm',
        },
      }],
      warnings: ['probe sample sk-2475-test-secret'],
    }))

    expect(JSON.stringify(result)).not.toContain('sk-2475')
    expect(result.models[0]?.mediaContract?.testStatus?.imageToVideo).toBe('unchecked')
    expect(result.models[0]?.mediaContractSource).toBe('llm')
  })

  it('preserves assistant media templates and redacts key-like values inside them', () => {
    const result = parseInspectorOutput(JSON.stringify({
      source: 'custom-template',
      recommendedProviderKey: 'openai-compatible',
      protocolType: 'manual-template',
      normalizedBaseUrl: 'https://api.example.com/v1',
      confidence: 'medium',
      models: [{
        name: 'Video Model',
        callName: 'vendor/video',
        purpose: 'video',
        confidence: 'medium',
        compatMediaTemplate: {
          ...validAsyncVideoTemplate,
          create: {
            ...validAsyncVideoTemplate.create,
            headers: { Authorization: 'Bearer sk-template-secret' },
            bodyTemplate: { model: '{{model}}', prompt: '{{prompt}}', apiKey: 'sk-body-secret' },
          },
        },
        compatMediaTemplateSource: 'ai',
      }],
      warnings: [],
    }))

    expect(result.models[0]?.compatMediaTemplateSource).toBe('ai')
    expect(result.models[0]?.compatMediaTemplate?.create.path).toBe('/videos')
    expect(JSON.stringify(result.models[0]?.compatMediaTemplate)).not.toContain('sk-template-secret')
    expect(JSON.stringify(result.models[0]?.compatMediaTemplate)).not.toContain('sk-body-secret')
  })

  it('drops media fields from non-media inspector models', () => {
    const result = parseInspectorOutput(JSON.stringify({
      source: 'custom-template',
      recommendedProviderKey: 'openai-compatible',
      protocolType: 'manual-template',
      normalizedBaseUrl: 'https://api.example.com/v1',
      confidence: 'medium',
      models: [{
        name: 'Text Model',
        callName: 'vendor/text',
        purpose: 'llm',
        confidence: 'medium',
        compatMediaTemplate: validAsyncVideoTemplate,
        compatMediaTemplateSource: 'ai',
        mediaContract: videoContract,
        mediaContractSource: 'llm',
      }],
      warnings: [],
    }))

    expect(result.models[0]).toMatchObject({
      callName: 'vendor/text',
      purpose: 'text',
    })
    expect(result.models[0]?.mediaContract).toBeUndefined()
    expect(result.models[0]?.mediaContractSource).toBeUndefined()
    expect(result.models[0]?.compatMediaTemplate).toBeUndefined()
    expect(result.models[0]?.compatMediaTemplateSource).toBeUndefined()
  })

  it('drops invalid assistant templates and dependent template media contracts', () => {
    const result = parseInspectorOutput(JSON.stringify({
      source: 'custom-template',
      recommendedProviderKey: 'openai-compatible',
      protocolType: 'manual-template',
      normalizedBaseUrl: 'https://api.example.com/v1',
      confidence: 'medium',
      models: [{
        name: 'Video Model',
        callName: 'vendor/video',
        purpose: 'video',
        confidence: 'medium',
        compatMediaTemplate: {
          ...validAsyncVideoTemplate,
          status: { method: 'GET', path: '/tasks/{{bad_task_id}}' },
          response: { statusPath: '$.status', outputUrlPath: '$.video.url' },
          polling: undefined,
        },
        compatMediaTemplateSource: 'ai',
        mediaContract: videoContract,
      }],
      warnings: [],
    }))

    expect(result.models[0]?.compatMediaTemplate).toBeUndefined()
    expect(result.models[0]?.compatMediaTemplateSource).toBeUndefined()
    expect(result.models[0]?.mediaContract).toBeUndefined()
    expect(result.models[0]?.mediaContractSource).toBeUndefined()
  })

  it('redacts common provider key-like strings from inspector output', () => {
    const result = parseInspectorOutput(JSON.stringify({
      source: 'custom-template',
      recommendedProviderKey: 'openai-compatible',
      protocolType: 'manual-template',
      normalizedBaseUrl: 'https://api.example.com/v1',
      confidence: 'medium',
      models: [{
        name: 'Video AIzaSyExampleGeminiKey1234567890 xai-exampleSecretToken123 gsk_exampleGroqToken123',
        callName: 'vendor/video',
        purpose: 'video',
        confidence: 'medium',
        compatMediaTemplate: {
          ...validAsyncVideoTemplate,
          create: {
            ...validAsyncVideoTemplate.create,
            headers: {
              Authorization: 'Bearer provider-token-with-many-characters-1234567890',
            },
            bodyTemplate: {
              prompt: '{{prompt}}',
              geminiKey: 'AIzaSyBodyGeminiKey1234567890',
              xaiKey: 'xai-bodySecretToken123456',
              groqKey: 'gsk_bodyGroqToken123456',
            },
          },
        },
        compatMediaTemplateSource: 'ai',
      }],
      warnings: ['AIzaSyWarningGeminiKey1234567890 xai-warningSecret123456 gsk_warningSecret123456'],
    }))

    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('AIzaSyExampleGeminiKey1234567890')
    expect(serialized).not.toContain('AIzaSyBodyGeminiKey1234567890')
    expect(serialized).not.toContain('AIzaSyWarningGeminiKey1234567890')
    expect(serialized).not.toContain('xai-exampleSecretToken123')
    expect(serialized).not.toContain('xai-bodySecretToken123456')
    expect(serialized).not.toContain('xai-warningSecret123456')
    expect(serialized).not.toContain('gsk_exampleGroqToken123')
    expect(serialized).not.toContain('gsk_bodyGroqToken123456')
    expect(serialized).not.toContain('gsk_warningSecret123456')
    expect(serialized).not.toContain('provider-token-with-many-characters-1234567890')
  })
})
