import type {
  FixedSpaceClassification,
  GridDensity,
  StoryboardBlockClassification,
  StoryboardConsistencySourceSnapshot,
} from './types'

const NO_FIXED_SPACE_PATTERNS = [
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

function assetsForShot(snapshot: StoryboardConsistencySourceSnapshot, shotNumber: number, kind: 'character' | 'location') {
  return snapshot.assets.filter((asset) => asset.kind === kind && asset.shotNumbers.includes(shotNumber))
}

function shotText(snapshot: StoryboardConsistencySourceSnapshot, shotNumber: number): string {
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

function blockText(snapshot: StoryboardConsistencySourceSnapshot, shotNumbers: readonly number[], blockPrompt: string): string {
  return [
    blockPrompt,
    ...shotNumbers.map((shotNumber) => shotText(snapshot, shotNumber)),
  ].join('\n')
}

function readBlockParticipants(snapshot: StoryboardConsistencySourceSnapshot, shotNumbers: readonly number[]): string[] {
  return uniq(snapshot.assets
    .filter((asset) => asset.kind === 'character' && asset.shotNumbers.some((shotNumber) => shotNumbers.includes(shotNumber)))
    .map((asset) => asset.name))
}

function readBlockLocations(snapshot: StoryboardConsistencySourceSnapshot, shotNumbers: readonly number[]): string[] {
  return uniq(snapshot.assets
    .filter((asset) => asset.kind === 'location' && asset.shotNumbers.some((shotNumber) => shotNumbers.includes(shotNumber)))
    .map((asset) => asset.name))
}

function hasRepeatedLocation(snapshot: StoryboardConsistencySourceSnapshot, shotNumbers: readonly number[]): boolean {
  const counts = new Map<string, number>()
  for (const shotNumber of shotNumbers) {
    for (const location of assetsForShot(snapshot, shotNumber, 'location')) {
      counts.set(location.name, (counts.get(location.name) ?? 0) + 1)
    }
  }
  return Array.from(counts.values()).some((count) => count >= 2)
}

export function classifyStoryboardConsistencyBlocks(snapshot: StoryboardConsistencySourceSnapshot): StoryboardBlockClassification[] {
  return snapshot.videoBlocks.map((block) => {
    const participantNames = readBlockParticipants(snapshot, block.shotNumbers)
    const locationNames = readBlockLocations(snapshot, block.shotNumbers)
    const excludedByMotionOrAbstraction = includesPattern(
      blockText(snapshot, block.shotNumbers, block.prompt),
      NO_FIXED_SPACE_PATTERNS,
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

export function resolveGridDensity(videoRatio: string): GridDensity {
  const [widthRaw, heightRaw] = videoRatio.split(':')
  const width = Number(widthRaw)
  const height = Number(heightRaw)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`EDIT_SCRIPT_STORYBOARD_VIDEO_RATIO_INVALID:${videoRatio}`)
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
