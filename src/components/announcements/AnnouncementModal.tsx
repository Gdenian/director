'use client'

import { useEffect, useState } from 'react'
import { useLocale } from 'next-intl'

import { AppIcon } from '@/components/ui/icons'
import type { AnnouncementItem } from './types'

function dismissedKey(id: string) {
  return `director-announcement-modal-dismissed:${id}`
}

export function AnnouncementModal() {
  const locale = useLocale()
  const [item, setItem] = useState<AnnouncementItem | null>(null)

  useEffect(() => {
    let mounted = true
    fetch(`/api/announcements?surface=modal&locale=${encodeURIComponent(locale)}`, { headers: { Accept: 'application/json' } })
      .then(response => response.ok ? response.json() : { items: [] })
      .then((payload: { items?: AnnouncementItem[] }) => {
        if (!mounted) return
        const next = (payload.items || []).find(announcement => !localStorage.getItem(dismissedKey(announcement.id)))
        setItem(next || null)
      })
      .catch(() => {
        if (mounted) setItem(null)
      })

    return () => {
      mounted = false
    }
  }, [locale])

  if (!item) return null

  const close = () => {
    localStorage.setItem(dismissedKey(item.id), '1')
    setItem(null)
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-elevated)] p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]">
            <AppIcon name="alert" className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-[var(--glass-text-primary)]">{item.title}</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--glass-text-secondary)]">{item.body}</p>
          </div>
          {item.dismissible ? (
            <button
              type="button"
              className="rounded-md p-1 text-[var(--glass-text-tertiary)] hover:bg-[var(--glass-bg-muted)] hover:text-[var(--glass-text-primary)]"
              onClick={close}
              title="关闭"
            >
              <AppIcon name="close" className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          {item.ctaHref && item.ctaLabel ? (
            <a className="glass-btn-base glass-btn-primary px-4 py-2 text-sm" href={item.ctaHref}>
              {item.ctaLabel}
            </a>
          ) : null}
          {item.dismissible ? (
            <button type="button" className="glass-btn-base glass-btn-secondary px-4 py-2 text-sm" onClick={close}>
              知道了
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

