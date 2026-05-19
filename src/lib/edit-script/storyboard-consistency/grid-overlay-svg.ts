export interface CoordinateGridOverlayInput {
  readonly width: number
  readonly height: number
  readonly columns: number
  readonly rows: number
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`EDIT_SCRIPT_STORYBOARD_GRID_OVERLAY_${name.toUpperCase()}_INVALID`)
  }
}

function lineElements(input: CoordinateGridOverlayInput, stroke: string, strokeWidth: number, opacity = 1): string {
  const vertical = Array.from({ length: input.columns + 1 }, (_, index) => {
    const x = Math.round(index * input.width / input.columns)
    return `<line x1="${x}" y1="0" x2="${x}" y2="${input.height}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`
  }).join('')
  const horizontal = Array.from({ length: input.rows + 1 }, (_, index) => {
    const y = Math.round(index * input.height / input.rows)
    return `<line x1="0" y1="${y}" x2="${input.width}" y2="${y}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`
  }).join('')
  return `${vertical}${horizontal}`
}

function cellLabels(input: CoordinateGridOverlayInput): string {
  const cellWidth = input.width / input.columns
  const cellHeight = input.height / input.rows
  return Array.from({ length: input.columns }, (_, xIndex) => (
    Array.from({ length: input.rows }, (_, yIndex) => {
      const x = Math.round((xIndex + 0.5) * cellWidth)
      const y = Math.round((yIndex + 0.5) * cellHeight)
      const label = `${xIndex + 1},${yIndex + 1}`
      return `<text x="${x}" y="${y}" fill="#ffffff" stroke="#020617" stroke-width="3" paint-order="stroke" font-size="14" font-family="Arial, Helvetica, sans-serif" font-weight="800" text-anchor="middle" dominant-baseline="middle">${label}</text>`
    }).join('')
  )).join('')
}

export function buildCoordinateGridOverlaySvg(input: CoordinateGridOverlayInput): string {
  assertPositiveInteger(input.width, 'width')
  assertPositiveInteger(input.height, 'height')
  assertPositiveInteger(input.columns, 'columns')
  assertPositiveInteger(input.rows, 'rows')

  return [
    `<svg width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}" xmlns="http://www.w3.org/2000/svg">`,
    '<rect width="100%" height="100%" fill="rgba(2,6,23,0.14)"/>',
    lineElements(input, '#ffffff', 4, 0.94),
    lineElements(input, '#020617', 2.25, 0.9),
    lineElements(input, '#38bdf8', 1, 1),
    cellLabels(input),
    '</svg>',
  ].join('')
}

export function buildCoordinateGridOverlaySvgBuffer(input: CoordinateGridOverlayInput): Buffer {
  return Buffer.from(buildCoordinateGridOverlaySvg(input))
}
