'use client'

import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import type { CreativeEngineUsageImpactItem } from '@/lib/creative-engine/usage-impact'

export type ModelUsageImpactAction = 'delete-engine' | 'disable-model' | 'edit-connection'

interface ModelUsageImpactDialogProps {
  open: boolean
  action: ModelUsageImpactAction
  modelLabel?: string
  affectedCount: number
  items: CreativeEngineUsageImpactItem[]
  errorMessage?: string | null
  isLoading?: boolean
  isConfirming?: boolean
  onCancel: () => void
  onConfirm: () => void
  onViewUsage: () => void
  onReplaceModel: () => void
}

function impactMessage(
  t: ReturnType<typeof useTranslations<'apiConfig'>>,
  action: ModelUsageImpactAction,
  affectedCount: number,
  isLoading: boolean,
  modelLabel?: string,
) {
  if (action === 'delete-engine') {
    return t('creativeEngine.impactDeleteEngine', { count: affectedCount })
  }
  if (action === 'disable-model') {
    if (isLoading) return t('creativeEngine.loadingImpact')
    if (!modelLabel) return t('creativeEngine.noImpact')
    return t('creativeEngine.impactDisableModel', { label: modelLabel })
  }
  return t('creativeEngine.impactEditConnection')
}

function confirmLabel(t: ReturnType<typeof useTranslations<'apiConfig'>>, action: ModelUsageImpactAction) {
  if (action === 'delete-engine') return t('creativeEngine.confirmDeleteAnyway')
  if (action === 'disable-model') return t('creativeEngine.confirmDisableAnyway')
  return t('creativeEngine.confirmEditAnyway')
}

export function ModelUsageImpactDialog({
  open,
  action,
  modelLabel,
  affectedCount,
  items,
  errorMessage,
  isLoading = false,
  isConfirming = false,
  onCancel,
  onConfirm,
  onViewUsage,
  onReplaceModel,
}: ModelUsageImpactDialogProps) {
  const t = useTranslations('apiConfig')
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center glass-overlay p-4" role="dialog" aria-modal="true">
      <div className="glass-surface-modal w-full max-w-lg overflow-hidden rounded-xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--glass-stroke-base)] p-5">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[var(--glass-text-primary)]">
              {t('creativeEngine.impactDialogTitle')}
            </h3>
            <p className="mt-2 text-sm text-[var(--glass-text-secondary)]">
              {errorMessage || impactMessage(t, action, affectedCount, isLoading, modelLabel)}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="glass-btn-base glass-btn-secondary inline-flex h-8 w-8 items-center justify-center p-0"
            aria-label={t('creativeEngine.cancel')}
          >
            <AppIcon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div id="creative-engine-usage-impact-list" className="max-h-[42vh] overflow-y-auto p-5">
          {errorMessage ? (
            <div className="flex items-start gap-2 rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-tone-danger-bg)] px-3 py-2 text-sm text-[var(--glass-tone-danger-fg)]">
              <AppIcon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          ) : isLoading ? (
            <div className="flex items-center gap-2 text-sm text-[var(--glass-text-secondary)]">
              <AppIcon name="loader" className="h-4 w-4 animate-spin" />
              {t('creativeEngine.loadingImpact')}
            </div>
          ) : items.length > 0 ? (
            <div className="space-y-2">
              {items.map((item, index) => (
                <div
                  key={`${item.scope}-${item.modelKey}-${item.field}-${index}`}
                  className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2"
                >
                  <div className="text-sm font-medium text-[var(--glass-text-primary)]">
                    {item.scope === 'project'
                      ? (item.projectTitle || item.projectId)
                      : t('creativeEngine.userDefaultsScope')}
                  </div>
                  <div className="mt-1 text-xs text-[var(--glass-text-secondary)]">
                    {item.label}: {item.modelName}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--glass-text-secondary)]">
              {t('creativeEngine.noImpact')}
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--glass-stroke-base)] p-4">
          <button type="button" onClick={onCancel} className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-sm">
            {t('creativeEngine.cancel')}
          </button>
          <button type="button" onClick={onReplaceModel} className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-sm">
            {t('creativeEngine.replaceModel')}
          </button>
          <button type="button" onClick={onViewUsage} className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-sm">
            {t('creativeEngine.viewUsage')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading || isConfirming || !!errorMessage}
            className="glass-btn-base glass-btn-tone-danger px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isConfirming ? t('saving') : confirmLabel(t, action)}
          </button>
        </div>
      </div>
    </div>
  )
}
