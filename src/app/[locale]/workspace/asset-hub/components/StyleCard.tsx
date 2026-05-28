'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import type { StyleAssetSummary } from '@/lib/assets/contracts'

interface StyleCardProps {
  style: StyleAssetSummary
  onEdit?: (style: StyleAssetSummary) => void
  onDelete?: (styleId: string) => void
  onSetDefault?: (styleId: string) => void
}

export function StyleCard({
  style,
  onEdit,
  onDelete,
  onSetDefault,
}: StyleCardProps) {
  const t = useTranslations('assetHub')
  const imageUrl = style.previewImageUrl || style.referenceImageUrl

  return (
    <div className="glass-surface overflow-hidden">
      <button
        type="button"
        onClick={() => imageUrl && window.open(imageUrl, '_blank', 'noopener,noreferrer')}
        className="relative block w-full aspect-[3/2] bg-[var(--glass-bg-muted)] overflow-hidden"
        disabled={!imageUrl}
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={style.name}
            fill
            unoptimized
            sizes="(max-width: 768px) 50vw, 240px"
            className="object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[var(--glass-text-tertiary)]">
            <AppIcon name="bookmark" className="h-8 w-8" />
          </span>
        )}
      </button>

      <div className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-[var(--glass-text-primary)]">{style.name}</h3>
              {style.isDefault && (
                <span className="glass-chip glass-chip-info px-2 py-0.5 text-[10px]">
                  {t('style.default')}
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-[var(--glass-text-secondary)]">
              {style.promptZh}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit?.(style)}
            className="glass-btn-base glass-btn-soft h-8 flex-1 rounded-md text-xs"
          >
            <AppIcon name="edit" className="h-3.5 w-3.5" />
            {t('style.edit')}
          </button>
          {!style.isDefault && (
            <button
              type="button"
              onClick={() => onSetDefault?.(style.id)}
              className="glass-btn-base glass-btn-tone-info h-8 flex-1 rounded-md text-xs"
            >
              <AppIcon name="check" className="h-3.5 w-3.5" />
              {t('style.setDefault')}
            </button>
          )}
          {!style.isSystemSeed && (
            <button
              type="button"
              onClick={() => onDelete?.(style.id)}
              className="glass-btn-base glass-btn-tone-danger h-8 w-8 rounded-md"
              title={t('style.delete')}
            >
              <AppIcon name="trash" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
