import type {
  ConsistencyLabBlockClassification,
  ConsistencyLabSourceSnapshot,
  ContactSheet9GridStrategyOutput,
  ContactSheetCell,
  ContactSheetGroup,
  FixedSpaceClassification,
  GridCoordinatesBlockOutput,
  GridCoordinatesStrategyOutput,
  GridPlanCoordinate,
  StructuredTextBlockOutput,
  StructuredTextShotContinuity,
  StructuredTextStrategyOutput,
} from './types'

const ABSTRACT_OR_TRANSITION_PATTERNS = [
  'dream',
  'memory',
  'montage',
  'chase',
  'cutaway',
  'object-only',
  'landscape-only',
  '梦',
  '梦境',
  '回忆',
  '蒙太奇',
  '追逐',
  '空镜',
  '纯物件',
  '纯风景',
  '快速跳切',
] as const

function includesPattern(value: string, patterns: readonly string[]): boolean {
  const normalized = value.toLocaleLowerCase()
  return patterns.some((pattern) => normalized.includes(pattern.toLocaleLowerCase()))
}

function uniq(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function assetsForShot(snapshot: ConsistencyLabSourceSnapshot, shotNumber: number, kind: 'character' | 'location') {
  return snapshot.assets.filter((asset) => asset.kind === kind && asset.shotNumbers.includes(shotNumber))
}

function shotText(snapshot: ConsistencyLabSourceSnapshot, shotNumber: number): string {
  const shot = snapshot.shots.find((item) => item.shotNumber === shotNumber)
  if (!shot) return ''
  return [
    shot.visualAction,
    shot.charactersAndScene,
    shot.camera,
    shot.videoPrompt,
    shot.sound,
  ].join('\n')
}

function blockText(snapshot: ConsistencyLabSourceSnapshot, shotNumbers: readonly number[], blockPrompt: string): string {
  return [
    blockPrompt,
    ...shotNumbers.map((shotNumber) => shotText(snapshot, shotNumber)),
  ].join('\n')
}

function readBlockParticipants(snapshot: ConsistencyLabSourceSnapshot, shotNumbers: readonly number[]): string[] {
  return uniq(snapshot.assets
    .filter((asset) => asset.kind === 'character' && asset.shotNumbers.some((shotNumber) => shotNumbers.includes(shotNumber)))
    .map((asset) => asset.name))
}

function readBlockLocations(snapshot: ConsistencyLabSourceSnapshot, shotNumbers: readonly number[]): string[] {
  return uniq(snapshot.assets
    .filter((asset) => asset.kind === 'location' && asset.shotNumbers.some((shotNumber) => shotNumbers.includes(shotNumber)))
    .map((asset) => asset.name))
}

function hasRepeatedLocation(snapshot: ConsistencyLabSourceSnapshot, shotNumbers: readonly number[]): boolean {
  const counts = new Map<string, number>()
  for (const shotNumber of shotNumbers) {
    for (const location of assetsForShot(snapshot, shotNumber, 'location')) {
      counts.set(location.name, (counts.get(location.name) ?? 0) + 1)
    }
  }
  return Array.from(counts.values()).some((count) => count >= 2)
}

export function classifyConsistencyBlocks(snapshot: ConsistencyLabSourceSnapshot): ConsistencyLabBlockClassification[] {
  return snapshot.videoBlocks.map((block) => {
    const participantNames = readBlockParticipants(snapshot, block.shotNumbers)
    const locationNames = readBlockLocations(snapshot, block.shotNumbers)
    const excludedByMotionOrAbstraction = includesPattern(
      blockText(snapshot, block.shotNumbers, block.prompt),
      ABSTRACT_OR_TRANSITION_PATTERNS,
    )
    const repeatedLocation = hasRepeatedLocation(snapshot, block.shotNumbers)
    const classification: FixedSpaceClassification = excludedByMotionOrAbstraction
      ? 'no_fixed_space'
      : repeatedLocation && participantNames.length >= 2
        ? 'fixed_space_strong'
        : locationNames.length > 0 && participantNames.length >= 2
          ? 'fixed_space_weak'
          : 'no_fixed_space'
    const reason = classification === 'fixed_space_strong'
      ? 'same videoBlock contains repeated location coverage and at least two core characters'
      : classification === 'fixed_space_weak'
        ? 'same videoBlock has a shared location and at least two core characters'
        : excludedByMotionOrAbstraction
          ? 'motion, abstraction, cutaway, object-only, or landscape-only language was detected'
          : 'fixed-space continuity signal is insufficient'
    return {
      sourceVideoBlockId: block.sourceVideoBlockId,
      blockIndex: block.blockIndex,
      classification,
      reason,
      participantNames,
      locationNames,
      excludedByMotionOrAbstraction,
    }
  })
}

function primarySubjectsForShot(snapshot: ConsistencyLabSourceSnapshot, shotNumber: number, participants: readonly string[]): string[] {
  const direct = assetsForShot(snapshot, shotNumber, 'character').map((asset) => asset.name)
  return uniq(direct).length > 0 ? uniq(direct) : participants.slice(0, 1)
}

function secondaryPresenceForShot(primarySubjects: readonly string[], participants: readonly string[], fixed: boolean): string[] {
  if (!fixed) return []
  return participants
    .filter((participant) => !primarySubjects.includes(participant))
    .map((participant, index) => {
      const placement = index % 3 === 0
        ? 'blurred background figure'
        : index % 3 === 1
          ? 'foreground shoulder'
          : 'edge-of-frame silhouette'
      return `${participant}: ${placement} or offscreen eyeline target`
    })
}

function shotContinuity(
  snapshot: ConsistencyLabSourceSnapshot,
  shotNumber: number,
  classification: FixedSpaceClassification,
  participants: readonly string[],
): StructuredTextShotContinuity {
  const fixed = classification !== 'no_fixed_space'
  const primarySubjects = primarySubjectsForShot(snapshot, shotNumber, participants)
  return {
    shotNumber,
    classification,
    primarySubjects,
    secondaryPresence: secondaryPresenceForShot(primarySubjects, participants, fixed),
    screenContinuity: fixed
      ? 'preserve the established left/right relation and make eyelines point toward the counterpart or anchor'
      : 'follow the original shot without forcing fixed-space continuity',
    depthOfField: fixed && primarySubjects.length === 1
      ? 'primary subject remains sharp; secondary counterpart can stay soft in foreground or background'
      : 'depth follows the original camera description',
  }
}

export function buildStructuredTextStrategyOutput(snapshot: ConsistencyLabSourceSnapshot): StructuredTextStrategyOutput {
  const blockClassifications = classifyConsistencyBlocks(snapshot)
  const blocks = snapshot.videoBlocks.map((block): StructuredTextBlockOutput => {
    const classification = blockClassifications.find((item) => item.sourceVideoBlockId === block.sourceVideoBlockId)
    if (!classification) throw new Error(`CONSISTENCY_LAB_CLASSIFICATION_MISSING:${block.sourceVideoBlockId}`)
    const participants = classification.participantNames
    const anchors = classification.locationNames.length > 0 ? classification.locationNames : ['primary scene anchor']
    const fixed = classification.classification !== 'no_fixed_space'
    return {
      sourceVideoBlockId: block.sourceVideoBlockId,
      classification: classification.classification,
      location: classification.locationNames[0] ?? null,
      participants,
      anchors,
      spatialRelation: fixed
        ? `${participants.join(' and ')} remain arranged around ${anchors[0]}; keep the same relative order across shots.`
        : 'No fixed spatial relation is forced for this block.',
      screenContinuity: fixed
        ? 'Keep screen-side continuity, counterpart presence, and eyeline direction across dialogue or reaction shots.'
        : 'Use only the original shot information.',
      shots: block.shotNumbers.map((shotNumber) => shotContinuity(snapshot, shotNumber, classification.classification, participants)),
    }
  })
  return {
    strategy: 'structured_text',
    blockClassifications,
    blocks,
  }
}

export function resolveGridDensity(videoRatio: string): { readonly columns: number; readonly rows: number; readonly ratio: string; readonly shortSideUnits: 9 } {
  const [widthRaw, heightRaw] = videoRatio.split(':')
  const width = Number(widthRaw)
  const height = Number(heightRaw)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`CONSISTENCY_LAB_VIDEO_RATIO_INVALID:${videoRatio}`)
  }
  if (width >= height) {
    return {
      columns: Math.max(9, Math.round(9 * width / height)),
      rows: 9,
      ratio: videoRatio,
      shortSideUnits: 9,
    }
  }
  return {
    columns: 9,
    rows: Math.max(9, Math.round(9 * height / width)),
    ratio: videoRatio,
    shortSideUnits: 9,
  }
}

