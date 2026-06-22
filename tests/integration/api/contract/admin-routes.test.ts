import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { ROUTE_CATALOG } from '../../../contracts/route-catalog'
import {
  installAuthMocks,
  mockAuthenticatedRole,
  mockUnauthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'
import { buildMockRequest } from '../../../helpers/request'

installAuthMocks()

const overviewMock = vi.hoisted(() => ({
  getAdminOverview: vi.fn(async () => ({ totalUsers: 2 })),
}))

const usersMock = vi.hoisted(() => ({
  listAdminUsers: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20 })),
  updateAdminUserAccess: vi.fn(async (_userId: string, input: { role?: string, status?: string }) => ({
    id: 'user-2',
    role: input.role ?? 'user',
    status: input.status ?? 'active',
  })),
}))

const billingMock = vi.hoisted(() => ({
  getAdminBillingSummary: vi.fn(async () => ({
    totals: { balance: '0', frozenAmount: '0', totalSpent: '0' },
    recentTransactions: { items: [], total: 0, page: 1, pageSize: 20 },
    freezesByStatus: [],
  })),
}))

const tasksMock = vi.hoisted(() => ({
  listAdminTasks: vi.fn(async () => ({
    items: [{
      id: 'task-1',
      status: 'queued',
      type: 'image',
      hasPayload: true,
      hasResult: true,
      billingModel: 'model-a',
    }],
    total: 1,
    page: 1,
    pageSize: 50,
  })),
  cancelAdminTask: vi.fn(async () => ({
    cancelled: true,
    task: { id: 'task-1', hasPayload: true, hasResult: false },
  })),
}))

const modelsMock = vi.hoisted(() => ({
  getAdminModelHealth: vi.fn(async () => ({ usageByModel: [], taskHealthByType: [] })),
}))

const systemHealthMock = vi.hoisted(() => ({
  getAdminSystemHealth: vi.fn(async () => ({
    database: { status: 'ok' },
    logs: { status: 'ok' },
    checkedAt: '2026-06-22T00:00:00.000Z',
  })),
}))

const auditMock = vi.hoisted(() => ({
  writeAdminAuditLog: vi.fn(async () => ({ id: 'audit-1' })),
}))

const prismaMock = vi.hoisted(() => ({
  adminAuditLog: {
    findMany: vi.fn(async (args?: { select?: Record<string, boolean> }) => {
      const row = {
        id: 'audit-1',
        actorUserId: 'admin-1',
        actorRole: 'admin',
        action: 'task.cancel',
        targetType: 'task',
        targetId: 'task-1',
        beforeJson: null,
        afterJson: { cancelled: true },
        reason: 'stuck',
        ip: '203.0.113.12',
        userAgent: 'vitest-admin-client',
        createdAt: new Date('2026-06-22T00:00:00.000Z'),
      }

      if (!args?.select) return [row]

      return [Object.fromEntries(
        Object.entries(row).filter(([key]) => args.select?.[key]),
      )]
    }),
    count: vi.fn(async () => 1),
  },
}))

