import { getProviderKey, type CustomModel, type Provider } from '../api-config'

export interface CreativeModelLightTestInput {
  model: CustomModel
  provider?: Provider
}

export function canLightTestCreativeModel({ model, provider }: CreativeModelLightTestInput): boolean {
  const status = model.status || 'unchecked'
  const hasConnection = !!provider?.baseUrl?.trim() && (provider.hasApiKey === true || !!provider.apiKey?.trim())
  return model.type === 'llm'
    && getProviderKey(model.provider) === 'openai-compatible'
    && model.enabled !== false
    && (status === 'unchecked' || status === 'failed')
    && hasConnection
}

export function buildCreativeModelLightTestPayload({ model, provider }: CreativeModelLightTestInput) {
  if (!canLightTestCreativeModel({ model, provider })) return null
  const serviceUrl = provider?.baseUrl?.trim()
  const apiKey = provider?.apiKey?.trim()
  if (!serviceUrl || !apiKey) return null
  return {
    protocolType: 'openai-compatible',
    serviceUrl,
    apiKey,
    modelCallName: model.modelId,
    confirmedCostRisk: true,
  }
}
