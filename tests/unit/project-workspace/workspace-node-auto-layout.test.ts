import { describe, expect, it } from 'vitest'
import type { WorkspaceCanvasFlowNode } from '@/features/project-workspace/canvas/node-canvas-types'
import {
  alignSpaceConsistencyNodesToMeasuredEditScript,
  repairWorkspaceNodeOverlapsNearMovedNodes,
  workspaceCanvasNodesOverlap,
} from '@/features/project-workspace/canvas/layout/workspace-node-auto-layout'

type TestNodeKind = 'shot' | 'editScript' | 'spaceConsistency'

function createNode(input: {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly width?: number
  readonly height?: number
  readonly kind?: TestNodeKind
}): WorkspaceCanvasFlowNode {
  const kind = input.kind ?? 'shot'
  const width = input.width ?? 100
  const height = input.height ?? 100
  return {
    id: input.id,
    type: 'workspaceNode',
    position: { x: input.x, y: input.y },
    style: { width, height },
    data: {
      kind,
      layoutNodeType: kind,
      targetType: 'panel',
      targetId: input.id,
      title: input.id,
      eyebrow: 'shot',
      body: 'body',
      meta: 'meta',
      statusLabel: 'ready',
      width,
      height,
    },
  }
}

describe('workspace node auto layout', () => {
  it('keeps the dragged node fixed and only moves overlapping neighbors', () => {
    const dragged = createNode({ id: 'dragged', x: 100, y: 100 })
    const neighbor = createNode({ id: 'neighbor', x: 150, y: 100 })
    const far = createNode({ id: 'far', x: 600, y: 100 })

    const repaired = repairWorkspaceNodeOverlapsNearMovedNodes(
      [dragged, neighbor, far],
      new Set(['dragged']),
      { gap: 24 },
    )

    const repairedDragged = repaired.find((node) => node.id === 'dragged')
    const repairedNeighbor = repaired.find((node) => node.id === 'neighbor')
    const repairedFar = repaired.find((node) => node.id === 'far')

    expect(repairedDragged?.position).toEqual({ x: 100, y: 100 })
    expect(repairedNeighbor?.position).toEqual({ x: 224, y: 100 })
    expect(repairedFar?.position).toEqual({ x: 600, y: 100 })
    expect(repairedDragged && repairedNeighbor ? workspaceCanvasNodesOverlap(repairedDragged, repairedNeighbor) : true).toBe(false)
  })

  it('repairs even a one-pixel edge overlap', () => {
    const dragged = createNode({ id: 'dragged', x: 100, y: 100 })
    const neighbor = createNode({ id: 'neighbor', x: 199, y: 100 })

    expect(workspaceCanvasNodesOverlap(dragged, neighbor)).toBe(true)

    const repaired = repairWorkspaceNodeOverlapsNearMovedNodes(
      [dragged, neighbor],
      new Set(['dragged']),
      { gap: 24 },
    )

    const repairedDragged = repaired.find((node) => node.id === 'dragged')
    const repairedNeighbor = repaired.find((node) => node.id === 'neighbor')

    expect(repairedDragged?.position).toEqual({ x: 100, y: 100 })
    expect(repairedNeighbor?.position).toEqual({ x: 224, y: 100 })
    expect(repairedDragged && repairedNeighbor ? workspaceCanvasNodesOverlap(repairedDragged, repairedNeighbor) : true).toBe(false)
  })

  it('pushes only the local collision chain when a neighbor lands on another card', () => {
    const dragged = createNode({ id: 'dragged', x: 100, y: 100 })
    const firstNeighbor = createNode({ id: 'first-neighbor', x: 150, y: 100 })
    const secondNeighbor = createNode({ id: 'second-neighbor', x: 260, y: 100 })
    const far = createNode({ id: 'far', x: 700, y: 100 })

    const repaired = repairWorkspaceNodeOverlapsNearMovedNodes(
      [dragged, firstNeighbor, secondNeighbor, far],
      new Set(['dragged']),
      { gap: 24 },
    )

    const repairedDragged = repaired.find((node) => node.id === 'dragged')
    const repairedFirst = repaired.find((node) => node.id === 'first-neighbor')
    const repairedSecond = repaired.find((node) => node.id === 'second-neighbor')
    const repairedFar = repaired.find((node) => node.id === 'far')

    expect(repairedDragged?.position).toEqual({ x: 100, y: 100 })
    expect(repairedFirst?.position).toEqual({ x: 224, y: 100 })
    expect(repairedSecond?.position).toEqual({ x: 348, y: 100 })
    expect(repairedFar?.position).toEqual({ x: 700, y: 100 })
    expect(repairedFirst && repairedSecond ? workspaceCanvasNodesOverlap(repairedFirst, repairedSecond) : true).toBe(false)
  })

  it('centers the space consistency node against the measured edit script height', () => {
    const editScript = createNode({
      id: 'edit-script:long',
      kind: 'editScript',
      x: 320,
      y: 600,
      width: 720,
      height: 1440,
    })
    const spaceConsistency = createNode({
      id: 'space-consistency:storyboard',
      kind: 'spaceConsistency',
      x: 1200,
      y: 1800,
      width: 640,
      height: 520,
    })
    const shot = createNode({ id: 'shot:1', kind: 'shot', x: 2000, y: 600 })

    const aligned = alignSpaceConsistencyNodesToMeasuredEditScript([editScript, spaceConsistency, shot])
    const alignedSpaceConsistency = aligned.find((node) => node.id === spaceConsistency.id)

    expect(alignedSpaceConsistency?.position.x).toBe(1112)
    expect(alignedSpaceConsistency?.position.y).toBe(1060)
    expect(shot.position).toEqual({ x: 2000, y: 600 })
  })
})
