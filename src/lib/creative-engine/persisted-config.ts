import { ApiError } from '@/lib/api-errors'
import {
  composeModelKey,
  parseModelKeyStrict,
  type UnifiedModelType,
} from '@/lib/model-config-contract'
import { validateMediaContract } from '@/lib/media-contract/validator'
import { validateOpenAICompatMediaTemplate } from '@/lib/user-api/model-template/validator'
import type {
  CreativeAuthType,
  CreativeDetectionConfidence,
  CreativeEngineConfig,
  CreativeEngineStatus,
  CreativeModelPricing,
  CreativeModelConfig,
  CreativeModelDetectionSource,
  CreativeModelPurpose,
  CreativeModelStatus,
  CreativeProtocolType,
} from './types'

type ApiModeType = 'gemini-sdk' | 'openai-official'
type GatewayRouteType = 'official' | 'openai-compat'
type LlmProtocolType = 'responses' | 'chat-completions'

const ENGINE_STATUSES = new Set<CreativeEngineStatus>([
  'unchecked',
  'available',
  'partial',
  'failed',
  'disabled',
])
const MODEL_STATUSES = new Set<CreativeModelStatus>([
  'unchecked',
  'available',
  'failed',
  'disabled',
])
const PROTOCOL_TYPES = new Set<CreativeProtocolType>([
  'official',
  'openai-compatible',
  'gemini-compatible',
  'manual-template',
])
const AUTH_TYPES = new Set<CreativeAuthType>([
  'bearer',
  'api-key',
  'query-key',
  'custom',
])
const API_MODES = new Set<ApiModeType>(['gemini-sdk', 'openai-official'])
const GATEWAY_ROUTES = new Set<GatewayRouteType>(['official', 'openai-compat'])
const CONFIDENCES = new Set<CreativeDetectionConfidence>(['high', 'medium', 'low'])
const MODEL_PURPOSES = new Set<CreativeModelPurpose>([
  'text',
  'image-generation',
  'image-edit',
  'video-generation',
  'voice-generation',
  'lip-sync',
  'voice-design',
])
const MODEL_TYPES = new Set<UnifiedModelType>(['llm', 'image', 'video', 'audio', 'lipsync'])
const LLM_PROTOCOLS = new Set<LlmProtocolType>(['responses', 'chat-completions'])
const DETECTION_SOURCES = new Set<CreativeModelDetectionSource>(['rule', 'provider-list', 'llm', 'manual'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readOptionalString(value: unknown): string | undefined {
  const trimmed = readTrimmedString(value)
  return trimmed || undefined
}

function readRequiredString(raw: Record<string, unknown>, key: string, code: string, index: number): string {
  const value = readTrimmedString(raw[key])
  if (!value) {
    throw new Error(`${code}: items[${index}].${key}`)
  }
  return value
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const normalized = value
    .map((item) => readTrimmedString(item))
    .filter(Boolean)
  return normalized.length > 0 ? normalized : undefined
}

function normalizeServiceUrl(value: unknown): string | undefined {
  const trimmed = readTrimmedString(value)
  return trimmed ? trimmed.replace(/\/+$/, '') : undefined
}

function readOptionalNonNegativeNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  throw new Error(`CREATIVE_MODEL_PRICING_INVALID: ${field}`)
}

function validateAllowedKeys(raw: Record<string, unknown>, allowed: readonly string[], field: string) {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(raw)) {
    if (allowedSet.has(key)) continue
    throw new Error(`CREATIVE_MODEL_PRICING_INVALID: ${field}.${key}`)
  }
}

