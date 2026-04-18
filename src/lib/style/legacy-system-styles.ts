import { ART_STYLES, getArtStylePrompt } from '@/lib/constants'
import type { LegacySystemStyle, StyleLocale } from './types'

export function listLegacySystemStyles(locale: StyleLocale = 'zh'): LegacySystemStyle[] {
  return ART_STYLES.map((style) => ({
    id: `system:${style.value}`,
    source: 'system',
    legacyKey: style.value,
    name: style.label,
    label: style.label,
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
