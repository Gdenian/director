'use client'

import React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import { AppIcon } from '@/components/ui/icons'
import { useProjectAssets, useUploadProjectTempMedia } from '@/lib/query/hooks'
import ImageEditModal from '../../components/storyboard/ImageEditModal'
import ReferenceImageModal, {
  toReferenceImageNotePayload,
  type ReferenceImageOption,
} from '../../components/storyboard/ReferenceImageModal'
import type { SelectedAsset } from '../../components/storyboard/hooks/useImageGeneration'
import type { WorkspaceCanvasFlowNode } from '../node-canvas-types'
import {
  ActionButton,
  DetailSection,
  Field,
  TextArea,
  TextInput,
  candidateImages,
  type PanelContext,
} from './detail-shared'

interface ImageDetailProps {
  readonly context: PanelContext
  readonly node: WorkspaceCanvasFlowNode
  readonly projectId: string
  readonly storyboards: readonly PanelContext['storyboard'][]
  readonly onGenerateImage: (
    panelId: string,
    count?: number,
    references?: {
      readonly referencePanelIds?: readonly string[]
      readonly extraImageUrls?: readonly string[]
      readonly referenceImageNotes?: readonly unknown[]
    },
  ) => Promise<void>
  readonly onSelectCandidate: (panelId: string, imageUrl: string) => Promise<void>
  readonly onCancelCandidate: (panelId: string) => Promise<void>
  readonly onModifyImage: (storyboardId: string, panelIndex: number, prompt: string, urls: readonly string[], selectedAssets: readonly SelectedAsset[]) => Promise<void>
  readonly onUndoImage: (panelId: string) => Promise<void>
  readonly onClearError: (storyboardId: string) => Promise<void>
  readonly onDownloadImages: () => Promise<void>
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('FILE_READ_FAILED'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('FILE_READ_FAILED'))
    reader.readAsDataURL(file)
  })
}

function selectedAssetImage(asset: { readonly media?: { readonly url: string } | null; readonly imageUrl?: string | null }): string | null {
  return asset.media?.url ?? asset.imageUrl ?? null
}