function normalizePricingOptionPrices(value: unknown, field: string): Record<string, Record<string, number>> | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) {
    throw new Error(`CREATIVE_MODEL_PRICING_INVALID: ${field}`)
  }

  const normalized: Record<string, Record<string, number>> = {}
  for (const [optionField, rawOptionMap] of Object.entries(value)) {
    if (!isRecord(rawOptionMap)) {
      throw new Error(`CREATIVE_MODEL_PRICING_INVALID: ${field}.${optionField}`)
    }
    const optionMap: Record<string, number> = {}
    for (const [optionValue, rawAmount] of Object.entries(rawOptionMap)) {
      const amount = readOptionalNonNegativeNumber(rawAmount, `${field}.${optionField}.${optionValue}`)
      if (amount === undefined) {
        throw new Error(`CREATIVE_MODEL_PRICING_INVALID: ${field}.${optionField}.${optionValue}`)
      }
      optionMap[optionValue] = amount
    }
    normalized[optionField] = optionMap
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function normalizeMediaPricing(value: unknown, field: string): CreativeModelPricing['image'] {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) {
    throw new Error(`CREATIVE_MODEL_PRICING_INVALID: ${field}`)
  }
  validateAllowedKeys(value, ['basePrice', 'optionPrices'], field)

  const basePrice = readOptionalNonNegativeNumber(value.basePrice, `${field}.basePrice`)
  const optionPrices = normalizePricingOptionPrices(value.optionPrices, `${field}.optionPrices`)
  if (basePrice === undefined && optionPrices === undefined) return undefined

  return {
    ...(basePrice !== undefined ? { basePrice } : {}),
    ...(optionPrices ? { optionPrices } : {}),
  }
}

function normalizeModelPricing(value: unknown): CreativeModelPricing | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) {
    throw new Error('CREATIVE_MODEL_PRICING_INVALID: pricing')
  }
  validateAllowedKeys(value, ['llm', 'image', 'video', 'input', 'output'], 'pricing')

  const llmRaw = isRecord(value.llm) ? value.llm : value
  if (value.llm !== undefined && !isRecord(value.llm)) {
    throw new Error('CREATIVE_MODEL_PRICING_INVALID: pricing.llm')
  }
  if (isRecord(value.llm)) {
    validateAllowedKeys(value.llm, ['inputPerMillion', 'outputPerMillion'], 'pricing.llm')
  }
  const inputPerMillion = readOptionalNonNegativeNumber(llmRaw.inputPerMillion, 'pricing.llm.inputPerMillion')
    ?? readOptionalNonNegativeNumber(value.input, 'pricing.input')
  const outputPerMillion = readOptionalNonNegativeNumber(llmRaw.outputPerMillion, 'pricing.llm.outputPerMillion')
    ?? readOptionalNonNegativeNumber(value.output, 'pricing.output')
  const llm = inputPerMillion !== undefined || outputPerMillion !== undefined
    ? {
      ...(inputPerMillion !== undefined ? { inputPerMillion } : {}),
      ...(outputPerMillion !== undefined ? { outputPerMillion } : {}),
    }
    : undefined

  const image = normalizeMediaPricing(value.image, 'pricing.image')
  const video = normalizeMediaPricing(value.video, 'pricing.video')

  return {
    ...(llm ? { llm } : {}),
    ...(image ? { image } : {}),
    ...(video ? { video } : {}),
  }
}

function normalizeCompatMediaTemplate(value: unknown, index: number) {
  if (value === undefined || value === null) return undefined
  const validated = validateOpenAICompatMediaTemplate(value)
  if (!validated.ok || !validated.template) {
    throw new Error(`CREATIVE_MODEL_COMPAT_MEDIA_TEMPLATE_INVALID: models[${index}].compatMediaTemplate`)
  }
  return validated.template
}

function normalizeMediaContract(
  value: unknown,
  index: number,
  modelMediaType: UnifiedModelType,
  hasCompatMediaTemplate: boolean,
) {
  if (value === undefined || value === null) return undefined
  if (modelMediaType !== 'image' && modelMediaType !== 'video') {
    throw new Error(`CREATIVE_MODEL_MEDIA_CONTRACT_INVALID: models[${index}].mediaContract`)
  }
  const validated = validateMediaContract(value, {
    modelMediaType,
    hasCompatMediaTemplate,
  })
  if (!validated.ok || !validated.contract) {
    const field = validated.issues[0]?.field
    const suffix = field && field !== 'mediaContract' ? `.${field}` : ''
    throw new Error(`CREATIVE_MODEL_MEDIA_CONTRACT_INVALID: models[${index}].mediaContract${suffix}`)
  }
  return validated.contract
}

function readEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  code: string,
  index: number,
  field: string,
): T | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (allowed.has(trimmed as T)) return trimmed as T
  }
  throw new Error(`${code}: items[${index}].${field}`)
}

function readEnumWithDefault<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  defaultValue: T,
  code: string,
  index: number,
  field: string,
): T {
  return readEnum(value, allowed, code, index, field) || defaultValue
}

function readJsonArray(raw: string | null | undefined, code: string, field: string): unknown[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${code}: ${field} is not valid JSON`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${code}: ${field} must be an array`)
  }
  return parsed
}

