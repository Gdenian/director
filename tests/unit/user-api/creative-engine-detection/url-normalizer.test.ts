import { describe, expect, it } from 'vitest'
import { normalizeCreativeEngineUrl } from '@/lib/user-api/creative-engine-detection/url-normalizer'

describe('creative engine URL normalizer', () => {
  it('trims whitespace and removes trailing slashes', () => {
    expect(normalizeCreativeEngineUrl(' https://api.example.com/v1/// ').primaryUrl).toBe('https://api.example.com/v1')
  })

  it('rolls known endpoint URLs back to their base path', () => {
    expect(normalizeCreativeEngineUrl('https://api.example.com/v1/chat/completions').primaryUrl).toBe('https://api.example.com/v1')
    expect(normalizeCreativeEngineUrl('https://api.example.com/v1/responses').primaryUrl).toBe('https://api.example.com/v1')
    expect(normalizeCreativeEngineUrl('https://api.example.com/v1/images/generations').primaryUrl).toBe('https://api.example.com/v1')
    expect(normalizeCreativeEngineUrl('https://api.example.com/v1/videos').primaryUrl).toBe('https://api.example.com/v1')
    expect(normalizeCreativeEngineUrl('https://api.example.com/v1/models').primaryUrl).toBe('https://api.example.com/v1')
  })

  it('adds a v1 candidate for likely OpenAI-compatible base URLs', () => {
    expect(normalizeCreativeEngineUrl('https://api.example.com').candidates).toContain('https://api.example.com/v1')
  })

  it.each([
    ['https://openrouter.ai', 'https://openrouter.ai/api/v1'],
    ['https://api.openai.com', 'https://api.openai.com/v1'],
    ['https://aistudio.google.com', 'https://generativelanguage.googleapis.com/v1beta'],
    ['https://dashscope.aliyuncs.com', 'https://dashscope.aliyuncs.com/compatible-mode/v1'],
    ['https://api.siliconflow.cn', 'https://api.siliconflow.cn/v1'],
    ['https://api.minimaxi.com', 'https://api.minimaxi.com/v1'],
  ])('maps known homepage %s to API base %s', (input, expected) => {
    expect(normalizeCreativeEngineUrl(input).primaryUrl).toBe(expected)
  })

  it('infers API URL from known documentation pages', () => {
    expect(normalizeCreativeEngineUrl('https://openrouter.ai/docs/quickstart').primaryUrl).toBe('https://openrouter.ai/api/v1')
    expect(normalizeCreativeEngineUrl('https://aistudio.google.com/docs/api-key').primaryUrl).toBe('https://generativelanguage.googleapis.com/v1beta')
  })
})
