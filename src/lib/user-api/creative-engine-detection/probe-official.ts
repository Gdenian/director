import { modelIdToDraft } from './model-classifier'
import type { CreativeEngineFingerprint, DetectionFailureCategory, ProbeResult } from './types'

type ProbeOfficialParams = {
  fingerprint: CreativeEngineFingerprint
  normalizedBaseUrl: string
  apiKey: string
}

const OFFICIAL_PROBE_TIMEOUT_MS = 15_000

type OfficialProbeConfig = {
  url: string
  headers: (apiKey: string) => Record<string, string>
  parseModels: (payload: unknown) => string[]
}

function failureFromStatus(status: number): DetectionFailureCategory {
  if (status === 401 || status === 403) return 'key-invalid'
  if (status === 429) return 'rate-limited'
  if (status === 402) return 'balance-insufficient'
  if (status === 404 || status === 405) return 'interface-unsupported'
  return 'provider-error'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseOpenAIStyleModels(payload: unknown): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return []
  return payload.data.flatMap((item) => {
    if (!isRecord(item)) return []
    return typeof item.id === 'string' ? [item.id] : []
  })
}

function parseFalModels(payload: unknown): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.models)) return []
  return payload.models.flatMap((item) => {
    if (!isRecord(item)) return []
    return typeof item.endpoint_id === 'string' ? [item.endpoint_id] : []
  })
}

const OFFICIAL_FREE_PROBES: Record<string, OfficialProbeConfig> = {
  fal: {
    url: 'https://api.fal.ai/v1/models?limit=1',
    headers: (apiKey) => ({ Authorization: `Key ${apiKey}` }),
    parseModels: parseFalModels,
  },
  vidu: {
    url: 'https://api.vidu.cn/ent/v2/credits',
    headers: (apiKey) => ({ Authorization: `Token ${apiKey}` }),
    parseModels: () => [],
  },
  bailian: {
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    parseModels: parseOpenAIStyleModels,
  },
  siliconflow: {
    url: 'https://api.siliconflow.cn/v1/models',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    parseModels: parseOpenAIStyleModels,
  },
}

export async function probeOfficialCreativeEngine(params: ProbeOfficialParams): Promise<ProbeResult> {
  const config = OFFICIAL_FREE_PROBES[params.fingerprint.providerKey]
  if (!config) {
    return {
      ok: false,
      source: params.fingerprint.source,
      providerKey: params.fingerprint.providerKey,
      protocolType: params.fingerprint.protocolType,
      confidence: params.fingerprint.confidence,
      models: [],
      warnings: ['OFFICIAL_FREE_PROBE_UNAVAILABLE'],
      failureCategory: 'interface-unsupported',
    }
  }

  try {
    const response = await fetch(config.url, {
      method: 'GET',
      headers: config.headers(params.apiKey),
      signal: AbortSignal.timeout(OFFICIAL_PROBE_TIMEOUT_MS),
    })

    if (!response.ok) {
      return {
        ok: false,
        source: params.fingerprint.source,
        providerKey: params.fingerprint.providerKey,
        protocolType: params.fingerprint.protocolType,
        confidence: params.fingerprint.confidence,
        models: [],
        warnings: [],
        failureCategory: failureFromStatus(response.status),
      }
    }

    const payload = await response.json().catch(() => null)
    const models = config.parseModels(payload).map(modelIdToDraft)
    return {
      ok: true,
      source: params.fingerprint.source,
      providerKey: params.fingerprint.providerKey,
      protocolType: params.fingerprint.protocolType,
      confidence: params.fingerprint.confidence,
      normalizedBaseUrl: params.normalizedBaseUrl,
      models,
      warnings: models.length === 0 ? ['MODEL_LIST_UNSUPPORTED'] : [],
    }
  } catch {
    return {
      ok: false,
      source: params.fingerprint.source,
      providerKey: params.fingerprint.providerKey,
      protocolType: params.fingerprint.protocolType,
      confidence: params.fingerprint.confidence,
      models: [],
      warnings: [],
      failureCategory: 'service-unreachable',
    }
  }
}
