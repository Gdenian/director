import { ART_STYLES, getArtStylePrompt } from '@/lib/constants'
import type { LegacySystemStyle, StyleLocale } from './types'

function buildLegacySystemStyleAssetId(legacyKey: string): string {
  return `system:${legacyKey}`
}

export function listLegacySystemStyles(locale: StyleLocale = 'zh'): LegacySystemStyle[] {
  return ART_STYLES.map((style) => ({
    id: buildLegacySystemStyleAssetId(style.value),
    source: 'system',
    legacyKey: style.value,
    name: locale === 'en' ? (style.labelEn ?? style.label) : style.label,
    label: locale === 'en' ? (style.labelEn ?? style.label) : style.label,
    positivePrompt: getArtStylePrompt(style.value, locale),
    negativePrompt: null,
    readOnly: true,
  }))
}

export function getLegacySystemStyle(
  legacyKey: string | null | undefined,
  locale: StyleLocale = 'zh',
): LegacySystemStyle | null {
  if (!legacyKey) return null
  return listLegacySystemStyles(locale).find((style) => style.legacyKey === legacyKey) ?? null
}

export function isLegacySystemStyleAssetId(value: string | null | undefined): value is `system:${string}` {
  return typeof value === 'string' && value.startsWith('system:') && value.length > 'system:'.length
}

export function getLegacySystemStyleById(
  styleAssetId: string | null | undefined,
  locale: StyleLocale = 'zh',
): LegacySystemStyle | null {
  if (!isLegacySystemStyleAssetId(styleAssetId)) return null
  return getLegacySystemStyle(styleAssetId.slice('system:'.length), locale)
}
