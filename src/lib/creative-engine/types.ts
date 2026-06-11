import type { ModelCapabilities, UnifiedModelType } from '@/lib/model-config-contract'
import type { OpenAICompatMediaTemplate } from '@/lib/openai-compat-media-template'

export type CreativeEngineStatus = 'unchecked' | 'available' | 'partial' | 'failed' | 'disabled'
export type CreativeModelStatus = 'unchecked' | 'available' | 'failed' | 'disabled'
export type CreativeDetectionConfidence = 'high' | 'medium' | 'low'

export type CreativeProtocolType =
  | 'official'
  | 'openai-compatible'
  | 'gemini-compatible'
  | 'manual-template'

export type CreativeAuthType = 'bearer' | 'api-key' | 'query-key' | 'custom'

export type CreativeModelPurpose =
  | 'text'
  | 'image-generation'
  | 'image-edit'
  | 'video-generation'
  | 'voice-generation'
  | 'lip-sync'
  | 'voice-design'

export type CreativeModelDraftPurpose = CreativeModelPurpose | 'unknown'

export type CreativeModelDetectionSource = 'rule' | 'provider-list' | 'llm' | 'manual'

export interface CreativeLlmCustomPricing {
  inputPerMillion?: number
  outputPerMillion?: number
}

export interface CreativeMediaCustomPricing {
  basePrice?: number
  optionPrices?: Record<string, Record<string, number>>
}

export interface CreativeModelPricing {
  llm?: CreativeLlmCustomPricing
  image?: CreativeMediaCustomPricing
  video?: CreativeMediaCustomPricing
}

export type DefaultModelField =
  | 'analysisModel'
  | 'characterModel'
  | 'locationModel'
  | 'storyboardModel'
  | 'editModel'
  | 'videoModel'
  | 'audioModel'
  | 'lipSyncModel'
  | 'voiceDesignModel'

export interface CreativeEngineConfig {
  id: string
  name: string
  source?: string
  providerKey: string
  displayProviderName?: string
  serviceUrl?: string
  apiKey?: string
  authType?: CreativeAuthType
  protocolType?: CreativeProtocolType
  apiMode?: 'gemini-sdk' | 'openai-official'
  gatewayRoute?: 'official' | 'openai-compat'
  status: CreativeEngineStatus
  confidence?: CreativeDetectionConfidence
  lastCheckedAt?: string
  allowKeyInInspector?: boolean
  hidden?: boolean
}

export interface CreativeModelConfig {
  id: string
  engineId: string
  name: string
  callName: string
  modelKey: string
  type: UnifiedModelType
  purpose: CreativeModelPurpose
  enabled: boolean
  status: CreativeModelStatus
  confidence?: CreativeDetectionConfidence
  capabilities?: ModelCapabilities
  pricing?: CreativeModelPricing
  llmProtocol?: 'responses' | 'chat-completions'
  compatMediaTemplate?: OpenAICompatMediaTemplate
  lastCheckedAt?: string
  detectionSource?: CreativeModelDetectionSource
  warningCodes?: string[]
}

export interface CreativeModelDraft extends Omit<CreativeModelConfig, 'purpose' | 'enabled'> {
  purpose: CreativeModelDraftPurpose
  enabled: false
}

export interface CreativeModelSelectorCandidate {
  purpose: CreativeModelPurpose
  enabled: boolean
  status: CreativeModelStatus
}
