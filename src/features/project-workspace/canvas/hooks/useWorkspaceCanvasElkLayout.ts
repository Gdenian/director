'use client'

import { useEffect, useMemo, useState } from 'react'
import type { WorkspaceCanvasFlowEdge, WorkspaceCanvasFlowNode } from '../node-canvas-types'
import {
  applyWorkspaceCanvasLayoutToNodes,
  buildWorkspaceCanvasGraphEdges,
  runWorkspaceCanvasElkLayout,
  type WorkspaceCanvasGraphNode,
  type WorkspaceCanvasNodeSize,
  type WorkspaceCanvasPosition,
} from '../layout/workspace-layout-engine'

const DEFAULT_ELK_LAYOUT_DEBOUNCE_MS = 80

function numericStyleDimension(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function nodeEstimatedSize(node: WorkspaceCanvasFlowNode): WorkspaceCanvasNodeSize {
  return {
    width: numericStyleDimension(node.style?.width) ?? node.data.width,
    height: numericStyleDimension(node.style?.height) ?? node.data.height,
  }
}

function positionMapSignature(positions: ReadonlyMap<string, WorkspaceCanvasPosition>): string {
  return [...positions.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([nodeId, position]) => `${nodeId}:${position.x},${position.y}`)
    .join('|')
}

function sizeMapSignature(sizes: ReadonlyMap<string, WorkspaceCanvasNodeSize>): string {
  return [...sizes.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([nodeId, size]) => `${nodeId}:${size.width}x${size.height}`)
    .join('|')
}

function nodeSignature(nodes: readonly WorkspaceCanvasFlowNode[]): string {
  return nodes.map((node, index) => {
    const size = nodeEstimatedSize(node)
    return [
      index,
      node.id,
      node.data.kind,
      node.data.targetType,
      node.data.targetId,
      size.width,
      size.height,
      node.data.expanded === true ? 'expanded' : 'collapsed',
    ].join(':')
  }).join('|')
}

function edgeSignature(edges: readonly WorkspaceCanvasFlowEdge[]): string {
  return edges.map((edge) => `${edge.id}:${edge.source}->${edge.target}`).join('|')
}

function buildGraphNodes(input: {
  readonly nodes: readonly WorkspaceCanvasFlowNode[]
  readonly measuredNodeSizes: ReadonlyMap<string, WorkspaceCanvasNodeSize>
  readonly lockedNodePositions: ReadonlyMap<string, WorkspaceCanvasPosition>
}): WorkspaceCanvasGraphNode[] {
  return input.nodes.map((node, index) => ({
    id: node.id,
    kind: node.data.kind,
    targetType: node.data.targetType,
    targetId: node.data.targetId,
    data: node.data,
    estimatedSize: nodeEstimatedSize(node),
    measuredSize: input.measuredNodeSizes.get(node.id),
    order: index,
    lane: node.data.kind,
    lockedPosition: input.lockedNodePositions.get(node.id),
  }))
}

export function useWorkspaceCanvasElkLayout(input: {
  readonly nodes: readonly WorkspaceCanvasFlowNode[]
  readonly edges: readonly WorkspaceCanvasFlowEdge[]
  readonly measuredNodeSizes: ReadonlyMap<string, WorkspaceCanvasNodeSize>
  readonly lockedNodePositions: ReadonlyMap<string, WorkspaceCanvasPosition>
  readonly expansionAnchors: ReadonlyMap<string, WorkspaceCanvasPosition>
  readonly debounceMs?: number
}): {
  readonly nodes: readonly WorkspaceCanvasFlowNode[]
  readonly error: Error | null
  readonly isLayoutPending: boolean
} {
  const [layoutedNodes, setLayoutedNodes] = useState<readonly WorkspaceCanvasFlowNode[]>([])
  const [error, setError] = useState<Error | null>(null)
  const [isLayoutPending, setIsLayoutPending] = useState(false)

  const signature = useMemo(() => [
    nodeSignature(input.nodes),
    edgeSignature(input.edges),
    sizeMapSignature(input.measuredNodeSizes),
    positionMapSignature(input.lockedNodePositions),
    positionMapSignature(input.expansionAnchors),
  ].join('\n'), [
    input.edges,
    input.expansionAnchors,
    input.lockedNodePositions,
    input.measuredNodeSizes,
    input.nodes,
  ])

  useEffect(() => {
    if (input.nodes.length === 0) {
      setLayoutedNodes([])
      setIsLayoutPending(false)
      return undefined
    }

    let cancelled = false
    const timeout = window.setTimeout(() => {
      setIsLayoutPending(true)
      setError(null)
      const graphNodes = buildGraphNodes({
        nodes: input.nodes,
        measuredNodeSizes: input.measuredNodeSizes,
        lockedNodePositions: input.lockedNodePositions,
      })
      void runWorkspaceCanvasElkLayout({
        nodes: graphNodes,
        edges: buildWorkspaceCanvasGraphEdges(input.edges),
        expansionAnchors: input.expansionAnchors,
      }).then((layout) => {
        if (cancelled) return
        setLayoutedNodes(applyWorkspaceCanvasLayoutToNodes(input.nodes, layout))
        setIsLayoutPending(false)
      }).catch((layoutError: unknown) => {
        if (cancelled) return
        setError(layoutError instanceof Error ? layoutError : new Error('workspace canvas ELK layout failed'))
        setIsLayoutPending(false)
      })
    }, input.debounceMs ?? DEFAULT_ELK_LAYOUT_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [input.debounceMs, input.edges, input.expansionAnchors, input.lockedNodePositions, input.measuredNodeSizes, input.nodes, signature])

  return {
    nodes: layoutedNodes.length > 0 ? layoutedNodes : input.nodes.map((node) => ({
      ...node,
      style: {
        ...node.style,
        opacity: 0,
      },
    })),
    error,
    isLayoutPending,
  }
}
