export type StylePromptFields = {
  promptZh: string
  promptEn: string
}

export type StylePromptApplyResult = StylePromptFields & {
  applied: boolean
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
