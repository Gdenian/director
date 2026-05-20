import ELK, { type ElkExtendedEdge, type ElkNode } from 'elkjs/lib/elk.bundled'
import type { WorkspaceCanvasFlowEdge, WorkspaceCanvasFlowNode } from '../node-canvas-types'

export interface WorkspaceCanvasPosition {
  readonly x: number
  readonly y: number
}

export interface WorkspaceCanvasNodeSize {
  readonly width: number
  readonly height: number
}

export interface WorkspaceCanvasGraphNode {
  readonly id: string
  readonly kind: WorkspaceCanvasFlowNode['data']['kind']
  readonly targetType: WorkspaceCanvasFlowNode['data']['targetType']
  readonly targetId: string
  readonly data: WorkspaceCanvasFlowNode['data']
  readonly estimatedSize: WorkspaceCanvasNodeSize
  readonly measuredSize?: WorkspaceCanvasNodeSize
  readonly order: number
  readonly lane: string
  readonly lockedPosition?: WorkspaceCanvasPosition
}

export interface WorkspaceCanvasGraphEdge {
  readonly id: string
  readonly source: string
  readonly target: string
}

export interface WorkspaceCanvasLayoutNode {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type WorkspaceCanvasLayoutResult = ReadonlyMap<string, WorkspaceCanvasLayoutNode>

export interface WorkspaceCanvasElkLayoutInput {
  readonly nodes: readonly WorkspaceCanvasGraphNode[]
  readonly edges: readonly WorkspaceCanvasGraphEdge[]
  readonly expansionAnchors?: ReadonlyMap<string, WorkspaceCanvasPosition>
}

export const WORKSPACE_CANVAS_ELK_LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'org.eclipse.elk.edgeRouting': 'ORTHOGONAL',
  'org.eclipse.elk.spacing.nodeNode': '72',
  'org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers': '180',
  'org.eclipse.elk.interactiveLayout': 'true',
} as const

const elk = new ELK({
  defaultLayoutOptions: WORKSPACE_CANVAS_ELK_LAYOUT_OPTIONS,
})

function nodeSize(node: WorkspaceCanvasGraphNode): WorkspaceCanvasNodeSize {
  return node.measuredSize ?? node.estimatedSize
}

function finitePosition(position: WorkspaceCanvasPosition | undefined): WorkspaceCanvasPosition | undefined {
  if (!position) return undefined
  return Number.isFinite(position.x) && Number.isFinite(position.y) ? position : undefined
}

function graphNodeInitialPosition(node: WorkspaceCanvasGraphNode): WorkspaceCanvasPosition | undefined {
  return finitePosition(node.lockedPosition)
}

export function buildWorkspaceCanvasElkGraph(input: WorkspaceCanvasElkLayoutInput): ElkNode {
  const children: ElkNode[] = input.nodes.map((node) => {
    const size = nodeSize(node)
    const position = graphNodeInitialPosition(node)
    return {
      id: node.id,
      width: size.width,
      height: size.height,
      ...(position ? { x: position.x, y: position.y } : {}),
      layoutOptions: {
        'elk.priority': String(node.order),
      },
    }
  })
  const nodeIds = new Set(children.map((node) => node.id))
  const edges: ElkExtendedEdge[] = input.edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    }))

  return {
    id: 'workspace-canvas-root',
    layoutOptions: WORKSPACE_CANVAS_ELK_LAYOUT_OPTIONS,
    children,
    edges,
  }
}

export function mapElkResultToWorkspaceCanvasLayout(result: ElkNode): WorkspaceCanvasLayoutResult {
  const children = result.children ?? []
  const layout = new Map<string, WorkspaceCanvasLayoutNode>()
  children.forEach((child) => {
    if (
      typeof child.x !== 'number' ||
      typeof child.y !== 'number' ||
      typeof child.width !== 'number' ||
      typeof child.height !== 'number'
    ) {
      throw new Error(`ELK layout result missing coordinates for node ${child.id}`)
    }
    layout.set(child.id, {
      x: child.x,
      y: child.y,
      width: child.width,
      height: child.height,
    })
  })
  return layout
}

function anchorTranslation(input: {
  readonly layout: WorkspaceCanvasLayoutResult
  readonly expansionAnchors?: ReadonlyMap<string, WorkspaceCanvasPosition>
}): WorkspaceCanvasPosition | null {
  if (!input.expansionAnchors || input.expansionAnchors.size === 0) return null
  for (const [nodeId, anchor] of input.expansionAnchors) {
    const layoutNode = input.layout.get(nodeId)
    if (layoutNode) {
      return {
        x: anchor.x - layoutNode.x,
        y: anchor.y - layoutNode.y,
      }
    }
  }
  return null
}

function applyAnchors(input: WorkspaceCanvasElkLayoutInput, layout: WorkspaceCanvasLayoutResult): WorkspaceCanvasLayoutResult {
  const translation = anchorTranslation({ layout, expansionAnchors: input.expansionAnchors })
  const anchoredLayout = new Map<string, WorkspaceCanvasLayoutNode>()
  layout.forEach((nodeLayout, nodeId) => {
    anchoredLayout.set(nodeId, translation
      ? {
          ...nodeLayout,
          x: nodeLayout.x + translation.x,
          y: nodeLayout.y + translation.y,
        }
      : nodeLayout)
  })
  input.nodes.forEach((node) => {
    const fixedPosition = input.expansionAnchors?.get(node.id) ?? node.lockedPosition
    if (!fixedPosition) return
    const nodeLayout = anchoredLayout.get(node.id)
    if (!nodeLayout) return
    anchoredLayout.set(node.id, {
      ...nodeLayout,
      x: fixedPosition.x,
      y: fixedPosition.y,
    })
  })
  return anchoredLayout
}

export async function runWorkspaceCanvasElkLayout(
  input: WorkspaceCanvasElkLayoutInput,
): Promise<WorkspaceCanvasLayoutResult> {
  const graph = buildWorkspaceCanvasElkGraph(input)
  const result = await elk.layout(graph)
  return applyAnchors(input, mapElkResultToWorkspaceCanvasLayout(result))
}

export function buildWorkspaceCanvasGraphEdges(
  edges: readonly WorkspaceCanvasFlowEdge[],
): WorkspaceCanvasGraphEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
  }))
}

export function applyWorkspaceCanvasLayoutToNodes(
  nodes: readonly WorkspaceCanvasFlowNode[],
  layout: WorkspaceCanvasLayoutResult,
): WorkspaceCanvasFlowNode[] {
  return nodes.map((node) => {
    const nodeLayout = layout.get(node.id)
    if (!nodeLayout) return node
    return {
      ...node,
      position: {
        x: nodeLayout.x,
        y: nodeLayout.y,
      },
      style: {
        ...node.style,
        width: nodeLayout.width,
        height: nodeLayout.height,
      },
      data: {
        ...node.data,
        width: nodeLayout.width,
        height: nodeLayout.height,
      },
    }
  })
}
