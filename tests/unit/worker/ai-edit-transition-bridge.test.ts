import { describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const bridgeMock = vi.hoisted(() => ({
  generateTransitionBridgeAsset: vi.fn(async () => ({
    editorAssetId: 'asset-1',
    url: '/m/bridge-video.mp4',
    durationMs: 1200,
  })),
}))

vi.mock('@/lib/novel-promotion/ai-editing/bridge', () => bridgeMock)

import { handleAiEditTransitionBridgeTask } from '@/lib/workers/handlers/ai-edit-transition-bridge'

function buildJob(payload: Record<string, unknown> = {}) {
  return {
    data: {
      taskId: 'task-1',
      type: TASK_TYPE.AI_EDIT_TRANSITION_BRIDGE,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'VideoEditorAsset',
      targetId: 'asset-1',
      payload,
      userId: 'user-1',
    } satisfies TaskJobData,
  }
}

describe('AI transition bridge worker', () => {
  it('returns editor asset output without panel output fields', async () => {
    const result = await handleAiEditTransitionBridgeTask(buildJob({ editorAssetId: 'asset-1' }) as never)

    expect(result).toEqual({ editorAssetId: 'asset-1', url: '/m/bridge-video.mp4', durationMs: 1200 })
    expect(result).not.toHaveProperty('panelId')
    expect(result).not.toHaveProperty('videoUrl')
    expect(bridgeMock.generateTransitionBridgeAsset).toHaveBeenCalledWith({
      taskId: 'task-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      editorAssetId: 'asset-1',
      payload: { editorAssetId: 'asset-1' },
    })
  })
})
