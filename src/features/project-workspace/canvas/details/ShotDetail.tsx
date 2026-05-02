'use client'

import React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import InsertPanelModal from '../../components/storyboard/InsertPanelModal'
import PanelVariantModal from '../../components/storyboard/PanelVariantModal'
import { useProjectAssets } from '@/lib/query/hooks'
import type { ShotVariantSuggestion } from '../../components/storyboard/PanelVariantModal.types'
import {
  ActionButton,
  DetailSection,
  Field,
  TextArea,
  TextInput,
  findNextPanelContext,
  isValidOptionalNumber,
  parseCharacterRefs,
  serializeCharacterRefs,
  type PanelContext,
} from './detail-shared'

interface ShotDetailProps {
  readonly context: PanelContext
  readonly projectId: string
  readonly storyboards: readonly PanelContext['storyboard'][]
  readonly onSave: (context: PanelContext, data: Record<string, unknown>) => Promise<void>
  readonly onDelete: (context: PanelContext) => Promise<void>
  readonly onCopy: (panelId: string) => Promise<void>
  readonly onInsert: (context: PanelContext, userInput: string) => Promise<void>
  readonly onVariant: (
    context: PanelContext,
    variant: Omit<ShotVariantSuggestion, 'id' | 'creative_score'>,
    options: { readonly includeCharacterAssets: boolean; readonly includeLocationAsset: boolean },
  ) => Promise<void>
  readonly onGenerateImage: (panelId: string, count?: number) => Promise<void>
  readonly onClearError: (storyboardId: string) => Promise<void>
  readonly onOpenAssetLibrary: (characterName?: string | null) => void
}

