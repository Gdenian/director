import { classifyModelPurposeFromName } from '@/lib/creative-engine/model-purpose'
import type { DetectedModelDraft } from './types'

export function modelIdToDraft(modelId: string): DetectedModelDraft {
  const { purpose, confidence } = classifyModelPurposeFromName(modelId)
  return {
    name: modelId,
    callName: modelId,
    purpose,
    confidence,
  }
}
