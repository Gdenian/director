import type { StyleLocale, StyleSnapshot } from './types'
import { resolveStylePrompt } from './service'

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function readStyleSnapshot(value: unknown): StyleSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const styleAssetId = record.styleAssetId === null ? null : readString(record.styleAssetId)
  const name = readString(record.name)
  const promptZh = readString(record.promptZh)
  const promptEn = record.promptEn === null ? null : readString(record.promptEn)
  const snapshotUpdatedAt = readString(record.snapshotUpdatedAt)
  if (!name || !promptZh || !snapshotUpdatedAt) return null

  return {
    styleAssetId: styleAssetId || null,
    name,
    promptZh,
    promptEn: promptEn || null,
    snapshotUpdatedAt,
  }
}

export function resolvePayloadStylePrompt(
  payload: Record<string, unknown>,
  locale: string,
  taskLabel: string,
): string {
  const styleSnapshot = readStyleSnapshot(payload.styleSnapshot)
  if (!styleSnapshot) {
    throw new Error(`styleSnapshot is required in ${taskLabel} payload`)
  }
  const styleLocale: StyleLocale = locale === 'en' ? 'en' : 'zh'
  return resolveStylePrompt(styleSnapshot, styleLocale)
}
