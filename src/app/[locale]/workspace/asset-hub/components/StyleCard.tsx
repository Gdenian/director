'use client'

import { useTranslations } from 'next-intl'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { AppIcon } from '@/components/ui/icons'
import type { StyleAssetSummary } from '@/lib/assets/contracts'

interface StyleCardProps {
  asset: StyleAssetSummary
  onView: (asset: StyleAssetSummary) => void
  onEdit: (asset: StyleAssetSummary) => void
  onDelete: (assetId: string) => void
}

export function StyleCard({
  asset,
  onView,
  onEdit,
  onDelete,
}: StyleCardProps) {
  const t = useTranslations('assetHub')
  const previewUrl = asset.previewMedia?.url ?? null

  return (
    <article className="glass-surface overflow-hidden relative group">
      <div className="relative aspect-[4/3] bg-[var(--glass-bg-muted)]">
        {previewUrl ? (
          <MediaImageWithLoading
            src={previewUrl}
            alt={asset.name}
            containerClassName="h-full w-full"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--glass-text-tertiary)]">
            <AppIcon name="sparklesAlt" className="h-10 w-10" />
          </div>
        )}
        <div className="absolute left-2 top-2">
          <span className={`glass-chip px-2 py-0.5 text-[10px] ${asset.source === 'system' ? 'glass-chip-neutral' : 'glass-chip-info'}`}>
            {asset.source === 'system' ? t('styleSourceSystem') : t('styleSourceUser')}
          </span>
        </div>
      </div>

      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--glass-text-primary)] line-clamp-2">
            {asset.name}
          </h3>
          {asset.readOnly ? (
            <span className="glass-chip glass-chip-neutral shrink-0 px-2 py-0.5 text-[10px]">
              {t('styleReadOnly')}
            </span>
          ) : null}
        </div>

        {asset.description ? (
          <p className="mt-1 text-xs text-[var(--glass-text-secondary)] line-clamp-2">
            {asset.description}
          </p>
        ) : null}

        <p className="mt-2 text-xs text-[var(--glass-text-secondary)] line-clamp-3">
          {asset.positivePrompt}
        </p>

        {asset.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {asset.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="glass-chip glass-chip-neutral px-2 py-0.5 text-[10px]">
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onView(asset)}
            className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs"
          >
            {t('view')}
          </button>
          {!asset.readOnly ? (
            <button
              type="button"
              onClick={() => onEdit(asset)}
              className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs"
            >
              {t('edit')}
            </button>
          ) : null}
          {!asset.readOnly ? (
            <button
              type="button"
              onClick={() => onDelete(asset.id)}
              className="glass-btn-base glass-btn-soft rounded-lg px-3 py-1.5 text-xs text-[var(--glass-tone-danger-fg)]"
            >
              {t('delete')}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export default StyleCard
