import type { CreativeEngineFingerprint } from './types'

type FingerprintInput = {
  url: string
}

function knownFingerprint(hostname: string, pathname: string): CreativeEngineFingerprint | null {
  if (hostname === 'openrouter.ai') {
    return { source: 'openrouter', providerKey: 'openrouter', confidence: 'high', protocolType: 'openai-compatible' }
  }
  if (hostname === 'api.openai.com') {
    return { source: 'openai', providerKey: 'openai', confidence: 'high', protocolType: 'official' }
  }
  if (hostname === 'generativelanguage.googleapis.com' || hostname === 'aistudio.google.com') {
    return { source: 'google-ai-studio', providerKey: 'google', confidence: 'high', protocolType: 'gemini-compatible' }
  }
  if (hostname.endsWith('.volces.com') || hostname.includes('volcengine')) {
    return { source: 'volcengine-ark', providerKey: 'ark', confidence: 'high', protocolType: 'openai-compatible' }
  }
  if (hostname === 'dashscope.aliyuncs.com') {
    return { source: 'alibaba-bailian', providerKey: 'bailian', confidence: 'high', protocolType: 'openai-compatible' }
  }
  if (hostname === 'api.siliconflow.cn') {
    return { source: 'siliconflow', providerKey: 'siliconflow', confidence: 'high', protocolType: 'openai-compatible' }
  }
  if (hostname === 'api.minimaxi.com') {
    return { source: 'minimax', providerKey: 'minimax', confidence: 'high', protocolType: 'openai-compatible' }
  }
  if (hostname.includes('vidu')) {
    return { source: 'vidu', providerKey: 'vidu', confidence: 'high', protocolType: 'official' }
  }
  if (hostname === 'queue.fal.run' || hostname.endsWith('.fal.ai')) {
    return { source: 'fal', providerKey: 'fal', confidence: 'high', protocolType: 'official' }
  }
  if (hostname === 'api.302.ai' || hostname.endsWith('.302.ai')) {
    return { source: '302-ai', providerKey: '302-ai', confidence: 'high', protocolType: 'openai-compatible' }
  }
  if (pathname.includes('/v1beta')) {
    return {
      source: 'custom-gemini-compatible',
      providerKey: 'gemini-compatible',
      confidence: 'medium',
      protocolType: 'gemini-compatible',
    }
  }
  if (pathname.includes('/v1')) {
    return {
      source: 'custom-openai-compatible',
      providerKey: 'openai-compatible',
      confidence: 'medium',
      protocolType: 'openai-compatible',
    }
  }
  return null
}

export function fingerprintCreativeEngineSource(input: FingerprintInput): CreativeEngineFingerprint {
  try {
    const parsed = new URL(input.url)
    const matched = knownFingerprint(parsed.hostname.toLowerCase(), parsed.pathname.toLowerCase())
    if (matched) return matched
  } catch {
    return { source: 'unknown', providerKey: 'openai-compatible', confidence: 'low', protocolType: 'openai-compatible' }
  }

  return {
    source: 'custom-openai-compatible',
    providerKey: 'openai-compatible',
    confidence: 'low',
    protocolType: 'openai-compatible',
  }
}
