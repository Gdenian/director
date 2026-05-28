export type StylePromptFields = {
  promptZh: string
  promptEn: string
}

export type StylePromptApplyResult = StylePromptFields & {
  applied: boolean
}

export type StylePromptGenerationErrorMessages = {
  fallback: string
  missingConfig: string
  invalidOutput: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readErrorPayload(error: unknown): Record<string, unknown> | null {
  const record = asRecord(error)
  return asRecord(record?.payload)
}

function readErrorCode(error: unknown): string {
  const payload = readErrorPayload(error)
  const payloadError = asRecord(payload?.error)
  const record = asRecord(error)
  return (
    readString(payloadError?.code) ||
    readString(payload?.errorCode) ||
    readString(payload?.code) ||
    readString(record?.code)
  )
}

function collectErrorMessages(error: unknown): string[] {
  const payload = readErrorPayload(error)
  const payloadError = asRecord(payload?.error)
  const record = asRecord(error)
  return [
    error instanceof Error ? error.message : '',
    readString(record?.message),
    readString(payloadError?.message),
    readString(payload?.errorMessage),
    readString(payload?.message),
  ].filter(Boolean)
}

function includesCjk(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value)
}

export function normalizeGeneratedStylePrompts(value: unknown): StylePromptFields {
  if (!value || typeof value !== 'object') {
    throw new Error('Generated style prompts must include promptZh and promptEn')
  }

  const record = value as { promptZh?: unknown; promptEn?: unknown }
  const promptZh = typeof record.promptZh === 'string' ? record.promptZh.trim() : ''
  const promptEn = typeof record.promptEn === 'string' ? record.promptEn.trim() : ''
  if (!promptZh || !promptEn) {
    throw new Error('Generated style prompts must include promptZh and promptEn')
  }

  return { promptZh, promptEn }
}

export function resolveStylePromptGenerationError(
  error: unknown,
  messages: StylePromptGenerationErrorMessages,
): string {
  const code = readErrorCode(error).toUpperCase()
  const rawMessages = collectErrorMessages(error)
  const joinedMessage = rawMessages.join('\n')

  if (
    code === 'MISSING_CONFIG' ||
    code === 'MODEL_NOT_CONFIGURED' ||
    /ANALYSIS_MODEL_NOT_CONFIGURED|MODEL_NOT_CONFIGURED|MISSING_CONFIG|Missing required configuration/i.test(joinedMessage)
  ) {
    return messages.missingConfig
  }

  if (/Style prompt JSON must include|Generated style prompts must include|promptZh and promptEn/i.test(joinedMessage)) {
    return messages.invalidOutput
  }

  const localizedMessage = rawMessages.find(includesCjk)
  return localizedMessage || messages.fallback
}

export function hasExistingStylePrompts(current: StylePromptFields): boolean {
  return current.promptZh.trim().length > 0 || current.promptEn.trim().length > 0
}

export function applyGeneratedStylePrompts(params: {
  current: StylePromptFields
  generated: StylePromptFields
  confirmOverwrite: () => boolean
}): StylePromptApplyResult {
  if (hasExistingStylePrompts(params.current) && !params.confirmOverwrite()) {
    return {
      ...params.current,
      applied: false,
    }
  }

  return {
    ...params.generated,
    applied: true,
  }
}
