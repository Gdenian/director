import { prisma } from '@/lib/prisma'
import { getLegacySystemStyle } from './legacy-system-styles'
import type { StyleLocale } from './types'

type GlobalStyleSelectionRecord = {
  id: string
  name: string
  positivePrompt: string
  negativePrompt: string | null
  legacyKey: string | null
}

export type ResolvedGlobalStyleSelection = {
  styleAssetId: string
  legacyKey: string | null
  label: string
  positivePrompt: string
  negativePrompt: string | null
}

function normalizeLocale(locale: StyleLocale | undefined): StyleLocale {
  return locale === 'en' ? 'en' : 'zh'
}

export function normalizeStyleAssetId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readLegacySystemStyle(
  styleAssetId: string,
  locale: StyleLocale,
): ResolvedGlobalStyleSelection | null {
  if (!styleAssetId.startsWith('system:')) return null
  const legacyKey = styleAssetId.slice('system:'.length).trim()
  const style = getLegacySystemStyle(legacyKey, locale)
  if (!style) return null
  return {
    styleAssetId,
    legacyKey: style.legacyKey,
    label: style.label,
    positivePrompt: style.positivePrompt,
    negativePrompt: style.negativePrompt,
  }
}

function mapDbStyle(style: GlobalStyleSelectionRecord): ResolvedGlobalStyleSelection {
  return {
    styleAssetId: style.id,
    legacyKey: style.legacyKey,
    label: style.name,
    positivePrompt: style.positivePrompt,
    negativePrompt: style.negativePrompt,
  }
}

export async function resolveReadableGlobalStyleSelection(input: {
  userId: string
  styleAssetId: string
  locale?: StyleLocale
}): Promise<ResolvedGlobalStyleSelection | null> {
  const locale = normalizeLocale(input.locale)
  const systemStyle = readLegacySystemStyle(input.styleAssetId, locale)
  if (systemStyle) {
    return systemStyle
  }

  const style = await prisma.globalStyle.findFirst({
    where: {
      id: input.styleAssetId,
      OR: [{ userId: input.userId }, { source: 'system' }],
    },
    select: {
      id: true,
      name: true,
      positivePrompt: true,
      negativePrompt: true,
      legacyKey: true,
    },
  })

  return style ? mapDbStyle(style) : null
}
