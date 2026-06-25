import { beforeEach, describe, expect, it, vi } from 'vitest'

const cancelTaskMock = vi.hoisted(() => vi.fn())
const removeTaskJobMock = vi.hoisted(() => vi.fn(async () => true))
const publishTaskEventMock = vi.hoisted(() => vi.fn(async () => ({})))

vi.mock('@/lib/task/service', () => ({
  cancelTask: cancelTaskMock,
}))

vi.mock('@/lib/task/queues', () => ({
  removeTaskJob: removeTaskJobMock,
}))

vi.mock('@/lib/task/publisher', () => ({
  publishTaskEvent: publishTaskEventMock,
}))

describe('admin task incident service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('publishes a user-visible failed event and reports billing rollback when admin cancels an active task', async () => {
    cancelTaskMock.mockResolvedValue({
      cancelled: true,
      billingRollback: {
        attempted: true,
        rolledBack: true,
      },
      task: {
        id: 'task-1',
        userId: 'user-1',
        projectId: 'project-1',
        episodeId: 'episode-1',
        type: 'video_panel',
        targetType: 'panel',
        targetId: 'panel-1',
        status: 'canceled',
        progress: 0,
        attempt: 0,
        maxAttempts: 5,
        priority: 0,
        errorCode: 'TASK_CANCELLED',
        billingInfo: { billable: true, status: 'rolled_back' },
        payload: { prompt: 'private prompt' },
        result: null,
        queuedAt: new Date('2026-06-24T00:00:00.000Z'),
        startedAt: null,
        finishedAt: new Date('2026-06-24T00:01:00.000Z'),
        heartbeatAt: null,
        enqueuedAt: null,
        enqueueAttempts: 0,
        createdAt: new Date('2026-06-24T00:00:00.000Z'),
        updatedAt: new Date('2026-06-24T00:01:00.000Z'),
      },
    })

    const { cancelAdminTask } = await import('@/lib/admin/tasks')
    const result = await cancelAdminTask('task-1', '运营取消')

    expect(result).toMatchObject({
      cancelled: true,
      freezeRolledBack: true,
    })
    expect(removeTaskJobMock).toHaveBeenCalledWith('task-1')
    expect(publishTaskEventMock).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1',
      userId: 'user-1',
      projectId: 'project-1',
      type: 'task.failed',
      taskType: 'video_panel',
      targetType: 'panel',
      targetId: 'panel-1',
      episodeId: 'episode-1',
      payload: {
        stage: 'cancelled',
        cancelled: true,
        reason: '运营取消',
        source: 'admin',
      },
    }))
    expect(JSON.stringify(result)).not.toContain('private prompt')
  })
})

