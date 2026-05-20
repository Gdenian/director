import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled'
import type {
  WorkspaceCanvasLayoutLane,
  WorkspaceCanvasLayoutModel,
  WorkspaceCanvasLayoutPosition,
  WorkspaceCanvasLayoutSize,
} from './workspace-layout-model'

export type WorkspaceElkLaneDirection = 'RIGHT' | 'DOWN'

export interface WorkspaceCanvasLayoutResultNode {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type WorkspaceCanvasLayoutResult = ReadonlyMap<string, WorkspaceCanvasLayoutResultNode>

export interface RunWorkspaceElkLaneLayoutInput {
  readonly model: WorkspaceCanvasLayoutModel
  readonly lane: WorkspaceCanvasLayoutLane
  readonly direction?: WorkspaceElkLaneDirection
  readonly previousPositions?: ReadonlyMap<string, WorkspaceCanvasLayoutPosition>
}

const elk = new ELK()

function sizeForNode(node: {
  readonly measuredSize?: WorkspaceCanvasLayoutSize
  readonly estimatedSize: WorkspaceCanvasLayoutSize
}): WorkspaceCanvasLayoutSize {
  return node.measuredSize ?? node.estimatedSize
}

function buildElkLaneGraph(input: RunWorkspaceElkLaneLayoutInput): ElkNode {
  const laneNodes = input.model.nodes
    .filter((node) => node.lane === input.lane)
    .sort((left, right) => left.order - right.order)

  return {
    id: `workspace-lane:${input.lane}`,
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': input.direction ?? 'DOWN',
      'org.eclipse.elk.edgeRouting': 'ORTHOGONAL',
      'org.eclipse.elk.spacing.nodeNode': '72',
      'org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers': '180',
      'org.eclipse.elk.interactiveLayout': 'true',
      'org.eclipse.elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    },
    children: laneNodes.map((node) => {
      const size = sizeForNode(node)
      const interactivePosition = input.previousPositions?.get(node.id) ?? node.basePosition
      return {
        id: node.id,
        width: size.width,
        height: size.height,
        x: interactivePosition.x,
        y: interactivePosition.y,
        layoutOptions: {
          'org.eclipse.elk.position': `${interactivePosition.x},${interactivePosition.y}`,
          'org.eclipse.elk.layered.priority.direction': String(laneNodes.length - node.order),
        },
      }
    }),
    edges: input.model.layoutEdges
      .filter((edge) => {
        const source = input.model.nodes.find((node) => node.id === edge.source)
        const target = input.model.nodes.find((node) => node.id === edge.target)
        return source?.lane === input.lane && target?.lane === input.lane
      })
      .map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
  }
}

function requiredNumber(value: number | undefined, field: string, nodeId: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`ELK lane layout returned invalid ${field} for node ${nodeId}.`)
  }
  return value
}

export function mapElkLaneResultToWorkspaceLayout(
  result: ElkNode,
  input: RunWorkspaceElkLaneLayoutInput,
): WorkspaceCanvasLayoutResult {
  const anchoredPositions = new Map<string, WorkspaceCanvasLayoutPosition>()
  input.model.nodes.forEach((node) => {
    if (node.lane !== input.lane) return
    if (node.anchorMode === 'none') return
    anchoredPositions.set(node.id, input.previousPositions?.get(node.id) ?? node.basePosition)
  })

  const mapped = new Map<string, WorkspaceCanvasLayoutResultNode>()
  for (const child of result.children ?? []) {
    const anchorPosition = anchoredPositions.get(child.id)
    mapped.set(child.id, {
      x: anchorPosition?.x ?? requiredNumber(child.x, 'x', child.id),
      y: anchorPosition?.y ?? requiredNumber(child.y, 'y', child.id),
      width: requiredNumber(child.width, 'width', child.id),
      height: requiredNumber(child.height, 'height', child.id),
    })
  }

  return mapped
}

export async function runWorkspaceElkLaneLayout(
  input: RunWorkspaceElkLaneLayoutInput,
): Promise<WorkspaceCanvasLayoutResult> {
  const graph = buildElkLaneGraph(input)
  const result = await elk.layout(graph)
  return mapElkLaneResultToWorkspaceLayout(result, input)
}
