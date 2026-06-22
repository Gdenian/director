import { describe, expect, it } from 'vitest'
import { redactTaskForAdmin } from '@/lib/admin/redaction'

describe('redactTaskForAdmin', () => {
  it('removes sensitive task payload, result, dedupe key, and preserves operational metadata', () => {
    const redacted = redactTaskForAdmin({
      id: 'task-1',
      userId: 'user-1',
      projectId: 'project-1',
      type: 'video',
      status: 'failed',
      payload: {
        prompt: 'private prompt',
        imageUrl: 'https://private.example/image.png',
      },
      result: {
        videoUrl: 'https://private.example/video.mp4',
      },
      dedupeKey: 'private-dedupe-key',
      billingInfo: {
        model: 'model-a',
      },
      errorMessage: 'request failed with api_key sk-private-secret',
      lastEnqueueError: 'bearer token leaked',
    })

    expect(redacted).not.toHaveProperty('payload')
    expect(redacted).not.toHaveProperty('result')
    expect(redacted).not.toHaveProperty('dedupeKey')
    expect(redacted).not.toHaveProperty('billingInfo')
    expect(JSON.stringify(redacted)).not.toContain('private prompt')
    expect(JSON.stringify(redacted)).not.toContain('private.example')
    expect(redacted.billingModel).toBe('model-a')
    expect(redacted.hasPayload).toBe(true)
    expect(redacted.hasResult).toBe(true)
    expect(redacted.errorMessage).not.toContain('sk-private-secret')
    expect(redacted.lastEnqueueError).not.toContain('bearer token leaked')
  })
})
