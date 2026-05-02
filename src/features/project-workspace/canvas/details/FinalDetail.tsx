'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import type { ProjectStoryboard } from '@/types/project'
import { ActionButton, DetailSection } from './detail-shared'

interface FinalDetailProps {
  readonly storyboards: readonly ProjectStoryboard[]
  readonly onGenerateAllVideos: () => Promise<void>
  readonly onDownloadVideos: () => Promise<void>
}

export default function FinalDetail(props: FinalDetailProps) {
  const t = useTranslations('projectWorkflow.canvas.workspace.detail')
  const panels = props.storyboards.flatMap((storyboard) => (storyboard.panels ?? []).map((panel) => ({ storyboard, panel })))
  const videos = panels.filter((item) => item.panel.videoMedia?.url || item.panel.videoUrl)
  const missing = panels.filter((item) => !item.panel.videoMedia?.url && !item.panel.videoUrl)
  const totalDuration = panels.reduce((total, item) => total + (item.panel.duration ?? 0), 0)
  return (
    <div className="space-y-4">
      <DetailSection title={t('sections.finalStats')}>
        <div className="grid gap-3 md:grid-cols-4">
          <p className="rounded-md bg-white p-3 text-sm">{t('stats.totalShots', { count: panels.length })}</p>
          <p className="rounded-md bg-white p-3 text-sm">{t('stats.totalVideos', { count: videos.length })}</p>
          <p className="rounded-md bg-white p-3 text-sm">{t('stats.missingVideos', { count: missing.length })}</p>
          <p className="rounded-md bg-white p-3 text-sm">{t('stats.totalDuration', { count: totalDuration })}</p>
        </div>
      </DetailSection>
      <DetailSection title={t('sections.timelineOrder')}>
        <div className="space-y-2">
          {panels.map(({ panel }, index) => (
            <div key={panel.id} className="flex items-center justify-between rounded-md border border-black/5 bg-white px-3 py-2 text-sm">
              <span>{index + 1}. {panel.description || panel.imagePrompt || panel.id}</span>
              <span className={panel.videoUrl || panel.videoMedia?.url ? 'text-[var(--glass-tone-success-fg)]' : 'text-[var(--glass-text-tertiary)]'}>
                {panel.videoUrl || panel.videoMedia?.url ? t('status.videoReady') : t('status.videoMissing')}
              </span>
            </div>
          ))}
        </div>
      </DetailSection>
      <div className="flex flex-wrap justify-end gap-2">
        <ActionButton onClick={props.onGenerateAllVideos} variant="primary">{t('actions.generateAllVideos')}</ActionButton>
        <ActionButton onClick={props.onDownloadVideos} disabled={videos.length === 0}>{t('actions.downloadVideos')}</ActionButton>
        <span className="rounded-md border border-dashed border-[var(--glass-stroke-base)] px-3 py-2 text-xs text-[var(--glass-text-tertiary)]">
          {t('messages.finalExportUnavailable')}
        </span>
      </div>
    </div>
  )
}
