'use client'

import { useEffect, useState } from 'react'
import { useLocale } from 'next-intl'

import { AppIcon } from '@/components/ui/icons'
import { announcementToneClass } from './announcement-styles'
import type { AnnouncementItem } from './types'

function dismissedKey(id: string) {
  return `director-announcement-dismissed:${id}`
}

export function AnnouncementBanner() {
  const locale = useLocale()
  const [items, setItems] = useState<AnnouncementItem[]>([])

  useEffect(() => {
    let mounted = true
    fetch(`/api/announcements?surface=top_banner&locale=${encodeURIComponent(locale)}`, { headers: { Accept: 'application/json' } })
      .then(response => response.ok ? response.json() : { items: [] })
      .then((payload: { items?: AnnouncementItem[] }) => {
        if (!mounted) return
        const visibleItems = (payload.items || []).filter(item => !localStorage.getItem(dismissedKey(item.id)))
        setItems(visibleItems)
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
    <div className="fixed inset-x-0 top-0 z-[80] space-y-2 px-3 py-3">
      {items.map(item => (
        <div
          key={item.id}
          className={`mx-auto flex max-w-5xl items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur ${announcementToneClass(item.severity)}`}
        >
          <AppIcon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{item.title}</div>
            <div className="mt-1 text-xs leading-5 opacity-90">{item.body}</div>
          </div>
          {item.ctaHref && item.ctaLabel ? (
            <a
              className="shrink-0 rounded-md border border-white/20 px-2 py-1 text-xs font-medium hover:bg-white/10"
              href={item.ctaHref}
            >
              {item.ctaLabel}
            </a>
          ) : null}
          {item.dismissible ? (
            <button
              type="button"
              className="shrink-0 rounded-md p-1 hover:bg-white/10"
              onClick={() => {
                localStorage.setItem(dismissedKey(item.id), '1')
                setItems(current => current.filter(currentItem => currentItem.id !== item.id))
              }}
              title="关闭"
            >
              <AppIcon name="close" className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}
