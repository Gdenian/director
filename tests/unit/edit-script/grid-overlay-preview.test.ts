import { describe, expect, it } from 'vitest'
import {
  buildGridOverlayPreviewSvg,
  GRID_OVERLAY_PREVIEW_VARIANTS,
} from '@/lib/edit-script/storyboard-consistency/grid-overlay-preview'

describe('grid overlay preview variants', () => {
  it('renders every preview variant with the same grid dimensions', () => {
    const svgs = GRID_OVERLAY_PREVIEW_VARIANTS.map((variant) => buildGridOverlayPreviewSvg({
      width: 1280,
      height: 720,
      columns: 16,
      rows: 9,
      variant,
    }))

    expect(svgs).toHaveLength(6)
    svgs.forEach((svg) => {
      expect(svg).toContain('viewBox="0 0 1280 720"')
      expect(svg).toContain('x2="1280"')
      expect(svg).toContain('y2="720"')
    })
  })

  it('provides high-contrast styles that include light and dark strokes', () => {
    const halo = buildGridOverlayPreviewSvg({
      width: 1280,
      height: 720,
      columns: 16,
      rows: 9,
      variant: 'halo_dual_line',
    })
    const visionBlocks = buildGridOverlayPreviewSvg({
      width: 1280,
      height: 720,
      columns: 16,
      rows: 9,
      variant: 'vision_blocks',
    })

    expect(halo).toContain('stroke="#ffffff"')
    expect(halo).toContain('stroke="#020617"')
    expect(halo).toContain('font-size="14"')
    expect(visionBlocks).toContain('X16 Y9')
    expect(visionBlocks).toContain('fill="#facc15"')
  })

  it('rejects invalid grid dimensions explicitly', () => {
    expect(() => buildGridOverlayPreviewSvg({
      width: 1280,
      height: 720,
      columns: 0,
      rows: 9,
      variant: 'current',
    })).toThrow('GRID_OVERLAY_COLUMNS_INVALID')
  })
})