function defaultGatewayRoute(providerKey: string): GatewayRouteType {
  return providerKey === 'openai-compatible' ? 'openai-compat' : 'official'
}

function readProviderKeyFromId(id: string): string {
  const index = id.indexOf(':')
  return index === -1 ? id : id.slice(0, index)
}

function isLikelyLegacyEngine(raw: Record<string, unknown>): boolean {
  return raw.providerKey === undefined && (raw.id !== undefined || raw.name !== undefined)
}

function isLikelyLegacyModel(raw: Record<string, unknown>): boolean {
  return raw.engineId === undefined && raw.callName === undefined && (raw.provider !== undefined || raw.modelId !== undefined)
}

function inferPurposeFromType(type: UnifiedModelType): CreativeModelPurpose {
  if (type === 'image') return 'image-generation'
  if (type === 'video') return 'video-generation'
  if (type === 'audio') return 'voice-generation'
  if (type === 'lipsync') return 'lip-sync'
  return 'text'
}

function readModelPurpose(value: unknown, type: UnifiedModelType, index: number): CreativeModelPurpose {
  if (value === 'unknown' || value === undefined || value === null || value === '') {
    return inferPurposeFromType(type)
  }
  const purpose = readEnum(
    value,
    MODEL_PURPOSES,
    'CREATIVE_MODEL_PURPOSE_INVALID',
    index,
    'purpose',
  )
  if (!purpose) {
    throw new Error(`CREATIVE_MODEL_PURPOSE_INVALID: models[${index}].purpose`)
  }
  return purpose
}

export function normalizeCreativeEngineInput(raw: unknown, index: number): CreativeEngineConfig {
  if (!isRecord(raw)) {
    throw new Error(`CREATIVE_ENGINE_PAYLOAD_INVALID: engines[${index}] must be an object`)
  }

  const id = readRequiredString(raw, 'id', 'CREATIVE_ENGINE_PAYLOAD_INVALID', index)
  const name = readRequiredString(raw, 'name', 'CREATIVE_ENGINE_PAYLOAD_INVALID', index)
  const providerKey = readRequiredString(raw, 'providerKey', 'CREATIVE_ENGINE_PAYLOAD_INVALID', index)
  const source = readOptionalString(raw.source)
  const displayProviderName = readOptionalString(raw.displayProviderName)
  const serviceUrl = normalizeServiceUrl(raw.serviceUrl)
  const authType = readEnum(raw.authType, AUTH_TYPES, 'CREATIVE_ENGINE_AUTH_TYPE_INVALID', index, 'authType')
  const protocolType = readEnum(raw.protocolType, PROTOCOL_TYPES, 'CREATIVE_ENGINE_PROTOCOL_TYPE_INVALID', index, 'protocolType')
  const apiMode = readEnum(raw.apiMode, API_MODES, 'CREATIVE_ENGINE_API_MODE_INVALID', index, 'apiMode')
  const gatewayRoute = readEnum(
    raw.gatewayRoute,
    GATEWAY_ROUTES,
    'CREATIVE_ENGINE_GATEWAY_ROUTE_INVALID',
    index,
    'gatewayRoute',
  ) || defaultGatewayRoute(providerKey)
  const confidence = readEnum(raw.confidence, CONFIDENCES, 'CREATIVE_ENGINE_CONFIDENCE_INVALID', index, 'confidence')
  const lastCheckedAt = readOptionalString(raw.lastCheckedAt)
  const allowKeyInInspector = readBoolean(raw.allowKeyInInspector)
  const hidden = readBoolean(raw.hidden)

  return {
    id,
    name,
    ...(source ? { source } : {}),
    providerKey,
    ...(displayProviderName ? { displayProviderName } : {}),
    ...(serviceUrl ? { serviceUrl } : {}),
    ...(typeof raw.apiKey === 'string' ? { apiKey: raw.apiKey.trim() } : {}),
    ...(authType ? { authType } : {}),
    ...(protocolType ? { protocolType } : {}),
    ...(apiMode ? { apiMode } : {}),
    gatewayRoute,
    status: readEnumWithDefault(raw.status, ENGINE_STATUSES, 'unchecked', 'CREATIVE_ENGINE_STATUS_INVALID', index, 'status'),
    ...(confidence ? { confidence } : {}),
    ...(lastCheckedAt ? { lastCheckedAt } : {}),
    ...(allowKeyInInspector !== undefined ? { allowKeyInInspector } : {}),
    ...(hidden !== undefined ? { hidden } : {}),
  }
}

