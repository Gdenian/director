import { describe, expect, it, vi } from 'vitest'
import {
  discardPendingEditorVersion,
  refreshProjectAfterRefineTask,
  runAiEditingAction,
} from '@/features/video-editor/hooks/useAiEditing'
import type { VideoEditorProject } from '@/features/video-editor/types/editor.types'

const projectWithPending: VideoEditorProject = {
  id: 'editor-1',
  episodeId: 'episode-1',
  schemaVersion: '1.2',
  config: { fps: 30, width: 1920, height: 1080, videoRatio: '16:9', burnSubtitlesDefault: true },
  timeline: [],
  audioTrack: [],
  subtitleCues: [],
  editorAssets: [],
  bgmTrack: [],
  pendingVersion: {
    versionId: 'version-1',
    summary: '更快',
    reason: 'ai_refine',
    createdAt: '2026-06-22T00:00:00.000Z',
  },
}

describe('useAiEditing helpers', () => {
  it('clears pendingVersion from the latest local project when discarding', async () => {
    const projectBeforeRequest = {
      ...projectWithPending,
      timeline: [{
        id: 'local-before-request',
        kind: 'source' as const,
        src: '/local.mp4',
        durationInFrames: 30,
        metadata: { storyboardId: 'storyboard-local' },
      }],
    }
    const projectAfterInFlightEdit = {
      ...projectBeforeRequest,
      timeline: [
        ...projectBeforeRequest.timeline,
        {
          id: 'local-during-request',
          kind: 'source' as const,
          src: '/during.mp4',
          durationInFrames: 45,
          metadata: { storyboardId: 'storyboard-during' },
        },
      ],
    }
    const discardPendingVersion = vi.fn(async () => ({
      success: true,
      projectData: { ...projectWithPending, timeline: [], pendingVersion: null },
    }))
    const onProjectChange = vi.fn()

    await discardPendingEditorVersion({
      discardPendingVersion,
      editorProjectId: 'editor-1',
      onProjectChange,
    })

    expect(discardPendingVersion).toHaveBeenCalledWith({ editorProjectId: 'editor-1' })
    const updater = onProjectChange.mock.calls[0]?.[0]
    expect(updater).toEqual(expect.any(Function))
    const updated = updater(projectAfterInFlightEdit)
    expect(updated.pendingVersion).toBeNull()
    expect(updated.timeline).toEqual(projectAfterInFlightEdit.timeline)
    expect(projectWithPending.pendingVersion).not.toBeNull()
  })

  it('waits for an async refine task before refreshing the editor project', async () => {
    const waitForTaskResult = vi.fn(async () => ({ success: true }))
    const refreshProject = vi.fn(async () => ({
      ...projectWithPending,
      pendingVersion: { ...projectWithPending.pendingVersion!, versionId: 'version-2' },
    }))

    await refreshProjectAfterRefineTask({
      refineResult: { async: true, taskId: 'task-1' },
      waitForTaskResult,
      refreshProject,
      intervalMs: 1,
      timeoutMs: 10,
    })

    expect(waitForTaskResult).toHaveBeenCalledWith('task-1', { intervalMs: 1, timeoutMs: 10 })
    expect(refreshProject).toHaveBeenCalledTimes(1)
  })

  it('captures action errors for UI feedback without leaking unhandled rejections', async () => {
    const setError = vi.fn()
    const setLoading = vi.fn()
    const failingAction = vi.fn(async () => {
      throw new Error('Import failed')
    })

    await expect(runAiEditingAction({
      setError,
      setLoading,
      action: failingAction,
    })).rejects.toThrow('Import failed')

    expect(setError).toHaveBeenCalledWith('Import failed')
    expect(setLoading).toHaveBeenNthCalledWith(1, true)
    expect(setLoading).toHaveBeenLastCalledWith(false)
  })
})
