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

function maskSecrets(value: unknown) {
  if (typeof value !== 'string') return value
  return SECRET_PATTERNS.reduce((masked, pattern) => masked.replace(pattern, 'redacted'), value)
}

export function redactTaskForAdmin<T extends Record<string, unknown>>(task: T) {
  const {
    payload,
    result,
    dedupeKey: _dedupeKey,
    billingInfo,
    errorMessage,
    lastEnqueueError,
    ...rest
  } = task

  return {
    ...rest,
    errorMessage: maskSecrets(errorMessage),
    lastEnqueueError: maskSecrets(lastEnqueueError),
    billingModel: extractBillingModel(billingInfo),
    hasPayload: payload != null,
    hasResult: result != null,
  }
}
