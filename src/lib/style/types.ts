import type { Prisma } from '@prisma/client'

export type StyleLocale = 'zh' | 'en'

export type StyleResolutionSource =
  | 'task-snapshot'
  | 'style-asset'
  | 'project-art-style-prompt'
  | 'project-art-style'
  | 'user-preference'
  | 'default'

export type StyleFallbackReason =
  | 'none'
  | 'style-asset-missing-or-inaccessible'
  | 'legacy-key-missing'
  | 'empty-style'

export type LegacySystemStyle = {
  id: string
  source: 'system'
  legacyKey: string
  name: string
  label: string
  positivePrompt: string
  negativePrompt: null
  readOnly: true
}

export type ResolvedStyleContext = {
  source: StyleResolutionSource
  fallbackReason: StyleFallbackReason
  styleAssetId: string | null
  legacyKey: string | null
  label: string
  positivePrompt: string
  negativePrompt: string | null
  sourceUpdatedAt: string | null
}

export type StylePromptSnapshot = {
  version: 1
  source: StyleResolutionSource
  fallbackReason: StyleFallbackReason
  styleAssetId: string | null
  legacyKey: string | null
  label: string
  positivePrompt: string
  negativePrompt: string | null
  sourceUpdatedAt: string | null
  capturedAt: string
}

export type StylePrismaClient = {
  novelPromotionProject: {
    findFirst: (args: Prisma.NovelPromotionProjectFindFirstArgs) => Promise<{
      styleAssetId: string | null
      artStylePrompt: string | null
      artStyle: string | null
    } | null>
  }
  globalStyle: {
    findFirst: (args: Prisma.GlobalStyleFindFirstArgs) => Promise<{
      id: string
      name: string
      positivePrompt: string
      negativePrompt: string | null
      legacyKey: string | null
      source: string
      updatedAt: Date | string
    } | null>
  }
  userPreference: {
    findUnique: (args: Prisma.UserPreferenceFindUniqueArgs) => Promise<{
      artStyle: string | null
    } | null>
  }
}

export type ResolveStyleContextInput = {
  userId: string
  projectId?: string | null
  locale?: StyleLocale
  taskSnapshot?: unknown
  prismaClient?: StylePrismaClient
}
