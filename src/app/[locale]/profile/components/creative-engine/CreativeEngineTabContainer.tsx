'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { ApiConfigToolbar } from '../api-config-tab/ApiConfigToolbar'
import { useProviders } from '../api-config'
import { CreativeEngineHome } from './CreativeEngineHome'
import { AddCreativeEngineModal } from './AddCreativeEngineModal'
import { ModelSelectionPanel } from './ModelSelectionPanel'
import { buildDetectedModelDrafts } from './detection-save-draft'

function makeDynamicEngineId(): string {
  const uuid = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `openai-compatible:${uuid}`
}

export function CreativeEngineTabContainer() {
  const t = useTranslations('apiConfig')
  const tc = useTranslations('common')
  const state = useProviders()
  const [isAddOpen, setIsAddOpen] = useState(false)

  const savingState =
    state.saveStatus === 'saving'
      ? resolveTaskPresentationState({
        phase: 'processing',
        intent: 'modify',
        resource: 'text',
        hasOutput: true,
      })
      : null

  if (state.loading) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-[var(--glass-text-tertiary)]">
        {tc('loading')}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <ApiConfigToolbar
        title={t('title')}
        saveStatus={state.saveStatus}
        savingState={savingState}
        savingLabel={t('saving')}
        savedLabel={t('saved')}
        saveFailedLabel={t('saveFailed')}
      />
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-6 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-3xl text-sm text-[var(--glass-text-secondary)]">
              {t('creativeEngine.description')}
            </p>
            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              className="glass-btn-base glass-btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm"
            >
              <AppIcon name="plus" className="h-4 w-4" />
              {t('creativeEngine.addTitle')}
            </button>
          </div>

          <CreativeEngineHome
            providers={state.providers}
            models={state.models}
            onAdd={() => setIsAddOpen(true)}
          />

          <ModelSelectionPanel state={state} />
        </div>
      </div>

      {isAddOpen ? (
        <AddCreativeEngineModal
          onClose={() => setIsAddOpen(false)}
          onSaved={async (draft) => {
            const providerId = makeDynamicEngineId()
            state.addProviderWithModels(
              {
                id: providerId,
                name: draft.name,
                baseUrl: draft.serviceUrl,
                apiKey: draft.apiKey,
                apiMode: 'openai-official',
                gatewayRoute: 'openai-compat',
              },
              buildDetectedModelDrafts(providerId, draft.models),
            )
            setIsAddOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}
