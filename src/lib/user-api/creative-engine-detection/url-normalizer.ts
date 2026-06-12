import type { NormalizedCreativeEngineUrl } from './types'

const KNOWN_HOME_API_URLS: Record<string, string> = {
  'openrouter.ai': 'https://openrouter.ai/api/v1',
  'api.openai.com': 'https://api.openai.com/v1',
  'aistudio.google.com': 'https://generativelanguage.googleapis.com/v1beta',
  'dashscope.aliyuncs.com': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  'api.siliconflow.cn': 'https://api.siliconflow.cn/v1',
  'api.minimaxi.com': 'https://api.minimaxi.com/v1',
}

const ROLLBACK_SUFFIXES = [
  '/chat/completions',
  '/images/generations',
  '/responses',
  '/videos',
  '/models',
]

function removeTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

function addUnique(list: string[], value: string) {
  if (!list.includes(value)) list.push(value)
}

function rollbackEndpoint(url: URL) {
  let pathname = removeTrailingSlashes(url.pathname)
  for (const suffix of ROLLBACK_SUFFIXES) {
    if (pathname.toLowerCase().endsWith(suffix)) {
      pathname = pathname.slice(0, -suffix.length) || '/'
      break
    }
  }
  url.pathname = pathname
  url.search = ''
  url.hash = ''
}

function shouldAddV1Candidate(url: URL) {
  const pathSegments = url.pathname.split('/').filter(Boolean)
  return !pathSegments.some((segment) => segment === 'v1' || segment === 'v1beta')
}

function isKnownDocumentationPath(pathname: string): boolean {
  const firstSegment = pathname.split('/').filter(Boolean)[0]?.toLowerCase()
  return firstSegment === 'docs' || firstSegment === 'documentation' || firstSegment === 'guide'
}

export function normalizeCreativeEngineUrl(input: string): NormalizedCreativeEngineUrl {
  const raw = removeTrailingSlashes(input.trim())
  const warnings: string[] = []

  try {
    const parsed = new URL(raw)
    const knownUrl = KNOWN_HOME_API_URLS[parsed.hostname.toLowerCase()]
    if (knownUrl && parsed.pathname === '/') {
      return {
        primaryUrl: knownUrl,
        candidates: [knownUrl],
        warnings,
      }
    }
    if (knownUrl && isKnownDocumentationPath(parsed.pathname)) {
      return {
        primaryUrl: knownUrl,
        candidates: [knownUrl],
        warnings: ['DOCUMENTATION_URL_INFERRED'],
      }
    }

    rollbackEndpoint(parsed)
    const primaryUrl = removeTrailingSlashes(parsed.toString())
    const candidates = [primaryUrl]

    if (shouldAddV1Candidate(parsed)) {
      const withV1 = new URL(primaryUrl)
      withV1.pathname = `${removeTrailingSlashes(withV1.pathname)}/v1`
      addUnique(candidates, removeTrailingSlashes(withV1.toString()))
    }

    return { primaryUrl, candidates, warnings }
  } catch {
    warnings.push('SERVICE_URL_INVALID')
    return { primaryUrl: raw, candidates: [raw], warnings }
  }
}
