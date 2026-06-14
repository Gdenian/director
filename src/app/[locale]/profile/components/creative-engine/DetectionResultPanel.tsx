'use client'

import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { CreativeModelList, type CreativeModelListItem } from './CreativeModelList'

export interface CreativeEngineDetectionResult {
  source: string
  recommendedProviderKey?: string
  confidence: string
  normalizedBaseUrl: string
  protocolType?: string
  status?: string
  models: CreativeModelListItem[]
}

interface DetectionResultPanelProps {
  result: CreativeEngineDetectionResult
  isSaving?: boolean
  onSave: () => void
  onViewModels: () => void
  onRedetect: () => void
  onManualAdjust: () => void
}

function translateStatus(
  t: ReturnType<typeof useTranslations<'apiConfig'>>,
  status: string | undefined,
): string {
  if (!status) return t('creativeEngine.unchecked')
  const knownStatuses = new Set(['available', 'unchecked', 'partial', 'failed', 'disabled'])
  if (!knownStatuses.has(status)) return status
  return t(`creativeEngine.${status}` as Parameters<typeof t>[0])
}

export function DetectionResultPanel({
  result,
  isSaving = false,
  onSave,
  onViewModels,
  onRedetect,
  onManualAdjust,
}: DetectionResultPanelProps) {
  const t = useTranslations('apiConfig')

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--glass-text-primary)]">
            {t('creativeEngine.detectionPending')}
          </h3>
          <p className="mt-1 text-xs text-[var(--glass-text-secondary)]">
            {t('creativeEngine.selectedByUserOnly')}
          </p>
        </div>
        <span className="glass-chip glass-chip-info inline-flex items-center gap-1 px-2 py-1 text-xs">
          <AppIcon name="sparkles" className="h-3.5 w-3.5" />
          {translateStatus(t, result.status)}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-[var(--glass-text-tertiary)]">{t('creativeEngine.source')}</dt>
          <dd className="mt-1 truncate font-medium text-[var(--glass-text-primary)]">{result.source}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--glass-text-tertiary)]">{t('creativeEngine.confidence')}</dt>
          <dd className="mt-1 font-medium text-[var(--glass-text-primary)]">{result.confidence}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--glass-text-tertiary)]">{t('creativeEngine.modelCount')}</dt>
          <dd className="mt-1 font-medium text-[var(--glass-text-primary)]">{result.models.length}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--glass-text-tertiary)]">{t('creativeEngine.serviceAddress')}</dt>
          <dd className="mt-1 truncate font-medium text-[var(--glass-text-primary)]">{result.normalizedBaseUrl}</dd>
        </div>
      </dl>

      <div className="max-h-[min(42dvh,26rem)] overflow-y-auto pr-1">
        <CreativeModelList models={result.models} />
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onManualAdjust} className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-sm">
          {t('creativeEngine.manualAdjust')}
        </button>
        <button type="button" onClick={onRedetect} className="glass-btn-base glass-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-sm">
          <AppIcon name="refresh" className="h-3.5 w-3.5" />
          {t('creativeEngine.redetect')}
        </button>
        <button
          type="button"
          onClick={onViewModels}
          disabled={isSaving}
          className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('creativeEngine.viewModels')}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="glass-btn-base glass-btn-primary px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? t('saving') : t('creativeEngine.saveEngine')}
        </button>
      </div>
    </section>
  )
}
