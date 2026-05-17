import { describe, expect, it } from 'vitest'
import {
  getWorkspaceCanvasNodePresentationProfile,
  resolveWorkspaceCanvasNodeSize,
} from '@/features/project-workspace/canvas/node-presentation-profiles'

describe('workspace canvas node presentation profiles', () => {
  it('gives BGM score nodes a wider expanded presentation without changing collapsed size', () => {
    const bgmProfile = getWorkspaceCanvasNodePresentationProfile('bgmScore')

    expect(bgmProfile.collapsed).toEqual({ width: 420, height: 320 })
    expect(bgmProfile.expanded).toEqual({ width: 960, height: 680 })
    expect(bgmProfile.expandedLayout).toBe('wide')
    expect(resolveWorkspaceCanvasNodeSize({
      kind: 'bgmScore',
      expanded: false,
      collapsedSize: bgmProfile.collapsed,
    })).toEqual({ width: 420, height: 320 })
    expect(resolveWorkspaceCanvasNodeSize({
      kind: 'bgmScore',
      expanded: true,
      collapsedSize: bgmProfile.collapsed,
    })).toEqual({ width: 960, height: 680 })
  })

  it('keeps node types without an expanded size on their projected collapsed dimensions', () => {
    expect(resolveWorkspaceCanvasNodeSize({
      kind: 'shot',
      expanded: true,
      collapsedSize: { width: 320, height: 560 },
    })).toEqual({ width: 320, height: 560 })
  })
})
