export type MediaTestDiagnosticCode =
  | 'MEDIA_TEST_BASE_URL_ERROR'
  | 'MEDIA_TEST_INVALID_KEY'
  | 'MEDIA_TEST_MISSING_MODEL'
  | 'MEDIA_TEST_PERMISSION_OR_PLAN'
  | 'MEDIA_TEST_RATE_LIMIT'
  | 'MEDIA_TEST_BALANCE_INSUFFICIENT'
  | 'MEDIA_TEST_REQUEST_SCHEMA_MISMATCH'
  | 'MEDIA_TEST_UNSUPPORTED_INPUT_FORMAT'
  | 'MEDIA_TEST_PUBLIC_URL_UNAVAILABLE'
  | 'MEDIA_TEST_MULTIPART_FIELD_MISMATCH'
  | 'MEDIA_TEST_RESPONSE_JSON_PATH_MISMATCH'
  | 'MEDIA_TEST_ASYNC_TASK_ID_PATH_MISMATCH'
  | 'MEDIA_TEST_ASYNC_STATUS_PATH_MISMATCH'
  | 'MEDIA_TEST_ASYNC_UPSTREAM_FAILED'
  | 'MEDIA_TEST_OUTPUT_URL_MISSING'
  | 'MEDIA_TEST_OUTPUT_URL_NOT_DOWNLOADABLE'
  | 'MEDIA_TEST_PROVIDER_TIMEOUT'
  | 'MEDIA_TEST_UPSTREAM_POOL_UNAVAILABLE'

export type MediaTestDiagnostic = {
  code: MediaTestDiagnosticCode
  message: string
  debugSnippet?: string
}

type ClassificationInput = {
  status?: number
  body?: unknown
  extraction?: string
  error?: unknown
}

function toSnippet(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  const raw = typeof value === 'string' ? value : JSON.stringify(value)
  return redactMediaTestSecrets(raw).slice(0, 500)
}

export function redactMediaTestSecrets(value: string): string {
  return value
    .replace(/(["']Authorization["']\s*:\s*["']Bearer\s+)([^"']+)(["'])/gi, '$1[REDACTED]$3')
    .replace(/(["']Authorization["']\s*:\s*["'])([^"']+)(["'])/gi, '$1[REDACTED]$3')
    .replace(/(["'](?:api_key|key)["']\s*:\s*["'])([^"']+)(["'])/gi, '$1[REDACTED]$3')
    .replace(/(Authorization\s*[:=]\s*Bearer\s+)[^\s"',}]+/gi, '$1[REDACTED]')
    .replace(/(Authorization\s*[:=]\s*)[^\s"',}]+/gi, '$1[REDACTED]')
    .replace(/(["']?(?:api_key|key)["']?\s*[:=]\s*["']?)([^"',}\s]+)/gi, '$1[REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-[REDACTED]')
}

export function classifyMediaTestError(input: ClassificationInput): MediaTestDiagnostic {
  const body = typeof input.body === 'string' ? input.body : input.body ? JSON.stringify(input.body) : ''
  const normalized = body.toLowerCase()
  let code: MediaTestDiagnosticCode = 'MEDIA_TEST_UPSTREAM_POOL_UNAVAILABLE'

  if (input.extraction === 'output-url-missing') {
    code = 'MEDIA_TEST_RESPONSE_JSON_PATH_MISMATCH'
  } else if (input.extraction === 'task-id-missing') {
    code = 'MEDIA_TEST_ASYNC_TASK_ID_PATH_MISMATCH'
  } else if (input.extraction === 'status-missing') {
    code = 'MEDIA_TEST_ASYNC_STATUS_PATH_MISMATCH'
  } else if (input.status === 401) {
    code = 'MEDIA_TEST_INVALID_KEY'
  } else if (input.status === 403) {
    code = normalized.includes('balance') || normalized.includes('quota')
      ? 'MEDIA_TEST_PERMISSION_OR_PLAN'
      : 'MEDIA_TEST_PERMISSION_OR_PLAN'
  } else if (input.status === 429) {
    code = 'MEDIA_TEST_RATE_LIMIT'
  } else if (input.status === 400 || input.status === 404 || input.status === 405 || input.status === 415 || input.status === 422) {
    code = 'MEDIA_TEST_REQUEST_SCHEMA_MISMATCH'
  } else if (input.status && input.status >= 500) {
    code = 'MEDIA_TEST_UPSTREAM_POOL_UNAVAILABLE'
  } else if (normalized.includes('timeout') || normalized.includes('timed out')) {
    code = 'MEDIA_TEST_PROVIDER_TIMEOUT'
  } else if (normalized.includes('balance') || normalized.includes('insufficient')) {
    code = 'MEDIA_TEST_BALANCE_INSUFFICIENT'
  } else if (normalized.includes('model')) {
    code = 'MEDIA_TEST_MISSING_MODEL'
  }

  return {
    code,
    message: body ? `Media test failed: ${redactMediaTestSecrets(body).slice(0, 200)}` : 'Media test failed',
    ...(toSnippet(input.body ?? input.error) ? { debugSnippet: toSnippet(input.body ?? input.error) } : {}),
  }
}
