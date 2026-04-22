'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useAssets } from '@/lib/query/hooks'
import type { StyleAssetSummary } from '@/lib/assets/contracts'
import { listLegacySystemStyles } from '@/lib/style'

interface GlobalStyleAssetPickerProps {
  value: string
  onChange: (value: string) => void
}

type PickerStyleOption = {
  id: string
  name: string
  readOnly: boolean
}

function isStyleAssetSummary(value: unknown): value is StyleAssetSummary {
  return !!value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'style'
}

export function GlobalStyleAssetPicker({
  value,
  onChange,
}: GlobalStyleAssetPickerProps) {
  const t = useTranslations('assetModal')
  const stylesQuery = useAssets({
    scope: 'global',
    kind: 'style',
  })

  const styles = useMemo(() => {
    const fallbackStyles: PickerStyleOption[] = listLegacySystemStyles('zh').map((style) => ({
      id: style.id,
      name: style.name,
      readOnly: style.readOnly,
    }))
    const fallbackById = new Map(fallbackStyles.map((style) => [style.id, style]))
    for (const asset of stylesQuery.data ?? []) {
      if (!isStyleAssetSummary(asset)) continue
      fallbackById.set(asset.id, {
        id: asset.id,
        name: asset.name,
        readOnly: asset.readOnly,
      })
    }
    return Array.from(fallbackById.values())
  }, [stylesQuery.data])

  return (
    <div className="space-y-2">
      <label className="glass-field-label block">
        {t('artStyle.title')}
      </label>
      <div className="grid grid-cols-2 gap-2">
        {styles.map((style) => (
          <button
            key={style.id}
            type="button"
            onClick={() => onChange(style.id)}
            className={`glass-btn-base px-3 py-2 rounded-lg text-sm border transition-all justify-start ${value === style.id
              ? 'glass-btn-tone-info border-[var(--glass-stroke-focus)]'
              : 'glass-btn-soft border-[var(--glass-stroke-base)] text-[var(--glass-text-secondary)]'
              }`}
          >
            <span>{style.name}</span>
          </button>
        ))}
      </div>
      {styles.length === 0 && (
        <p className="glass-field-hint">
          {t('artStyle.empty')}
        </p>
      )}
    </div>
  )
}
