import { resolveStyleContext } from './resolve-style-context'
import { createStylePromptSnapshot } from './snapshot'
import type { ResolvedStyleContext, StyleLocale, StylePromptSnapshot } from './types'

export type ProjectStyleTaskPayload = {
  styleContext: ResolvedStyleContext
  stylePromptSnapshot: StylePromptSnapshot
  legacyArtStyle: string | null
}

export async function buildProjectStyleTaskPayload(input: {
  projectId: string
  userId: string
  locale?: StyleLocale
}): Promise<ProjectStyleTaskPayload> {
  const styleContext = await resolveStyleContext({
    projectId: input.projectId,
    userId: input.userId,
    locale: input.locale,
  })

  return {
    styleContext,
    stylePromptSnapshot: createStylePromptSnapshot(styleContext),
    legacyArtStyle: styleContext.legacyKey,
  }
}
