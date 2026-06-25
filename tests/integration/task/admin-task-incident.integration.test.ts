import { beforeEach, describe, expect, it, vi } from 'vitest'

import { prisma } from '../../helpers/prisma'
import { resetBillingState } from '../../helpers/db-reset'
import { createQueuedTask, createTestProject, createTestUser, seedBalance } from '../../helpers/billing-fixtures'
import { freezeBalance } from '@/lib/billing/ledger'
import { cancelAdminTask, createTaskIncident } from '@/lib/admin/tasks'
import { TASK_EVENT_TYPE, TASK_STATUS, TASK_TYPE, type TaskBillingInfo } from '@/lib/task/types'

vi.mock('@/lib/task/queues', () => ({
  removeTaskJob: vi.fn(async () => true),
}))

vi.mock('@/lib/redis', () => ({
  redis: { publish: vi.fn(async () => 1) },
}))

vi.mock('@/lib/run-runtime/publisher', () => ({
  publishRunEvent: vi.fn(async () => ({})),
}))

describe('admin task incident handling', () => {
  beforeEach(async () => {
    await resetBillingState()
  })

  it('cancels queued task, rolls back pending freeze, and writes user-visible failed event', async () => {
    const user = await createTestUser()
    const project = await createTestProject(user.id)
    await seedBalance(user.id, 10)
    const freezeId = await freezeBalance(user.id, 2, {
      source: 'task',
      taskId: 'task-incident-1',
      idempotencyKey: 'incident-task-1',
    })
    expect(freezeId).toBeTruthy()

    const billingInfo: TaskBillingInfo = {
      billable: true,
      source: 'task',
      taskType: TASK_TYPE.VIDEO_PANEL,
      apiType: 'video',
      model: 'video-model',
      quantity: 1,
      unit: 'video',
      maxFrozenCost: 2,
      action: TASK_TYPE.VIDEO_PANEL,
      freezeId,
      modeSnapshot: 'ENFORCE',
      status: 'frozen',
    }
    const task = await createQueuedTask({
      id: 'task-incident-1',
      userId: user.id,
      projectId: project.id,
      type: TASK_TYPE.VIDEO_PANEL,
      targetType: 'panel',
      targetId: 'panel-1',
      billingInfo,
      payload: { prompt: 'private prompt' },
    })

    const result = await cancelAdminTask(task.id, '运营取消')

    expect(result.cancelled).toBe(true)
    expect(result.freezeRolledBack).toBe(true)
    const reloaded = await prisma.task.findUnique({ where: { id: task.id } })
    expect(reloaded).toMatchObject({
      status: TASK_STATUS.CANCELED,
      errorCode: 'TASK_CANCELLED',
    })
    const freeze = await prisma.balanceFreeze.findUnique({ where: { id: freezeId! } })
    expect(freeze?.status).toBe('rolled_back')
    const balance = await prisma.userBalance.findUnique({ where: { userId: user.id } })
    expect(String(balance?.balance)).toBe('10')
    expect(String(balance?.frozenAmount)).toBe('0')
    const event = await prisma.taskEvent.findFirst({
      where: {
        taskId: task.id,
        eventType: TASK_EVENT_TYPE.FAILED,
      },
    })
    expect(event).toBeTruthy()
    expect(event?.payload).toMatchObject({
      lifecycleType: TASK_EVENT_TYPE.FAILED,
      stage: 'cancelled',
      cancelled: true,
      reason: '运营取消',
      source: 'admin',
    })
    expect(JSON.stringify(event?.payload)).not.toContain('private prompt')
  })

  it('batch cancels stale queued tasks and records redacted incident items', async () => {
    const user = await createTestUser()
    const project = await createTestProject(user.id)
    const staleDate = new Date(Date.now() - 90 * 60_000)

    const first = await createQueuedTask({
      id: 'task-incident-batch-1',
      userId: user.id,
      projectId: project.id,
      type: TASK_TYPE.VIDEO_PANEL,
      targetType: 'panel',
      targetId: 'panel-batch-1',
      billingInfo: {
        billable: true,
        source: 'task',
        taskType: TASK_TYPE.VIDEO_PANEL,
        apiType: 'video',
        model: 'private-billing-model',
        quantity: 1,
        unit: 'video',
        maxFrozenCost: 2,
        action: TASK_TYPE.VIDEO_PANEL,
        modeSnapshot: 'ENFORCE',
        status: 'frozen',
      },
      payload: { prompt: 'private prompt one', apiKey: 'secret-key-one' },
    })
    const second = await createQueuedTask({
      id: 'task-incident-batch-2',
      userId: user.id,
      projectId: project.id,
      type: TASK_TYPE.VIDEO_PANEL,
      targetType: 'panel',
      targetId: 'panel-batch-2',
      billingInfo: {
        billable: true,
        source: 'task',
        taskType: TASK_TYPE.VIDEO_PANEL,
        apiType: 'video',
        model: 'private-billing-model',
        quantity: 1,
        unit: 'video',
        maxFrozenCost: 2,
        action: TASK_TYPE.VIDEO_PANEL,
        modeSnapshot: 'ENFORCE',
        status: 'frozen',
      },
      payload: { prompt: 'private prompt two', token: 'secret-token-two' },
    })
    await prisma.task.updateMany({
      where: { id: { in: [first.id, second.id] } },
      data: { createdAt: staleDate, updatedAt: staleDate },
    })

    const incident = await createTaskIncident({
      title: '取消卡死视频任务',
      action: 'cancel',
      reason: '队列事故',
      createdBy: 'owner-1',
      filter: {
        status: [TASK_STATUS.QUEUED],
        type: [TASK_TYPE.VIDEO_PANEL],
        userId: user.id,
        projectId: project.id,
        olderThanMinutes: 30,
        limit: 10,
      },
    })

    expect(incident.status).toBe('completed')
    expect(incident.counts).toEqual({ total: 2, completed: 2, failed: 0 })
    expect(incident.items).toHaveLength(2)
    expect(incident.items.every(item => item.status === 'completed')).toBe(true)

    const canceledCount = await prisma.task.count({
      where: {
        id: { in: [first.id, second.id] },
        status: TASK_STATUS.CANCELED,
      },
    })
    expect(canceledCount).toBe(2)

    const persistedItems = await prisma.adminTaskIncidentItem.findMany({
      where: { incidentId: incident.id },
      orderBy: { taskId: 'asc' },
    })
    expect(persistedItems).toHaveLength(2)
    const jsonText = JSON.stringify({ incident, persistedItems })
    expect(jsonText).not.toContain('payload')
    expect(jsonText).not.toContain('result')
    expect(jsonText).not.toContain('billingInfo')
    expect(jsonText).not.toContain('dedupeKey')
    expect(jsonText).not.toContain('private prompt')
    expect(jsonText).not.toContain('secret-key-one')
    expect(jsonText).not.toContain('secret-token-two')
  })

  it('marks incident item failed when a matched task is not actually cancelled', async () => {
    const user = await createTestUser()
    const project = await createTestProject(user.id)
    const task = await createQueuedTask({
      id: 'task-incident-race-1',
      userId: user.id,
      projectId: project.id,
      type: TASK_TYPE.VIDEO_PANEL,
      targetType: 'panel',
      targetId: 'panel-race',
      payload: { prompt: 'private race prompt' },
    })
    await prisma.task.update({
      where: { id: task.id },
      data: { status: TASK_STATUS.COMPLETED },
    })

    const incident = await createTaskIncident({
      title: '取消已完成任务',
      action: 'cancel',
      reason: '竞态检查',
      createdBy: 'owner-1',
      filter: {
        status: [TASK_STATUS.COMPLETED],
        type: [TASK_TYPE.VIDEO_PANEL],
        userId: user.id,
        limit: 5,
      },
    })

    expect(incident.status).toBe('partial_failed')
    expect(incident.counts).toEqual({ total: 1, completed: 0, failed: 1 })
    expect(incident.items[0]?.status).toBe('failed')
    expect(incident.items[0]?.errorMessage).toContain('Task was not cancelled')
    expect(JSON.stringify(incident)).not.toContain('private race prompt')
  })
})
