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
      RENDER: 'director-render',
    })
  })

  it('routes AI editing task types to their worker queues', async () => {
    const { getQueueTypeByTaskType, QUEUE_NAME } = await import('@/lib/task/queues')
    const { TASK_TYPE } = await import('@/lib/task/types')

    expect(getQueueTypeByTaskType(TASK_TYPE.AI_EDIT_ASSEMBLE)).toBe('text')
    expect(getQueueTypeByTaskType(TASK_TYPE.AI_EDIT_REFINE)).toBe('text')
    expect(getQueueTypeByTaskType(TASK_TYPE.AI_EDIT_TRANSITION_BRIDGE)).toBe('video')
    expect(getQueueTypeByTaskType(TASK_TYPE.EDITOR_RENDER)).toBe('render')
    expect(QUEUE_NAME.RENDER).toBe('director-render')
  })
})