function coordinateForIndex(index: number, total: number, columns: number, rows: number): { readonly x: number; readonly y: number } {
  if (total <= 1) return { x: Math.ceil(columns / 2), y: Math.ceil(rows / 2) }
  const left = Math.max(1, Math.round(columns * 0.3))
  const right = Math.min(columns, Math.round(columns * 0.7))
  const span = Math.max(1, right - left)
  return {
    x: Math.min(columns, left + Math.round(span * index / Math.max(1, total - 1))),
    y: Math.min(rows, Math.max(1, Math.round(rows * (index % 2 === 0 ? 0.62 : 0.45)))),
  }
}

function buildCoordinates(
  participants: readonly string[],
  anchors: readonly string[],
  columns: number,
  rows: number,
): GridPlanCoordinate[] {
  const anchorCoordinates = anchors.slice(0, 3).map((anchor, index): GridPlanCoordinate => ({
    name: anchor,
    kind: 'anchor',
    x: Math.min(columns, Math.max(1, Math.round(columns * (0.5 + (index - 1) * 0.15)))),
    y: Math.min(rows, Math.max(1, Math.round(rows * 0.52))),
  }))
  const characterCoordinates = participants.map((participant, index): GridPlanCoordinate => {
    const coordinate = coordinateForIndex(index, participants.length, columns, rows)
    const facing = participants.find((candidate) => candidate !== participant) ?? anchors[0] ?? 'scene center'
    return {
      name: participant,
      kind: 'character',
      x: coordinate.x,
      y: coordinate.y,
      facing,
    }
  })
  return [...anchorCoordinates, ...characterCoordinates]
}