export default function ShotDetail(props: ShotDetailProps) {
  const t = useTranslations('projectWorkflow.canvas.workspace.detail')
  const { panel } = props.context
  const [shotType, setShotType] = useState(panel.shotType ?? '')
  const [cameraMove, setCameraMove] = useState(panel.cameraMove ?? '')
  const [description, setDescription] = useState(panel.description ?? '')
  const [location, setLocation] = useState(panel.location ?? '')
  const [characters, setCharacters] = useState(parseCharacterRefs(panel.characters))
  const [propsText, setPropsText] = useState(panel.props ?? '')
  const [srtStart, setSrtStart] = useState(panel.srtStart?.toString() ?? '')
  const [srtEnd, setSrtEnd] = useState(panel.srtEnd?.toString() ?? '')
  const [duration, setDuration] = useState(panel.duration?.toString() ?? '')
  const [srtSegment, setSrtSegment] = useState(panel.srtSegment ?? '')
  const [videoPrompt, setVideoPrompt] = useState(panel.videoPrompt ?? '')
  const [imagePrompt, setImagePrompt] = useState(panel.imagePrompt ?? '')
  const [photographyRules, setPhotographyRules] = useState(panel.photographyRules ?? '')
  const [actingNotes, setActingNotes] = useState(panel.actingNotes ?? '')
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [selectedAppearanceId, setSelectedAppearanceId] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [manualError, setManualError] = useState<string | null>(null)
  const [insertOpen, setInsertOpen] = useState(false)
  const [variantOpen, setVariantOpen] = useState(false)
  const [inserting, setInserting] = useState(false)
  const [creatingVariant, setCreatingVariant] = useState(false)
  const hydratedRef = useRef(false)
  const { data: assets } = useProjectAssets(props.projectId)
  const selectedCharacter = assets?.characters.find((character) => character.id === selectedCharacterId) ?? null
  const selectedAppearance = selectedCharacter?.appearances.find((appearance) => appearance.id === selectedAppearanceId)
    ?? selectedCharacter?.appearances[0]
    ?? null
  const selectedLocation = assets?.locations.find((assetLocation) => assetLocation.id === selectedLocationId) ?? null
  const hasInvalidNumber = !isValidOptionalNumber(srtStart) || !isValidOptionalNumber(srtEnd) || !isValidOptionalNumber(duration)
  const nextContext = useMemo(() => findNextPanelContext(props.storyboards, props.context), [props.context, props.storyboards])
  const panelError = panel.imageErrorMessage ?? props.context.storyboard.lastError ?? null

  useEffect(() => {
    hydratedRef.current = false
    setShotType(panel.shotType ?? '')
    setCameraMove(panel.cameraMove ?? '')
    setDescription(panel.description ?? '')
    setLocation(panel.location ?? '')
    setCharacters(parseCharacterRefs(panel.characters))
    setPropsText(panel.props ?? '')
    setSrtStart(panel.srtStart?.toString() ?? '')
    setSrtEnd(panel.srtEnd?.toString() ?? '')
    setDuration(panel.duration?.toString() ?? '')
    setSrtSegment(panel.srtSegment ?? '')
    setVideoPrompt(panel.videoPrompt ?? '')
    setImagePrompt(panel.imagePrompt ?? '')
    setPhotographyRules(panel.photographyRules ?? '')
    setActingNotes(panel.actingNotes ?? '')
    setSavingState('idle')
    setManualError(null)
    queueMicrotask(() => {
      hydratedRef.current = true
    })
  }, [panel])

  useEffect(() => {
    const firstCharacter = assets?.characters[0]
    setSelectedCharacterId(firstCharacter?.id ?? '')
    setSelectedAppearanceId(firstCharacter?.appearances[0]?.id ?? '')
    setSelectedLocationId(assets?.locations[0]?.id ?? '')
  }, [assets])

  const buildPayload = () => ({
    shotType,
    cameraMove,
    description,
    location: location || null,
    characters: serializeCharacterRefs(characters),
    props: propsText,
    srtStart: srtStart ? Number(srtStart) : null,
    srtEnd: srtEnd ? Number(srtEnd) : null,
    duration: duration ? Number(duration) : null,
    srtSegment,
    imagePrompt,
    videoPrompt,
    photographyRules,
    actingNotes,
  })

  const save = async () => {
    if (hasInvalidNumber) return
    setSavingState('saving')
    setManualError(null)
    try {
      await props.onSave(props.context, buildPayload())
      setSavingState('saved')
    } catch (error) {
      setSavingState('failed')
      setManualError(error instanceof Error ? error.message : t('errors.saveFailed'))
      throw error
    }
  }

  useEffect(() => {
    if (!hydratedRef.current || hasInvalidNumber) return undefined
    const timer = window.setTimeout(() => {
      void save().catch(() => undefined)
    }, 900)
    return () => window.clearTimeout(timer)
  }, [shotType, cameraMove, description, location, characters, propsText, srtStart, srtEnd, duration, srtSegment, imagePrompt, videoPrompt, photographyRules, actingNotes, hasInvalidNumber])

  const addSelectedAssetCharacter = () => {
    if (!selectedCharacter) return
    const appearanceName = selectedAppearance?.changeReason ?? ''
    setCharacters((current) => {
      if (current.some((item) => item.name === selectedCharacter.name && item.appearance === appearanceName)) return current
      return [...current, { name: selectedCharacter.name, appearance: appearanceName }]
    })
  }

  return (
    <div className="space-y-4">
      <DetailSection title={t('sections.shotEdit')}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--glass-text-tertiary)]">
            {savingState === 'saving' ? t('status.saving') : savingState === 'saved' ? t('status.saved') : savingState === 'failed' ? t('status.saveFailed') : t('status.idle')}
          </p>
          {manualError ? <button type="button" className="text-xs text-[var(--glass-tone-danger-fg)] underline" onClick={() => { void save().catch(() => undefined) }}>{t('actions.retrySave')}</button> : null}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('fields.shotType')}><TextInput value={shotType} onChange={setShotType} /></Field>
          <Field label={t('fields.cameraMove')}><TextInput value={cameraMove} onChange={setCameraMove} /></Field>
        </div>
        <Field label={t('fields.description')}><TextArea value={description} onChange={setDescription} rows={4} /></Field>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label={t('fields.location')}><TextInput value={location} onChange={setLocation} /></Field>
          <Field label={t('fields.srtStart')}><TextInput value={srtStart} onChange={setSrtStart} /></Field>
          <Field label={t('fields.srtEnd')}><TextInput value={srtEnd} onChange={setSrtEnd} /></Field>
          <Field label={t('fields.duration')}><TextInput value={duration} onChange={setDuration} /></Field>
        </div>
        {hasInvalidNumber ? <p className="text-xs text-[var(--glass-tone-danger-fg)]">{t('errors.invalidNumber')}</p> : null}
        <Field label={t('fields.srtSegment')}><TextArea value={srtSegment} onChange={setSrtSegment} rows={3} /></Field>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('fields.imagePrompt')}><TextArea value={imagePrompt} onChange={setImagePrompt} rows={5} /></Field>
          <Field label={t('fields.videoPrompt')}><TextArea value={videoPrompt} onChange={setVideoPrompt} rows={5} /></Field>
        </div>
      </DetailSection>

      <DetailSection title={t('sections.assets')}>
        <div className="flex flex-wrap gap-2">
          {characters.map((character, index) => (
            <span key={`${character.name}-${character.appearance}-${index}`} className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1 text-xs">
              {character.appearance ? `${character.name} / ${character.appearance}` : character.name}
              <button type="button" onClick={() => setCharacters((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                <AppIcon name="closeMd" className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label={t('fields.characterAsset')}>
            <select value={selectedCharacterId} onChange={(event) => {
              const characterId = event.target.value
              const nextCharacter = assets?.characters.find((character) => character.id === characterId) ?? null
              setSelectedCharacterId(characterId)
              setSelectedAppearanceId(nextCharacter?.appearances[0]?.id ?? '')
            }} className="w-full rounded-md border border-[var(--glass-stroke-base)] bg-white px-3 py-2 text-sm">
              <option value="">{t('empty.selectCharacter')}</option>
              {assets?.characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
            </select>
          </Field>
          <Field label={t('fields.appearanceAsset')}>
            <select value={selectedAppearanceId} onChange={(event) => setSelectedAppearanceId(event.target.value)} className="w-full rounded-md border border-[var(--glass-stroke-base)] bg-white px-3 py-2 text-sm">
              <option value="">{t('empty.selectAppearance')}</option>
              {selectedCharacter?.appearances.map((appearance) => <option key={appearance.id} value={appearance.id}>{appearance.changeReason}</option>)}
            </select>
          </Field>
          <Field label={t('fields.locationAsset')}>
            <select value={selectedLocationId} onChange={(event) => setSelectedLocationId(event.target.value)} className="w-full rounded-md border border-[var(--glass-stroke-base)] bg-white px-3 py-2 text-sm">
              <option value="">{t('empty.selectLocation')}</option>
              {assets?.locations.map((assetLocation) => <option key={assetLocation.id} value={assetLocation.id}>{assetLocation.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={addSelectedAssetCharacter} disabled={!selectedCharacter}>{t('actions.addSelectedCharacter')}</ActionButton>
          <ActionButton onClick={() => setLocation(selectedLocation?.name ?? '')} disabled={!selectedLocation}>{t('actions.useSelectedLocation')}</ActionButton>
          <ActionButton onClick={() => props.onOpenAssetLibrary(characters[0]?.name ?? null)}>{t('actions.openAssetLibrary')}</ActionButton>
        </div>
        <Field label={t('fields.props')}><TextArea value={propsText} onChange={setPropsText} rows={3} /></Field>
      </DetailSection>

      <DetailSection title={t('sections.aiData')}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('fields.photographyRules')}><TextArea value={photographyRules} onChange={setPhotographyRules} rows={7} /></Field>
          <Field label={t('fields.actingNotes')}><TextArea value={actingNotes} onChange={setActingNotes} rows={7} /></Field>
        </div>
      </DetailSection>

      {panelError ? (
        <DetailSection title={t('sections.errors')}>
          <p className="rounded-md bg-[var(--glass-tone-danger-bg)] p-3 text-sm text-[var(--glass-tone-danger-fg)]">{panelError}</p>
          <ActionButton onClick={() => props.onClearError(props.context.storyboard.id)}>{t('actions.clearError')}</ActionButton>
        </DetailSection>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <ActionButton onClick={save} disabled={savingState === 'saving' || hasInvalidNumber} variant="primary">{savingState === 'saving' ? t('actions.saving') : t('actions.savePanel')}</ActionButton>
        <ActionButton onClick={() => props.onGenerateImage(panel.id, 1)}>{t('actions.generateImage')}</ActionButton>
        <ActionButton onClick={() => props.onCopy(panel.id)}>{t('actions.copyPanel')}</ActionButton>
        <ActionButton onClick={() => setInsertOpen(true)}>{t('actions.insertPanel')}</ActionButton>
        <ActionButton onClick={() => setVariantOpen(true)}>{t('actions.createVariant')}</ActionButton>
        <ActionButton onClick={() => props.onDelete(props.context)} variant="danger">{t('actions.deletePanel')}</ActionButton>
      </div>

      <InsertPanelModal
        isOpen={insertOpen}
        onClose={() => setInsertOpen(false)}
        prevPanel={{
          id: panel.id,
          panelNumber: panel.panelNumber,
          description: panel.description,
          imageUrl: panel.media?.url ?? panel.imageUrl,
        }}
        nextPanel={nextContext ? {
          id: nextContext.panel.id,
          panelNumber: nextContext.panel.panelNumber,
          description: nextContext.panel.description,
          imageUrl: nextContext.panel.media?.url ?? nextContext.panel.imageUrl,
        } : null}
        isInserting={inserting}
        onInsert={async (userInput) => {
          setInserting(true)
          try {
            await props.onInsert(props.context, userInput)
            setInsertOpen(false)
          } finally {
            setInserting(false)
          }
        }}
      />

      <PanelVariantModal
        isOpen={variantOpen}
        onClose={() => setVariantOpen(false)}
        panel={{
          id: panel.id,
          storyboardId: props.context.storyboard.id,
          panelNumber: panel.panelNumber,
          imageUrl: panel.media?.url ?? panel.imageUrl,
          description: panel.description,
        }}
        projectId={props.projectId}
        isSubmittingVariantTask={creatingVariant}
        onVariant={async (variant, options) => {
          setCreatingVariant(true)
          try {
            await props.onVariant(props.context, variant, options)
            setVariantOpen(false)
          } finally {
            setCreatingVariant(false)
          }
        }}
      />
    </div>
  )
}
