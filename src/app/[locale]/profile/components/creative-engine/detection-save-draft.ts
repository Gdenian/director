import { purposeToRuntimeType } from '@/lib/creative-engine/model-purpose'
import type { CreativeModelPurpose, CreativeProtocolType } from '@/lib/creative-engine/types'
import type { CustomModel, Provider } from '../api-config'
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

function resolveDetectedModelPurpose(value: unknown): CreativeModelPurpose | null {
  if (isCreativeModelPurpose(value)) return value
  if (value === 'unknown') return 'text'
  return null
}

function isCreativeProtocolType(value: unknown): value is CreativeProtocolType {
  return value === 'openai-compatible'
    || value === 'gemini-compatible'
    || value === 'official'
    || value === 'manual-template'
}

function makeDetectedEngineId(providerKey: string): string {
  const uuid = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${providerKey}:${uuid}`
}

function normalizeDetectedProviderKey(value: string, protocolType: CreativeProtocolType): string {
  const providerKey = value.trim().toLowerCase()
  if (protocolType === 'gemini-compatible') return 'gemini-compatible'
  if (protocolType === 'openai-compatible') return 'openai-compatible'
  if (protocolType === 'official') return providerKey || 'openai-compatible'
  return 'openai-compatible'
}

export function resolveCreativeEngineDisplayName(input: {
  serviceName: string
  detectedSource?: string | null
  fallbackName: string
}): string {
  const serviceName = input.serviceName.trim()
  if (serviceName) return serviceName

  const detectedSource = input.detectedSource?.trim()
  if (detectedSource && detectedSource !== 'unknown') return detectedSource

  return input.fallbackName
}

export function buildDetectedEngineProviderDraft(input: {
  recommendedProviderKey: string
  protocolType: string
  name: string
  serviceUrl: string
  apiKey: string
}): Omit<Provider, 'hasApiKey'> {
  const protocolType = isCreativeProtocolType(input.protocolType) ? input.protocolType : 'openai-compatible'
  const providerKey = normalizeDetectedProviderKey(input.recommendedProviderKey, protocolType)
  const id = makeDetectedEngineId(providerKey)
  return {
    id,
    name: input.name,
    baseUrl: input.serviceUrl,
    apiKey: input.apiKey,
    protocolType,
    ...(protocolType === 'gemini-compatible'
      ? { apiMode: 'gemini-sdk' as const, gatewayRoute: 'official' as const }
      : {}),
    ...(protocolType === 'openai-compatible'
      ? { apiMode: 'openai-official' as const, gatewayRoute: 'openai-compat' as const }
      : {}),
    ...(protocolType === 'official'
      ? { gatewayRoute: 'official' as const }
      : {}),
  }
}

export function buildDetectedModelDrafts(
  providerId: string,
  models: CreativeModelListItem[],
): Array<Omit<CustomModel, 'enabled'>> {
  const llmProtocolCheckedAt = new Date().toISOString()
  return models.flatMap((model) => {
    const purpose = resolveDetectedModelPurpose(model.purpose)
    if (!purpose) return []
    const modelId = (model.callName || model.id || '').trim()
    if (!modelId) return []
    const type = purposeToRuntimeType(purpose)
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
      ...(model.compatMediaTemplate ? { compatMediaTemplate: model.compatMediaTemplate } : {}),
      ...(model.compatMediaTemplateSource ? { compatMediaTemplateSource: model.compatMediaTemplateSource } : {}),
      ...(model.mediaContract ? { mediaContract: model.mediaContract } : {}),
      ...(model.mediaContractSource ? { mediaContractSource: model.mediaContractSource } : {}),
      purpose,
      status: model.status === 'failed' || model.status === 'disabled'
        ? model.status
        : (model.status || 'unchecked'),
      price: 0,
    }]
  })
}
