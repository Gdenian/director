'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/api-fetch'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { AppIcon } from '@/components/ui/icons'
import { useAssetActions } from '@/lib/query/hooks'
import type { StyleAssetSummary } from '@/lib/assets/contracts'
import type { MediaRef } from '@/types/project'

type StyleAssetModalMode = 'create' | 'view' | 'edit'

interface StyleAssetModalProps {
  mode: StyleAssetModalMode
  asset?: StyleAssetSummary
  folderId?: string | null
  onClose: () => void
  onSuccess: () => void
}

function formatTags(tags: string[]) {
  return tags.join(', ')
}

function parseTags(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

export function StyleAssetModal({
  mode,
  asset,
  folderId,
  onClose,
  onSuccess,
}: StyleAssetModalProps) {
  const t = useTranslations('assetHub')
  const actions = useAssetActions({ scope: 'global', kind: 'style' })
  const isReadOnly = mode === 'view'
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [positivePrompt, setPositivePrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [tags, setTags] = useState('')
  const [previewMedia, setPreviewMedia] = useState<MediaRef | null>(null)
  const [isUploadingPreview, setIsUploadingPreview] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setName(asset?.name ?? '')
    setDescription(asset?.description ?? '')
    setPositivePrompt(asset?.positivePrompt ?? '')
    setNegativePrompt(asset?.negativePrompt ?? '')
    setTags(formatTags(asset?.tags ?? []))
    setPreviewMedia(asset?.previewMedia ?? null)
  }, [asset, mode])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting && !isUploadingPreview) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isSubmitting, isUploadingPreview, onClose])

  const handlePreviewUpload = async (file: File) => {
    setIsUploadingPreview(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', 'style-preview')

      const response = await apiFetch('/api/asset-hub/upload-image', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json() as { media?: MediaRef; error?: { message?: string } }
      if (!response.ok || !data.media) {
        throw new Error(data.error?.message || t('styleModal.uploadFailed'))
      }

      setPreviewMedia(data.media)
    } finally {
      setIsUploadingPreview(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleSubmit = async () => {
    if (isReadOnly || isSubmitting || !name.trim() || !positivePrompt.trim()) return

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      positivePrompt: positivePrompt.trim(),
      negativePrompt: negativePrompt.trim() || null,
      tags: parseTags(tags),
      folderId: mode === 'create' ? (folderId ?? null) : (asset?.folderId ?? null),
      previewMediaId: previewMedia?.id ?? null,
    }

    setIsSubmitting(true)
    try {
      if (mode === 'edit' && asset) {
        await actions.update(asset.id, payload)
      } else {
        await actions.create(payload)
      }
      onSuccess()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : t('styleModal.saveFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const title = mode === 'create'
    ? t('styleModal.createTitle')
    : mode === 'edit'
      ? t('styleModal.editTitle')
      : t('styleModal.viewTitle')

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center glass-overlay p-4">
      <div className="glass-surface-modal w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--glass-stroke-base)] px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">{title}</h3>
            <p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{t('styleModal.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="glass-btn-base glass-btn-soft flex h-8 w-8 items-center justify-center rounded-full text-[var(--glass-text-tertiary)]"
          >
            <AppIcon name="close" className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="glass-field-label block">
                  {t('styleModal.name')} <span className="text-[var(--glass-tone-danger-fg)]">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('styleModal.namePlaceholder')}
                  disabled={isReadOnly}
                  className="glass-input-base w-full px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                />
              </div>

              <div className="space-y-2">
                <label className="glass-field-label block">{t('styleModal.description')}</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t('styleModal.descriptionPlaceholder')}
                  disabled={isReadOnly}
                  className="glass-textarea-base h-24 w-full resize-none px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                />
              </div>

              <div className="space-y-2">
                <label className="glass-field-label block">
                  {t('styleModal.positivePrompt')} <span className="text-[var(--glass-tone-danger-fg)]">*</span>
                </label>
                <textarea
                  value={positivePrompt}
                  onChange={(event) => setPositivePrompt(event.target.value)}
                  placeholder={t('styleModal.positivePromptPlaceholder')}
                  disabled={isReadOnly}
                  className="glass-textarea-base h-32 w-full resize-none px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                />
              </div>

              <div className="space-y-2">
                <label className="glass-field-label block">{t('styleModal.negativePrompt')}</label>
                <textarea
                  value={negativePrompt}
                  onChange={(event) => setNegativePrompt(event.target.value)}
                  placeholder={t('styleModal.negativePromptPlaceholder')}
                  disabled={isReadOnly}
                  className="glass-textarea-base h-24 w-full resize-none px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                />
              </div>

              <div className="space-y-2">
                <label className="glass-field-label block">{t('styleModal.tags')}</label>
                <input
                  type="text"
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder={t('styleModal.tagsPlaceholder')}
                  disabled={isReadOnly}
                  className="glass-input-base w-full px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="glass-surface-soft rounded-xl border border-[var(--glass-stroke-base)] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('styleModal.previewTitle')}</span>
                  {previewMedia ? (
                    <span className="glass-chip glass-chip-info px-2 py-0.5 text-[10px]">
                      {t('styleModal.previewReady')}
                    </span>
                  ) : null}
                </div>

                <div className="overflow-hidden rounded-xl bg-[var(--glass-bg-muted)]">
                  {previewMedia?.url ? (
                    <MediaImageWithLoading
                      src={previewMedia.url}
                      alt={name || t('styleModal.previewTitle')}
                      containerClassName="aspect-[4/3] w-full"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[4/3] w-full items-center justify-center text-[var(--glass-text-tertiary)]">
                      <AppIcon name="image" className="h-10 w-10" />
                    </div>
                  )}
                </div>

                <p className="mt-3 text-xs text-[var(--glass-text-tertiary)]">{t('styleModal.previewHint')}</p>

                {!isReadOnly ? (
                  <div className="mt-4">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (!file) return
                        void handlePreviewUpload(file).catch((error) => {
                          window.alert(error instanceof Error ? error.message : t('styleModal.uploadFailed'))
                        })
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingPreview || isSubmitting}
                      className="glass-btn-base glass-btn-secondary w-full rounded-lg px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isUploadingPreview ? t('styleModal.uploadingPreview') : t('styleModal.uploadPreview')}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="glass-btn-base glass-btn-secondary rounded-lg px-4 py-2 text-sm"
            disabled={isSubmitting || isUploadingPreview}
          >
            {isReadOnly ? t('styleModal.close') : t('common.cancel')}
          </button>
          {!isReadOnly ? (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isSubmitting || isUploadingPreview || !name.trim() || !positivePrompt.trim()}
              className="glass-btn-base glass-btn-primary rounded-lg px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? t('styleModal.saving')
                : mode === 'create'
                  ? t('styleModal.create')
                  : t('styleModal.save')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default StyleAssetModal