export function normalizeCreativeModelInput(raw: unknown, index: number): CreativeModelConfig {
  if (!isRecord(raw)) {
    throw new Error(`CREATIVE_MODEL_PAYLOAD_INVALID: models[${index}] must be an object`)
  }

  const rawId = readTrimmedString(raw.id)
  const rawModelKey = readTrimmedString(raw.modelKey)
  if (!rawId && !rawModelKey) {
    throw new Error(`CREATIVE_MODEL_KEY_INVALID: models[${index}].id`)
  }

  const engineId = readRequiredString(raw, 'engineId', 'CREATIVE_MODEL_PAYLOAD_INVALID', index)
  const callName = readRequiredString(raw, 'callName', 'CREATIVE_MODEL_PAYLOAD_INVALID', index)
  const modelKey = composeModelKey(engineId, callName)
  if (!modelKey) {
    throw new Error(`CREATIVE_MODEL_KEY_INVALID: models[${index}].modelKey`)
  }
  if (rawModelKey) {
    const parsed = parseModelKeyStrict(rawModelKey)
    if (!parsed || parsed.modelKey !== modelKey) {
      throw new Error(`CREATIVE_MODEL_KEY_MISMATCH: models[${index}].modelKey`)
    }
  }

  const type = readEnum(
    raw.type,
    MODEL_TYPES,
    'CREATIVE_MODEL_TYPE_INVALID',
    index,
    'type',
  )
  if (!type) {
    throw new Error(`CREATIVE_MODEL_TYPE_INVALID: models[${index}].type`)
  }
  const purpose = readModelPurpose(raw.purpose, type, index)
  const confidence = readEnum(raw.confidence, CONFIDENCES, 'CREATIVE_MODEL_CONFIDENCE_INVALID', index, 'confidence')
  const llmProtocol = readEnum(raw.llmProtocol, LLM_PROTOCOLS, 'CREATIVE_MODEL_LLM_PROTOCOL_INVALID', index, 'llmProtocol')
  const llmProtocolCheckedAt = readOptionalString(raw.llmProtocolCheckedAt)
  const lastCheckedAt = readOptionalString(raw.lastCheckedAt)
  const detectionSource = readEnum(raw.detectionSource, DETECTION_SOURCES, 'CREATIVE_MODEL_DETECTION_SOURCE_INVALID', index, 'detectionSource')
  const warningCodes = readStringArray(raw.warningCodes)
  const tier = readOptionalString(raw.tier)
  const tags = readStringArray(raw.tags)
  const pricing = normalizeModelPricing(raw.pricing)
  const compatMediaTemplate = normalizeCompatMediaTemplate(raw.compatMediaTemplate, index)
  const compatMediaTemplateCheckedAt = readOptionalString(raw.compatMediaTemplateCheckedAt)
  const compatMediaTemplateSource = raw.compatMediaTemplateSource === 'ai' || raw.compatMediaTemplateSource === 'manual'
    ? raw.compatMediaTemplateSource
    : undefined
  const mediaContract = normalizeMediaContract(raw.mediaContract, index, type, !!compatMediaTemplate)
  const mediaContractCheckedAt = readOptionalString(raw.mediaContractCheckedAt) || mediaContract?.checkedAt
  const mediaContractSource = raw.mediaContractSource === 'rule'
    || raw.mediaContractSource === 'provider-list'
    || raw.mediaContractSource === 'llm'
    || raw.mediaContractSource === 'manual'
    || raw.mediaContractSource === 'official-adapter'
    ? raw.mediaContractSource
    : mediaContract?.source

  return {
    id: rawId || modelKey,
    engineId,
    name: readOptionalString(raw.name) || callName,
    callName,
    modelKey,
    type,
    purpose,
    enabled: raw.enabled === true,
    status: readEnumWithDefault(raw.status, MODEL_STATUSES, 'unchecked', 'CREATIVE_MODEL_STATUS_INVALID', index, 'status'),
    ...(confidence ? { confidence } : {}),
    ...(isRecord(raw.capabilities) ? { capabilities: raw.capabilities } : {}),
    ...(pricing ? { pricing } : {}),
    ...(llmProtocol ? { llmProtocol } : {}),
    ...(llmProtocolCheckedAt ? { llmProtocolCheckedAt } : {}),
    ...(compatMediaTemplate ? { compatMediaTemplate } : {}),
    ...(compatMediaTemplateCheckedAt ? { compatMediaTemplateCheckedAt } : {}),
    ...(compatMediaTemplateSource ? { compatMediaTemplateSource } : {}),
    ...(mediaContract ? { mediaContract } : {}),
    ...(mediaContractCheckedAt ? { mediaContractCheckedAt } : {}),
    ...(mediaContractSource ? { mediaContractSource } : {}),
    ...(lastCheckedAt ? { lastCheckedAt } : {}),
    ...(detectionSource ? { detectionSource } : {}),
    ...(warningCodes ? { warningCodes } : {}),
    ...(tier ? { tier } : {}),
    ...(tags ? { tags } : {}),
  }
}

