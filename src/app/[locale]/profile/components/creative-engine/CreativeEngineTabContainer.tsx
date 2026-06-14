'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/api-fetch'
import { AppIcon } from '@/components/ui/icons'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import type {
  CreativeEngineUsageImpactItem,
  CreativeEngineUsageImpactTarget,
} from '@/lib/creative-engine/usage-impact'
import { ApiConfigToolbar } from '../api-config-tab/ApiConfigToolbar'
import { useProviders, type CustomModel, type Provider } from '../api-config'
import { CreativeEngineHome } from './CreativeEngineHome'
import { AddCreativeEngineModal } from './AddCreativeEngineModal'
import { ModelSelectionPanel } from './ModelSelectionPanel'
import { ModelUsageImpactDialog, type ModelUsageImpactAction } from './ModelUsageImpactDialog'
import { buildDetectedEngineProviderDraft, buildDetectedModelDrafts } from './detection-save-draft'

type PendingImpactAction =
  | { action: 'delete-engine'; provider: Provider }
  | { action: 'disable-model'; model: CustomModel }
  | { action: 'edit-connection'; provider: Provider; updates: { apiKey: string; baseUrl: string } }

interface UsageImpactState {
  pending: PendingImpactAction | null
  items: CreativeEngineUsageImpactItem[]
  affectedCount: number
  errorMessage: string | null
  isLoading: boolean
  isConfirming: boolean
}

export function CreativeEngineTabContainer() {
  const t = useTranslations('apiConfig')
  const tc = useTranslations('common')
  const state = useProviders()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [impactState, setImpactState] = useState<UsageImpactState>({
    pending: null,
    items: [],
    affectedCount: 0,
    errorMessage: null,
    isLoading: false,
    isConfirming: false,
  })

  const savingState =
    state.saveStatus === 'saving'
      ? resolveTaskPresentationState({
        phase: 'processing',
        intent: 'modify',
        resource: 'text',
        hasOutput: true,
      })
      : null

  async function openImpactDialog(pending: PendingImpactAction, target: CreativeEngineUsageImpactTarget) {
    setImpactState({
      pending,
      items: [],
      affectedCount: 0,
      errorMessage: null,
      isLoading: true,
      isConfirming: false,
    })
    try {
      const response = await apiFetch('/api/user/creative-engines/impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      })
      if (!response.ok) throw new Error(`impact request failed: ${response.status}`)
      const result = await response.json() as {
        affectedCount?: number
        items?: CreativeEngineUsageImpactItem[]
      }
      setImpactState({
        pending,
        items: result.items || [],
        affectedCount: result.affectedCount || 0,
        errorMessage: null,
        isLoading: false,
        isConfirming: false,
      })
    } catch {
      setImpactState({
        pending,
        items: [],
        affectedCount: 0,
        errorMessage: t('creativeEngine.impactLoadFailed'),
        isLoading: false,
        isConfirming: false,
      })
    }
  }

  function closeImpactDialog() {
    setImpactState({
      pending: null,
      items: [],
      affectedCount: 0,
      errorMessage: null,
      isLoading: false,
      isConfirming: false,
    })
  }

  function scrollToModelSelection() {
    document.getElementById('creative-engine-model-selection')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    closeImpactDialog()
  }

  function scrollToUsageList() {
    document.getElementById('creative-engine-usage-impact-list')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  function requestDeleteEngine(provider: Provider) {
    void openImpactDialog(
      { action: 'delete-engine', provider },
      { type: 'engine', engineId: provider.id },
    )
  }

  function requestToggleModel(model: CustomModel) {
    if (model.enabled === false) {
      state.toggleModel(model.modelKey, model.provider)
      return
    }
    void openImpactDialog(
      { action: 'disable-model', model },
      { type: 'model', modelKey: model.modelKey },
    )
  }

  function requestUpdateConnection(provider: Provider, updates: { apiKey: string; baseUrl: string }) {
    void openImpactDialog(
      { action: 'edit-connection', provider, updates },
      { type: 'engine', engineId: provider.id },
    )
  }

  function confirmImpactAction() {
    const pending = impactState.pending
    if (!pending) return
    setImpactState((previous) => ({ ...previous, isConfirming: true }))
    if (pending.action === 'delete-engine') {
      state.deleteProvider(pending.provider.id, { skipConfirm: true })
    } else if (pending.action === 'disable-model') {
      state.toggleModel(pending.model.modelKey, pending.model.provider, { skipConfirm: true })
    } else {
      state.updateProviderConnection(pending.provider.id, pending.updates)
    }
    closeImpactDialog()
  }

  function currentImpactAction(): ModelUsageImpactAction {
    return impactState.pending?.action || 'delete-engine'
  }

  function currentImpactModelLabel() {
    const pending = impactState.pending
    if (pending?.action !== 'disable-model') return undefined
    return impactState.items[0]?.label
  }

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
            onDeleteEngine={requestDeleteEngine}
            onUpdateConnection={requestUpdateConnection}
            onToggleModel={requestToggleModel}
          />

          <div id="creative-engine-model-selection">
            <ModelSelectionPanel state={state} />
          </div>
        </div>
      </div>

      {isAddOpen ? (
        <AddCreativeEngineModal
          onClose={() => setIsAddOpen(false)}
          onSaved={async (draft) => {
            const provider = buildDetectedEngineProviderDraft(draft)
            state.addProviderWithModels(
              provider,
              buildDetectedModelDrafts(provider.id, draft.models),
            )
            setIsAddOpen(false)
          }}
        />
      ) : null}

      <ModelUsageImpactDialog
        open={!!impactState.pending}
        action={currentImpactAction()}
        modelLabel={currentImpactModelLabel()}
        affectedCount={impactState.affectedCount}
        items={impactState.items}
        errorMessage={impactState.errorMessage}
        isLoading={impactState.isLoading}
        isConfirming={impactState.isConfirming}
        onCancel={closeImpactDialog}
        onConfirm={confirmImpactAction}
        onViewUsage={scrollToUsageList}
        onReplaceModel={scrollToModelSelection}
      />
    </div>
  )
}
