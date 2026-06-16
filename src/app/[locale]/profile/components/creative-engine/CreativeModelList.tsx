'use client'

import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import type { CreativeDetectionConfidence, CreativeModelPurpose, CreativeModelStatus } from '@/lib/creative-engine/types'
import type { MediaContract, MediaContractSource } from '@/lib/media-contract/types'
import type {
  OpenAICompatMediaTemplate,
  OpenAICompatMediaTemplateSource,
} from '@/lib/openai-compat-media-template'
import type { CustomModel } from '../api-config'

export interface CreativeModelListItem {
  id?: string
  name?: string
  callName?: string
  modelKey?: string
  purpose?: CreativeModelPurpose | 'unknown'
  status?: CreativeModelStatus | 'unchecked'
  confidence?: CreativeDetectionConfidence
  enabled?: boolean
  mediaContract?: MediaContract
  mediaContractSource?: MediaContractSource
  compatMediaTemplate?: OpenAICompatMediaTemplate
  compatMediaTemplateSource?: OpenAICompatMediaTemplateSource
}

interface CreativeModelListProps {
  models: CreativeModelListItem[]
  emptyLabel?: string
  onToggleModel?: (model: CustomModel) => void
  canTestModel?: (model: CreativeModelListItem) => boolean
  onTestModel?: (model: CreativeModelListItem) => void
  testingModelKey?: string | null
}

function modelName(model: CreativeModelListItem): string {
  return model.name || model.callName || model.modelKey || model.id || 'Unknown model'
}

function modelStatus(model: CreativeModelListItem): string {
  return model.status || 'unchecked'
}

export function getCreativeModelPurposeLabel(
  purpose: CreativeModelListItem['purpose'],
  t: (key: string) => string,
): string {
  return t(`creativeEngine.modelPurposes.${purpose || 'unknown'}`)
}

export function CreativeModelList({
  models,
  emptyLabel,
  onToggleModel,
  canTestModel,
  onTestModel,
  testingModelKey,
}: CreativeModelListProps) {
  const t = useTranslations('apiConfig')

  if (models.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--glass-stroke-base)] px-3 py-4 text-sm text-[var(--glass-text-tertiary)]">
        {emptyLabel || t('creativeEngine.noServicesDescription')}
      </div>
    )
  }

  return (
    <div className="divide-y divide-[var(--glass-stroke-base)] overflow-hidden rounded-xl border border-[var(--glass-stroke-base)]">
      {models.map((model, index) => (
        <div key={model.modelKey || model.id || `${model.callName}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-[var(--glass-text-primary)]">
              {modelName(model)}
            </div>
            <div className="mt-0.5 truncate text-xs text-[var(--glass-text-tertiary)]">
              {t('creativeEngine.modelCallName')}: {model.callName || model.id || model.modelKey || '-'}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs">
            <span className="rounded-md bg-[var(--glass-bg-surface)] px-2 py-1 text-[var(--glass-text-secondary)]">
              {getCreativeModelPurposeLabel(model.purpose, t)}
            </span>
            {canTestModel?.(model) ? (
              <button
                type="button"
                onClick={() => onTestModel?.(model)}
                disabled={testingModelKey === model.modelKey}
                className="glass-chip glass-chip-neutral inline-flex items-center gap-1 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-60"
                title={t('creativeEngine.testModel')}
              >
                <AppIcon
                  name={testingModelKey === model.modelKey ? 'loader' : 'badgeCheck'}
                  className={`h-3 w-3 ${testingModelKey === model.modelKey ? 'animate-spin' : ''}`}
                />
                {testingModelKey === model.modelKey
                  ? t('creativeEngine.testingModel')
                  : t(`creativeEngine.${modelStatus(model)}` as Parameters<typeof t>[0])}
              </button>
            ) : (
              <span className="glass-chip glass-chip-neutral inline-flex items-center gap-1 px-2 py-1">
                <AppIcon name="badgeCheck" className="h-3 w-3" />
                {t(`creativeEngine.${modelStatus(model)}` as Parameters<typeof t>[0])}
              </span>
            )}
            {onToggleModel && model.modelKey ? (
              <button
                type="button"
                onClick={() => onToggleModel(model as CustomModel)}
                className="glass-btn-base glass-btn-secondary px-2 py-1"
              >
                {model.enabled === false ? t('creativeEngine.enableModel') : t('creativeEngine.disableModel')}
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}
