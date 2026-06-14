import { modelMetadataToDraft } from './model-classifier'
import { chooseFailureCategory } from './failure-category'
import type { DetectionFailureCategory, ProbeResult } from './types'

type ProbeGeminiParams = {
  urls: string[]
  apiKey: string
}

const MODEL_LIST_PROBE_TIMEOUT_MS = 15_000

function isGeminiCandidate(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'generativelanguage.googleapis.com' || parsed.pathname.includes('/v1beta')
  } catch {
    return false
  }
}

function modelsUrl(baseUrl: string, apiKey: string) {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/models`)
  url.searchParams.set('key', apiKey)
  return url.toString()
}

function parseModels(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== 'object') return []
  const record = payload as Record<string, unknown>
  if (!Array.isArray(record.models)) return []
  return record.models.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const model = item as Record<string, unknown>
    return typeof model.name === 'string' ? [model] : []
  })
}

function failureFromStatus(status: number): { category: DetectionFailureCategory; warning?: string } {
  if (status === 401 || status === 403) return { category: 'key-invalid' }
  if (status === 429) return { category: 'rate-limited' }
  if (status === 402) return { category: 'balance-insufficient' }
  if (status === 404 || status === 405) return { category: 'interface-unsupported', warning: 'MODEL_LIST_UNSUPPORTED' }
  return { category: 'provider-error' }
}

export async function probeGeminiCompatibleModels(params: ProbeGeminiParams): Promise<ProbeResult> {
  const failures: DetectionFailureCategory[] = []
  const warnings: string[] = []
  const candidates = params.urls.filter(isGeminiCandidate)

  for (const url of candidates) {
    try {
      const response = await fetch(modelsUrl(url, params.apiKey), {
        method: 'GET',
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
        protocolType: 'gemini-compatible',
        confidence: 'high',
        normalizedBaseUrl: url,
        models: parsedModels.flatMap((model) => {
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
    protocolType: 'gemini-compatible',
    confidence: 'low',
    models: [],
    warnings,
    failureCategory: candidates.length > 0 ? chooseFailureCategory(failures) : undefined,
  }
}
