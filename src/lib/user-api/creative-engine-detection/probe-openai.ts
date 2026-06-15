import { modelIdToDraft, modelMetadataToDraft } from './model-classifier'
import { chooseFailureCategory } from './failure-category'
import type { DetectionFailureCategory, ProbeResult } from './types'

type ProbeOpenAIParams = {
  urls: string[]
  apiKey: string
}

const MODEL_LIST_PROBE_TIMEOUT_MS = 15_000

function modelListUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, '')}/models`
}

function isOpenAICompatibleCandidate(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.hostname !== 'generativelanguage.googleapis.com' && !parsed.pathname.includes('/v1beta')
  } catch {
    return false
  }
}

function parseModels(payload: unknown): Array<string | Record<string, unknown>> {
  if (!payload || typeof payload !== 'object') return []
  const record = payload as Record<string, unknown>
  const rawList = Array.isArray(record.data) ? record.data : Array.isArray(record.models) ? record.models : []
  const models: Array<string | Record<string, unknown>> = []
  for (const item of rawList) {
    if (typeof item === 'string') {
      models.push(item)
      continue
    }
    if (!item || typeof item !== 'object') continue
    const model = item as Record<string, unknown>
    if (typeof model.id === 'string' || typeof model.name === 'string') {
      models.push(model)
    }
  }
  return models
}

function failureFromStatus(status: number): { category: DetectionFailureCategory; warning?: string } {
  if (status === 401 || status === 403) return { category: 'key-invalid' }
  if (status === 429) return { category: 'rate-limited' }
  if (status === 402) return { category: 'balance-insufficient' }
  if (status === 404 || status === 405) return { category: 'interface-unsupported', warning: 'MODEL_LIST_UNSUPPORTED' }
  return { category: 'provider-error' }
}

export async function probeOpenAICompatibleModels(params: ProbeOpenAIParams): Promise<ProbeResult> {
  const failures: DetectionFailureCategory[] = []
  const warnings: string[] = []
  const candidates = params.urls.filter(isOpenAICompatibleCandidate)

  for (const url of candidates) {
    try {
      const response = await fetch(modelListUrl(url), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
        },
        signal: AbortSignal.timeout(MODEL_LIST_PROBE_TIMEOUT_MS),
      })

      if (!response.ok) {
        const failure = failureFromStatus(response.status)
        failures.push(failure.category)
        if (failure.warning && !warnings.includes(failure.warning)) warnings.push(failure.warning)
        continue
      }

      const payload = await response.json().catch(() => null)
      const parsedModels = parseModels(payload)
      if (parsedModels.length === 0) {
        failures.push('interface-unsupported')
        continue
      }

      return {
        ok: true,
        protocolType: 'openai-compatible',
        confidence: 'high',
        normalizedBaseUrl: url,
        models: parsedModels.flatMap((model) => {
          if (typeof model === 'string') return [modelIdToDraft(model)]
          const draft = modelMetadataToDraft(model)
          return draft ? [draft] : []
        }),
        warnings,
      }
    } catch {
      failures.push('service-unreachable')
    }
  }

  return {
    ok: false,
    protocolType: 'openai-compatible',
    confidence: 'low',
    models: [],
    warnings,
    failureCategory: candidates.length > 0 ? (chooseFailureCategory(failures) || 'service-unreachable') : undefined,
  }
}
