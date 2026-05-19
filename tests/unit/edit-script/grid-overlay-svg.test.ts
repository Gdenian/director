import { describe, expect, it } from 'vitest'
import {
  buildCoordinateGridOverlaySvg,
  buildCoordinateGridOverlaySvgBuffer,
} from '@/lib/edit-script/storyboard-consistency/grid-overlay-svg'

describe('production coordinate grid overlay svg', () => {
  it('renders the production high-contrast halo overlay with the requested grid dimensions', () => {
    const svg = buildCoordinateGridOverlaySvg({
      width: 1280,
      height: 720,
      columns: 16,
      rows: 9,
    })

    expect(svg).toContain('viewBox="0 0 1280 720"')
    expect(svg).toContain('x2="1280"')
    expect(svg).toContain('y2="720"')
    expect(svg).toContain('16,9')
  })

  it('uses the selected high-contrast white, dark, and cyan stroke stack', () => {
    const svg = buildCoordinateGridOverlaySvg({
      width: 1280,
      height: 720,
      columns: 16,
      rows: 9,
    })

    expect(svg).toContain('stroke="#ffffff"')
    expect(svg).toContain('stroke="#020617"')
    expect(svg).toContain('stroke="#38bdf8"')
    expect(svg).toContain('stroke-width="4"')
    expect(svg).toContain('stroke-width="2.25"')
    expect(svg).toContain('stroke-width="1"')
    expect(svg).toContain('fill="#ffffff" stroke="#020617" stroke-width="3"')
    expect(svg).toContain('font-size="14"')
  })

  it('returns a buffer for sharp compositing in the production worker', () => {
    const buffer = buildCoordinateGridOverlaySvgBuffer({
      width: 1280,
      height: 720,
      columns: 16,
      rows: 9,
    })

    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.toString('utf8')).toContain('<svg')
  })

  it('rejects invalid grid dimensions explicitly', () => {
    expect(() => buildCoordinateGridOverlaySvg({
      width: 1280,
      height: 720,
      columns: 0,
      rows: 9,
    })).toThrow('EDIT_SCRIPT_STORYBOARD_GRID_OVERLAY_COLUMNS_INVALID')
  })
})
