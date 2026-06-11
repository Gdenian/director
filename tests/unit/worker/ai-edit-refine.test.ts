import { describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const refineMock = vi.hoisted(() => ({
  refineAiEdit: vi.fn(async () => ({
    editorProjectId: 'editor-1',
    pendingVersionId: 'version-2',
    summary: 'faster pacing',
    warnings: [],
  })),
}))

vi.mock('@/lib/novel-promotion/ai-editing/refine', () => refineMock)

import { handleAiEditRefineTask } from '@/lib/workers/handlers/ai-edit-refine'

function buildJob(payload: Record<string, unknown> = {}) {
  return {
    data: {
      taskId: 'task-1',
      type: TASK_TYPE.AI_EDIT_REFINE,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'VideoEditorProject',
      targetId: 'editor-1',
      payload,
      userId: 'user-1',
    } satisfies TaskJobData,
  }
}

describe('AI edit refine worker', () => {
  it('forwards instruction and task context to refine orchestration', async () => {
    const result = await handleAiEditRefineTask(buildJob({ instruction: '节奏更快' }) as never)

    expect(result).toEqual({
      editorProjectId: 'editor-1',
      pendingVersionId: 'version-2',
      summary: 'faster pacing',
      warnings: [],
    })
    expect(refineMock.refineAiEdit).toHaveBeenCalledWith({
      taskId: 'task-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      instruction: '节奏更快',
      payload: { instruction: '节奏更快' },
    })
  })

  it('requires a non-empty instruction', async () => {
    await expect(handleAiEditRefineTask(buildJob({ instruction: '   ' }) as never)).rejects.toThrow('AI_EDIT_REFINE missing instruction')
  })
})
