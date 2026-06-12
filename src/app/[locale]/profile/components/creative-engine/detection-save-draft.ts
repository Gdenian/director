import { purposeToRuntimeType } from '@/lib/creative-engine/model-purpose'
import type { CreativeModelPurpose } from '@/lib/creative-engine/types'
import type { CustomModel } from '../api-config'
import { encodeModelKey } from '../api-config'
import type { CreativeModelListItem } from './CreativeModelList'

const CREATIVE_PURPOSES = new Set<CreativeModelPurpose>([
  'text',
  'image-generation',
  'image-edit',
  'video-generation',
  'voice-generation',
  'lip-sync',
  'voice-design',
])

function isCreativeModelPurpose(value: unknown): value is CreativeModelPurpose {
  return typeof value === 'string' && CREATIVE_PURPOSES.has(value as CreativeModelPurpose)
}

export function buildDetectedModelDrafts(
  providerId: string,
  models: CreativeModelListItem[],
): Array<Omit<CustomModel, 'enabled'>> {
  const llmProtocolCheckedAt = new Date().toISOString()
  return models.flatMap((model) => {
    if (!isCreativeModelPurpose(model.purpose)) return []
    const modelId = (model.callName || model.id || '').trim()
    if (!modelId) return []
    const type = purposeToRuntimeType(model.purpose)
    const llmProtocol = type === 'llm' && providerId.startsWith('openai-compatible:')
      ? {
        llmProtocol: 'chat-completions' as const,
        llmProtocolCheckedAt,
      }
      : {}
    return [{
      modelId,
      modelKey: encodeModelKey(providerId, modelId),
      name: model.name || modelId,
      type,
      provider: providerId,
      ...llmProtocol,
      purpose: model.purpose,
      status: model.status === 'failed' || model.status === 'disabled'
        ? model.status
        : (model.status || 'unchecked'),
      price: 0,
    }]
  })
}
