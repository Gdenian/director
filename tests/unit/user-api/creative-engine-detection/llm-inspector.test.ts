import { describe, expect, it } from 'vitest'
import {
  INSPECTOR_SYSTEM_PROMPT,
  resolveInspectorConfig,
  parseInspectorOutput,
} from '@/lib/user-api/creative-engine-detection/llm-inspector'

describe('creative engine LLM inspector', () => {
  it('validates structured JSON output and maps inspector purposes to draft purposes', () => {
    const parsed = parseInspectorOutput(JSON.stringify({
      source: 'OpenRouter',
      recommendedProviderKey: 'openai-compatible',
      protocolType: 'openai-compatible',
      normalizedBaseUrl: 'https://openrouter.ai/api/v1',
      confidence: 'high',
      models: [{
        name: 'Claude',
        callName: 'anthropic/claude-sonnet-4.5',
        purpose: 'llm',
        confidence: 'high',
      }],
      warnings: [],
    }))

    expect(parsed).toMatchObject({
      source: 'OpenRouter',
      recommendedProviderKey: 'openai-compatible',
      protocolType: 'openai-compatible',
      normalizedBaseUrl: 'https://openrouter.ai/api/v1',
      confidence: 'high',
    })
    expect(parsed.models[0]).toMatchObject({
      callName: 'anthropic/claude-sonnet-4.5',
      purpose: 'text',
      confidence: 'high',
    })
  })

  it('rejects malformed or unsafe output', () => {
    expect(() => parseInspectorOutput('not json')).toThrow('INSPECTOR_OUTPUT_INVALID')
    expect(() => parseInspectorOutput(JSON.stringify({
      source: 'Bad',
      recommendedProviderKey: 'x',
      protocolType: 'arbitrary-rest',
      normalizedBaseUrl: 'https://x.test',
      confidence: 'high',
      models: [{
        name: 'Model',
        callName: 'model',
        purpose: 'llm',
        confidence: 'high',
      }],
      warnings: [],
    }))).toThrow('INSPECTOR_OUTPUT_INVALID')
    expect(() => parseInspectorOutput(JSON.stringify({
      source: 'Bad',
      recommendedProviderKey: 'x',
      protocolType: 'manual-template',
      normalizedBaseUrl: 'not a url',
      confidence: 'high',
      models: [{
        name: 'Model',
        callName: 'model',
        purpose: 'llm',
        confidence: 'high',
      }],
      warnings: [],
    }))).toThrow('INSPECTOR_OUTPUT_INVALID')
    expect(() => parseInspectorOutput(JSON.stringify({
      source: 'Bad',
      recommendedProviderKey: 'x',
      protocolType: 'manual-template',
      normalizedBaseUrl: 'https://x.test',
      confidence: 'high',
      models: [],
      warnings: [],
    }))).toThrow('INSPECTOR_OUTPUT_INVALID')
  })

  it('keeps inspector prompts as draft-only guidance', () => {
    expect(INSPECTOR_SYSTEM_PROMPT).toContain('你只能生成配置草稿')
    expect(INSPECTOR_SYSTEM_PROMPT).toContain('不能声称已经保存')
    expect(INSPECTOR_SYSTEM_PROMPT).toContain('不能推荐默认创作方案')
    expect(INSPECTOR_SYSTEM_PROMPT).toContain('不能自动分配模型')
  })

  it('asks the inspector to draft executable media templates from documentation', () => {
    expect(INSPECTOR_SYSTEM_PROMPT).toContain('compatMediaTemplate')
    expect(INSPECTOR_SYSTEM_PROMPT).toContain('mediaContract')
    expect(INSPECTOR_SYSTEM_PROMPT).toContain('openai-compat-template')
  })

  it('requires a supported inspector provider when env is configured', () => {
    const previousProvider = process.env.CREATIVE_ENGINE_INSPECTOR_PROVIDER
    const previousModel = process.env.CREATIVE_ENGINE_INSPECTOR_MODEL
    const previousKey = process.env.CREATIVE_ENGINE_INSPECTOR_API_KEY
    try {
      process.env.CREATIVE_ENGINE_INSPECTOR_PROVIDER = 'unsupported'
      process.env.CREATIVE_ENGINE_INSPECTOR_MODEL = 'gpt-5-mini'
      process.env.CREATIVE_ENGINE_INSPECTOR_API_KEY = 'inspector-key'

      expect(resolveInspectorConfig()).toBeNull()

      process.env.CREATIVE_ENGINE_INSPECTOR_PROVIDER = 'openai-compatible'
      expect(resolveInspectorConfig()).toMatchObject({
        provider: 'openai-compatible',
        model: 'gpt-5-mini',
      })
    } finally {
      process.env.CREATIVE_ENGINE_INSPECTOR_PROVIDER = previousProvider
      process.env.CREATIVE_ENGINE_INSPECTOR_MODEL = previousModel
      process.env.CREATIVE_ENGINE_INSPECTOR_API_KEY = previousKey
    }
  })
})
