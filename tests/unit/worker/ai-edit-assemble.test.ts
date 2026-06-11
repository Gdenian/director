import { describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const assembleMock = vi.hoisted(() => ({
  assembleInitialAiEdit: vi.fn(async () => ({
    editorProjectId: 'editor-1',
    summary: 'assembled',
    degraded: false,
    warnings: [],
  })),
}))

vi.mock('@/lib/novel-promotion/ai-editing/assemble', () => assembleMock)

import { handleAiEditAssembleTask } from '@/lib/workers/handlers/ai-edit-assemble'

function buildJob(payload: Record<string, unknown> = {}) {
  return {
    data: {
      taskId: 'task-1',
      type: TASK_TYPE.AI_EDIT_ASSEMBLE,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'VideoEditorProject',
      targetId: 'episode-1',
      payload,
      userId: 'user-1',
    } satisfies TaskJobData,
  }
}

describe('AI edit assemble worker', () => {
  it('forwards task context to assemble orchestration', async () => {
    const result = await handleAiEditAssembleTask(buildJob() as never)

    expect(result).toEqual({
      editorProjectId: 'editor-1',
      summary: 'assembled',
      degraded: false,
      warnings: [],
    })
    expect(assembleMock.assembleInitialAiEdit).toHaveBeenCalledWith({
      taskId: 'task-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      payload: {},
    })
  })

  it('requires an episode id', async () => {
    const job = buildJob() as { data: TaskJobData }
    job.data.episodeId = undefined
    job.data.payload = {}

    await expect(handleAiEditAssembleTask(job as never)).rejects.toThrow('AI_EDIT_ASSEMBLE missing episodeId')
  })
})
