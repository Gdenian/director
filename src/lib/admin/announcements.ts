import { prisma } from '@/lib/prisma'

import { parseList } from './audience'
import {
  booleanValue,
  clampPage,
  clampPageSize,
  enumValue,
  optionalDate,
  optionalString,
  requiredString,
} from './operation-utils'

const ANNOUNCEMENT_TYPES = ['general', 'maintenance', 'incident', 'billing', 'release', 'campaign'] as const
const ANNOUNCEMENT_SEVERITIES = ['info', 'warning', 'critical'] as const
const ANNOUNCEMENT_STATUSES = ['draft', 'scheduled', 'published', 'paused', 'archived'] as const
const ANNOUNCEMENT_LOCALES = ['all', 'zh', 'en'] as const
const ANNOUNCEMENT_SURFACES = ['top_banner', 'modal', 'workspace_notice', 'profile_message'] as const
const ANNOUNCEMENT_AUDIENCES = ['all', 'admins', 'test_users', 'vip', 'restricted', 'group', 'target_users'] as const

type AnnouncementImpactRecord = {
  surface?: unknown
  surfaces?: unknown
  groupKeys?: unknown
  targetUserIds?: unknown
}

export interface ListAdminAnnouncementsParams {
  status?: string | null
  type?: string | null
  page?: number | null
  pageSize?: number | null
}

export interface AdminAnnouncementInput {
  title?: unknown
  body?: unknown
  type?: unknown
  severity?: unknown
  status?: unknown
  locale?: unknown
  surface?: unknown
  audience?: unknown
  startsAt?: unknown
  endsAt?: unknown
  dismissible?: unknown
  ctaLabel?: unknown
  ctaHref?: unknown
  groupKeys?: unknown
  targetUserIds?: unknown
  ctaVariant?: unknown
  publishedAt?: unknown
  archivedAt?: unknown
  createdBy?: string | null
  updatedBy?: string | null
}

function impactSummary(item: AnnouncementImpactRecord) {
  const surfaces = parseList(item.surfaces)
  const surface = typeof item.surface === 'string' && item.surface.trim() ? [item.surface.trim()] : []
  return {
    surfaces: surfaces.length > 0 ? surfaces : surface,
    groupKeys: parseList(item.groupKeys),
    targetUserCount: parseList(item.targetUserIds).length,
  }
}

function serializeAnnouncement<T extends {
  createdAt: Date
  updatedAt: Date
  startsAt: Date | null
  endsAt: Date | null
  publishedAt?: Date | null
  archivedAt?: Date | null
  surface?: unknown
  surfaces?: unknown
  groupKeys?: unknown
  targetUserIds?: unknown
}>(announcement: T) {
  return {
    ...announcement,
    startsAt: announcement.startsAt?.toISOString() ?? null,
    endsAt: announcement.endsAt?.toISOString() ?? null,
    publishedAt: announcement.publishedAt?.toISOString() ?? null,
    archivedAt: announcement.archivedAt?.toISOString() ?? null,
    createdAt: announcement.createdAt.toISOString(),
    updatedAt: announcement.updatedAt.toISOString(),
    impactSummary: impactSummary(announcement),
  }
}

function parseAnnouncementCreateInput(input: AdminAnnouncementInput) {
  const status = enumValue(input.status, ANNOUNCEMENT_STATUSES, 'draft')
  return {
    title: requiredString(input.title, 'title'),
    body: requiredString(input.body, 'body'),
    type: enumValue(input.type, ANNOUNCEMENT_TYPES, 'general'),
    severity: enumValue(input.severity, ANNOUNCEMENT_SEVERITIES, 'info'),
    status,
    locale: enumValue(input.locale, ANNOUNCEMENT_LOCALES, 'all'),
    surface: enumValue(input.surface, ANNOUNCEMENT_SURFACES, 'top_banner'),
    audience: enumValue(input.audience, ANNOUNCEMENT_AUDIENCES, 'all'),
    startsAt: optionalDate(input.startsAt),
    endsAt: optionalDate(input.endsAt),
    dismissible: booleanValue(input.dismissible, true),
    ctaLabel: optionalString(input.ctaLabel),
    ctaHref: optionalString(input.ctaHref),
    groupKeys: optionalString(input.groupKeys),
    targetUserIds: optionalString(input.targetUserIds),
    ctaVariant: optionalString(input.ctaVariant),
    publishedAt: optionalDate(input.publishedAt) ?? (status === 'published' ? new Date() : null),
    archivedAt: optionalDate(input.archivedAt) ?? (status === 'archived' ? new Date() : null),
    createdBy: optionalString(input.createdBy),
    updatedBy: optionalString(input.updatedBy),
  }
}

