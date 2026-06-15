import { chooseFailureCategory } from './failure-category'
import { fingerprintCreativeEngineSource } from './fingerprint'
import { inspectCreativeEngine } from './llm-inspector'
import { buildMediaContractDraftForDetectedModel } from './media-contract-drafts'
import { probeGeminiCompatibleModels } from './probe-gemini'
import { probeOfficialCreativeEngine } from './probe-official'
import { probeOpenAICompatibleModels } from './probe-openai'
import { mapProbeResultToDetection } from './result-mapper'
import type { CreativeEngineDetectionResult, CreativeEngineDetectRequest, DetectedModelDraft } from './types'
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

function toInspectorProbeLogs(params: {
  normalizedWarnings: string[]
  openaiWarnings: string[]
  geminiWarnings: string[]
  officialWarnings: string[]
}) {
  return mergeWarnings(
    params.normalizedWarnings,
    params.openaiWarnings,
    params.geminiWarnings,
    params.officialWarnings,
    ['MODEL_LIST_UNREADABLE'],
  )
}

async function inspectWithFallback(input: Parameters<typeof inspectCreativeEngine>[0]) {
  try {
    return {
      result: await inspectCreativeEngine(input),
      unavailable: false,
    }
  } catch {
    return {
      result: null,
      unavailable: true,
    }
  }
}

function withMediaContractDrafts(result: CreativeEngineDetectionResult): CreativeEngineDetectionResult {
  return {
    ...result,
    models: result.models.map((model): DetectedModelDraft => {
      const draft = buildMediaContractDraftForDetectedModel({
        protocolType: result.protocolType,
        model,
      })
      return {
        ...model,
        ...(draft.mediaContract ? { mediaContract: draft.mediaContract } : {}),
        ...(draft.mediaContractSource ? { mediaContractSource: draft.mediaContractSource } : {}),
      }
    }),
  }
}

export async function detectCreativeEngine(request: CreativeEngineDetectRequest): Promise<CreativeEngineDetectionResult> {
  const normalized = normalizeCreativeEngineUrl(request.serviceUrl)
  const fingerprint = fingerprintCreativeEngineSource({ url: normalized.primaryUrl })

  const openaiResult = await probeOpenAICompatibleModels({
    urls: normalized.candidates,
    apiKey: request.apiKey,
  })
  if (openaiResult.ok) return withMediaContractDrafts(mapProbeResultToDetection({ normalized, fingerprint, probe: openaiResult }))

  const geminiResult = await probeGeminiCompatibleModels({
    urls: normalized.candidates,
    apiKey: request.apiKey,
  })
  if (geminiResult.ok) return withMediaContractDrafts(mapProbeResultToDetection({ normalized, fingerprint, probe: geminiResult }))

  const officialResult = await probeOfficialCreativeEngine({
    fingerprint,
    normalizedBaseUrl: normalized.primaryUrl,
    apiKey: request.apiKey,
  })
  if (officialResult.ok) return withMediaContractDrafts(mapProbeResultToDetection({ normalized, fingerprint, probe: officialResult }))

  const probeLogs = toInspectorProbeLogs({
    normalizedWarnings: normalized.warnings,
    openaiWarnings: openaiResult.warnings,
    geminiWarnings: geminiResult.warnings,
    officialWarnings: officialResult.warnings,
  })
  const inspected = await inspectWithFallback({
    ...request,
    probeLogs,
    responseSamples: [],
  })
  if (inspected.result) {
    return withMediaContractDrafts({
      ...inspected.result,
      warnings: mergeWarnings(probeLogs, inspected.result.warnings),
      risks: inspected.result.risks || [],
      requiresManualModelEntry: inspected.result.protocolType === 'manual-template',
    })
  }
  const finalWarnings = inspected.unavailable
    ? mergeWarnings(probeLogs, ['INSPECTOR_UNAVAILABLE'])
    : probeLogs

  return {
    source: fingerprint.source,
    recommendedProviderKey: fingerprint.providerKey,
    protocolType: fingerprint.protocolType,
    normalizedBaseUrl: normalized.primaryUrl,
    confidence: 'low',
    models: [],
    warnings: finalWarnings,
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
