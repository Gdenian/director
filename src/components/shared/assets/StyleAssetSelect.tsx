'use client'

import { useTranslations } from 'next-intl'
import { useGlobalStyles } from '@/lib/query/hooks'
import { SelectVariantCard } from '@/components/ui/select-variants'

const CREATE_STYLE_OPTION_VALUE = '__create_style__'

interface StyleAssetSelectProps {
  value: string
  onChange: (value: string) => void
  onCreateStyle?: () => void
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
  onCreateStyle,
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
  const options = [
    { value: '', label: isLoading ? t('styleAsset.loading') : fallbackLabel },
    ...styles.map((style) => ({
      value: style.id,
      label: style.isDefault ? `${style.name} (${t('styleAsset.defaultBadge')})` : style.name,
    })),
    ...(onCreateStyle
      ? [{
          value: CREATE_STYLE_OPTION_VALUE,
          label: t('styleAsset.createNew'),
          description: t('styleAsset.createHint'),
        }]
      : []),
  ]

  const handleChange = (nextValue: string) => {
    if (nextValue === CREATE_STYLE_OPTION_VALUE) {
      onCreateStyle?.()
      return
    }
    onChange(nextValue)
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {showLabel && (
        <label className="glass-field-label block">
          {label ?? t('styleAsset.label')}
        </label>
      )}
      <SelectVariantCard
        options={options}
        value={value}
        onChange={handleChange}
        placeholder={fallbackLabel}
        disabled={disabled || isLoading}
        className="h-10"
      />
      {showHint && (
        <p className="glass-field-hint">
          {t('styleAsset.hint')}
        </p>
      )}
    </div>
  )
}
