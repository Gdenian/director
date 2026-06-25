import { prisma } from '@/lib/prisma'
import { audienceMatches, parseList, withinWindow } from '@/lib/admin/audience'

export type PublicAnnouncementSurface = 'top_banner' | 'modal' | 'workspace_notice' | 'profile_message'

type PublicAnnouncementRecord = {
  id: string
  title: string
  body: string
  type: string
  severity: string
  status: string
  locale: string
  surface: string
  audience: string
  groupKeys: string | null
  targetUserIds: string | null
  startsAt: Date | null
  endsAt: Date | null
  dismissible: boolean
  ctaLabel: string | null
  ctaHref: string | null
  updatedAt: Date
}

function isPublicAnnouncementSurface(value: string): value is PublicAnnouncementSurface {
  return value === 'top_banner'
    || value === 'modal'
    || value === 'workspace_notice'
    || value === 'profile_message'
}

async function getAudienceContext(userId?: string | null) {
  if (!userId) return { userId: null, role: 'user', groupKey: null }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, adminGroupKey: true },
  })
  return {
    userId,
    role: user?.role || 'user',
    groupKey: user?.adminGroupKey || null,
  }
}

function serializePublicAnnouncement(item: PublicAnnouncementRecord) {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    type: item.type,
    severity: item.severity,
    locale: item.locale,
    surface: item.surface,
    dismissible: item.dismissible,
    ctaLabel: item.ctaLabel,
    ctaHref: item.ctaHref,
    updatedAt: item.updatedAt.toISOString(),
  }
}

export async function getPublicAnnouncements(context: {
  userId?: string | null
  locale: string
  surface?: PublicAnnouncementSurface
  now?: Date
}) {
  const now = context.now || new Date()
  const surface = context.surface || 'top_banner'
  const audienceContext = await getAudienceContext(context.userId)

  const items = await prisma.adminAnnouncement.findMany({
    where: {
      status: 'published',
      surface,
      OR: [
        { locale: 'all' },
        { locale: context.locale },
      ],
      AND: [
        {
          OR: [
            { startsAt: null },
            { startsAt: { lte: now } },
          ],
        },
        {
          OR: [
            { endsAt: null },
            { endsAt: { gte: now } },
          ],
        },
      ],
    },
    orderBy: [
      { severity: 'desc' },
      { updatedAt: 'desc' },
    ],
    take: 3,
    select: {
      id: true,
      title: true,
      body: true,
      type: true,
      severity: true,
      status: true,
      locale: true,
      surface: true,
      audience: true,
      groupKeys: true,
      targetUserIds: true,
      startsAt: true,
      endsAt: true,
      dismissible: true,
      ctaLabel: true,
      ctaHref: true,
      updatedAt: true,
    },
  })

  return {
    items: (items as PublicAnnouncementRecord[])
      .filter(item => withinWindow(item, now))
      .filter(item => audienceMatches({
        audience: item.audience,
        groupKeys: parseList(item.groupKeys),
        targetUserIds: parseList(item.targetUserIds),
      }, audienceContext))
      .map(serializePublicAnnouncement),
  }
}

export async function listVisibleTopAnnouncements(locale: string, role = 'user') {
  const result = await getPublicAnnouncements({
    userId: null,
    locale,
    surface: 'top_banner',
  })
  if (role === 'admin' || role === 'owner') return result.items
  return result.items
}

export function normalizePublicAnnouncementSurface(value: string | null): PublicAnnouncementSurface {
  return value && isPublicAnnouncementSurface(value) ? value : 'top_banner'
}
