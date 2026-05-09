'use client'

import React from 'react'
import { useTranslations } from 'next-intl'

interface EditFirstComposerProps {
  readonly episodeId?: string
  readonly value: string
  readonly error: string | null
  readonly pending: boolean
  readonly onChange: (value: string) => void
  readonly onSubmit: () => Promise<void>
}

export function EditFirstComposer({
  episodeId,
  value,
  error,
  pending,
  onChange,
  onSubmit,
}: EditFirstComposerProps) {
  const t = useTranslations('assistantAgent')

  return (
    <div>
      <textarea
        rows={1}
        value={value}
        disabled={pending}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('panel.composerPlaceholder')}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey) return
          event.preventDefault()
          void onSubmit()
        }}
        className="max-h-[5.5rem] min-h-9 w-full resize-none overflow-y-auto rounded-[14px] bg-[var(--glass-bg-muted)] px-3.5 py-2 text-sm leading-5 text-[var(--glass-text-primary)] outline-none [field-sizing:content] placeholder:text-[var(--glass-text-tertiary)] disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-[var(--glass-text-tertiary)]">
          {error || t('panel.editFirstHint')}
        </p>
        <button
          type="button"
          disabled={!episodeId || !value.trim() || pending}
          onClick={() => { void onSubmit() }}
          className="h-10 shrink-0 rounded-[14px] bg-[var(--glass-text-primary)] px-4 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('panel.send')}
        </button>
      </div>
    </div>
  )
}
