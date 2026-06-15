import { describe, expect, it } from 'vitest'
import { classifyMediaTestError } from '@/lib/media-contract/test-diagnostics'

describe('media test diagnostics', () => {
  it.each([
    [401, 'bad key', 'MEDIA_TEST_INVALID_KEY'],
    [403, 'insufficient quota', 'MEDIA_TEST_PERMISSION_OR_PLAN'],
    [429, 'rate limit', 'MEDIA_TEST_RATE_LIMIT'],
    [415, 'unsupported media type', 'MEDIA_TEST_REQUEST_SCHEMA_MISMATCH'],
  ])('maps status %s to %s', (status, body, code) => {
    expect(classifyMediaTestError({ status, body })).toMatchObject({ code })
  })

  it('maps missing json path to response path mismatch', () => {
    expect(classifyMediaTestError({ status: 200, body: '{"data":[]}', extraction: 'output-url-missing' }))
      .toMatchObject({ code: 'MEDIA_TEST_RESPONSE_JSON_PATH_MISMATCH' })
  })

  it('maps balance-like provider messages to insufficient balance', () => {
    expect(classifyMediaTestError({ status: 403, body: 'insufficient balance' }))
      .toMatchObject({ code: 'MEDIA_TEST_BALANCE_INSUFFICIENT' })
  })

  it('redacts json-shaped secrets from messages and snippets', () => {
    const result = classifyMediaTestError({
      status: 500,
      body: JSON.stringify({
        Authorization: 'Bearer plain-secret',
        api_key: 'plain-api-key',
        key: 'plain-key',
        error: 'bad sk-secret-value',
      }),
    })

    expect(result.message).not.toContain('plain-secret')
    expect(result.message).not.toContain('plain-api-key')
    expect(result.message).not.toContain('plain-key')
    expect(result.message).not.toContain('sk-secret-value')
    expect(result.debugSnippet).not.toContain('plain-secret')
    expect(result.debugSnippet).not.toContain('plain-api-key')
    expect(result.debugSnippet).not.toContain('plain-key')
    expect(result.debugSnippet).not.toContain('sk-secret-value')
  })
})
