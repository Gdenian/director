import { classifyModelPurposeFromName } from '@/lib/creative-engine/model-purpose'
import type { CreativeDetectionConfidence, CreativeModelDraftPurpose } from '@/lib/creative-engine/types'
import type { DetectedModelDraft } from './types'

type ModelMetadata = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function collectMetadataTokens(value: unknown): string[] {
  if (typeof value === 'string') return [value.toLowerCase()]
  if (Array.isArray(value)) return value.flatMap(collectMetadataTokens)
  if (!isRecord(value)) return []

  const tokens: string[] = []
  for (const [key, nestedValue] of Object.entries(value)) {
    if (nestedValue === true) tokens.push(key.toLowerCase())
    tokens.push(...collectMetadataTokens(nestedValue))
  }
  return tokens
}

function purposeFromMetadata(raw: unknown): {
  purpose: CreativeModelDraftPurpose
  confidence: CreativeDetectionConfidence
} | null {
  const tokens = collectMetadataTokens(raw).join(' ')
  if (!tokens) return null

  if (/(lip[-_ ]?sync|lipsync|口型|唇形)/.test(tokens)) return { purpose: 'lip-sync', confidence: 'high' }
  if (/(voice[-_ ]?design|音色)/.test(tokens)) return { purpose: 'voice-design', confidence: 'high' }
  if (/(video[-_ ]?generation|generatevideos?|video|movie)/.test(tokens)) {
    return { purpose: 'video-generation', confidence: 'high' }
  }
  if (/(image[-_ ]?edit|editimage|inpaint|outpaint)/.test(tokens)) {
    return { purpose: 'image-edit', confidence: 'high' }
  }
  if (/(image[-_ ]?generation|generateimages?|image|vision|picture)/.test(tokens)) {
    return { purpose: 'image-generation', confidence: 'high' }
  }
  if (/(text[-_ ]?to[-_ ]?speech|tts|speech|audio|voice[-_ ]?generation|voice)/.test(tokens)) {
    return { purpose: 'voice-generation', confidence: 'high' }
  }
  if (/(generatecontent|chat|completion|text|language|token)/.test(tokens)) {
    return { purpose: 'text', confidence: 'high' }
  }

  return null
}

export function modelMetadataToDraft(metadata: ModelMetadata): DetectedModelDraft | null {
  const modelId = readString(metadata.id) || readString(metadata.name)
  if (!modelId) return null
  const metadataResult = purposeFromMetadata({
    capabilities: metadata.capabilities,
    modalities: metadata.modalities,
    input_modalities: metadata.input_modalities,
    output_modalities: metadata.output_modalities,
    supportedGenerationMethods: metadata.supportedGenerationMethods,
    supported_generation_methods: metadata.supported_generation_methods,
    type: metadata.type,
    mode: metadata.mode,
    supported_endpoints: metadata.supported_endpoints,
  })
  if (metadataResult) {
    return {
      name: modelId,
      callName: modelId,
      purpose: metadataResult.purpose,
      confidence: metadataResult.confidence,
    }
  }
  return modelIdToDraft(modelId)
}

export function modelIdToDraft(modelId: string): DetectedModelDraft {
  const { purpose, confidence } = classifyModelPurposeFromName(modelId)
  return {
    name: modelId,
    callName: modelId,
    purpose,
    confidence,
  }
}
