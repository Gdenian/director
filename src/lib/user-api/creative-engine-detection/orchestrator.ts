import { chooseFailureCategory } from './failure-category'
import { fingerprintCreativeEngineSource } from './fingerprint'
import { probeGeminiCompatibleModels } from './probe-gemini'
import { probeOfficialCreativeEngine } from './probe-official'
import { probeOpenAICompatibleModels } from './probe-openai'
import { mapProbeResultToDetection } from './result-mapper'
import type { CreativeEngineDetectionResult, CreativeEngineDetectRequest } from './types'
import { normalizeCreativeEngineUrl } from './url-normalizer'

function mergeWarnings(...groups: string[][]) {
  return [...new Set(groups.flat())]
}

function resolveFallbackFailureCategory(params: {
  fingerprintProtocolType: string
  openaiResult: { failureCategory?: CreativeEngineDetectionResult['failureCategory'] }
  geminiResult: { failureCategory?: CreativeEngineDetectionResult['failureCategory'] }
  officialResult: { failureCategory?: CreativeEngineDetectionResult['failureCategory'] }
}) {
  if (params.fingerprintProtocolType === 'official' && params.officialResult.failureCategory) {
    return params.officialResult.failureCategory
  }
  return chooseFailureCategory([
    params.openaiResult.failureCategory,
    params.geminiResult.failureCategory,
    params.officialResult.failureCategory,
  ])
}

export async function detectCreativeEngine(request: CreativeEngineDetectRequest): Promise<CreativeEngineDetectionResult> {
  const normalized = normalizeCreativeEngineUrl(request.serviceUrl)
  const fingerprint = fingerprintCreativeEngineSource({ url: normalized.primaryUrl })

  const openaiResult = await probeOpenAICompatibleModels({
    urls: normalized.candidates,
    apiKey: request.apiKey,
  })
  if (openaiResult.ok) return mapProbeResultToDetection({ normalized, fingerprint, probe: openaiResult })

  const geminiResult = await probeGeminiCompatibleModels({
    urls: normalized.candidates,
    apiKey: request.apiKey,
  })
  if (geminiResult.ok) return mapProbeResultToDetection({ normalized, fingerprint, probe: geminiResult })

  const officialResult = await probeOfficialCreativeEngine({
    fingerprint,
    normalizedBaseUrl: normalized.primaryUrl,
    apiKey: request.apiKey,
  })
  if (officialResult.ok) return mapProbeResultToDetection({ normalized, fingerprint, probe: officialResult })

  return {
    source: fingerprint.source,
    recommendedProviderKey: fingerprint.providerKey,
    protocolType: fingerprint.protocolType,
    normalizedBaseUrl: normalized.primaryUrl,
    confidence: 'low',
    models: [],
    warnings: mergeWarnings(
      normalized.warnings,
      openaiResult.warnings,
      geminiResult.warnings,
      officialResult.warnings,
      ['MODEL_LIST_UNREADABLE'],
    ),
    risks: ['这个服务没有开放模型列表接口。你仍然可以手动添加模型调用名。'],
    failureCategory: resolveFallbackFailureCategory({
      fingerprintProtocolType: fingerprint.protocolType,
      openaiResult,
      geminiResult,
      officialResult,
    }),
    requiresManualModelEntry: true,
  }
}
