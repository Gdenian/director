export const GRID_OVERLAY_PREVIEW_VARIANTS = [
  'current',
  'halo_dual_line',
  'inverse_plate_labels',
  'axis_ruler',
  'cell_badges',
  'vision_blocks',
] as const

export type GridOverlayPreviewVariant = (typeof GRID_OVERLAY_PREVIEW_VARIANTS)[number]

export interface GridOverlayPreviewInput {
  readonly width: number
  readonly height: number
  readonly columns: number
  readonly rows: number
  readonly variant: GridOverlayPreviewVariant
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`GRID_OVERLAY_${name.toUpperCase()}_INVALID`)
  }
}

function lineElements(input: GridOverlayPreviewInput, stroke: string, strokeWidth: number, opacity = 1): string {
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

function cellLabels(input: GridOverlayPreviewInput, options: {
  readonly fill: string
  readonly fontSize: number
  readonly stroke?: string
  readonly strokeWidth?: number
  readonly opacity?: number
  readonly withPlate?: boolean
}): string {
  const cellWidth = input.width / input.columns
  const cellHeight = input.height / input.rows
  return Array.from({ length: input.columns }, (_, xIndex) => (
    Array.from({ length: input.rows }, (_, yIndex) => {
      const x = Math.round((xIndex + 0.5) * cellWidth)
      const y = Math.round((yIndex + 0.5) * cellHeight)
      const label = `${xIndex + 1},${yIndex + 1}`
      const plateWidth = Math.max(32, label.length * options.fontSize * 0.72)
      const plateHeight = Math.max(20, options.fontSize + 8)
      const plate = options.withPlate
        ? `<rect x="${Math.round(x - plateWidth / 2)}" y="${Math.round(y - plateHeight / 2)}" width="${Math.round(plateWidth)}" height="${Math.round(plateHeight)}" rx="7" fill="rgba(255,255,255,0.88)" stroke="rgba(15,23,42,0.9)" stroke-width="2"/>`
        : ''
      const strokeAttrs = options.stroke && options.strokeWidth
        ? ` stroke="${options.stroke}" stroke-width="${options.strokeWidth}" paint-order="stroke"`
        : ''
      return `${plate}<text x="${x}" y="${y}" fill="${options.fill}"${strokeAttrs} opacity="${options.opacity ?? 1}" font-size="${options.fontSize}" font-family="Arial, Helvetica, sans-serif" font-weight="800" text-anchor="middle" dominant-baseline="middle">${label}</text>`
    }).join('')
  )).join('')
}

function axisLabels(input: GridOverlayPreviewInput): string {
  const top = Array.from({ length: input.columns }, (_, index) => {
    const x = Math.round((index + 0.5) * input.width / input.columns)
    return `<text x="${x}" y="27" fill="#020617" font-size="22" font-family="Arial, Helvetica, sans-serif" font-weight="900" text-anchor="middle">${index + 1}</text>`
  }).join('')
  const left = Array.from({ length: input.rows }, (_, index) => {
    const y = Math.round((index + 0.5) * input.height / input.rows + 8)
    return `<text x="28" y="${y}" fill="#020617" font-size="22" font-family="Arial, Helvetica, sans-serif" font-weight="900" text-anchor="middle">${index + 1}</text>`
  }).join('')
  return [
    '<rect x="0" y="0" width="100%" height="42" fill="rgba(255,255,255,0.9)"/>',
    '<rect x="0" y="0" width="48" height="100%" fill="rgba(255,255,255,0.9)"/>',
    '<line x1="48" y1="0" x2="48" y2="100%" stroke="#020617" stroke-width="3"/>',
    '<line x1="0" y1="42" x2="100%" y2="42" stroke="#020617" stroke-width="3"/>',
    top,
    left,
  ].join('')
}

function blockLabels(input: GridOverlayPreviewInput): string {
  const cellWidth = input.width / input.columns
  const cellHeight = input.height / input.rows
  return Array.from({ length: input.columns }, (_, xIndex) => (
    Array.from({ length: input.rows }, (_, yIndex) => {
      const x = Math.round((xIndex + 0.5) * cellWidth)
      const y = Math.round((yIndex + 0.5) * cellHeight)
      const label = `X${xIndex + 1} Y${yIndex + 1}`
      return [
        `<circle cx="${x}" cy="${y}" r="7" fill="#facc15" stroke="#020617" stroke-width="3"/>`,
        `<text x="${x}" y="${y + 23}" fill="#ffffff" stroke="#020617" stroke-width="5" paint-order="stroke" font-size="15" font-family="Arial, Helvetica, sans-serif" font-weight="900" text-anchor="middle">${label}</text>`,
      ].join('')
    }).join('')
  )).join('')
}

function variantBody(input: GridOverlayPreviewInput): string {
  switch (input.variant) {
    case 'current':
      return [
        '<rect width="100%" height="100%" fill="rgba(255,255,255,0.08)"/>',
        lineElements(input, 'rgba(14,165,233,0.72)', 2),
        cellLabels(input, { fill: 'rgba(2,6,23,0.86)', fontSize: 18 }),
      ].join('')
    case 'halo_dual_line':
      return [
        '<rect width="100%" height="100%" fill="rgba(2,6,23,0.14)"/>',
        lineElements(input, '#ffffff', 7, 0.94),
        lineElements(input, '#020617', 4, 0.9),
        lineElements(input, '#38bdf8', 2, 1),
        cellLabels(input, { fill: '#ffffff', stroke: '#020617', strokeWidth: 3, fontSize: 14 }),
      ].join('')
    case 'inverse_plate_labels':
      return [
        '<rect width="100%" height="100%" fill="rgba(15,23,42,0.2)"/>',
        lineElements(input, '#ffffff', 6, 0.88),
        lineElements(input, '#f97316', 3, 0.96),
        cellLabels(input, { fill: '#020617', fontSize: 18, withPlate: true }),
      ].join('')
    case 'axis_ruler':
      return [
        '<rect width="100%" height="100%" fill="rgba(255,255,255,0.16)"/>',
        lineElements(input, '#ffffff', 6, 0.78),
        lineElements(input, '#0f172a', 3, 0.82),
        lineElements(input, '#22d3ee', 1.5, 0.95),
        axisLabels(input),
      ].join('')
    case 'cell_badges':
      return [
        '<rect width="100%" height="100%" fill="rgba(2,6,23,0.18)"/>',
        lineElements(input, '#f8fafc', 5, 0.92),
        lineElements(input, '#db2777', 2, 1),
        cellLabels(input, { fill: '#020617', fontSize: 17, withPlate: true }),
      ].join('')
    case 'vision_blocks':
      return [
        '<rect width="100%" height="100%" fill="rgba(2,6,23,0.26)"/>',
        lineElements(input, '#ffffff', 8, 0.96),
        lineElements(input, '#020617', 5, 0.95),
        lineElements(input, '#facc15', 2.5, 1),
        blockLabels(input),
      ].join('')
  }
}

export function buildGridOverlayPreviewSvg(input: GridOverlayPreviewInput): string {
  assertPositiveInteger(input.width, 'width')
  assertPositiveInteger(input.height, 'height')
  assertPositiveInteger(input.columns, 'columns')
  assertPositiveInteger(input.rows, 'rows')

  return [
    `<svg width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}" xmlns="http://www.w3.org/2000/svg">`,
    variantBody(input),
    '</svg>',
  ].join('')
}
