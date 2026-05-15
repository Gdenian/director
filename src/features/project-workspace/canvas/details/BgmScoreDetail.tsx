'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { toDisplayImageUrl } from '@/lib/media/image-url'
import type { WorkspaceCanvasFlowNode } from '../node-canvas-types'
import { ActionButton, DetailSection } from './detail-shared'

interface BgmScoreDetailProps {
  readonly node: WorkspaceCanvasFlowNode
  readonly onGenerateBgmScore: () => Promise<void>
}

export default function BgmScoreDetail({ node, onGenerateBgmScore }: BgmScoreDetailProps) {
  const t = useTranslations('projectWorkflow.canvas.workspace.detail')
  const details = node.data.bgmScoreDetails
  const mixUrl = toDisplayImageUrl(details?.mixUrl) ?? details?.mixUrl ?? null
  const renderTimedSections = (
    sections: NonNullable<typeof details>['designSections'],
  ) => (
    <div className="space-y-2">
      {sections.map((section, index) => {
        const timeRange = typeof section.startSec === 'number' || typeof section.endSec === 'number'
          ? `${section.startSec ?? 0}s - ${section.endSec ?? details?.durationSeconds ?? ''}s`
          : null
        return (
          <div key={`${section.title}-${index}`} className="rounded-md border border-black/5 bg-white px-3 py-2 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {section.category ? (
                  <p className="text-[10px] font-semibold uppercase text-[var(--glass-text-tertiary)]">{section.category}</p>
                ) : null}
                <span className="break-words font-semibold">{section.title}</span>
              </div>
              {timeRange ? (
                <span className="shrink-0 text-xs text-[var(--glass-text-tertiary)]">{timeRange}</span>
              ) : null}
            </div>
            {section.purpose ? <p className="mt-1 text-xs leading-5 text-[var(--glass-text-secondary)]">{section.purpose}</p> : null}
            <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[var(--glass-text-tertiary)]">{section.content}</p>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-4">
      {mixUrl ? (
        <DetailSection title={t('sections.bgmScoreOutput')}>
          <div className="space-y-3 rounded-md bg-white p-3">
            <audio src={mixUrl} controls className="w-full" />
          </div>
        </DetailSection>
      ) : null}
      <DetailSection title={t('sections.bgmScoreStats')}>
        <div className="grid gap-3 md:grid-cols-4">
          <p className="rounded-md bg-white p-3 text-sm">{t('stats.bgmStatus', { status: details?.status ?? '-' })}</p>
          {details?.hasPromptDesign ? (
            <>
              <p className="rounded-md bg-white p-3 text-sm">{t('stats.bgmDesignSectionCount', { count: details.designSectionCount })}</p>
              <p className="rounded-md bg-white p-3 text-sm">{t('stats.bgmPromptSectionCount', { count: details.promptSectionCount })}</p>
              <p className="rounded-md bg-white p-3 text-sm">{t('stats.bgmVirtualLayerCount', { count: details.virtualLayerCount })}</p>
            </>
          ) : null}
          <p className="rounded-md bg-white p-3 text-sm">{t('stats.totalDuration', { count: details?.durationSeconds ?? 0 })}</p>
          <p className="rounded-md bg-white p-3 text-sm">{details?.musicModel ?? '-'}</p>
        </div>
      </DetailSection>
      {details?.promptDesignMissing ? (
        <DetailSection title={t('sections.promptDesignMissing')}>
          <p className="rounded-md bg-white p-3 text-sm leading-6 text-[var(--glass-tone-warning-fg)]">{t('messages.promptDesignMissingDescription')}</p>
        </DetailSection>
      ) : null}
      {details?.scoreOverview ? (
        <DetailSection title={t('sections.bgmScoreOverview')}>
          <p className="rounded-md bg-white p-3 text-sm leading-6 text-[var(--glass-text-secondary)]">{details.scoreOverview}</p>
        </DetailSection>
      ) : null}
      {details?.designSections && details.designSections.length > 0 ? (
        <DetailSection title={t('sections.bgmScoreDesign')}>
          {renderTimedSections(details.designSections)}
        </DetailSection>
      ) : null}
      {details?.virtualLayers && details.virtualLayers.length > 0 ? (
        <DetailSection title={t('sections.bgmScoreVirtualLayers')}>
          <div className="space-y-2">
            {details.virtualLayers.map((layer, index) => (
              <div key={`${layer.name}-${index}`} className="rounded-md border border-black/5 bg-white px-3 py-2 text-sm">
                <p className="font-semibold">{layer.name}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--glass-text-secondary)]">{layer.purpose}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[var(--glass-text-tertiary)]">{layer.content}</p>
              </div>
            ))}
          </div>
        </DetailSection>
      ) : null}
      {details?.promptSections && details.promptSections.length > 0 ? (
        <DetailSection title={t('sections.bgmScorePromptSections')}>
          {renderTimedSections(details.promptSections)}
        </DetailSection>
      ) : null}
      {details?.finalPrompt ? (
        <DetailSection title={t('sections.finalMusicPrompt')}>
          <p className="rounded-md bg-white p-3 whitespace-pre-wrap break-words text-xs leading-5 text-[var(--glass-text-secondary)]">{details.finalPrompt}</p>
        </DetailSection>
      ) : null}
      {details?.negativePrompt ? (
        <DetailSection title={t('sections.negativePrompt')}>
          <p className="rounded-md bg-white p-3 whitespace-pre-wrap break-words text-xs leading-5 text-[var(--glass-text-secondary)]">{details.negativePrompt}</p>
        </DetailSection>
      ) : null}
      {details?.errorMessage ? (
        <DetailSection title={t('sections.error')}>
          <p className="rounded-md bg-white p-3 text-sm text-[var(--glass-tone-danger-fg)]">{details.errorMessage}</p>
        </DetailSection>
      ) : null}
      <div className="flex justify-end">
        <ActionButton onClick={onGenerateBgmScore} disabled={node.data.isRunning === true} variant="primary">
          {node.data.isRunning === true ? t('actions.generatingBgm') : t('actions.generateBgmScore')}
        </ActionButton>
      </div>
    </div>
  )
}
