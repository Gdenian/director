import type { MediaCapability, MediaContract } from './types'

const IMAGE_CAPABILITIES = new Set<MediaCapability>([
  'text-to-image',
  'image-to-image',
  'image-edit',
])

const VIDEO_CAPABILITIES = new Set<MediaCapability>([
  'text-to-video',
  'image-to-video',
  'first-last-frame-video',
])

const STATUS_KEYS: Record<MediaCapability, keyof NonNullable<MediaContract['testStatus']>> = {
  'text-to-image': 'textToImage',
  'image-to-image': 'imageToImage',
  'image-edit': 'imageEdit',
  'text-to-video': 'textToVideo',
  'image-to-video': 'imageToVideo',
  'first-last-frame-video': 'firstLastFrameVideo',
}

export function mediaCapabilityStatusKey(
  capability: MediaCapability,
): keyof NonNullable<MediaContract['testStatus']> {
  return STATUS_KEYS[capability]
}

export function isImageCapability(capability: MediaCapability): boolean {
  return IMAGE_CAPABILITIES.has(capability)
}

export function isVideoCapability(capability: MediaCapability): boolean {
  return VIDEO_CAPABILITIES.has(capability)
}
