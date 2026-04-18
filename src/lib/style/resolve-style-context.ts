import { prisma } from '@/lib/prisma'
import type {
  ResolveStyleContextInput,
  ResolvedStyleContext,
  StyleFallbackReason,
  StyleLocale,
  StylePrismaClient,
  StyleResolutionSource,
} from './types'
import { getLegacySystemStyle } from './legacy-system-styles'
import { normalizeStylePromptSnapshot } from './snapshot'

const DEFAULT_LEGACY_STYLE = 'american-comic'
const EMPTY_FALLBACK_LABEL = '与参考图风格一致'

function normalizeLocale(locale: StyleLocale | undefined): StyleLocale {
  return locale === 'en' ? 'en' : 'zh'
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

function createEmptyFallback(fallbackReason: StyleFallbackReason): ResolvedStyleContext {
  return {
    source: 'default',
    fallbackReason,
    styleAssetId: null,
    legacyKey: null,
    label: EMPTY_FALLBACK_LABEL,
    positivePrompt: '',
    negativePrompt: null,
    sourceUpdatedAt: null,
  }
}

function fromLegacyStyle(
  source: StyleResolutionSource,
  legacyKey: string | null | undefined,
  locale: StyleLocale,
  fallbackReason: StyleFallbackReason,
): ResolvedStyleContext | null {
  const style = getLegacySystemStyle(legacyKey, locale)
  if (!style) return null

  return {
    source,
    fallbackReason,
    styleAssetId: null,
    legacyKey: style.legacyKey,
    label: style.label,
    positivePrompt: style.positivePrompt,
    negativePrompt: style.negativePrompt,
    sourceUpdatedAt: null,
  }
}

export async function resolveStyleContext(input: ResolveStyleContextInput): Promise<ResolvedStyleContext> {
  const locale = normalizeLocale(input.locale)
  const prismaClient = (input.prismaClient ?? prisma) as StylePrismaClient

  const taskSnapshot = normalizeStylePromptSnapshot(input.taskSnapshot)
  if (taskSnapshot) {
    return {
      source: 'task-snapshot',
      fallbackReason: taskSnapshot.fallbackReason,
      styleAssetId: taskSnapshot.styleAssetId,
      legacyKey: taskSnapshot.legacyKey,
      label: taskSnapshot.label,
      positivePrompt: taskSnapshot.positivePrompt,
      negativePrompt: taskSnapshot.negativePrompt,
      sourceUpdatedAt: taskSnapshot.sourceUpdatedAt,
    }
  }

  let fallbackReason: StyleFallbackReason = 'none'
  const project = input.projectId
    ? await prismaClient.novelPromotionProject.findFirst({
      where: {
        projectId: input.projectId,
        project: { is: { userId: input.userId } },
      },
      select: {
        styleAssetId: true,
        artStylePrompt: true,
        artStyle: true,
      },
    })
    : null

  if (project?.styleAssetId) {
    const styleAsset = await prismaClient.globalStyle.findFirst({
      where: {
        id: project.styleAssetId,
        OR: [{ userId: input.userId }, { source: 'system' }],
      },
      select: {
        id: true,
        name: true,
        positivePrompt: true,
        negativePrompt: true,
        legacyKey: true,
        source: true,
        updatedAt: true,
      },
    })

    if (styleAsset) {
      return {
        source: 'style-asset',
        fallbackReason: 'none',
        styleAssetId: styleAsset.id,
        legacyKey: styleAsset.legacyKey,
        label: styleAsset.name,
        positivePrompt: styleAsset.positivePrompt,
        negativePrompt: styleAsset.negativePrompt,
        sourceUpdatedAt: toIsoString(styleAsset.updatedAt),
      }
    }

    fallbackReason = 'style-asset-missing-or-inaccessible'
  }

  const projectPrompt = project?.artStylePrompt?.trim()
  if (projectPrompt) {
    return {
      source: 'project-art-style-prompt',
      fallbackReason,
      styleAssetId: null,
      legacyKey: null,
      label: '自定义风格',
      positivePrompt: projectPrompt,
      negativePrompt: null,
      sourceUpdatedAt: null,
    }
  }

  const projectLegacyStyle = fromLegacyStyle('project-art-style', project?.artStyle, locale, fallbackReason)
  if (projectLegacyStyle) return projectLegacyStyle

  const userPreference = await prismaClient.userPreference.findUnique({
    where: { userId: input.userId },
    select: { artStyle: true },
  })
  const userLegacyStyle = fromLegacyStyle('user-preference', userPreference?.artStyle, locale, fallbackReason)
  if (userLegacyStyle) return userLegacyStyle

  const defaultStyle = fromLegacyStyle('default', DEFAULT_LEGACY_STYLE, locale, fallbackReason)
  if (defaultStyle) return defaultStyle

  return createEmptyFallback(fallbackReason === 'none' ? 'empty-style' : fallbackReason)
}
