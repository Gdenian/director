import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  installAuthMocks,
  mockAuthenticatedRole,
  mockUnauthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'
import { buildMockRequest } from '../../../helpers/request'

installAuthMocks()

const announcementsMock = vi.hoisted(() => ({
  getPublicAnnouncements: vi.fn(async () => ({
    items: [{
      id: 'announcement-1',
      title: '维护公告',
      body: '今晚 23:00 维护',
      type: 'maintenance',
      severity: 'warning',
      locale: 'zh',
      surface: 'top_banner',
      dismissible: true,
      ctaLabel: null,
      ctaHref: null,
      updatedAt: '2026-06-23T00:00:00.000Z',
    }],
  })),
  normalizePublicAnnouncementSurface: vi.fn((value: string | null) => value || 'top_banner'),
}))

vi.mock('@/lib/announcements/public', () => announcementsMock)

describe('api contract - public announcements route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAuthMockState()
    installAuthMocks()
    vi.resetModules()
  })

  it('returns visible top announcements for the requested locale only as public fields', async () => {
    mockAuthenticatedRole('user-1', 'user')
    const mod = await import('@/app/api/announcements/route')
    const res = await mod.GET(
      buildMockRequest({ path: '/api/announcements?locale=zh', method: 'GET' }),
      { params: Promise.resolve({}) },
    )
    const json = await res.json()
    const jsonText = JSON.stringify(json)

    expect(res.status).toBe(200)
    expect(announcementsMock.getPublicAnnouncements).toHaveBeenCalledWith({
      userId: 'user-1',
      locale: 'zh',
      surface: 'top_banner',
    })
    expect(json.items[0]).toMatchObject({
      id: 'announcement-1',
      title: '维护公告',
        body: '今晚 23:00 维护',
        surface: 'top_banner',
        severity: 'warning',
        dismissible: true,
    })
    expect(jsonText).not.toContain('createdBy')
    expect(jsonText).not.toContain('updatedBy')
    expect(jsonText).not.toContain('audience')
  })

  it('passes explicit surface to public announcement service', async () => {
    announcementsMock.normalizePublicAnnouncementSurface.mockReturnValueOnce('workspace_notice')
    mockAuthenticatedRole('user-1', 'user')
    const mod = await import('@/app/api/announcements/route')
    const res = await mod.GET(
      buildMockRequest({ path: '/api/announcements?locale=zh&surface=workspace_notice', method: 'GET' }),
      { params: Promise.resolve({}) },
    )

    expect(res.status).toBe(200)
    expect(announcementsMock.normalizePublicAnnouncementSurface).toHaveBeenCalledWith('workspace_notice')
    expect(announcementsMock.getPublicAnnouncements).toHaveBeenCalledWith({
      userId: 'user-1',
      locale: 'zh',
      surface: 'workspace_notice',
    })
  })

  it('requires a logged-in user', async () => {
    mockUnauthenticated()
    const mod = await import('@/app/api/announcements/route')
    const res = await mod.GET(
      buildMockRequest({ path: '/api/announcements?locale=zh', method: 'GET' }),
      { params: Promise.resolve({}) },
    )

    expect(res.status).toBe(401)
  })
})
