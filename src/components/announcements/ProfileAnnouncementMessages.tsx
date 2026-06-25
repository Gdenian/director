'use client'

import { useEffect, useState } from 'react'
import { useLocale } from 'next-intl'

import { AppIcon } from '@/components/ui/icons'
import { announcementToneClass } from './announcement-styles'
import type { AnnouncementItem } from './types'

export function ProfileAnnouncementMessages() {
  const locale = useLocale()
  const [items, setItems] = useState<AnnouncementItem[]>([])

  useEffect(() => {
    let mounted = true
    fetch(`/api/announcements?surface=profile_message&locale=${encodeURIComponent(locale)}`, { headers: { Accept: 'application/json' } })
      .then(response => response.ok ? response.json() : { items: [] })
      .then((payload: { items?: AnnouncementItem[] }) => {
        if (mounted) setItems(payload.items || [])
      })
      .catch(() => {
        if (mounted) setItems([])
      })

    return () => {
      mounted = false
    }
  }, [locale])

  if (items.length === 0) return null

  return (
    <div className="mb-5 space-y-2">
      {items.map(item => (
        <div key={item.id} className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${announcementToneClass(item.severity)}`}>
          <AppIcon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{item.title}</div>
            <div className="mt-1 text-xs leading-5 opacity-90">{item.body}</div>
          </div>
          {item.ctaHref && item.ctaLabel ? (
            <a className="shrink-0 rounded-md border border-current/20 px-2 py-1 text-xs font-medium hover:bg-white/10" href={item.ctaHref}>
              {item.ctaLabel}
            </a>
          ) : null}
        </div>
      ))}
    </div>
  )
}

