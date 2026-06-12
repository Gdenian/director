/**
 * 获取用户的模型列表
 *
 * 返回用户在个人中心启用的模型，供项目配置下拉框使用。
 * capabilities 仅来自系统内置目录（不信任用户提交的 model.capabilities）。
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import {
  parseCreativeEngines,
  parseCreativeModels,
} from '@/lib/creative-engine/persisted-config'
import {
  composeModelKey,
  type CapabilityValue,
  type ModelCapabilities,
  type UnifiedModelType,
} from '@/lib/model-config-contract'
import { findBuiltinCapabilities } from '@/lib/model-capabilities/catalog'
import { findBuiltinPricingCatalogEntry } from '@/lib/model-pricing/catalog'
import type { VideoPricingTier } from '@/lib/model-pricing/video-tier'
import type {
  CreativeDetectionConfidence,
  CreativeEngineConfig,
  CreativeEngineStatus,
  CreativeModelConfig,
  CreativeModelPurpose,
  CreativeModelStatus,
} from '@/lib/creative-engine/types'

interface UserModelOption {
  value: string
  label: string
  provider?: string
  providerName?: string
  capabilities?: ModelCapabilities
  videoPricingTiers?: VideoPricingTier[]
  purpose?: CreativeModelPurpose
  engineStatus?: CreativeEngineStatus
  modelStatus?: CreativeModelStatus
  source?: string
  confidence?: CreativeDetectionConfidence
}

interface UserModelsPayload {
  llm: UserModelOption[]
  image: UserModelOption[]
  video: UserModelOption[]
  audio: UserModelOption[]
  lipsync: UserModelOption[]
  voiceDesign: UserModelOption[]
}

const AUDIO_MODEL_EXCLUDED_IDS = new Set([
  'qwen-voice-design',
])

function toDisplayLabel(model: CreativeModelConfig, fallbackModelId: string): string {
  if (typeof model.name === 'string' && model.name.trim()) return model.name.trim()
  return fallbackModelId
}

function dedupeByModelKey(items: UserModelOption[]): UserModelOption[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.value)) return false
    seen.add(item.value)
    return true
  })
}

function cloneVideoPricingTiers(rawTiers: Array<{ when: Record<string, CapabilityValue> }>): VideoPricingTier[] {
  return rawTiers.map((tier) => ({
    when: { ...tier.when },
  }))
}

function parseStoredModels(rawModels: string | null | undefined): CreativeModelConfig[] {
  try {
    return parseCreativeModels(rawModels)
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null
    throw new ApiError('INVALID_PARAMS', {
      code: apiError?.details?.code || 'MODEL_PAYLOAD_INVALID',
      field: 'customModels',
    })
  }
}

function parseStoredProviders(rawProviders: string | null | undefined): CreativeEngineConfig[] {
  try {
    return parseCreativeEngines(rawProviders)
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null
    throw new ApiError('INVALID_PARAMS', {
      code: apiError?.details?.code || 'PROVIDER_PAYLOAD_INVALID',
      field: 'customProviders',
    })
  }
}

function hasStoredProviderApiKey(provider: CreativeEngineConfig): boolean {
  return typeof provider.apiKey === 'string' && provider.apiKey.trim().length > 0
}

function isBlockedStatus(status: CreativeEngineStatus | CreativeModelStatus): boolean {
  return status === 'failed' || status === 'disabled'
}

function isPurposeCompatible(modelType: UnifiedModelType, purpose: CreativeModelPurpose): boolean {
  if (purpose === 'text') return modelType === 'llm'
  if (purpose === 'image-generation' || purpose === 'image-edit') return modelType === 'image'
  if (purpose === 'video-generation') return modelType === 'video'
  if (purpose === 'voice-generation' || purpose === 'voice-design') return modelType === 'audio'
  if (purpose === 'lip-sync') return modelType === 'lipsync'
  return false
}

function isUserSelectableModel(model: CreativeModelConfig): boolean {
  if (!model.enabled) return false
  if (isBlockedStatus(model.status)) return false
  if (!isPurposeCompatible(model.type, model.purpose)) return false
  if (model.type !== 'audio') return true
  if (model.purpose === 'voice-design') return true
  return !AUDIO_MODEL_EXCLUDED_IDS.has(model.callName)
}

function getModelGroup(modelType: UnifiedModelType, purpose: CreativeModelPurpose): keyof UserModelsPayload {
  if (modelType === 'audio' && purpose === 'voice-design') return 'voiceDesign'
  return modelType
}

function findBuiltinCapabilitiesWithProviderKey(
  modelType: UnifiedModelType,
  provider: string,
  providerKey: string,
  modelId: string,
): ModelCapabilities | undefined {
  return findBuiltinCapabilities(modelType, provider, modelId)
    || (providerKey !== provider ? findBuiltinCapabilities(modelType, providerKey, modelId) : undefined)
}

function findVideoPricingEntryWithProviderKey(
  provider: string,
  providerKey: string,
  modelId: string,
) {
  return findBuiltinPricingCatalogEntry('video', provider, modelId)
    || (providerKey !== provider ? findBuiltinPricingCatalogEntry('video', providerKey, modelId) : null)
}

export const GET = apiHandler(async () => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const userId = session.user.id

  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: { customModels: true, customProviders: true },
  })

  const modelsRaw = parseStoredModels(pref?.customModels)
  const providers = parseStoredProviders(pref?.customProviders)

  const providersById = new Map<string, CreativeEngineConfig>()
  providers.forEach((provider) => {
    const providerId = provider.id.trim()
    if (!providerId) return
    providersById.set(providerId, provider)
  })

  const grouped: UserModelsPayload = {
    llm: [],
    image: [],
    video: [],
    audio: [],
    lipsync: [],
    voiceDesign: [],
  }

  for (const model of modelsRaw) {
    if (!isUserSelectableModel(model)) continue

    const modelType = model.type
    const engine = providersById.get(model.engineId)
    if (!engine) continue
    if (isBlockedStatus(engine.status)) continue
    if (!hasStoredProviderApiKey(engine)) continue

    const provider = model.engineId
    const modelId = model.callName
    const modelKey = model.modelKey || composeModelKey(provider, modelId)
    if (!modelKey) continue

    const option: UserModelOption = {
      value: modelKey,
      label: toDisplayLabel(model, modelId || modelKey),
      provider,
      providerName: engine.name,
      purpose: model.purpose,
      engineStatus: engine.status,
      modelStatus: model.status,
      source: model.detectionSource,
      confidence: model.confidence,
    }

    if (provider && modelId) {
      const capabilities = findBuiltinCapabilitiesWithProviderKey(modelType, provider, engine.providerKey, modelId)
      if (capabilities) {
        option.capabilities = capabilities
      }

      if (modelType === 'video') {
        const pricingEntry = findVideoPricingEntryWithProviderKey(provider, engine.providerKey, modelId)
        if (pricingEntry?.pricing.mode === 'capability' && Array.isArray(pricingEntry.pricing.tiers)) {
          option.videoPricingTiers = cloneVideoPricingTiers(pricingEntry.pricing.tiers)
        }
      }
    }

    grouped[getModelGroup(modelType, model.purpose)].push(option)
  }

  return NextResponse.json({
    llm: dedupeByModelKey(grouped.llm),
    image: dedupeByModelKey(grouped.image),
    video: dedupeByModelKey(grouped.video),
    audio: dedupeByModelKey(grouped.audio),
    lipsync: dedupeByModelKey(grouped.lipsync),
    voiceDesign: dedupeByModelKey(grouped.voiceDesign),
  } satisfies UserModelsPayload)
})
