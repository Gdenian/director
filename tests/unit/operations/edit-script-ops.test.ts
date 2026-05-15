import { describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { createEditScriptOperations } from '@/lib/operations/domains/media/edit-script-ops'
import { TASK_TYPE } from '@/lib/task/types'

const serviceMock = vi.hoisted(() => ({
  generateProjectEditScreenplay: vi.fn(async () => ({
    id: 'screenplay-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    userPrompt: 'make a short film',
    screenplayText: 'INT. ORBITAL DOCK - NIGHT',
    status: 'ready',
  })),
  generateProjectEditScript: vi.fn(async () => ({
    id: 'edit-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    title: 'Orbital Dock',
    logline: 'A pilot lands.',
    durationSec: 30,
    shotCount: 6,
    status: 'ready',
    requirements: [],
    videoBlocks: [
      { kind: 'group', shotNumbers: [1, 2] },
      { kind: 'single', shotNumbers: [3] },
    ],
  })),
  generateProjectEditScriptAssets: vi.fn(async () => ({
    id: 'edit-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    title: 'Orbital Dock',
    durationSec: 30,
    shotCount: 6,
    status: 'ready',
    requirements: [
      { id: 'req-1', kind: 'character', name: 'Pilot', status: 'generating', targetId: 'character-1' },
    ],
    videoBlocks: [],
  })),
  generateProjectEditScriptStoryboard: vi.fn(async () => ({
    storyboardId: 'storyboard-1',
    panelCount: 6,
    submittedImageTasks: 6,
  })),
}))

vi.mock('@/lib/edit-script/service', () => serviceMock)

const submitOperationTaskMock = vi.hoisted(() => ({
  submitOperationTask: vi.fn(async () => ({
    success: true,
    async: true,
    taskId: 'task-edit-script-1',
    runId: 'run-1',
    status: 'queued',
    deduped: false,
  })),
}))

vi.mock('@/lib/operations/submit-operation-task', () => submitOperationTaskMock)

function buildContext() {
  return {
    request: new Request('http://localhost') as unknown as NextRequest,
    userId: 'user-1',
    projectId: 'project-1',
    source: 'assistant-panel',
    context: {
      locale: 'zh',
      episodeId: 'episode-1',
    },
    writer: null,
  }
}

describe('edit-script operations', () => {
  it('exposes edit-first artifacts as independent operations', () => {
    const operations = createEditScriptOperations()

    expect(Object.keys(operations).sort()).toEqual([
      'generate_edit_screenplay',
      'generate_edit_script',
      'generate_edit_script_assets',
      'generate_edit_script_storyboard',
    ])
    expect(operations.generate_edit_script?.summary).toContain('Fails if no ready screenplay exists')
    expect(operations.generate_edit_script?.confirmation?.required).toBe(true)
  })

  it('passes context episode and locale into screenplay generation', async () => {
    const operations = createEditScriptOperations()
    const result = await operations.generate_edit_screenplay.execute(buildContext(), {
      prompt: 'make a short film',
      confirmed: true,
    })

    const screenplay = result as { readonly id: string }
    expect(screenplay.id).toBe('screenplay-1')
    expect(serviceMock.generateProjectEditScreenplay).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      userId: 'user-1',
      episodeId: 'episode-1',
      locale: 'zh',
      prompt: 'make a short film',
    }))
  })

  it('submits edit script generation as an async episode task', async () => {
    const operations = createEditScriptOperations()
    const result = await operations.generate_edit_script.execute(buildContext(), {
      prompt: 'make a short film',
      screenplayId: 'screenplay-1',
      confirmed: true,
    })

    expect(result).toEqual(expect.objectContaining({
      success: true,
      async: true,
      taskId: 'task-edit-script-1',
      episodeId: 'episode-1',
    }))
    expect(serviceMock.generateProjectEditScript).not.toHaveBeenCalled()
    expect(submitOperationTaskMock.submitOperationTask).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      userId: 'user-1',
      episodeId: 'episode-1',
      type: TASK_TYPE.EDIT_SCRIPT_GENERATE,
      targetType: 'ProjectEpisode',
      targetId: 'episode-1',
      operationId: 'generate_edit_script',
      confirmed: true,
      payload: expect.objectContaining({
        episodeId: 'episode-1',
        prompt: 'make a short film',
        screenplayId: 'screenplay-1',
      }),
    }))
  })
})
