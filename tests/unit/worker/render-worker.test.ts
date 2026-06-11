import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

type WorkerProcessor = (job: Job<TaskJobData>) => Promise<unknown>

const workerState = vi.hoisted(() => ({
  processor: null as WorkerProcessor | null,
}))

const sharedMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  withTaskLifecycle: vi.fn(async (job: Job<TaskJobData>, handler: WorkerProcessor) => await handler(job)),
}))

const renderMock = vi.hoisted(() => ({
  renderEditorProject: vi.fn(async () => ({
    editorProjectId: 'editor-1',
    outputUrl: '/m/output.mp4',
  })),
}))

vi.mock('bullmq', () => ({
  Queue: class {
    constructor(_name: string) {}
  },
  Worker: class {
    constructor(_name: string, processor: WorkerProcessor) {
      workerState.processor = processor
    }
  },
}))
vi.mock('@/lib/redis', () => ({ queueRedis: {} }))
vi.mock('@/lib/workers/shared', () => sharedMock)
vi.mock('@/lib/novel-promotion/ai-editing/render-worker', () => renderMock)

function buildJob(overrides: Partial<TaskJobData> = {}): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-render-1',
      type: TASK_TYPE.EDITOR_RENDER,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'VideoEditorProject',
      targetId: 'editor-1',
      payload: { editorProjectId: 'editor-1', burnSubtitles: true, quality: 'draft' },
      userId: 'user-1',
      ...overrides,
    },
  } as unknown as Job<TaskJobData>
}

describe('render worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    workerState.processor = null
  })

  it('dispatches editor render tasks to the render pipeline', async () => {
    const { createRenderWorker } = await import('@/lib/workers/render.worker')
    createRenderWorker()

    const result = await workerState.processor?.(buildJob())

    expect(result).toEqual({ editorProjectId: 'editor-1', outputUrl: '/m/output.mp4' })
    expect(renderMock.renderEditorProject).toHaveBeenCalledWith({
      taskId: 'task-render-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      editorProjectId: 'editor-1',
      burnSubtitles: true,
      quality: 'draft',
      payload: { editorProjectId: 'editor-1', burnSubtitles: true, quality: 'draft' },
    })
  })

  it('rejects unsupported render queue task types', async () => {
    const { createRenderWorker } = await import('@/lib/workers/render.worker')
    createRenderWorker()

    await expect(workerState.processor?.(buildJob({ type: TASK_TYPE.VIDEO_PANEL }))).rejects.toThrow('Unsupported render task type')
  })
})