export function parseCreativeEngines(raw: string | null | undefined): CreativeEngineConfig[] {
  return readJsonArray(raw, 'CREATIVE_ENGINE_PAYLOAD_INVALID', 'customProviders')
    .map((item, index) => {
      if (isRecord(item) && isLikelyLegacyEngine(item)) {
        return normalizeCreativeEngineInput({
          ...item,
          providerKey: readProviderKeyFromId(readTrimmedString(item.id)),
          serviceUrl: item.serviceUrl ?? item.baseUrl,
        }, index)
      }
      return normalizeCreativeEngineInput(item, index)
    })
}

export function parseCreativeModels(raw: string | null | undefined): CreativeModelConfig[] {
  return readJsonArray(raw, 'CREATIVE_MODEL_PAYLOAD_INVALID', 'customModels')
    .map((item, index) => {
      if (isRecord(item) && isLikelyLegacyModel(item)) {
        const parsed = parseModelKeyStrict(readTrimmedString(item.modelKey))
        const engineId = readTrimmedString(item.provider) || parsed?.provider || ''
        const callName = readTrimmedString(item.modelId) || parsed?.modelId || ''
        const type = readEnum(item.type, MODEL_TYPES, 'CREATIVE_MODEL_TYPE_INVALID', index, 'type')
        return normalizeCreativeModelInput({
          ...item,
          id: readTrimmedString(item.id) || readTrimmedString(item.modelKey) || composeModelKey(engineId, callName),
          engineId,
          callName,
          purpose: item.purpose ?? (type ? inferPurposeFromType(type) : undefined),
          enabled: item.enabled ?? true,
          status: item.status ?? 'available',
          pricing: item.pricing ?? item.customPricing,
        }, index)
      }
      return normalizeCreativeModelInput(item, index)
    })
}

export function toRuntimeProvider(engine: CreativeEngineConfig) {
  return {
    id: engine.id,
    name: engine.name,
    baseUrl: engine.serviceUrl,
    apiKey: engine.apiKey,
    hidden: engine.hidden,
    apiMode: engine.apiMode,
    gatewayRoute: engine.gatewayRoute || defaultGatewayRoute(engine.providerKey || readProviderKeyFromId(engine.id)),
  }
}

export function toRuntimeModel(model: CreativeModelConfig) {
  return {
    modelId: model.callName,
    modelKey: model.modelKey,
    name: model.name,
    type: model.type,
    provider: model.engineId,
    llmProtocol: model.llmProtocol,
    llmProtocolCheckedAt: model.llmProtocolCheckedAt,
    compatMediaTemplate: model.compatMediaTemplate,
    compatMediaTemplateCheckedAt: model.compatMediaTemplateCheckedAt,
    compatMediaTemplateSource: model.compatMediaTemplateSource,
    mediaContract: model.mediaContract,
    mediaContractCheckedAt: model.mediaContractCheckedAt,
    mediaContractSource: model.mediaContractSource,
    price: 0,
    enabled: model.enabled,
    purpose: model.purpose,
    status: model.status,
    capabilities: model.capabilities,
    customPricing: model.pricing,
  }
}

export function toApiError(error: unknown, field: string): ApiError {
  if (error instanceof ApiError) return error
  const message = error instanceof Error ? error.message : String(error)
  const code = message.match(/[A-Z][A-Z0-9_]+/)?.[0] || 'CREATIVE_CONFIG_INVALID'
  return new ApiError('INVALID_PARAMS', {
    code,
    field,
  })
}
