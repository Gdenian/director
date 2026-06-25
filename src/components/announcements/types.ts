export interface AnnouncementItem {
  id: string
  title: string
  body: string
  severity: string
  dismissible: boolean
  ctaLabel: string | null
  ctaHref: string | null
}

