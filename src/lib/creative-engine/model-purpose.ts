import type { UnifiedModelType } from '@/lib/model-config-contract'
import type {
  CreativeDetectionConfidence,
  CreativeModelDraftPurpose,
  CreativeModelPurpose,
  CreativeModelSelectorCandidate,
  DefaultModelField,
} from './types'

const DEFAULT_FIELD_PURPOSES: Record<DefaultModelField, readonly CreativeModelPurpose[]> = {
  analysisModel: ['text'],
  characterModel: ['image-generation'],
  locationModel: ['image-generation'],
  storyboardModel: ['image-generation'],
  editModel: ['image-edit'],
  videoModel: ['video-generation'],
  audioModel: ['voice-generation'],
  lipSyncModel: ['lip-sync'],
  voiceDesignModel: ['voice-design'],
}

export function purposeToRuntimeType(purpose: CreativeModelPurpose): UnifiedModelType {
  switch (purpose) {
    case 'text':
      return 'llm'
    case 'image-generation':
    case 'image-edit':
      return 'image'
    case 'video-generation':
      return 'video'
    case 'voice-generation':
    case 'voice-design':
      return 'audio'
    case 'lip-sync':
      return 'lipsync'
    default: {
      const exhaustivePurpose: never = purpose
      return exhaustivePurpose
    }
  }
}

export function defaultFieldToPurpose(field: DefaultModelField): CreativeModelPurpose[] {
  return [...DEFAULT_FIELD_PURPOSES[field]]
}

export function shouldShowModelForDefaultField(
  model: CreativeModelSelectorCandidate,
  field: DefaultModelField,
): boolean {
  if (!model.enabled) return false
  if (model.status === 'failed' || model.status === 'disabled') return false
  return defaultFieldToPurpose(field).includes(model.purpose)
}

export function classifyModelPurposeFromName(name: string): {
  purpose: CreativeModelDraftPurpose
  confidence: CreativeDetectionConfidence
} {
  const value = name.toLowerCase()
  if (/(voice[-_ ]?design|音色)/.test(value)) return { purpose: 'voice-design', confidence: 'high' }
  if (/(lip[-_ ]?sync|lipsync|口型|唇形)/.test(value)) return { purpose: 'lip-sync', confidence: 'high' }
  if (/(tts|text[-_ ]?to[-_ ]?speech|speech|voice|语音|配音)/.test(value)) {
    return { purpose: 'voice-generation', confidence: 'medium' }
  }
  if (/(image[-_ ]?edit|edit[-_ ]?image|inpaint|outpaint|修图|编辑)/.test(value)) {
    return { purpose: 'image-edit', confidence: 'medium' }
  }
  if (/(veo|kling|wan|seedance|sora|vidu|video|hailuo|视频)/.test(value)) {
    return { purpose: 'video-generation', confidence: 'medium' }
  }
  if (/(imagen|seedream|flux|sdxl|stable[-_ ]?diffusion|image|banana|图片|图像)/.test(value)) {
    return { purpose: 'image-generation', confidence: 'medium' }
  }
  if (/(gpt|claude|deepseek|qwen|gemini|doubao|llama|mistral|sonnet|haiku|文本|chat)/.test(value)) {
    return { purpose: 'text', confidence: 'high' }
  }
  return { purpose: 'unknown', confidence: 'low' }
}