vi.mock('@/lib/admin/overview', () => overviewMock)
vi.mock('@/lib/admin/users', () => usersMock)
vi.mock('@/lib/admin/billing', () => billingMock)
vi.mock('@/lib/admin/tasks', () => tasksMock)
vi.mock('@/lib/admin/models', () => modelsMock)
vi.mock('@/lib/admin/system-health', () => systemHealthMock)
vi.mock('@/lib/admin/audit', () => auditMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('api contract - admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAuthMockState()
    installAuthMocks()
    vi.resetModules()
  })

  afterEach(() => {
    resetAuthMockState()
    vi.resetModules()
  })

  it('admin route group exists in route catalog', () => {
    const adminRoutes = ROUTE_CATALOG
      .filter((entry) => entry.contractGroup === 'admin-routes')
      .map((entry) => entry.routeFile)

    expect(adminRoutes).toEqual(expect.arrayContaining([
      'src/app/api/admin/overview/route.ts',
      'src/app/api/admin/users/route.ts',
      'src/app/api/admin/users/[userId]/route.ts',
      'src/app/api/admin/billing/route.ts',
      'src/app/api/admin/tasks/route.ts',
      'src/app/api/admin/tasks/[taskId]/route.ts',
      'src/app/api/admin/models/route.ts',
      'src/app/api/admin/system-health/route.ts',
      'src/app/api/admin/audit-logs/route.ts',
      'src/app/api/admin/download-logs/route.ts',
    ]))
  })

  it('GET /api/admin/overview enforces admin auth and calls overview service', async () => {
    const mod = await import('@/app/api/admin/overview/route')
    const req = buildMockRequest({ path: '/api/admin/overview', method: 'GET' })

    mockUnauthenticated()
    expect((await mod.GET(req, { params: Promise.resolve({}) })).status).toBe(401)

    mockAuthenticatedRole('user-1', 'user')
    expect((await mod.GET(req, { params: Promise.resolve({}) })).status).toBe(403)

    mockAuthenticatedRole('admin-1', 'admin')
    const res = await mod.GET(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ totalUsers: 2 })
    expect(overviewMock.getAdminOverview).toHaveBeenCalledTimes(1)
  })

  it('GET /api/admin/users passes normalized query params to listAdminUsers', async () => {
    mockAuthenticatedRole('admin-1', 'admin')
    const mod = await import('@/app/api/admin/users/route')
    const req = buildMockRequest({
      path: '/api/admin/users?search=alice&role=admin&status=active&page=2&pageSize=10',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(200)
    expect(usersMock.listAdminUsers).toHaveBeenCalledWith({
      search: 'alice',
      role: 'admin',
      status: 'active',
      page: 2,
      pageSize: 10,
    })
  })

  it('PATCH /api/admin/users/[userId] requires owner and writes audit log', async () => {
    const mod = await import('@/app/api/admin/users/[userId]/route')
    const context = { params: Promise.resolve({ userId: 'user-2' }) }

    mockAuthenticatedRole('admin-1', 'admin')
    const adminRes = await mod.PATCH(
      buildMockRequest({ path: '/api/admin/users/user-2', method: 'PATCH', body: { role: 'admin' } }),
      context,
    )
    expect(adminRes.status).toBe(403)

    mockAuthenticatedRole('owner-1', 'owner')
    const ownerRes = await mod.PATCH(
      buildMockRequest({
        path: '/api/admin/users/user-2',
        method: 'PATCH',
        body: { role: 'admin', status: 'disabled', reason: 'policy' },
        headers: {
          'x-forwarded-for': '203.0.113.10, 10.0.0.1',
          'user-agent': 'vitest-admin-client',
        },
      }),
      context,
    )

    expect(ownerRes.status).toBe(200)
    expect(usersMock.updateAdminUserAccess).toHaveBeenCalledWith('user-2', {
      role: 'admin',
      status: 'disabled',
    })
    expect(auditMock.writeAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actor: { id: 'owner-1', role: 'owner' },
      action: 'user.access.update',
      targetType: 'user',
      targetId: 'user-2',
      before: null,
      after: { role: 'admin', status: 'disabled' },
      reason: 'policy',
      ip: '203.0.113.10',
      userAgent: 'vitest-admin-client',
    }))
  })

  it('PATCH /api/admin/users/[userId] treats non-object JSON bodies as empty objects', async () => {
    mockAuthenticatedRole('owner-1', 'owner')
    const mod = await import('@/app/api/admin/users/[userId]/route')
    const res = await mod.PATCH(
      buildMockRequest({ path: '/api/admin/users/user-2', method: 'PATCH', body: null }),
      { params: Promise.resolve({ userId: 'user-2' }) },
    )

    expect(res.status).toBe(200)
    expect(usersMock.updateAdminUserAccess).toHaveBeenCalledWith('user-2', {})
  })

  it('PATCH /api/admin/users/[userId] treats invalid JSON bodies as empty objects', async () => {
    mockAuthenticatedRole('owner-1', 'owner')
    const mod = await import('@/app/api/admin/users/[userId]/route')
    const res = await mod.PATCH(
      new NextRequest('http://localhost:3000/api/admin/users/user-2', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
      { params: Promise.resolve({ userId: 'user-2' }) },
    )

    expect(res.status).toBe(200)
    expect(usersMock.updateAdminUserAccess).toHaveBeenCalledWith('user-2', {})
  })

  it('PATCH /api/admin/users/[userId] ignores primitive bodies and non-string reasons', async () => {
    mockAuthenticatedRole('owner-1', 'owner')
    const mod = await import('@/app/api/admin/users/[userId]/route')

    const stringBodyRes = await mod.PATCH(
      buildMockRequest({ path: '/api/admin/users/user-2', method: 'PATCH', body: 'role=admin' }),
      { params: Promise.resolve({ userId: 'user-2' }) },
    )
    const numberBodyRes = await mod.PATCH(
      buildMockRequest({ path: '/api/admin/users/user-2', method: 'PATCH', body: 123 }),
      { params: Promise.resolve({ userId: 'user-2' }) },
    )
    const nonStringReasonRes = await mod.PATCH(
      buildMockRequest({
        path: '/api/admin/users/user-2',
        method: 'PATCH',
        body: { role: 'admin', reason: 123 },
      }),
      { params: Promise.resolve({ userId: 'user-2' }) },
    )

    expect(stringBodyRes.status).toBe(200)
    expect(numberBodyRes.status).toBe(200)
    expect(nonStringReasonRes.status).toBe(200)
    expect(usersMock.updateAdminUserAccess).toHaveBeenNthCalledWith(1, 'user-2', {})
    expect(usersMock.updateAdminUserAccess).toHaveBeenNthCalledWith(2, 'user-2', {})
    expect(auditMock.writeAdminAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({
      reason: null,
    }))
  })

  it('GET /api/admin/tasks returns redacted task summaries', async () => {
    mockAuthenticatedRole('admin-1', 'admin')
    const mod = await import('@/app/api/admin/tasks/route')
    const req = buildMockRequest({
      path: '/api/admin/tasks?status=queued,failed&type=image,video&userId=user-1&projectId=project-1&page=3&pageSize=25',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({}) })
    const jsonText = JSON.stringify(await res.json())

    expect(res.status).toBe(200)
    expect(tasksMock.listAdminTasks).toHaveBeenCalledWith({
      status: ['queued', 'failed'],
      type: ['image', 'video'],
      userId: 'user-1',
      projectId: 'project-1',
      page: 3,
      pageSize: 25,
    })
    expect(jsonText).not.toContain('payload')
    expect(jsonText).not.toContain('result')
    expect(jsonText).not.toContain('dedupeKey')
    expect(jsonText).not.toContain('private prompt')
  })

  it('POST /api/admin/tasks/[taskId] requires owner, cancels task, and audits', async () => {
    const mod = await import('@/app/api/admin/tasks/[taskId]/route')
    const context = { params: Promise.resolve({ taskId: 'task-1' }) }

    mockAuthenticatedRole('admin-1', 'admin')
    const adminRes = await mod.POST(
      buildMockRequest({ path: '/api/admin/tasks/task-1', method: 'POST', body: { reason: 'stuck' } }),
      context,
    )
    expect(adminRes.status).toBe(403)

    mockAuthenticatedRole('owner-1', 'owner')
    const ownerRes = await mod.POST(
      buildMockRequest({
        path: '/api/admin/tasks/task-1',
        method: 'POST',
        body: { reason: 'stuck' },
        headers: {
          'x-forwarded-for': '198.51.100.7, 10.0.0.2',
          'user-agent': 'vitest-owner-client',
        },
      }),
      context,
    )

    expect(ownerRes.status).toBe(200)
    expect(tasksMock.cancelAdminTask).toHaveBeenCalledWith('task-1', 'stuck')
    expect(auditMock.writeAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actor: { id: 'owner-1', role: 'owner' },
      action: 'task.cancel',
      targetType: 'task',
      targetId: 'task-1',
      after: { cancelled: true },
      reason: 'stuck',
      ip: '198.51.100.7',
      userAgent: 'vitest-owner-client',
    }))
  })

  it('POST /api/admin/tasks/[taskId] treats non-object JSON bodies as empty objects', async () => {
    mockAuthenticatedRole('owner-1', 'owner')
    const mod = await import('@/app/api/admin/tasks/[taskId]/route')
    const res = await mod.POST(
      buildMockRequest({ path: '/api/admin/tasks/task-1', method: 'POST', body: null }),
      { params: Promise.resolve({ taskId: 'task-1' }) },
    )

    expect(res.status).toBe(200)
    expect(tasksMock.cancelAdminTask).toHaveBeenCalledWith('task-1', '')
  })

  it('POST /api/admin/tasks/[taskId] falls back to x-real-ip and null audit reason for non-string reasons', async () => {
    mockAuthenticatedRole('owner-1', 'owner')
    const mod = await import('@/app/api/admin/tasks/[taskId]/route')
    const res = await mod.POST(
      buildMockRequest({
        path: '/api/admin/tasks/task-1',
        method: 'POST',
        body: { reason: 123 },
        headers: {
          'x-real-ip': '192.0.2.44',
          'user-agent': 'vitest-real-ip-client',
        },
      }),
      { params: Promise.resolve({ taskId: 'task-1' }) },
    )

    expect(res.status).toBe(200)
    expect(tasksMock.cancelAdminTask).toHaveBeenCalledWith('task-1', '')
    expect(auditMock.writeAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      reason: null,
      ip: '192.0.2.44',
      userAgent: 'vitest-real-ip-client',
    }))
  })

  it('GET /api/admin/audit-logs returns admin-readable paginated audit logs', async () => {
    mockAuthenticatedRole('admin-1', 'admin')
    const mod = await import('@/app/api/admin/audit-logs/route')
    const req = buildMockRequest({ path: '/api/admin/audit-logs?page=2&pageSize=5', method: 'GET' })

    const res = await mod.GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toMatchObject({ total: 1, page: 2, pageSize: 5 })
    expect(JSON.stringify(json)).not.toContain('beforeJson')
    expect(JSON.stringify(json)).not.toContain('afterJson')
    expect(prismaMock.adminAuditLog.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      skip: 5,
      take: 5,
      select: {
        id: true,
        actorUserId: true,
        actorRole: true,
        action: true,
        targetType: true,
        targetId: true,
        reason: true,
        ip: true,
        userAgent: true,
        createdAt: true,
      },
    })
  })
})