function parseAnnouncementUpdateInput(input: AdminAnnouncementInput) {
  const nextStatus = input.status !== undefined ? enumValue(input.status, ANNOUNCEMENT_STATUSES, 'draft') : null
  const data = {
    ...(input.title !== undefined ? { title: requiredString(input.title, 'title') } : {}),
    ...(input.body !== undefined ? { body: requiredString(input.body, 'body') } : {}),
    ...(input.type !== undefined ? { type: enumValue(input.type, ANNOUNCEMENT_TYPES, 'general') } : {}),
    ...(input.severity !== undefined ? { severity: enumValue(input.severity, ANNOUNCEMENT_SEVERITIES, 'info') } : {}),
    ...(nextStatus ? { status: nextStatus } : {}),
    ...(input.locale !== undefined ? { locale: enumValue(input.locale, ANNOUNCEMENT_LOCALES, 'all') } : {}),
    ...(input.surface !== undefined ? { surface: enumValue(input.surface, ANNOUNCEMENT_SURFACES, 'top_banner') } : {}),
    ...(input.audience !== undefined ? { audience: enumValue(input.audience, ANNOUNCEMENT_AUDIENCES, 'all') } : {}),
    ...(input.startsAt !== undefined ? { startsAt: optionalDate(input.startsAt) } : {}),
    ...(input.endsAt !== undefined ? { endsAt: optionalDate(input.endsAt) } : {}),
    ...(input.dismissible !== undefined ? { dismissible: booleanValue(input.dismissible, true) } : {}),
    ...(input.ctaLabel !== undefined ? { ctaLabel: optionalString(input.ctaLabel) } : {}),
    ...(input.ctaHref !== undefined ? { ctaHref: optionalString(input.ctaHref) } : {}),
    ...(input.groupKeys !== undefined ? { groupKeys: optionalString(input.groupKeys) } : {}),
    ...(input.targetUserIds !== undefined ? { targetUserIds: optionalString(input.targetUserIds) } : {}),
    ...(input.ctaVariant !== undefined ? { ctaVariant: optionalString(input.ctaVariant) } : {}),
    ...(input.publishedAt !== undefined ? { publishedAt: optionalDate(input.publishedAt) } : {}),
    ...(input.archivedAt !== undefined ? { archivedAt: optionalDate(input.archivedAt) } : {}),
    ...(input.createdBy !== undefined ? { createdBy: optionalString(input.createdBy) } : {}),
    ...(input.updatedBy !== undefined ? { updatedBy: optionalString(input.updatedBy) } : {}),
  }

  if (Object.keys(data).length === 0) {
    throw new Error('At least one announcement field is required')
  }
  if (nextStatus === 'published' && input.publishedAt === undefined) {
    Object.assign(data, { publishedAt: new Date() })
  }
  if (nextStatus === 'archived' && input.archivedAt === undefined) {
    Object.assign(data, { archivedAt: new Date() })
  }
  return data
}

export async function listAdminAnnouncements(params: ListAdminAnnouncementsParams = {}) {
  const page = clampPage(params.page)
  const pageSize = clampPageSize(params.pageSize)
  const status = params.status ? enumValue(params.status, ANNOUNCEMENT_STATUSES, 'draft') : null
  const type = params.type ? enumValue(params.type, ANNOUNCEMENT_TYPES, 'general') : null
  const where = {
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
  }

  const [items, total] = await Promise.all([
    prisma.adminAnnouncement.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
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
        startsAt: true,
        endsAt: true,
        dismissible: true,
        ctaLabel: true,
        ctaHref: true,
        groupKeys: true,
        targetUserIds: true,
        ctaVariant: true,
        publishedAt: true,
        archivedAt: true,
        createdBy: true,
        updatedBy: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.adminAnnouncement.count({ where }),
  ])

  return {
    items: items.map(serializeAnnouncement),
    total,
    page,
    pageSize,
  }
}

export async function createAdminAnnouncement(input: AdminAnnouncementInput) {
  const announcement = await prisma.adminAnnouncement.create({
    data: parseAnnouncementCreateInput(input),
  })
  return serializeAnnouncement(announcement)
}

export async function updateAdminAnnouncement(id: string, input: AdminAnnouncementInput) {
  const announcement = await prisma.adminAnnouncement.update({
    where: { id },
    data: parseAnnouncementUpdateInput(input),
  })
  return serializeAnnouncement(announcement)
}
