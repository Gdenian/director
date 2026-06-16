import type {
  CreativeDetectionConfidence,
  CreativeModelDraftPurpose,
  CreativeProtocolType,
} from '@/lib/creative-engine/types'
import type {
  OpenAICompatMediaTemplate,
  OpenAICompatMediaTemplateSource,
} from '@/lib/openai-compat-media-template'
import type { MediaContract, MediaContractSource } from '@/lib/media-contract/types'

export type DetectionFailureCategory =
  | 'key-invalid'
  | 'service-unreachable'
  | 'interface-unsupported'
  | 'rate-limited'
  | 'balance-insufficient'
  | 'provider-error'
  | 'partial-compatibility'

export interface CreativeEngineDetectRequest {
  serviceUrl: string
  apiKey: string
  allowKeyInInspector: boolean
}

export interface NormalizedCreativeEngineUrl {
  primaryUrl: string
  candidates: string[]
  warnings: string[]
}

export interface CreativeEngineFingerprint {
  source: string
  providerKey: string
  confidence: CreativeDetectionConfidence
  protocolType: CreativeProtocolType
}

export interface DetectedModelDraft {
  name: string
  callName: string
  purpose: CreativeModelDraftPurpose
  confidence: CreativeDetectionConfidence
  mediaContract?: MediaContract
  compatMediaTemplate?: OpenAICompatMediaTemplate
  mediaContractSource?: MediaContractSource
  compatMediaTemplateSource?: OpenAICompatMediaTemplateSource
}

export interface CreativeEngineDetectionResult {
  source: string
  recommendedProviderKey: string
  protocolType: CreativeProtocolType
  normalizedBaseUrl: string
  confidence: CreativeDetectionConfidence
  models: DetectedModelDraft[]
  warnings: string[]
  risks: string[]
  failureCategory?: DetectionFailureCategory
  requiresManualModelEntry?: boolean
}

export interface ProbeResult {
  ok: boolean
  source?: string
  providerKey?: string
  protocolType?: CreativeProtocolType
  confidence: CreativeDetectionConfidence
  normalizedBaseUrl?: string
  models: DetectedModelDraft[]
  warnings: string[]
  failureCategory?: DetectionFailureCategory
}