export default function ImageDetail(props: ImageDetailProps) {
  const t = useTranslations('projectWorkflow.canvas.workspace.detail')
  const { panel, storyboard } = props.context
  const candidates = candidateImages(panel)
  const [selectedCandidate, setSelectedCandidate] = useState(candidates[0] ?? '')
  const [count, setCount] = useState('1')
  const [referenceModalOpen, setReferenceModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [selectedReferences, setSelectedReferences] = useState<ReferenceImageOption[]>([])
  const { data: assets } = useProjectAssets(props.projectId)
  const uploadTempMedia = useUploadProjectTempMedia()
  const imageUrl = props.node.data.previewImageUrl ?? null
  const hasPreviousImage = Boolean(panel.previousImageMedia?.url ?? panel.previousImageUrl)

  useEffect(() => {
    setSelectedCandidate(candidateImages(panel)[0] ?? '')
  }, [panel])

  const panelReferenceOptions = useMemo<ReferenceImageOption[]>(() => (
    props.storyboards.flatMap((item) => (item.panels ?? []).flatMap((referencePanel) => {
      const referenceUrl = referencePanel.media?.url ?? referencePanel.imageUrl
      if (!referenceUrl || referencePanel.id === panel.id) return []
      return [{
        id: `panel:${referencePanel.id}`,
        source: 'storyboard',
        label: t('labels.panelReference', { number: referencePanel.panelNumber ?? referencePanel.panelIndex + 1 }),
        imageUrl: referenceUrl,
        note: '',
        referencePanelId: referencePanel.id,
      } satisfies ReferenceImageOption]
    }))
  ), [panel.id, props.storyboards, t])

  const assetReferenceOptions = useMemo<ReferenceImageOption[]>(() => {
    const characterOptions = (assets?.characters ?? []).flatMap((character) => (
      character.appearances.flatMap((appearance) => {
        const image = selectedAssetImage(appearance)
        if (!image) return []
        return [{
          id: `character:${character.id}:${appearance.id}`,
          source: 'character',
          label: `${character.name} / ${appearance.changeReason}`,
          imageUrl: image,
          note: '',
        } satisfies ReferenceImageOption]
      })
    ))
    const locationOptions = (assets?.locations ?? []).flatMap((location) => (
      location.images.flatMap((image) => {
        const url = selectedAssetImage(image)
        if (!url) return []
        return [{
          id: `location:${location.id}:${image.id}`,
          source: 'location',
          label: location.name,
          imageUrl: url,
          note: '',
        } satisfies ReferenceImageOption]
      })
    ))
    const propOptions = (assets?.props ?? []).flatMap((prop) => (
      prop.images.flatMap((image) => {
        const url = selectedAssetImage(image)
        if (!url) return []
        return [{
          id: `prop:${prop.id}:${image.id}`,
          source: 'prop',
          label: prop.name,
          imageUrl: url,
          note: '',
        } satisfies ReferenceImageOption]
      })
    ))
    return [...characterOptions, ...locationOptions, ...propOptions]
  }, [assets])

  const generateWithReferences = async () => {
    const referencePanelIds = selectedReferences
      .map((item) => item.referencePanelId)
      .filter((value): value is string => Boolean(value))
    const extraImageUrls = selectedReferences
      .filter((item) => !item.referencePanelId)
      .map((item) => item.imageUrl)
    await props.onGenerateImage(panel.id, Number(count) || 1, {
      referencePanelIds,
      extraImageUrls,
      referenceImageNotes: selectedReferences.map(toReferenceImageNotePayload),
    })
  }

  return (
    <div className="space-y-4">
      <DetailSection title={t('sections.imagePreview')}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
          <button type="button" onClick={() => imageUrl && setPreviewImage(imageUrl)} className="overflow-hidden rounded-lg border border-black/10 bg-white">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={props.node.data.title} className="max-h-[420px] w-full object-contain" />
            ) : (
              <div className="flex h-60 items-center justify-center text-sm text-[var(--glass-text-tertiary)]">{t('empty.noImage')}</div>
            )}
          </button>
          <div className="space-y-3">
            <Field label={t('fields.imagePrompt')}><TextArea value={panel.imagePrompt ?? ''} onChange={() => undefined} rows={8} readOnly /></Field>
            {panel.imageErrorMessage ? (
              <div className="space-y-2 rounded-md bg-[var(--glass-tone-danger-bg)] p-2 text-xs text-[var(--glass-tone-danger-fg)]">
                <p>{panel.imageErrorMessage}</p>
                <ActionButton onClick={() => props.onClearError(storyboard.id)}>{t('actions.clearError')}</ActionButton>
              </div>
            ) : null}
          </div>
        </div>
      </DetailSection>

      <DetailSection title={t('sections.candidates')}>
        {candidates.length > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
              {candidates.map((url) => (
                <button key={url} type="button" onClick={() => setSelectedCandidate(url)} className={`overflow-hidden rounded-md border ${selectedCandidate === url ? 'border-[#111827]' : 'border-black/10'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={t('fields.candidateImage')} className="h-24 w-full object-cover" />
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton onClick={() => props.onSelectCandidate(panel.id, selectedCandidate)} disabled={!selectedCandidate} variant="primary">{t('actions.confirmCandidate')}</ActionButton>
              <ActionButton onClick={() => props.onCancelCandidate(panel.id)}>{t('actions.cancelCandidate')}</ActionButton>
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--glass-text-tertiary)]">{t('empty.noCandidates')}</p>
        )}
      </DetailSection>

      <DetailSection title={t('sections.imageGeneration')}>
        <div className="grid gap-3 md:grid-cols-[8rem_1fr]">
          <Field label={t('fields.count')}><TextInput value={count} onChange={setCount} /></Field>
          <div className="rounded-md border border-black/5 bg-white p-3 text-xs text-[var(--glass-text-secondary)]">
            {t('messages.referenceSelection', { count: selectedReferences.length })}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={() => setReferenceModalOpen(true)}>{t('actions.selectReferences')}</ActionButton>
          <ActionButton onClick={() => generateWithReferences()} variant="primary">
            {panel.imageTaskRunning ? t('actions.forceRegenerateImage') : t('actions.regenerateImage')}
          </ActionButton>
          <ActionButton onClick={() => setEditModalOpen(true)}>{t('actions.modifyImage')}</ActionButton>
          {hasPreviousImage ? <ActionButton onClick={() => props.onUndoImage(panel.id)}>{t('actions.undoImage')}</ActionButton> : null}
          <ActionButton onClick={() => props.onDownloadImages()}>{t('actions.downloadImages')}</ActionButton>
        </div>
      </DetailSection>

      <ReferenceImageModal
        isOpen={referenceModalOpen}
        panelOptions={panelReferenceOptions}
        assetOptions={assetReferenceOptions}
        selectedItems={selectedReferences}
        isUploading={uploadTempMedia.isPending}
        onClose={() => setReferenceModalOpen(false)}
        onChange={setSelectedReferences}
        onCreateUrlReference={(url) => {
          const trimmed = url.trim()
          if (!/^https?:\/\//.test(trimmed)) return null
          return {
            id: `custom:${trimmed}`,
            source: 'custom',
            label: trimmed,
            imageUrl: trimmed,
            note: '',
          }
        }}
        onUploadFile={async (file) => {
          const base64 = await fileToBase64(file)
          const result = await uploadTempMedia.mutateAsync({
            imageBase64: base64,
            extension: file.name.split('.').pop() || 'png',
            type: file.type,
          })
          if (!result.url) throw new Error('UPLOAD_TEMP_MEDIA_MISSING_URL')
          return {
            id: `custom:${result.url}`,
            source: 'custom',
            label: file.name,
            imageUrl: result.url,
            note: '',
          }
        }}
      />

      {editModalOpen ? (
        <ImageEditModal
          projectId={props.projectId}
          defaultAssets={[]}
          onClose={() => setEditModalOpen(false)}
          onSubmit={(prompt, images, selectedAssets) => {
            void props.onModifyImage(storyboard.id, panel.panelIndex, prompt, images, selectedAssets).then(() => setEditModalOpen(false))
          }}
        />
      ) : null}

      {previewImage ? <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} /> : null}
    </div>
  )
}
