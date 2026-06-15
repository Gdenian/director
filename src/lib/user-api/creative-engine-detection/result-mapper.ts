import type {
  CreativeEngineDetectionResult,
  CreativeEngineFingerprint,
  NormalizedCreativeEngineUrl,
  ProbeResult,
} from './types'

type MapProbeParams = {
  normalized: NormalizedCreativeEngineUrl
  fingerprint: CreativeEngineFingerprint
  probe: ProbeResult
}

function uniqueWarnings(...groups: string[][]) {
  return [...new Set(groups.flat())]
}

function resolveProtocolType(
  fingerprint: CreativeEngineFingerprint,
  probe: ProbeResult,
) {
  if (fingerprint.protocolType === 'official') return fingerprint.protocolType
  return probe.protocolType || fingerprint.protocolType
}

export function mapProbeResultToDetection(params: MapProbeParams): CreativeEngineDetectionResult {
  const { normalized, fingerprint, probe } = params
  return {
    source: probe.source || fingerprint.source,
    recommendedProviderKey: probe.providerKey || fingerprint.providerKey,
    protocolType: resolveProtocolType(fingerprint, probe),
    normalizedBaseUrl: probe.normalizedBaseUrl || normalized.primaryUrl,
    confidence: probe.confidence,
    models: probe.models,
    warnings: uniqueWarnings(normalized.warnings, probe.warnings),
    risks: [],
    failureCategory: probe.failureCategory,
    requiresManualModelEntry: probe.models.length === 0,
  }
}
