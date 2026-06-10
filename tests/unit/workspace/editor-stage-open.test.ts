import { describe, expect, it } from 'vitest'
import { resolveWorkspaceCurrentStage } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceProjectSnapshot'
import { buildWorkspaceStageNavigationItems } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageNavigation'

const emptyArtifacts = {
  hasStory: false,
  hasScript: false,
  hasAssets: false,
  hasStoryboard: false,
  hasVideo: false,
  hasVoice: false,
}

describe('workspace editor stage UI access', () => {
  it('keeps editor as the current stage instead of falling back to videos', () => {
    expect(resolveWorkspaceCurrentStage('editor')).toBe('editor')
  })

  it('does not mark the editor navigation item as disabled', () => {
    const items = buildWorkspaceStageNavigationItems({
      isAnyOperationRunning: false,
      stageArtifacts: emptyArtifacts,
      t: (key) => key,
    })

    const editorItem = items.find((item) => item.id === 'editor')

    expect(editorItem).toMatchObject({
      id: 'editor',
      label: 'stages.editor',
      status: 'empty',
    })
    expect(editorItem?.disabled).toBeUndefined()
    expect(editorItem?.disabledLabel).toBeUndefined()
  })
})
