'use client'

import { useTranslations } from 'next-intl'
import { useGlobalStyles } from '@/lib/query/hooks'

interface StyleAssetSelectProps {
  value: string
  onChange: (value: string) => void
  mode?: 'project' | 'asset-hub'
  disabled?: boolean
  label?: string
  className?: string
  showLabel?: boolean
  showHint?: boolean
}

export default function StyleAssetSelect({
  value,
  onChange,
  mode = 'project',
  disabled = false,
  label,
  className = '',
  showLabel = true,
  showHint = true,
}: StyleAssetSelectProps) {
  const t = useTranslations('assetModal')
  const { data: styles = [], isLoading } = useGlobalStyles()
  const fallbackLabel = mode === 'project'
    ? t('styleAsset.projectDefault')
    : t('styleAsset.userDefault')

  return (
    <div className={`space-y-2 ${className}`}>
      {showLabel && (
        <label className="glass-field-label block">
          {label ?? t('styleAsset.label')}
        </label>
      )}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || isLoading}
        className="glass-select-base w-full px-3 py-2 text-sm"
      >
        <option value="">{isLoading ? t('styleAsset.loading') : fallbackLabel}</option>
        {styles.map((style) => (
          <option key={style.id} value={style.id}>
            {style.name}{style.isDefault ? ` (${t('styleAsset.defaultBadge')})` : ''}
          </option>
        ))}
      </select>
      {showHint && (
        <p className="glass-field-hint">
          {t('styleAsset.hint')}
        </p>
      )}
    </div>
  )
}
