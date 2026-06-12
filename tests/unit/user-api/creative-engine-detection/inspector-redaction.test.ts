import { describe, expect, it } from 'vitest'
import {
  buildInspectorPayload,
  redactSecret,
} from '@/lib/user-api/creative-engine-detection/llm-inspector'

describe('creative engine inspector redaction', () => {
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
})
