'use client'

import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import {
  useAiDesignStyle,
  useStyleActions,
  useUploadAssetHubTempMedia,
} from '@/lib/query/hooks'
import type { StyleAssetSummary } from '@/lib/assets/contracts'
import {
  applyGeneratedStylePrompts,
  normalizeGeneratedStylePrompts,
} from './style-prompt-generation'

interface StyleAssetModalProps {
  folderId?: string | null
  style?: StyleAssetSummary | null
  onClose: () => void
  onSuccess: () => void
}

type ImageField = 'referenceImageUrl' | 'previewImageUrl'

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export default function StyleAssetModal({
  folderId,
  style,
  onClose,
  onSuccess,
}: StyleAssetModalProps) {
  const t = useTranslations('assetHub')
  const actions = useStyleActions()
  const uploadTemp = useUploadAssetHubTempMedia()
  const generateStylePrompt = useAiDesignStyle()
  const referenceInputRef = useRef<HTMLInputElement>(null)
  const previewInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(style?.name ?? '')
  const [promptZh, setPromptZh] = useState(style?.promptZh ?? '')
  const [promptEn, setPromptEn] = useState(style?.promptEn ?? '')
  const [referenceImageUrl, setReferenceImageUrl] = useState(style?.referenceImageUrl ?? '')
  const [previewImageUrl, setPreviewImageUrl] = useState(style?.previewImageUrl ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [promptGenerationError, setPromptGenerationError] = useState('')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isSaving, onClose])

  const handleUpload = async (field: ImageField, file?: File | null) => {
    if (!file) return
    const dataUrl = await readFileAsDataUrl(file)
    const result = await uploadTemp.mutateAsync({ imageBase64: dataUrl })
    const url = result.url || result.key || ''
    if (!url) return
    if (field === 'referenceImageUrl') {
      setReferenceImageUrl(url)
    } else {
      setPreviewImageUrl(url)
    }
  }

  const handleGeneratePrompt = async () => {
    const trimmedReferenceImageUrl = referenceImageUrl.trim()
    if (!trimmedReferenceImageUrl) {
      setPromptGenerationError(t('style.missingReferenceImage'))
      return
    }

    setPromptGenerationError('')
    try {
      const result = await generateStylePrompt.mutateAsync(trimmedReferenceImageUrl)
      const generated = normalizeGeneratedStylePrompts(result)
      const next = applyGeneratedStylePrompts({
        current: { promptZh, promptEn },
        generated,
        confirmOverwrite: () => window.confirm(t('style.overwritePromptConfirm')),
      })
      if (!next.applied) return
      setPromptZh(next.promptZh)
      setPromptEn(next.promptEn)
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : t('style.generatePromptFailed')
      setPromptGenerationError(message)
    }
  }

  const handleSave = async () => {
    if (!name.trim() || !promptZh.trim()) return
    try {
      setIsSaving(true)
      const payload = {
        name: name.trim(),
        promptZh: promptZh.trim(),
        promptEn: promptEn.trim() || null,
        folderId: folderId ?? null,
        referenceImageUrl: referenceImageUrl.trim() || null,
        previewImageUrl: previewImageUrl.trim() || null,
      }
      if (style) {
        await actions.update.mutateAsync({ styleId: style.id, payload })
      } else {
        await actions.create.mutateAsync(payload)
      }
      onSuccess()
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  const renderImageField = (
    field: ImageField,
    value: string,
    onValueChange: (value: string) => void,
    inputRef: RefObject<HTMLInputElement | null>,
  ) => (
    <div className="space-y-2">
      <label className="glass-field-label block">
        {field === 'referenceImageUrl' ? t('style.referenceImage') : t('style.previewImage')}
      </label>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className="glass-input-base min-w-0 flex-1 px-3 py-2 text-sm"
          placeholder={t('style.imageUrlPlaceholder')}
        />
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void handleUpload(field, event.target.files?.[0]).finally(() => {
              event.target.value = ''
            })
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploadTemp.isPending}
          className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-2 text-sm disabled:opacity-50"
        >
          <AppIcon name="upload" className="h-4 w-4" />
          {uploadTemp.isPending ? t('style.uploading') : t('style.upload')}
        </button>
        {field === 'referenceImageUrl' && (
          <button
            type="button"
            onClick={() => void handleGeneratePrompt()}
            disabled={generateStylePrompt.isPending || !value.trim()}
            className="glass-btn-base glass-btn-tone-info rounded-lg px-3 py-2 text-sm disabled:opacity-50"
            title={!value.trim() ? t('style.missingReferenceImage') : undefined}
          >
            <AppIcon name="sparkles" className="h-4 w-4" />
            {generateStylePrompt.isPending ? t('style.generatingPrompt') : t('style.generatePrompt')}
          </button>
        )}
      </div>
      {value && (
        <div className="relative h-24 w-full overflow-hidden rounded-lg">
          <Image
            src={value}
            alt=""
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 640px"
            className="object-cover"
          />
        </div>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center glass-overlay p-4">
      <div className="glass-surface-modal flex max-h-[86vh] w-full max-w-2xl flex-col">
        <div className="flex items-center justify-between border-b border-[var(--glass-stroke-base)] p-5">
          <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">
            {style ? t('style.editTitle') : t('style.createTitle')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="glass-btn-base glass-btn-soft h-8 w-8 rounded-full"
          >
            <AppIcon name="close" className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="space-y-2">
            <label className="glass-field-label block">
              {t('style.name')} <span className="text-[var(--glass-tone-danger-fg)]">*</span>
            </label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="glass-input-base w-full px-3 py-2 text-sm"
              placeholder={t('style.namePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <label className="glass-field-label block">
              {t('style.promptZh')} <span className="text-[var(--glass-tone-danger-fg)]">*</span>
            </label>
            <textarea
              value={promptZh}
              onChange={(event) => setPromptZh(event.target.value)}
              className="glass-textarea-base h-28 w-full resize-none px-3 py-2 text-sm"
              placeholder={t('style.promptZhPlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <label className="glass-field-label block">{t('style.promptEn')}</label>
            <textarea
              value={promptEn}
              onChange={(event) => setPromptEn(event.target.value)}
              className="glass-textarea-base h-24 w-full resize-none px-3 py-2 text-sm"
              placeholder={t('style.promptEnPlaceholder')}
            />
          </div>

          {renderImageField('referenceImageUrl', referenceImageUrl, setReferenceImageUrl, referenceInputRef)}
          {promptGenerationError && (
            <p className="glass-field-hint text-[var(--glass-tone-danger-fg)]">
              {promptGenerationError}
            </p>
          )}
          {renderImageField('previewImageUrl', previewImageUrl, setPreviewImageUrl, previewInputRef)}
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="glass-btn-base glass-btn-secondary rounded-lg px-4 py-2 text-sm"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving || !name.trim() || !promptZh.trim()}
            className="glass-btn-base glass-btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-50"
          >
            {isSaving ? t('style.saving') : t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}
