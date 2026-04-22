import { isArtStyleValue } from '@/lib/constants'
import { ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { createStylePromptSnapshot } from './snapshot'
import { getLegacySystemStyle, getLegacySystemStyleById } from './legacy-system-styles'
import type { ResolvedStyleContext, StyleLocale, StylePromptSnapshot } from './types'

function normalizeLocale(locale: StyleLocale | undefined): StyleLocale {
  return locale === 'en' ? 'en' : 'zh'
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function invalidStyleAssetIdError(): ApiError {
  return new ApiError('INVALID_PARAMS', {
    code: 'INVALID_STYLE_ASSET_ID',
    field: 'styleAssetId',
    message: 'styleAssetId must reference a readable style asset',
  })
}

function invalidArtStyleError(): ApiError {
  return new ApiError('INVALID_PARAMS', {
    code: 'INVALID_ART_STYLE',
    field: 'artStyle',
    message: 'artStyle must be a supported value',
  })
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

export async function resolveSelectedStyleContext(input: {
  userId: string
  styleAssetId?: unknown
  legacyArtStyle?: unknown
  locale?: StyleLocale
}): Promise<ResolvedStyleContext | null> {
  const locale = normalizeLocale(input.locale)
  const styleAssetId = normalizeString(input.styleAssetId)
  const legacyArtStyle = normalizeString(input.legacyArtStyle)

  if (styleAssetId) {
    const systemStyle = getLegacySystemStyleById(styleAssetId, locale)
    if (systemStyle) {
      return {
        source: 'style-asset',
        fallbackReason: 'none',
        styleAssetId: systemStyle.id,
        legacyKey: systemStyle.legacyKey,
        label: systemStyle.label,
        positivePrompt: systemStyle.positivePrompt,
        negativePrompt: systemStyle.negativePrompt,
        sourceUpdatedAt: null,
      }
    }

    const styleAsset = await prisma.globalStyle.findFirst({
      where: {
        id: styleAssetId,
        OR: [
          { source: 'system' },
          { userId: input.userId },
        ],
      },
      select: {
        id: true,
        name: true,
        positivePrompt: true,
        negativePrompt: true,
        legacyKey: true,
        updatedAt: true,
      },
    })

    if (!styleAsset) {
      throw invalidStyleAssetIdError()
    }

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

  if (!legacyArtStyle) {
    return null
  }

  if (!isArtStyleValue(legacyArtStyle)) {
    throw invalidArtStyleError()
  }

  const systemStyle = getLegacySystemStyle(legacyArtStyle, locale)
  if (!systemStyle) {
    throw invalidArtStyleError()
  }

  return {
    source: 'style-asset',
    fallbackReason: 'none',
    styleAssetId: systemStyle.id,
    legacyKey: systemStyle.legacyKey,
    label: systemStyle.label,
    positivePrompt: systemStyle.positivePrompt,
    negativePrompt: systemStyle.negativePrompt,
    sourceUpdatedAt: null,
  }
}

export async function buildSelectedStyleTaskPayload(input: {
  userId: string
  styleAssetId?: unknown
  legacyArtStyle?: unknown
  locale?: StyleLocale
}): Promise<{
  styleContext: ResolvedStyleContext
  stylePromptSnapshot: StylePromptSnapshot
  legacyArtStyle: string | null
  styleAssetId: string | null
} | null> {
  const styleContext = await resolveSelectedStyleContext(input)
  if (!styleContext) {
    return null
  }

  return {
    styleContext,
    stylePromptSnapshot: createStylePromptSnapshot(styleContext),
    legacyArtStyle: styleContext.legacyKey,
    styleAssetId: styleContext.styleAssetId,
  }
}
