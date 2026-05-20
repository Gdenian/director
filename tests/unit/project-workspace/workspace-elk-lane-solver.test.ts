import { describe, expect, it } from 'vitest'
import type { ElkNode } from 'elkjs/lib/elk.bundled'
import type { WorkspaceCanvasFlowNode } from '@/features/project-workspace/canvas/node-canvas-types'
import type { CanvasLayoutNodeType } from '@/lib/project-canvas/layout/canvas-layout-contract'
import { buildWorkspaceCanvasLayoutModel } from '@/features/project-workspace/canvas/layout/workspace-layout-model'
import {
  mapElkLaneResultToWorkspaceLayout,
  runWorkspaceElkLaneLayout,
} from '@/features/project-workspace/canvas/layout/workspace-elk-lane-solver'

function createNode(input: {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly width?: number
  readonly height?: number
  readonly kind?: WorkspaceCanvasFlowNode['data']['kind']
}): WorkspaceCanvasFlowNode {
  const kind = input.kind ?? 'videoPlan'
  const width = input.width ?? 180
  const height = input.height ?? 120
  const layoutNodeType: CanvasLayoutNodeType = kind === 'storyInput' ? 'story' : kind
  return {
    id: input.id,
    type: 'workspaceNode',
    position: { x: input.x, y: input.y },
    style: { width, height },
    data: {
      kind,
      layoutNodeType,
      targetType: 'panel',
      targetId: input.id,
      title: input.id,
      eyebrow: 'node',
      body: 'body',
      meta: 'meta',
      statusLabel: 'ready',
      width,
      height,
    },
  }
}

function overlap(
  left: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  right: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  )
}

describe('workspace ELK lane solver', () => {
  it('lays out one constrained lane without overlapping nodes', async () => {
    const model = buildWorkspaceCanvasLayoutModel({
      nodes: [
        createNode({ id: 'video-plan:1', x: 0, y: 0 }),
        createNode({ id: 'video-plan:2', x: 0, y: 0 }),
      ],
    })

    const result = await runWorkspaceElkLaneLayout({
      model,
      lane: 'videoPlan',
      direction: 'DOWN',
    })
    const first = result.get('video-plan:1')
    const second = result.get('video-plan:2')

    expect(first).toEqual(expect.objectContaining({ width: 180, height: 120 }))
    expect(second).toEqual(expect.objectContaining({ width: 180, height: 120 }))
    expect(first && second ? overlap(first, second) : true).toBe(false)
  })

  it('keeps fixed anchors exact instead of accepting ELK movement', () => {
    const fixedAnchorPositions = new Map([['video-plan:anchor', { x: 420, y: 240 }]])
    const model = buildWorkspaceCanvasLayoutModel({
      nodes: [createNode({ id: 'video-plan:anchor', x: 0, y: 0 })],
      fixedAnchorPositions,
    })
    const elkResult: ElkNode = {
      id: 'lane',
      children: [{
        id: 'video-plan:anchor',
        x: 10,
        y: 20,
        width: 180,
        height: 120,
      }],
    }

    const result = mapElkLaneResultToWorkspaceLayout(elkResult, {
      model,
      lane: 'videoPlan',
      previousPositions: fixedAnchorPositions,
    })

    expect(result.get('video-plan:anchor')).toEqual({
      x: 420,
      y: 240,
      width: 180,
      height: 120,
    })
  })

  it('throws when ELK omits required coordinates', () => {
    const model = buildWorkspaceCanvasLayoutModel({
      nodes: [createNode({ id: 'video-plan:bad', x: 0, y: 0 })],
    })
    const elkResult: ElkNode = {
      id: 'lane',
      children: [{
        id: 'video-plan:bad',
        width: 180,
        height: 120,
      }],
    }

    expect(() => mapElkLaneResultToWorkspaceLayout(elkResult, {
      model,
      lane: 'videoPlan',
    })).toThrow('ELK lane layout returned invalid x for node video-plan:bad.')
  })
})
