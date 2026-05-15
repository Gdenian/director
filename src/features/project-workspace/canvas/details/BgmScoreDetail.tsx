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
          <p className="rounded-md bg-white p-3 text-sm">{t('stats.bgmStemCount', { count: details?.stemCount ?? 0 })}</p>
          <p className="rounded-md bg-white p-3 text-sm">{t('stats.totalDuration', { count: details?.durationSeconds ?? 0 })}</p>
          <p className="rounded-md bg-white p-3 text-sm">{details?.musicModel ?? '-'}</p>
        </div>
      </DetailSection>
      {details?.stems && details.stems.length > 0 ? (
        <DetailSection title={t('sections.bgmScoreStems')}>
          <div className="space-y-2">
            {details.stems.map((stem) => (
              <div key={stem.role} className="rounded-md border border-black/5 bg-white px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{stem.role}</span>
                  <span className="text-xs text-[var(--glass-text-tertiary)]">
                    {stem.startSec}s - {Math.round((stem.startSec + stem.durationSec) * 10) / 10}s · {stem.gainDb}dB
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--glass-text-secondary)]">{stem.reason}</p>
                <p className="mt-1 line-clamp-3 text-xs leading-5 text-[var(--glass-text-tertiary)]">{stem.prompt}</p>
              </div>
            ))}
          </div>
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
