'use client'

import { useLocale, useTranslations } from 'next-intl'
import type { CapabilityValue } from '@/lib/model-config-contract'
import type { useProviders } from '../api-config'
import {
  encodeModelKey,
  getProviderDisplayName,
  parseModelKey,
} from '../api-config'
import { DefaultModelCards } from '../api-config-tab/DefaultModelCards'
import { useApiConfigFilters } from '../api-config-tab/hooks/useApiConfigFilters'

type CreativeEngineState = ReturnType<typeof useProviders>

interface ModelSelectionPanelProps {
  state: CreativeEngineState
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isCapabilityValue(value: unknown): value is CapabilityValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function extractCapabilityFieldsFromModel(
  capabilities: Record<string, unknown> | undefined,
  modelType: string,
): Array<{ field: string; options: CapabilityValue[] }> {
  if (!capabilities) return []
  const namespace = capabilities[modelType]
  if (!isRecord(namespace)) return []
  return Object.entries(namespace)
    .filter(([key, value]) => key.endsWith('Options') && Array.isArray(value) && value.every(isCapabilityValue) && value.length > 0)
    .map(([key, value]) => ({
      field: key.slice(0, -'Options'.length),
      options: value as CapabilityValue[],
    }))
}

function parseBySample(input: string, sample: CapabilityValue): CapabilityValue {
  if (typeof sample === 'number') return Number(input)
  if (typeof sample === 'boolean') return input === 'true'
  return input
}

function toCapabilityFieldLabel(field: string): string {
  return field.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase())
}

export function ModelSelectionPanel({ state }: ModelSelectionPanelProps) {
  const locale = useLocale()
  const t = useTranslations('apiConfig')
  const { getEnabledModelsByType } = useApiConfigFilters({
    providers: state.providers,
    models: state.models,
  })

  const handleWorkflowConcurrencyChange = (
    field: 'analysis' | 'image' | 'video',
    rawValue: string,
  ) => {
    const parsed = Number.parseInt(rawValue, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    state.updateWorkflowConcurrency(field, parsed)
  }

  return (
    <DefaultModelCards
      t={t}
      defaultModels={state.defaultModels}
      getEnabledModelsByType={getEnabledModelsByType}
      parseModelKey={parseModelKey}
      encodeModelKey={encodeModelKey}
      getProviderDisplayName={getProviderDisplayName}
      locale={locale}
      updateDefaultModel={state.updateDefaultModel}
      batchUpdateDefaultModels={state.batchUpdateDefaultModels}
      extractCapabilityFieldsFromModel={extractCapabilityFieldsFromModel}
      toCapabilityFieldLabel={toCapabilityFieldLabel}
      capabilityDefaults={state.capabilityDefaults}
      updateCapabilityDefault={state.updateCapabilityDefault}
      parseBySample={parseBySample}
      workflowConcurrency={state.workflowConcurrency}
      handleWorkflowConcurrencyChange={handleWorkflowConcurrencyChange}
    />
  )
}