function translateCoordinates(coordinates: readonly GridPlanCoordinate[]): string {
  const anchors = coordinates.filter((item) => item.kind === 'anchor')
  const characters = coordinates.filter((item) => item.kind === 'character')
  if (characters.length === 0) return 'No character coordinate plan is available; follow the original shot.'
  const anchorText = anchors.length > 0
    ? `Anchor reference: ${anchors.map((anchor) => `${anchor.name} [${anchor.x},${anchor.y}]`).join('; ')}.`
    : 'No fixed anchor is available.'
  const characterText = characters.map((character) => (
    `${character.name} stays near [${character.x},${character.y}] facing ${character.facing ?? 'the scene center'}`
  )).join('; ')
  return `${anchorText} Cinematic translation: ${characterText}; convert these top-down positions into foreground/background, left/right screen placement, and eyeline continuity.`
}

export function buildGridCoordinatesStrategyOutput(snapshot: ConsistencyLabSourceSnapshot): GridCoordinatesStrategyOutput {
  const grid = resolveGridDensity(snapshot.project.videoRatio)
  const blockClassifications = classifyConsistencyBlocks(snapshot)
  const blocks = snapshot.videoBlocks.map((block): GridCoordinatesBlockOutput => {
    const classification = blockClassifications.find((item) => item.sourceVideoBlockId === block.sourceVideoBlockId)
    if (!classification) throw new Error(`CONSISTENCY_LAB_CLASSIFICATION_MISSING:${block.sourceVideoBlockId}`)
    const anchors = classification.locationNames.length > 0 ? classification.locationNames : ['scene center']
    const coordinates = classification.classification === 'no_fixed_space'
      ? []
      : buildCoordinates(classification.participantNames, anchors, grid.columns, grid.rows)
    return {
      sourceVideoBlockId: block.sourceVideoBlockId,
      classification: classification.classification,
      grid,
      coordinates,
      cinematicTranslation: classification.classification === 'no_fixed_space'
        ? 'No coordinate lock is applied for this block.'
        : translateCoordinates(coordinates),
      perShotInstructions: block.shotNumbers.map((shotNumber) => (
        shotContinuity(snapshot, shotNumber, classification.classification, classification.participantNames)
      )),
    }
  })
  return {
    strategy: 'grid_coordinates',
    blockClassifications,
    blocks,
  }
}

function cellForShot(shotNumber: number, index: number): ContactSheetCell {
  const row = Math.floor(index / 3)
  const column = index % 3
  return {
    shotNumber,
    cellIndex: index + 1,
    row: row + 1,
    column: column + 1,
    crop: {
      x: column / 3,
      y: row / 3,
      width: 1 / 3,
      height: 1 / 3,
    },
  }
}

export function buildContactSheet9GridStrategyOutput(snapshot: ConsistencyLabSourceSnapshot): ContactSheet9GridStrategyOutput {
  const groups: ContactSheetGroup[] = []
  for (const block of snapshot.videoBlocks) {
    for (let start = 0; start < block.shotNumbers.length; start += 9) {
      const shotNumbers = block.shotNumbers.slice(start, start + 9)
      groups.push({
        sourceVideoBlockId: block.sourceVideoBlockId,
        groupIndex: groups.length,
        shotNumbers,
        cells: shotNumbers.map((shotNumber, index) => cellForShot(shotNumber, index)),
      })
    }
  }
  return {
    strategy: 'contact_sheet_9grid',
    groups,
  }
}
