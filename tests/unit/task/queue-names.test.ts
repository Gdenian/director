import { describe, expect, it, vi } from 'vitest'

vi.mock('bullmq', () => ({
  Queue: class {
    constructor(_queueName: string) {}
  },
}))

vi.mock('@/lib/redis', () => ({ queueRedis: {} }))

describe('task queue names', () => {
  it('uses director-prefixed queue names for every queue type', async () => {
    const { QUEUE_NAME } = await import('@/lib/task/queues')

    expect(QUEUE_NAME).toEqual({
      IMAGE: 'director-image',
      VIDEO: 'director-video',
      VOICE: 'director-voice',
      TEXT: 'director-text',
    })
  })
})
