'use client'

import { useMemo } from 'react'
import { AppIcon } from '@/components/ui/icons'
import { useAssets } from '@/lib/query/hooks'
import type { ProjectResolvedStyleSummary } from '@/types/project'

interface ProjectStyleAssetSelectorProps {
  value: string | null | undefined
  resolvedStyle?: ProjectResolvedStyleSummary | null
  onChange: (value: string | null) => void
  disabled?: boolean
  className?: string
}

interface StyleOption {
  value: string
  label: string
}

function buildLegacyOptionLabel(
  value: string | null | undefined,
  resolvedStyle: ProjectResolvedStyleSummary | null | undefined,
) {
  if (value) {
    return '不使用风格资产'
  }

  const resolvedLabel = resolvedStyle?.label?.trim()
  return resolvedLabel ? `兼容旧风格：${resolvedLabel}` : '兼容旧风格'
}

export default function ProjectStyleAssetSelector({
  value,
  resolvedStyle,
  onChange,
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
        label: resolvedStyle?.label?.trim() || '当前风格资产',
      })
    }

    return nextOptions
  }, [assets, resolvedStyle?.label, value])

  const selectValue = value ?? ''
  const legacyOptionLabel = buildLegacyOptionLabel(value, resolvedStyle)

  return (
    <div className={`relative ${className ?? ''}`}>
      <select
        value={selectValue}
        onChange={(event) => onChange(event.target.value || null)}
        disabled={disabled}
        className="glass-input-base h-10 w-full appearance-none pr-8 pl-3 text-[13px] font-medium text-[var(--glass-text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">{legacyOptionLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {isLoading && options.length === 0 ? (
          <option value="" disabled>
            加载风格资产中...
          </option>
        ) : null}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[var(--glass-text-tertiary)]">
        <AppIcon name="chevronDown" className="h-4 w-4" />
      </span>
    </div>
  )
}
