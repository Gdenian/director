import { getArtStylePrompt, isArtStyleValue } from '@/lib/constants'
import { resolveStyleContext } from '@/lib/style/resolve-style-context'
import { normalizeStylePromptSnapshot } from '@/lib/style/snapshot'
import type { StyleLocale } from '@/lib/style/types'

export type WorkerStyleResolution = {
  positivePrompt: string
  negativePrompt: string | null
  source: 'snapshot' | 'live' | 'legacy' | 'empty'
}

export async function resolveWorkerStyleText(input: {
  taskSnapshot: unknown
  legacyArtStyle: unknown
  projectId: string
  userId: string
  locale: StyleLocale
}): Promise<WorkerStyleResolution> {
  const taskSnapshot = normalizeStylePromptSnapshot(input.taskSnapshot)
  if (taskSnapshot) {
    return {
      positivePrompt: taskSnapshot.positivePrompt,
      negativePrompt: taskSnapshot.negativePrompt,
      source: 'snapshot',
    }
  }

  const liveStyle = await resolveStyleContext({
    projectId: input.projectId,
    userId: input.userId,
    locale: input.locale,
  })
  if (liveStyle.positivePrompt) {
    return {
      positivePrompt: liveStyle.positivePrompt,
      negativePrompt: liveStyle.negativePrompt,
      source: 'live',
    }
  }

  const legacyArtStyle = typeof input.legacyArtStyle === 'string' ? input.legacyArtStyle.trim() : ''
  if (isArtStyleValue(legacyArtStyle)) {
    return {
      positivePrompt: getArtStylePrompt(legacyArtStyle, input.locale),
      negativePrompt: null,
      source: 'legacy',
    }
  }

  return {
    positivePrompt: '',
    negativePrompt: null,
    source: 'empty',
  }
}
