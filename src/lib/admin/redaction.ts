const SECRET_PATTERNS = [
  /\bapi[_-]?key\b\s*(?::|=)?\s*['"]?[^'"\s,;]+/gi,
  /\bbearer\s+[^'"\s,;]+/gi,
]

export function extractBillingModel(billingInfo: unknown): string | null {
  if (!billingInfo || typeof billingInfo !== 'object' || Array.isArray(billingInfo)) return null
  const model = (billingInfo as { model?: unknown }).model
  if (typeof model === 'string') return model
  const modelKey = (billingInfo as { modelKey?: unknown }).modelKey
  return typeof modelKey === 'string' ? modelKey : null
}

type RedactedTask<T extends Record<string, unknown>> =
  Omit<T, 'payload' | 'result' | 'dedupeKey' | 'billingInfo' | 'errorMessage' | 'lastEnqueueError'> & {
    errorMessage: unknown
    lastEnqueueError: unknown
    billingModel: string | null
    hasPayload: boolean
    hasResult: boolean
  }

function maskSecrets(value: unknown) {
  if (typeof value !== 'string') return value
  return SECRET_PATTERNS.reduce((masked, pattern) => masked.replace(pattern, 'redacted'), value)
}

export function redactTaskForAdmin<T extends Record<string, unknown>>(task: T): RedactedTask<T> {
  const rest: Record<string, unknown> = { ...task }
  const payload = rest.payload
  const result = rest.result
  const billingInfo = rest.billingInfo
  const errorMessage = rest.errorMessage
  const lastEnqueueError = rest.lastEnqueueError
  delete rest.payload
  delete rest.result
  delete rest.dedupeKey
  delete rest.billingInfo
  delete rest.errorMessage
  delete rest.lastEnqueueError

  return {
    ...(rest as Omit<T, 'payload' | 'result' | 'dedupeKey' | 'billingInfo' | 'errorMessage' | 'lastEnqueueError'>),
    errorMessage: maskSecrets(errorMessage),
    lastEnqueueError: maskSecrets(lastEnqueueError),
    billingModel: extractBillingModel(billingInfo),
    hasPayload: payload != null,
    hasResult: result != null,
  } satisfies RedactedTask<T>
}
