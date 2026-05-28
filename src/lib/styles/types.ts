import type { Locale } from '@/i18n/routing'

export type StyleSnapshot = {
  styleAssetId: string | null
  name: string
  promptZh: string
  promptEn: string | null
  snapshotUpdatedAt: string
}

export type StyleLocale = Extract<Locale, 'zh' | 'en'>
