export type RenderDimensions = { width: number; height: number }

const DIMENSIONS_BY_RATIO: Record<string, RenderDimensions> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
}

export function dimensionsForVideoRatio(videoRatio: string | null | undefined): RenderDimensions {
  return DIMENSIONS_BY_RATIO[videoRatio || ''] || DIMENSIONS_BY_RATIO['16:9']
}
