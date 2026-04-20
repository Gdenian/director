'use client'

import { useMemo } from 'react'
import { AppIcon } from '@/components/ui/icons'
import { useAssets } from '@/lib/query/hooks'
import type { ProjectResolvedStyleSummary } from '@/types/project'

interface ProjectStyleAssetSelectorProps {
  value: string | null | undefined
  resolvedStyle?: ProjectResolvedStyleSummary | null
  onChange: (value: string) => void
  texts: {
    assetMode: string
    compatibilityMode: string
    formatCompatibilityMode: (label: string) => string
    currentAsset: string
    loading: string
  }
  disabled?: boolean
  className?: string
}

interface StyleOption {
  value: string
  label: string
}

function buildLegacyOptionLabel(
  resolvedStyle: ProjectResolvedStyleSummary | null | undefined,
  texts: ProjectStyleAssetSelectorProps['texts'],
) {
  const resolvedLabel = resolvedStyle?.label?.trim()
  return resolvedLabel ? texts.formatCompatibilityMode(resolvedLabel) : texts.compatibilityMode
}

export default function ProjectStyleAssetSelector({
  value,
  resolvedStyle,
  onChange,
  texts,
  disabled = false,
  className,
}: ProjectStyleAssetSelectorProps) {
  const { data: assets = [], isLoading } = useAssets({
    scope: 'global',
    kind: 'style',
  })

  const options = useMemo<StyleOption[]>(() => {
    const nextOptions = assets
      .filter((asset) => asset.kind === 'style')
      .map((asset) => ({
        value: asset.id,
        label: asset.name,
      }))

    if (value && !nextOptions.some((option) => option.value === value)) {
      nextOptions.unshift({
        value,
        label: resolvedStyle?.label?.trim() || texts.currentAsset,
      })
    }

    return nextOptions
  }, [assets, resolvedStyle?.label, texts.currentAsset, value])

  const selectValue = value ?? ''
  const legacyOptionLabel = buildLegacyOptionLabel(resolvedStyle, texts)

  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <div className="text-[11px] font-medium text-[var(--glass-text-tertiary)]">
        {value ? texts.assetMode : texts.compatibilityMode}
      </div>
      <div className="relative">
        <select
          value={selectValue}
          onChange={(event) => {
            if (!event.target.value) return
            onChange(event.target.value)
          }}
          disabled={disabled}
          className="glass-input-base h-10 w-full appearance-none pr-8 pl-3 text-[13px] font-medium text-[var(--glass-text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {!value ? (
            <option value="">{legacyOptionLabel}</option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          {isLoading && options.length === 0 ? (
            <option value="" disabled>
              {texts.loading}
            </option>
          ) : null}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[var(--glass-text-tertiary)]">
          <AppIcon name="chevronDown" className="h-4 w-4" />
        </span>
      </div>
    </div>
  )
}
