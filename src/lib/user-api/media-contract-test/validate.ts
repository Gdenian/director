import { isImageCapability, isVideoCapability } from '@/lib/media-contract/status'
import type { MediaCapability, MediaContract } from '@/lib/media-contract/types'

export function isMediaContractCapabilitySupported(
  contract: MediaContract,
  capability: MediaCapability,
): boolean {
  const mediaTypeSupported = contract.mediaType === 'image'
    ? isImageCapability(capability)
    : isVideoCapability(capability)
  return mediaTypeSupported && contract.capabilities.includes(capability)
}

export function assertMediaContractTestCapability(
  contract: MediaContract,
  capability: MediaCapability,
): void {
  if (!isMediaContractCapabilitySupported(contract, capability)) {
    throw new Error(`MEDIA_TEST_CAPABILITY_UNSUPPORTED: ${capability}`)
  }
}
