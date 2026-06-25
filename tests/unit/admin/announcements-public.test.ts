import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPublicAnnouncements } from '@/lib/announcements/public'

const prismaMock = vi.hoisted(() => ({
  adminAnnouncement: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('public announcements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      role: 'user',
      adminGroupKey: 'vip',
    })
  })

  it('returns only current surface, locale, time window, and user group matches', async () => {
    prismaMock.adminAnnouncement.findMany.mockResolvedValue([
      {
        id: 'a1',
        title: 'VIP 公告',
        body: 'body',
        type: 'general',
        severity: 'info',
        status: 'published',
        locale: 'zh',
        surface: 'workspace_notice',
        audience: 'group',
        groupKeys: 'vip',
        targetUserIds: null,
        startsAt: null,
        endsAt: null,
        dismissible: true,
        ctaLabel: null,
        ctaHref: null,
        updatedAt: new Date('2026-06-24T00:00:00.000Z'),
        createdBy: 'owner-1',
        updatedBy: 'owner-1',
      },
    ])

    const result = await getPublicAnnouncements({
      userId: 'u1',
      locale: 'zh',
      surface: 'workspace_notice',
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      id: 'a1',
      title: 'VIP 公告',
      body: 'body',
    })
    expect(JSON.stringify(result)).not.toContain('createdBy')
    expect(JSON.stringify(result)).not.toContain('updatedBy')
    expect(JSON.stringify(result)).not.toContain('groupKeys')
    expect(JSON.stringify(result)).not.toContain('targetUserIds')
  })

  it('filters announcements outside user audience and active time window', async () => {
    prismaMock.adminAnnouncement.findMany.mockResolvedValue([
      {
        id: 'future',
        title: '未开始',
        body: 'body',
        type: 'general',
        severity: 'info',
        status: 'published',
        locale: 'zh',
        surface: 'workspace_notice',
        audience: 'all',
        groupKeys: null,
        targetUserIds: null,
        startsAt: new Date('2026-06-25T00:00:00.000Z'),
        endsAt: null,
        dismissible: true,
        ctaLabel: null,
        ctaHref: null,
        updatedAt: new Date('2026-06-24T00:00:00.000Z'),
      },
      {
        id: 'expired',
        title: '已过期',
        body: 'body',
        type: 'general',
        severity: 'info',
        status: 'published',
        locale: 'zh',
        surface: 'workspace_notice',
        audience: 'all',
        groupKeys: null,
        targetUserIds: null,
        startsAt: null,
        endsAt: new Date('2026-06-23T00:00:00.000Z'),
        dismissible: true,
        ctaLabel: null,
        ctaHref: null,
        updatedAt: new Date('2026-06-24T00:00:00.000Z'),
      },
      {
        id: 'wrong-group',
        title: '普通组不可见',
        body: 'body',
        type: 'general',
        severity: 'info',
        status: 'published',
        locale: 'zh',
        surface: 'workspace_notice',
        audience: 'group',
        groupKeys: 'restricted',
        targetUserIds: null,
        startsAt: null,
        endsAt: null,
        dismissible: true,
        ctaLabel: null,
        ctaHref: null,
        updatedAt: new Date('2026-06-24T00:00:00.000Z'),
      },
    ])

    const result = await getPublicAnnouncements({
      userId: 'u1',
      locale: 'zh',
      surface: 'workspace_notice',
      now: new Date('2026-06-24T12:00:00.000Z'),
    })

    expect(result.items).toEqual([])
  })
})
