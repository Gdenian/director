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

function hasDocumentation(request: CreativeEngineDetectRequest) {
  return typeof request.documentationText === 'string' && request.documentationText.trim().length > 0
}

function successfulProbeLogs(result: CreativeEngineDetectionResult) {
  return mergeWarnings(result.warnings, ['MODEL_LIST_READABLE'])
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

function finalizeInspectorResult(
  result: CreativeEngineDetectionResult,
  probeLogs: string[],
  documentationText?: string,
): CreativeEngineDetectionResult {
  return withMediaContractDrafts({
    ...result,
    warnings: mergeWarnings(probeLogs, result.warnings),
    risks: result.risks || [],
    requiresManualModelEntry: result.protocolType === 'manual-template' || result.models.length === 0,
  }, documentationText)
}

function mergeInspectorModelsIntoProbeResult(
  probeDetection: CreativeEngineDetectionResult,
  inspectedResult: CreativeEngineDetectionResult,
  probeLogs: string[],
  documentationText?: string,
): CreativeEngineDetectionResult {
  const inspectedByCallName = new Map(
    withMediaContractDrafts(inspectedResult, documentationText).models
      .map((model) => [model.callName.trim().toLowerCase(), model] as const),
  )

  const mergedModels = probeDetection.models.map((model): DetectedModelDraft => {
    const inspected = inspectedByCallName.get(model.callName.trim().toLowerCase())
    if (!inspected) return model

    return {
      ...model,
      ...(inspected.mediaContract ? { mediaContract: inspected.mediaContract } : {}),
      ...(inspected.mediaContractSource ? { mediaContractSource: inspected.mediaContractSource } : {}),
      ...(inspected.compatMediaTemplate ? { compatMediaTemplate: inspected.compatMediaTemplate } : {}),
      ...(inspected.compatMediaTemplateSource ? { compatMediaTemplateSource: inspected.compatMediaTemplateSource } : {}),
    }
  })

  return {
    ...probeDetection,
    source: inspectedResult.source,
    recommendedProviderKey: inspectedResult.recommendedProviderKey,
    protocolType: inspectedResult.protocolType,
    normalizedBaseUrl: inspectedResult.normalizedBaseUrl,
    confidence: inspectedResult.confidence,
    models: mergedModels,
    warnings: mergeWarnings(probeLogs, inspectedResult.warnings),
    risks: inspectedResult.risks || probeDetection.risks || [],
    requiresManualModelEntry: mergedModels.length === 0,
  }
}

function withMediaContractDrafts(
  result: CreativeEngineDetectionResult,
  documentationText?: string,
): CreativeEngineDetectionResult {
  return {
    ...result,
    models: result.models.map((model): DetectedModelDraft => {
      const {
        mediaContract: _mediaContract,
        mediaContractSource: _mediaContractSource,
        compatMediaTemplate: _compatMediaTemplate,
        compatMediaTemplateSource: _compatMediaTemplateSource,
        ...baseModel
      } = model
      void _mediaContract
      void _mediaContractSource
      void _compatMediaTemplate
      void _compatMediaTemplateSource
      const draft = buildMediaContractDraftForDetectedModel({
        protocolType: result.protocolType,
        model,
        documentationText,
      })
      return {
        ...baseModel,
        ...(draft.compatMediaTemplate ? { compatMediaTemplate: draft.compatMediaTemplate } : {}),
        ...(draft.compatMediaTemplateSource ? { compatMediaTemplateSource: draft.compatMediaTemplateSource } : {}),
        ...(draft.mediaContract ? { mediaContract: draft.mediaContract } : {}),
        ...(draft.mediaContractSource ? { mediaContractSource: draft.mediaContractSource } : {}),
      }
    }),
  }
}

export async function detectCreativeEngine(request: CreativeEngineDetectRequest): Promise<CreativeEngineDetectionResult> {
  const normalized = normalizeCreativeEngineUrl(request.serviceUrl)
  const fingerprint = fingerprintCreativeEngineSource({ url: normalized.primaryUrl })
  const shouldInspectDocs = hasDocumentation(request)

  const openaiResult = await probeOpenAICompatibleModels({
    urls: normalized.candidates,
    apiKey: request.apiKey,
  })
  if (openaiResult.ok) {
    const probeDetection = withMediaContractDrafts(
      mapProbeResultToDetection({ normalized, fingerprint, probe: openaiResult }),
      request.documentationText,
    )
    if (shouldInspectDocs) {
      const probeLogs = successfulProbeLogs(probeDetection)
      const inspected = await inspectWithFallback({
        ...request,
        probeLogs,
        responseSamples: [],
      })
      if (inspected.result) {
        return mergeInspectorModelsIntoProbeResult(probeDetection, inspected.result, probeLogs, request.documentationText)
      }
    }
    return probeDetection
  }

  const geminiResult = await probeGeminiCompatibleModels({
    urls: normalized.candidates,
    apiKey: request.apiKey,
  })
  if (geminiResult.ok) {
    const probeDetection = withMediaContractDrafts(
      mapProbeResultToDetection({ normalized, fingerprint, probe: geminiResult }),
      request.documentationText,
    )
    if (shouldInspectDocs) {
      const probeLogs = successfulProbeLogs(probeDetection)
      const inspected = await inspectWithFallback({
        ...request,
        probeLogs,
        responseSamples: [],
      })
      if (inspected.result) {
        return mergeInspectorModelsIntoProbeResult(probeDetection, inspected.result, probeLogs, request.documentationText)
      }
    }
    return probeDetection
  }

  const officialResult = await probeOfficialCreativeEngine({
    fingerprint,
    normalizedBaseUrl: normalized.primaryUrl,
    apiKey: request.apiKey,
  })
  if (officialResult.ok) {
    const probeDetection = withMediaContractDrafts(
      mapProbeResultToDetection({ normalized, fingerprint, probe: officialResult }),
      request.documentationText,
    )
    if (shouldInspectDocs) {
      const probeLogs = successfulProbeLogs(probeDetection)
      const inspected = await inspectWithFallback({
        ...request,
        probeLogs,
        responseSamples: [],
      })
      if (inspected.result) {
        return mergeInspectorModelsIntoProbeResult(probeDetection, inspected.result, probeLogs, request.documentationText)
      }
    }
    return probeDetection
  }

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
    return finalizeInspectorResult(inspected.result, probeLogs, request.documentationText)
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
