import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKSPACE_CANVAS_VIEWPORT,
  clampWorkspaceCanvasZoom,
  getNextWorkspaceCanvasWheelZoom,
  WORKSPACE_CANVAS_MAX_ZOOM,
  WORKSPACE_CANVAS_MIN_ZOOM,
} from '@/features/project-workspace/canvas/canvasViewport'

describe('workspace canvas viewport', () => {
  it('allows zooming in substantially beyond the default view', () => {
    expect(WORKSPACE_CANVAS_MAX_ZOOM).toBe(2.5)
    expect(clampWorkspaceCanvasZoom(2.4)).toBe(2.4)
  })

  it('clamps canvas zoom into the supported range', () => {
    expect(clampWorkspaceCanvasZoom(0.01)).toBe(WORKSPACE_CANVAS_MIN_ZOOM)
    expect(WORKSPACE_CANVAS_MIN_ZOOM).toBe(0.0625)
    expect(clampWorkspaceCanvasZoom(20)).toBe(WORKSPACE_CANVAS_MAX_ZOOM)
    expect(clampWorkspaceCanvasZoom(Number.NaN)).toBe(DEFAULT_WORKSPACE_CANVAS_VIEWPORT.zoom)
  })

  it('uses the same zoom range for wheel zooming', () => {
    expect(getNextWorkspaceCanvasWheelZoom(WORKSPACE_CANVAS_MAX_ZOOM, -1000)).toBe(WORKSPACE_CANVAS_MAX_ZOOM)
    expect(getNextWorkspaceCanvasWheelZoom(WORKSPACE_CANVAS_MIN_ZOOM, 1000)).toBe(WORKSPACE_CANVAS_MIN_ZOOM)
  })
})
