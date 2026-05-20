import { describe, expect, it } from 'vitest'
import {
  mapElkResultToWorkspaceCanvasLayout,
  runWorkspaceCanvasElkLayout,
  type WorkspaceCanvasGraphNode,
} from '@/features/project-workspace/canvas/layout/workspace-layout-engine'

function graphNode(input: {
  readonly id: string
  readonly order: number
  readonly width?: number
  readonly height?: number
  readonly lockedPosition?: { readonly x: number; readonly y: number }
}): WorkspaceCanvasGraphNode {
  const width = input.width ?? 120
  const height = input.height ?? 80
  return {
    id: input.id,
    kind: 'shot',
    targetType: 'panel',
    targetId: input.id,
    data: {
      kind: 'shot',
      layoutNodeType: 'shot',
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
    estimatedSize: { width, height },
    order: input.order,
    lane: 'shot',
    lockedPosition: input.lockedPosition,
  }
}

function layoutsOverlap(
  left: NonNullable<ReturnType<Map<string, { readonly x: number; readonly y: number; readonly width: number; readonly height: number }>['get']>>,
  right: NonNullable<ReturnType<Map<string, { readonly x: number; readonly y: number; readonly width: number; readonly height: number }>['get']>>,
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  )
}

describe('workspace canvas ELK layout engine', () => {
  it('lays out a simple directed workflow from left to right', async () => {
    const layout = await runWorkspaceCanvasElkLayout({
      nodes: [
        graphNode({ id: 'story', order: 0 }),
        graphNode({ id: 'script', order: 1 }),
        graphNode({ id: 'video', order: 2 }),
      ],
      edges: [
        { id: 'story-script', source: 'story', target: 'script' },
        { id: 'script-video', source: 'script', target: 'video' },
      ],
    })

    const story = layout.get('story')
    const script = layout.get('script')
    const video = layout.get('video')

    expect(story).toBeDefined()
    expect(script).toBeDefined()
    expect(video).toBeDefined()
    expect(script?.x).toBeGreaterThan(story?.x ?? Number.POSITIVE_INFINITY)
    expect(video?.x).toBeGreaterThan(script?.x ?? Number.POSITIVE_INFINITY)
  })

  it('keeps differently sized nodes from overlapping', async () => {
    const layout = await runWorkspaceCanvasElkLayout({
      nodes: [
        graphNode({ id: 'wide', order: 0, width: 640, height: 280 }),
        graphNode({ id: 'tall', order: 1, width: 260, height: 820 }),
        graphNode({ id: 'small', order: 2, width: 160, height: 120 }),
      ],
      edges: [
        { id: 'wide-tall', source: 'wide', target: 'tall' },
        { id: 'wide-small', source: 'wide', target: 'small' },
      ],
    })

    const nodes = [...layout.values()]
    nodes.forEach((node, index) => {
      nodes.slice(index + 1).forEach((otherNode) => {
        expect(layoutsOverlap(node, otherNode)).toBe(false)
      })
    })
  })

  it('keeps an expanded node anchor fixed after ELK computes the graph', async () => {
    const anchor = { x: 840, y: 320 }
    const layout = await runWorkspaceCanvasElkLayout({
      nodes: [
        graphNode({ id: 'source', order: 0 }),
        graphNode({ id: 'expanded', order: 1, width: 760, height: 820 }),
        graphNode({ id: 'target', order: 2 }),
      ],
      edges: [
        { id: 'source-expanded', source: 'source', target: 'expanded' },
        { id: 'expanded-target', source: 'expanded', target: 'target' },
      ],
      expansionAnchors: new Map([['expanded', anchor]]),
    })

    expect(layout.get('expanded')).toMatchObject(anchor)
  })

  it('keeps locked manual nodes at their saved position', async () => {
    const lockedPosition = { x: 420, y: 180 }
    const layout = await runWorkspaceCanvasElkLayout({
      nodes: [
        graphNode({ id: 'locked', order: 0, lockedPosition }),
        graphNode({ id: 'next', order: 1 }),
      ],
      edges: [
        { id: 'locked-next', source: 'locked', target: 'next' },
      ],
    })

    expect(layout.get('locked')).toMatchObject(lockedPosition)
    expect(layout.get('next')).toBeDefined()
  })

  it('fails explicitly when ELK output does not contain coordinates', () => {
    expect(() => mapElkResultToWorkspaceCanvasLayout({
      id: 'root',
      children: [{ id: 'missing-position' }],
    })).toThrow('ELK layout result missing coordinates for node missing-position')
  })
})
