import type { MediaCapability, MediaContract } from './types'
import { isImageCapability, isVideoCapability, mediaCapabilityStatusKey } from './status'

export function resolveRequestedImageCapability(
  referenceImages?: string[],
): 'text-to-image' | 'image-to-image' {
  return Array.isArray(referenceImages) && referenceImages.length > 0
    ? 'image-to-image'
    : 'text-to-image'
}

export function resolveRequestedVideoCapability(
  options?: { lastFrameImageUrl?: string },
): 'image-to-video' | 'first-last-frame-video' {
  return options?.lastFrameImageUrl ? 'first-last-frame-video' : 'image-to-video'
}

export function assertMediaContractCapability(input: {
  contract: MediaContract
  capability: MediaCapability
  trustedOfficialAdapter: boolean
}): void {
  const { contract, capability, trustedOfficialAdapter } = input
  const mediaTypeSupported = contract.mediaType === 'image'
    ? isImageCapability(capability)
    : isVideoCapability(capability)
  if (!mediaTypeSupported || !contract.capabilities.includes(capability)) {
    throw new Error(`MEDIA_CONTRACT_CAPABILITY_UNSUPPORTED: ${capability}`)
  }

  if (trustedOfficialAdapter && contract.executor === 'official-adapter') {
    return
  }

  const statusKey = mediaCapabilityStatusKey(capability)
  if (contract.testStatus?.[statusKey] !== 'passed') {
    throw new Error(`MEDIA_CONTRACT_CAPABILITY_NOT_PASSED: ${capability}`)
  }
}
