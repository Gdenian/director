'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import type { CustomModel, Provider } from '../api-config'

interface CreativeEngineHomeProps {
  providers: Provider[]
  models: CustomModel[]
  onAdd: () => void
}

function hasKey(provider: Provider): boolean {
  return provider.hasApiKey === true || !!provider.apiKey?.trim()
}

function resolveServiceStatus(provider: Provider): 'available' | 'unchecked' {
  return hasKey(provider) ? 'available' : 'unchecked'
}

export function CreativeEngineHome({ providers, models, onAdd }: CreativeEngineHomeProps) {
  const t = useTranslations('apiConfig')
  const connectedProviders = useMemo(
    () => providers.filter(hasKey),
    [providers],
  )

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--glass-text-primary)]">{t('providerPool')}</h3>
          <p className="mt-1 text-sm text-[var(--glass-text-secondary)]">{t('providerPoolDesc')}</p>
        </div>
        <span className="rounded-full bg-[var(--glass-bg-surface)] px-3 py-1 text-xs text-[var(--glass-text-secondary)]">
          {t('creativeEngine.connectedServiceCount', { count: connectedProviders.length })}
        </span>
      </div>

      {connectedProviders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--glass-stroke-base)] p-6 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--glass-bg-surface)] text-[var(--glass-text-secondary)]">
            <AppIcon name="unplug" className="h-5 w-5" />
          </div>
          <h4 className="mt-3 text-sm font-semibold text-[var(--glass-text-primary)]">
            {t('creativeEngine.noServices')}
          </h4>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--glass-text-secondary)]">
            {t('creativeEngine.noServicesDescription')}
          </p>
          <button type="button" onClick={onAdd} className="glass-btn-base glass-btn-primary mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm">
            <AppIcon name="plus" className="h-4 w-4" />
            {t('creativeEngine.addTitle')}
          </button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {connectedProviders.map((provider) => {
            const serviceModels = models.filter((model) => model.provider === provider.id)
            const status = resolveServiceStatus(provider)
            return (
              <article key={provider.id} className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-[var(--glass-text-primary)]">{provider.name}</h4>
                    <p className="mt-1 truncate text-xs text-[var(--glass-text-tertiary)]">
                      {provider.baseUrl || provider.id}
                    </p>
                  </div>
                  <span className="glass-chip glass-chip-neutral shrink-0 px-2 py-1 text-xs">
                    {t(`creativeEngine.${status}` as Parameters<typeof t>[0])}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--glass-text-secondary)]">
                  <span className="inline-flex items-center gap-1 rounded-md bg-[var(--glass-bg-base)] px-2 py-1">
                    <AppIcon name="cpu" className="h-3.5 w-3.5" />
                    {t('creativeEngine.configuredModelCount', { count: serviceModels.length })}
                  </span>
                  {provider.apiMode ? (
                    <span className="rounded-md bg-[var(--glass-bg-base)] px-2 py-1">
                      {provider.apiMode}
                    </span>
                  ) : null}
                </div>
                <div className="mt-4 flex justify-end gap-2 text-xs text-[var(--glass-text-tertiary)]">
                  {t('creativeEngine.selectedByUserOnly')}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
