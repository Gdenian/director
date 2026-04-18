import type {
  ResolvedStyleContext,
  StyleFallbackReason,
  StylePromptSnapshot,
  StyleResolutionSource,
} from './types'

const STYLE_RESOLUTION_SOURCES = new Set<StyleResolutionSource>([
  'task-snapshot',
  'style-asset',
  'project-art-style-prompt',
  'project-art-style',
  'user-preference',
  'default',
])

const STYLE_FALLBACK_REASONS = new Set<StyleFallbackReason>([
  'none',
  'style-asset-missing-or-inaccessible',
  'legacy-key-missing',
  'empty-style',
])

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null
}

export function createStylePromptSnapshot(
  context: ResolvedStyleContext,
  capturedAt = new Date(),
): StylePromptSnapshot {
  return {
    version: 1,
    source: context.source,
    fallbackReason: context.fallbackReason,
    styleAssetId: context.styleAssetId,
    legacyKey: context.legacyKey,
    label: context.label,
    positivePrompt: context.positivePrompt,
    negativePrompt: context.negativePrompt,
    sourceUpdatedAt: context.sourceUpdatedAt,
    capturedAt: capturedAt.toISOString(),
  }
}

export function normalizeStylePromptSnapshot(value: unknown): StylePromptSnapshot | null {
  if (!value || typeof value !== 'object') return null

  const snapshot = value as Record<string, unknown>
  if (snapshot.version !== 1) return null
  if (typeof snapshot.source !== 'string' || !STYLE_RESOLUTION_SOURCES.has(snapshot.source as StyleResolutionSource)) {
    return null
  }
  if (
    typeof snapshot.fallbackReason !== 'string' ||
    !STYLE_FALLBACK_REASONS.has(snapshot.fallbackReason as StyleFallbackReason)
  ) {
    return null
  }
  if (!isNullableString(snapshot.styleAssetId)) return null
  if (!isNullableString(snapshot.legacyKey)) return null
  if (typeof snapshot.label !== 'string') return null
  if (typeof snapshot.positivePrompt !== 'string') return null
  if (!isNullableString(snapshot.negativePrompt)) return null
  if (!isNullableString(snapshot.sourceUpdatedAt)) return null
  if (typeof snapshot.capturedAt !== 'string') return null

  return {
    version: 1,
    source: snapshot.source as StyleResolutionSource,
    fallbackReason: snapshot.fallbackReason as StyleFallbackReason,
    styleAssetId: snapshot.styleAssetId,
    legacyKey: snapshot.legacyKey,
    label: snapshot.label,
    positivePrompt: snapshot.positivePrompt,
    negativePrompt: snapshot.negativePrompt,
    sourceUpdatedAt: snapshot.sourceUpdatedAt,
    capturedAt: snapshot.capturedAt,
  }
}
