'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { EditBriefOptionId } from '@/lib/edit-script/types'
import type { EditFirstQuestion } from './edit-first-questions'

export type EditFirstProgressKind = 'briefQuestions' | 'editScript'

interface EditFirstInlineReplyProps {
  readonly pending: boolean
  readonly progressKind: EditFirstProgressKind | null
  readonly activeQuestion?: EditFirstQuestion | null
  readonly onSelectOption: (optionId: EditBriefOptionId) => void
}

const PROGRESS_STEP_INTERVAL_MS = 1800

function useProgressStepIndex(enabled: boolean, stepCount: number, resetKey: string): number {
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    setStepIndex(0)
    if (!enabled || stepCount <= 1) return undefined

    const timer = window.setInterval(() => {
      setStepIndex((current) => Math.min(current + 1, stepCount - 1))
    }, PROGRESS_STEP_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [enabled, resetKey, stepCount])

  return stepIndex
}

export function EditFirstInlineReply({
  pending,
  progressKind,
  activeQuestion,
  onSelectOption,
}: EditFirstInlineReplyProps) {
  const t = useTranslations('assistantAgent')
  const progressSteps = useMemo(() => {
    if (progressKind === 'briefQuestions') {
      return [
        t('panel.editFirstProgress.briefQuestions.understandRequest'),
        t('panel.editFirstProgress.briefQuestions.designQuestions'),
        t('panel.editFirstProgress.briefQuestions.prepareOptions'),
      ] as const
    }
    if (progressKind === 'editScript') {
      return [
        t('panel.editFirstProgress.editScript.rhythm'),
        t('panel.editFirstProgress.editScript.visualAction'),
        t('panel.editFirstProgress.editScript.camera'),
        t('panel.editFirstProgress.editScript.videoPrompt'),
        t('panel.editFirstProgress.editScript.sound'),
        t('panel.editFirstProgress.editScript.assets'),
        t('panel.editFirstProgress.editScript.persist'),
      ] as const
    }
    return [] as const
  }, [progressKind, t])
  const progressStepIndex = useProgressStepIndex(Boolean(progressKind && pending), progressSteps.length, progressKind ?? 'idle')

  if (activeQuestion) {
    return (
      <div className="space-y-3 px-1 py-1 text-sm leading-6 text-[var(--glass-text-primary)]">
        <div className="flex items-center gap-3 text-base font-semibold">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--glass-text-primary)]" aria-hidden="true" />
          <span>{t('panel.editFirstStatusAnswering')}</span>
        </div>
        <div className="rounded-[22px] border border-[var(--glass-stroke-base)] bg-white/86 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-[var(--glass-text-tertiary)]">
              {t('panel.briefQuestionBadge')}
            </p>
          </div>
          <p className="mb-3 text-base font-semibold leading-7 text-[var(--glass-text-primary)]">
            {activeQuestion.label}
          </p>
          <div className="space-y-2">
            {activeQuestion.options.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={pending}
                onClick={() => onSelectOption(option.id)}
                className="block w-full rounded-[16px] border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-[var(--glass-text-secondary)] transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {option.id}: {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!progressKind) return null

  const title = progressKind === 'briefQuestions'
    ? t('panel.editFirstStatusBriefQuestions')
    : t('panel.editFirstStatusEditScript')
  const description = progressKind === 'briefQuestions'
    ? t('panel.editFirstProgress.briefQuestions.description')
    : t('panel.editFirstProgress.editScript.description')
  const currentStep = progressSteps[progressStepIndex] ?? progressSteps[0] ?? title

  return (
    <div className="space-y-4 px-1 py-1 text-sm leading-6 text-[var(--glass-text-primary)]">
      <div className="flex items-center gap-3 text-base font-semibold">
        <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[var(--glass-text-primary)]" aria-hidden="true" />
        <span>{title}</span>
      </div>
      <p className="text-sm leading-7 text-[var(--glass-text-tertiary)]">
        {description}
      </p>
      <div className="space-y-2 rounded-[22px] border border-[var(--glass-stroke-base)] bg-white/78 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
        <div className="text-sm font-semibold text-[var(--glass-text-primary)]">
          {t('panel.editFirstProgress.currentStep', { step: currentStep })}
        </div>
        <div className="space-y-1.5">
          {progressSteps.map((step, index) => (
            <div
              key={step}
              className={`flex items-center gap-2 text-xs ${index === progressStepIndex ? 'font-semibold text-[var(--glass-text-primary)]' : 'text-[var(--glass-text-tertiary)]'}`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${index === progressStepIndex ? 'bg-[var(--glass-text-primary)]' : 'bg-slate-300'}`}
                aria-hidden="true"
              />
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
