import { describe, expect, it } from 'vitest'
import { fingerprintCreativeEngineSource } from '@/lib/user-api/creative-engine-detection/fingerprint'

describe('creative engine fingerprint', () => {
  it.each([
    ['https://openrouter.ai/api/v1', 'openrouter', 'openai-compatible'],
    ['https://api.openai.com/v1', 'openai', 'official'],
    ['https://generativelanguage.googleapis.com/v1beta', 'google-ai-studio', 'gemini-compatible'],
    ['https://ark.cn-beijing.volces.com/api/v3', 'volcengine-ark', 'openai-compatible'],
    ['https://dashscope.aliyuncs.com/compatible-mode/v1', 'alibaba-bailian', 'openai-compatible'],
    ['https://api.siliconflow.cn/v1', 'siliconflow', 'openai-compatible'],
    ['https://api.minimaxi.com/v1', 'minimax', 'openai-compatible'],
    ['https://api.vidu.cn', 'vidu', 'official'],
    ['https://queue.fal.run', 'fal', 'official'],
    ['https://api.302.ai/v1', '302-ai', 'openai-compatible'],
  ])('detects %s as %s using %s protocol', (url, source, protocolType) => {
    expect(fingerprintCreativeEngineSource({ url })).toEqual(
      expect.objectContaining({
        source,
        protocolType,
      }),
    )
  })

  it('classifies unknown v1 URLs as custom OpenAI-compatible services', () => {
    expect(fingerprintCreativeEngineSource({ url: 'https://api.example.com/v1' })).toEqual(
      expect.objectContaining({
        source: 'custom-openai-compatible',
        providerKey: 'openai-compatible',
        protocolType: 'openai-compatible',
        confidence: 'medium',
      }),
    )
  })

  it('classifies unknown Gemini-like URLs as custom Gemini-compatible services', () => {
    expect(fingerprintCreativeEngineSource({ url: 'https://example.com/v1beta' })).toEqual(
      expect.objectContaining({
        source: 'custom-gemini-compatible',
        providerKey: 'gemini-compatible',
        protocolType: 'gemini-compatible',
        confidence: 'medium',
      }),
    )
  })
})
