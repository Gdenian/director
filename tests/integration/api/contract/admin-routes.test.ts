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
  parseAdminUserAccessUpdate: vi.fn((input: { role?: string, status?: string, adminGroupKey?: string | null, adminNote?: string | null, revokeSession?: boolean }) => {
    const hasRole = 'role' in input
    const hasStatus = 'status' in input
    const hasAdminGroupKey = 'adminGroupKey' in input
    const hasAdminNote = 'adminNote' in input
    const hasRevokeSession = 'revokeSession' in input
    if (!hasRole && !hasStatus && !hasAdminGroupKey && !hasAdminNote && !hasRevokeSession) throw new Error('At least one access field is required')
    if (hasRole && !['user', 'admin', 'owner'].includes(String(input.role))) throw new Error('Invalid user role')
    if (hasStatus && !['active', 'disabled'].includes(String(input.status))) throw new Error('Invalid user status')
    if (hasAdminGroupKey && input.adminGroupKey !== null && typeof input.adminGroupKey !== 'string') {
      throw new Error('Invalid admin group key')
    }
    if (hasAdminNote && input.adminNote !== null && typeof input.adminNote !== 'string') {
      throw new Error('Invalid admin note')
    }
    if (hasRevokeSession && input.revokeSession !== true) {
      throw new Error('Invalid revoke session flag')
    }
    return input
  }),
  getAdminUserAccessBefore: vi.fn(async (): Promise<{
    id: string
    role: string
    status: string
    adminGroupKey: string | null
    adminNote: string | null
    sessionVersion: number
  }> => ({
    id: 'user-2',
    role: 'user',
    status: 'active',
    adminGroupKey: 'free',
    adminNote: null,
    sessionVersion: 0,
  })),
  updateAdminUserAccess: vi.fn(async (_userId: string, input: { role?: string, status?: string, adminGroupKey?: string | null, adminNote?: string | null, revokeSession?: boolean }, context?: { actorId?: string }) => {
    const hasRole = 'role' in input
    const hasStatus = 'status' in input
    const hasAdminGroupKey = 'adminGroupKey' in input
    const hasAdminNote = 'adminNote' in input
    const hasRevokeSession = 'revokeSession' in input
    if (!hasRole && !hasStatus && !hasAdminGroupKey && !hasAdminNote && !hasRevokeSession) throw new Error('At least one access field is required')
    if (_userId === context?.actorId && input.role === 'owner') throw new Error('cannot promote self to owner')
    if (hasRole && !['user', 'admin', 'owner'].includes(String(input.role))) throw new Error('Invalid user role')
    if (hasStatus && !['active', 'disabled'].includes(String(input.status))) throw new Error('Invalid user status')
    return {
      id: 'user-2',
      role: input.role ?? 'user',
      status: input.status ?? 'active',
      adminGroupKey: input.adminGroupKey ?? 'free',
      adminNote: input.adminNote ?? null,
      sessionVersion: hasRevokeSession ? 5 : hasRole || hasStatus ? 1 : 0,
    }
  }),
}))

const billingMock = vi.hoisted(() => ({
  getAdminBillingSummary: vi.fn(async () => ({
    totals: { balance: '0', frozenAmount: '0', totalSpent: '0' },
    recentTransactions: { items: [], total: 0, page: 1, pageSize: 20 },
    freezesByStatus: [],
  })),
  manualCreditBalance: vi.fn(async () => ({
    transactionId: 'txn-credit-1',
    duplicated: false,
    balanceAfter: 10,
  })),
  manualDebitBalance: vi.fn(async () => ({
    transactionId: 'txn-debit-1',
    duplicated: false,
    balanceAfter: 7,
  })),
  releaseAdminFreeze: vi.fn(async () => ({
    released: true,
    transactionId: 'txn-freeze-1',
    userId: 'user-2',
    amount: 4,
    balanceAfter: 8,
  })),
  reconcileAdminOrder: vi.fn(async () => ({
    reconciled: true,
    orderId: 'order-1',
    userId: 'user-2',
    transactionId: 'txn-order-1',
    balanceAfter: 130,
  })),
  refundAdminOrder: vi.fn(async () => ({
    refunded: true,
    orderId: 'order-1',
    userId: 'user-2',
    transactionId: 'txn-refund-1',
    balanceAfter: 0,
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
    freezeRolledBack: true,
    task: { id: 'task-1', status: 'canceled', hasPayload: true, hasResult: false },
  })),
  createTaskIncident: vi.fn(async () => ({
    id: 'incident-1',
    title: '取消卡死任务',
    action: 'cancel',
    status: 'completed',
    reason: '队列事故',
    filter: { status: ['queued'], limit: 20 },
    createdBy: 'owner-1',
    completedAt: '2026-06-24T00:00:00.000Z',
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z',
    counts: { total: 1, completed: 1, failed: 0 },
    items: [{
      id: 'incident-item-1',
      incidentId: 'incident-1',
      taskId: 'task-1',
      status: 'completed',
      before: { id: 'task-1', status: 'queued', hasPayload: true, hasResult: false },
      after: { id: 'task-1', status: 'canceled', hasPayload: true, hasResult: false },
      errorMessage: null,
      createdAt: '2026-06-24T00:00:00.000Z',
      updatedAt: '2026-06-24T00:00:00.000Z',
    }],
  })),
  getTaskIncident: vi.fn(async () => ({
    id: 'incident-1',
    title: '取消卡死任务',
    action: 'cancel',
    status: 'completed',
    reason: '队列事故',
    filter: { status: ['queued'], limit: 20 },
    createdBy: 'owner-1',
    completedAt: '2026-06-24T00:00:00.000Z',
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z',
    counts: { total: 1, completed: 1, failed: 0 },
    items: [{
      id: 'incident-item-1',
      incidentId: 'incident-1',
      taskId: 'task-1',
      status: 'completed',
      before: { id: 'task-1', status: 'queued', hasPayload: true, hasResult: false },
      after: { id: 'task-1', status: 'canceled', hasPayload: true, hasResult: false },
      errorMessage: null,
      createdAt: '2026-06-24T00:00:00.000Z',
      updatedAt: '2026-06-24T00:00:00.000Z',
    }],
  })),
}))

type AdminModelHealthFixture = {
  usageByModel: Array<Record<string, unknown>>
  taskHealthByType: Array<Record<string, unknown>>
  channels: Array<Record<string, unknown>>
}

const modelsMock = vi.hoisted(() => ({
  getAdminModelHealth: vi.fn(async (): Promise<AdminModelHealthFixture> => ({ usageByModel: [], taskHealthByType: [], channels: [] })),
  getAdminModelChannelBefore: vi.fn(async () => ({
    key: 'openai-compatible:abc::gpt-5',
    provider: 'openai-compatible:abc',
    model: 'gpt-5',
    modelType: 'llm',
    status: 'active',
    isAdvanced: false,
    isDefault: false,
    groupKeys: null,
    costMultiplier: null,
    userMessage: null,
    lastTestStatus: null,
    lastTestMessage: null,
    lastTestAt: null,
  })),
  updateAdminModelChannel: vi.fn(async () => ({
    key: 'openai-compatible:abc::gpt-5',
    provider: 'openai-compatible:abc',
    model: 'gpt-5',
    modelType: 'llm',
    status: 'disabled',
    isAdvanced: true,
    isDefault: false,
    groupKeys: 'vip',
    costMultiplier: null,
    userMessage: '模型维护中',
    lastTestStatus: null,
    lastTestMessage: null,
    lastTestAt: null,
  })),
  testAdminModelChannel: vi.fn(async () => ({
    key: 'openai-compatible:abc::gpt-5',
    dryRun: true,
    status: 'skipped',
    message: 'No provider test is configured for this model channel.',
  })),
}))

const systemHealthMock = vi.hoisted(() => ({
  sanitizeHealthChecksForSnapshot: vi.fn((checks: Record<string, Record<string, unknown>>) => ({
    database: { status: checks.database?.status },
    redis: { status: checks.redis?.status },
    bullmq: { status: checks.bullmq?.status, queues: checks.bullmq?.queues },
    worker: {
      status: checks.worker?.status,
      queuedBacklog: checks.worker?.queuedBacklog,
      running: checks.worker?.running,
      staleRunning: checks.worker?.staleRunning,
      latestHeartbeatAt: checks.worker?.latestHeartbeatAt,
    },
    minio: { status: checks.minio?.status, storageType: checks.minio?.storageType },
    payment: { status: checks.payment?.status, configured: checks.payment?.configured },
    modelChannels: {
      status: checks.modelChannels?.status,
      total: checks.modelChannels?.total,
      active: checks.modelChannels?.active,
      disabled: checks.modelChannels?.disabled,
      maintenance: checks.modelChannels?.maintenance,
      failed: checks.modelChannels?.failed,
      defaultProblems: checks.modelChannels?.defaultProblems,
    },
    logs: { status: checks.logs?.status, files: checks.logs?.files, totalSizeBytes: checks.logs?.totalSizeBytes },
  })),
  sanitizeAdminSystemHealthForResponse: vi.fn((health: {
    checks: Record<string, Record<string, unknown>>
    database?: Record<string, unknown>
    logs?: Record<string, unknown>
  }) => {
    const redact = (value: unknown) => String(value)
      .replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^/@\s:]+):([^/@\s]+)@/gi, '$1$2:***@')
      .replace(/([?&][^=\s&]*(?:api[_-]?key|token|secret|signature|credential|access[_-]?key)[^=\s&]*=)([^&\s]+)/gi, '$1***')
      .replace(/\b([A-Z0-9_]*(?:DATABASE_URL|REDIS_URL|MYSQL_URL|POSTGRES_URL|PASSWORD|SECRET|TOKEN|API[_-]?KEY|ACCESS[_-]?KEY)[A-Z0-9_-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=***')
      .replace(/(["']?(?:apiKey|api_key|secret|secretAccessKey|password|token|databaseUrl|redisUrl|mysqlUrl|postgresUrl)["']?\s*:\s*)("[^"]*"|'[^']*'|[^\s,}]+)/gi, '$1***')
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1***')
    const sanitizeCheck = (check: Record<string, unknown>) => check.message
      ? { ...check, message: redact(check.message) }
      : check
    const checks = Object.fromEntries(
      Object.entries(health.checks).map(([key, check]) => [key, sanitizeCheck(check)]),
    )
    return {
      ...health,
      checks,
      database: health.database ? checks.database : health.database,
      logs: health.logs ? checks.logs : health.logs,
    }
  }),
  getAdminSystemHealth: vi.fn(async () => ({
    status: 'warning',
    checks: {
      database: { status: 'ok', message: 'DATABASE_URL="mysql://root:dbpass@127.0.0.1/app"' },
      redis: { status: 'ok', message: 'redis://default:redispass@127.0.0.1:6379' },
      bullmq: { status: 'ok', queues: {} },
      worker: { status: 'ok', queuedBacklog: 0, running: 0, staleRunning: 0, latestHeartbeatAt: null },
      minio: { status: 'ok', storageType: 'local', message: 'secretAccessKey: minio-secret' },
      payment: { status: 'missing_config', configured: false, message: 'apiKey=pay-secret' },
      modelChannels: { status: 'ok', total: 0, active: 0, disabled: 0, maintenance: 0, failed: 0, defaultProblems: 0 },
      logs: { status: 'ok', message: 'Bearer log-token https://s3.local/bucket?X-Amz-Signature=amz-secret&X-Amz-Credential=credential&safe=value' },
    },
    impactedFeatures: ['充值支付'],
    recommendedActions: ['检查支付渠道配置'],
    database: { status: 'ok', message: 'DATABASE_URL="mysql://root:dbpass@127.0.0.1/app"' },
    logs: { status: 'ok', message: 'Bearer log-token https://s3.local/bucket?X-Amz-Signature=amz-secret&X-Amz-Credential=credential&safe=value' },
    checkedAt: '2026-06-22T00:00:00.000Z',
  })),
}))

const auditMock = vi.hoisted(() => ({
  writeAdminAuditLog: vi.fn(async () => ({ id: 'audit-1' })),
}))

const lastAuditCall = () => {
  const calls = auditMock.writeAdminAuditLog.mock.calls as unknown as Array<[unknown]>
  return calls[calls.length - 1]?.[0]
}

const operationsMock = vi.hoisted(() => ({
  getAdminOperations: vi.fn(async () => ({
    announcements: { total: 1, published: 1 },
    featureFlags: { total: 2, disabled: 1 },
    userGroups: { total: 1, active: 1 },
    commercial: { packages: 1, redeemCodes: 1 },
  })),
}))

const announcementsMock = vi.hoisted(() => ({
  listAdminAnnouncements: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20 })),
  createAdminAnnouncement: vi.fn(async () => ({
    id: 'announcement-1',
    title: '维护公告',
    status: 'draft',
  })),
  updateAdminAnnouncement: vi.fn(async () => ({
    id: 'announcement-1',
    title: '维护公告',
    status: 'published',
    severity: 'warning',
  })),
}))

const featureFlagsMock = vi.hoisted(() => ({
  listAdminFeatureFlags: vi.fn(async () => ({ items: [] })),
  updateAdminFeatureFlag: vi.fn(async () => ({
    key: 'video_generation',
    enabled: false,
  })),
}))

const userGroupsMock = vi.hoisted(() => ({
  listAdminUserGroups: vi.fn(async () => ({ items: [] })),
  createAdminUserGroup: vi.fn(async () => ({
    key: 'vip',
    name: 'VIP 用户',
    status: 'active',
  })),
  updateAdminUserGroup: vi.fn(async () => ({
    key: 'vip',
    name: 'VIP 用户',
    status: 'paused',
  })),
}))

const commercialRecord = (value: Record<string, unknown>) => value

const commercialMock = vi.hoisted(() => ({
  getAdminCommercial: vi.fn(async () => ({ packages: [], redeemCodes: [] })),
  getAdminCommercialPackageBefore: vi.fn(async (): Promise<Record<string, unknown> | null> => ({
    key: 'starter',
    name: 'Starter',
    status: 'paused',
    price: '99',
    currency: 'CNY',
    credits: '120',
    bonusCredits: '0',
    durationDays: null,
    userGroupKey: null,
    groupKeys: null,
    startsAt: null,
    endsAt: null,
    purchaseLimitPerUser: null,
    sortOrder: 100,
  })),
  getAdminRedeemCodeBefore: vi.fn(async (): Promise<Record<string, unknown> | null> => ({
    code: 'WELCOME100',
    status: 'active',
    credits: '100',
    maxRedemptions: 50,
    redeemedCount: 0,
    singleUserLimit: 1,
    startsAt: null,
    endsAt: null,
    userGroupKey: null,
    groupKeys: null,
    targetUserIds: null,
  })),
  createAdminCommercialPackage: vi.fn(async () => ({
    key: 'starter',
    name: 'Starter',
    status: 'active',
    transactionId: 'txn-hidden',
    balanceAfter: '999',
    payload: 'private prompt',
  })),
  updateAdminCommercialPackage: vi.fn(async (): Promise<Record<string, unknown>> => ({
    key: 'starter',
    name: 'Starter',
    status: 'paused',
    price: '99',
    currency: 'CNY',
    credits: '120',
    bonusCredits: '0',
  })),
  createAdminRedeemCode: vi.fn(async () => ({
    code: 'WELCOME100',
    status: 'active',
    transactionId: 'txn-hidden',
    balanceAfter: '999',
    payload: 'private prompt',
  })),
  updateAdminRedeemCode: vi.fn(async () => ({
    code: 'WELCOME100',
    status: 'paused',
    credits: '100',
    maxRedemptions: 50,
    redeemedCount: 0,
    singleUserLimit: 1,
  })),
  summarizeAdminCommercialPackage: vi.fn((item: {
    key?: string
    name?: string
    description?: string | null
    status?: string
    price?: string
    currency?: string
    credits?: string
    bonusCredits?: string
    durationDays?: number | null
    userGroupKey?: string | null
    groupKeys?: string | null
    startsAt?: string | null
    endsAt?: string | null
    purchaseLimitPerUser?: number | null
    sortOrder?: number
  }) => ({
    key: item.key,
    name: item.name,
    description: item.description ?? null,
    status: item.status,
    price: item.price,
    currency: item.currency,
    credits: item.credits,
    bonusCredits: item.bonusCredits,
    durationDays: item.durationDays ?? null,
    userGroupKey: item.userGroupKey ?? null,
    groupKeys: item.groupKeys ?? null,
    startsAt: item.startsAt ?? null,
    endsAt: item.endsAt ?? null,
    purchaseLimitPerUser: item.purchaseLimitPerUser ?? null,
    sortOrder: item.sortOrder,
  })),
  summarizeAdminRedeemCode: vi.fn((item: {
    code?: string
    status?: string
    credits?: string
    maxRedemptions?: number
    redeemedCount?: number
    singleUserLimit?: number
    startsAt?: string | null
    endsAt?: string | null
    userGroupKey?: string | null
    groupKeys?: string | null
    targetUserIds?: string | null
  }) => ({
    code: item.code,
    status: item.status,
    credits: item.credits,
    maxRedemptions: item.maxRedemptions,
    redeemedCount: item.redeemedCount,
    singleUserLimit: item.singleUserLimit,
    startsAt: item.startsAt ?? null,
    endsAt: item.endsAt ?? null,
    userGroupKey: item.userGroupKey ?? null,
    groupKeys: item.groupKeys ?? null,
    targetUserIds: item.targetUserIds ?? null,
  })),
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
  adminHealthCheckSnapshot: {
    create: vi.fn(async () => ({ id: 'health-snapshot-1' })),
  },
}))

vi.mock('@/lib/admin/overview', () => overviewMock)
vi.mock('@/lib/admin/users', () => usersMock)
vi.mock('@/lib/admin/billing', () => billingMock)
vi.mock('@/lib/admin/tasks', () => tasksMock)
vi.mock('@/lib/admin/models', () => modelsMock)
vi.mock('@/lib/admin/system-health', () => systemHealthMock)
vi.mock('@/lib/admin/audit', () => auditMock)
vi.mock('@/lib/admin/operations', () => operationsMock)
vi.mock('@/lib/admin/announcements', () => announcementsMock)
vi.mock('@/lib/admin/feature-flags', () => featureFlagsMock)
vi.mock('@/lib/admin/user-groups', () => userGroupsMock)
vi.mock('@/lib/admin/commercial', () => commercialMock)
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
      'src/app/api/admin/operations/route.ts',
      'src/app/api/admin/announcements/route.ts',
      'src/app/api/admin/announcements/[announcementId]/route.ts',
      'src/app/api/admin/feature-flags/route.ts',
      'src/app/api/admin/feature-flags/[flagKey]/route.ts',
      'src/app/api/admin/user-groups/route.ts',
      'src/app/api/admin/user-groups/[groupKey]/route.ts',
      'src/app/api/admin/commercial/route.ts',
      'src/app/api/admin/commercial/packages/route.ts',
      'src/app/api/admin/commercial/packages/[packageKey]/route.ts',
      'src/app/api/admin/commercial/redeem-codes/route.ts',
      'src/app/api/admin/commercial/redeem-codes/[code]/route.ts',
      'src/app/api/admin/users/route.ts',
      'src/app/api/admin/users/[userId]/route.ts',
      'src/app/api/admin/billing/route.ts',
      'src/app/api/admin/billing/manual-credit/route.ts',
      'src/app/api/admin/billing/manual-debit/route.ts',
      'src/app/api/admin/billing/freezes/[freezeId]/release/route.ts',
      'src/app/api/admin/billing/orders/[orderId]/reconcile/route.ts',
      'src/app/api/admin/billing/orders/[orderId]/refund/route.ts',
      'src/app/api/admin/tasks/route.ts',
      'src/app/api/admin/tasks/[taskId]/route.ts',
      'src/app/api/admin/tasks/incidents/route.ts',
      'src/app/api/admin/tasks/incidents/[incidentId]/route.ts',
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

  it('GET /api/admin/operations enforces admin auth and returns operations summary', async () => {
    const mod = await import('@/app/api/admin/operations/route')
    const req = buildMockRequest({ path: '/api/admin/operations', method: 'GET' })

    mockUnauthenticated()
    expect((await mod.GET(req, { params: Promise.resolve({}) })).status).toBe(401)

    mockAuthenticatedRole('user-1', 'user')
    expect((await mod.GET(req, { params: Promise.resolve({}) })).status).toBe(403)

    mockAuthenticatedRole('admin-1', 'admin')
    const res = await mod.GET(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      announcements: { total: 1, published: 1 },
      featureFlags: { total: 2, disabled: 1 },
      userGroups: { total: 1, active: 1 },
      commercial: { packages: 1, redeemCodes: 1 },
    })
  })

  it('GET /api/admin/models returns usage summary and safe model channels', async () => {
    const mod = await import('@/app/api/admin/models/route')

    modelsMock.getAdminModelHealth.mockResolvedValueOnce({
      usageByModel: [{ apiType: 'text', model: 'gpt-5', cost: '1.5', quantity: 3, count: 2 }],
      taskHealthByType: [{ type: 'text', status: 'completed', count: 2 }],
      channels: [{
        key: 'openai-compatible:abc::gpt-5',
        provider: 'openai-compatible:abc',
        model: 'gpt-5',
        modelType: 'llm',
        status: 'active',
        isAdvanced: false,
        isDefault: true,
        groupKeys: null,
        costMultiplier: null,
        userMessage: null,
        lastTestStatus: null,
        lastTestMessage: null,
        lastTestAt: null,
        apiKey: 'must-not-leak',
        payload: 'private prompt',
        result: 'private result',
        dedupeKey: 'dedupe-1',
        billingInfo: { amount: 1 },
      }],
    })

    mockAuthenticatedRole('admin-1', 'admin')
    const res = await mod.GET(
      buildMockRequest({ path: '/api/admin/models', method: 'GET' }),
      { params: Promise.resolve({}) },
    )

    expect(res.status).toBe(200)
    const bodyText = JSON.stringify(await res.json())
    expect(bodyText).toContain('channels')
    expect(bodyText).not.toContain('must-not-leak')
    expect(bodyText).not.toContain('private prompt')
    expect(bodyText).not.toContain('private result')
    expect(bodyText).not.toContain('dedupe-1')
    expect(bodyText).not.toContain('billingInfo')
  })

  it('PATCH /api/admin/models/[modelKey] requires owner, reason, and audits disable safely', async () => {
    const mod = await import('@/app/api/admin/models/[modelKey]/route')
    const context = { params: Promise.resolve({ modelKey: 'openai-compatible%3Aabc%3A%3Agpt-5' }) }

    mockAuthenticatedRole('admin-1', 'admin')
    expect((await mod.PATCH(
      buildMockRequest({
        path: '/api/admin/models/openai-compatible%3Aabc%3A%3Agpt-5',
        method: 'PATCH',
        body: { status: 'disabled', reason: '供应商故障' },
      }),
      context,
    )).status).toBe(403)

    mockAuthenticatedRole('owner-1', 'owner')
    const missingReasonRes = await mod.PATCH(
      buildMockRequest({
        path: '/api/admin/models/openai-compatible%3Aabc%3A%3Agpt-5',
        method: 'PATCH',
        body: { status: 'disabled', reason: '   ' },
      }),
      context,
    )
    expect(missingReasonRes.status).toBe(400)
    await expect(missingReasonRes.json()).resolves.toEqual({ error: 'reason is required' })
    expect(modelsMock.updateAdminModelChannel).not.toHaveBeenCalled()

    const res = await mod.PATCH(
      buildMockRequest({
        path: '/api/admin/models/openai-compatible%3Aabc%3A%3Agpt-5',
        method: 'PATCH',
        body: {
          status: 'disabled',
          userMessage: '模型维护中',
          groupKeys: 'vip',
          isAdvanced: true,
          reason: '供应商故障',
          apiKey: 'must-not-leak',
          payload: 'private prompt',
        },
      }),
      context,
    )

    expect(res.status).toBe(200)
    expect(modelsMock.getAdminModelChannelBefore).toHaveBeenCalledWith('openai-compatible:abc::gpt-5')
    expect(modelsMock.updateAdminModelChannel).toHaveBeenCalledWith('openai-compatible:abc::gpt-5', {
      status: 'disabled',
      userMessage: '模型维护中',
      groupKeys: 'vip',
      isAdvanced: true,
      updatedBy: 'owner-1',
    })
    expect(auditMock.writeAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actor: { id: 'owner-1', role: 'owner' },
      action: 'model_channel.disable',
      targetType: 'model_channel',
      targetId: 'openai-compatible:abc::gpt-5',
      reason: '供应商故障',
    }))
    expect(JSON.stringify(await res.json())).not.toContain('must-not-leak')
  })

  it('POST /api/admin/models/[modelKey]/test requires owner, reason, audits, and returns dry-run DTO', async () => {
    const mod = await import('@/app/api/admin/models/[modelKey]/test/route')
    const context = { params: Promise.resolve({ modelKey: 'openai-compatible%3Aabc%3A%3Agpt-5' }) }

    mockAuthenticatedRole('owner-1', 'owner')
    const missingReasonRes = await mod.POST(
      buildMockRequest({
        path: '/api/admin/models/openai-compatible%3Aabc%3A%3Agpt-5/test',
        method: 'POST',
        body: { reason: '' },
      }),
      context,
    )
    expect(missingReasonRes.status).toBe(400)
    await expect(missingReasonRes.json()).resolves.toEqual({ error: 'reason is required' })

    const res = await mod.POST(
      buildMockRequest({
        path: '/api/admin/models/openai-compatible%3Aabc%3A%3Agpt-5/test',
        method: 'POST',
        body: { reason: '巡检', apiKey: 'must-not-leak' },
      }),
      context,
    )

    expect(res.status).toBe(200)
    expect(modelsMock.testAdminModelChannel).toHaveBeenCalledWith('openai-compatible:abc::gpt-5', {
      actorId: 'owner-1',
    })
    expect(auditMock.writeAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'model_channel.test',
      targetType: 'model_channel',
      targetId: 'openai-compatible:abc::gpt-5',
      reason: '巡检',
    }))
    const bodyText = JSON.stringify(await res.json())
    expect(bodyText).toContain('dryRun')
    expect(bodyText).not.toContain('must-not-leak')
  })

  it('POST /api/admin/announcements requires owner and audits without exposing creative content', async () => {
    const mod = await import('@/app/api/admin/announcements/route')

    mockAuthenticatedRole('admin-1', 'admin')
    const adminRes = await mod.POST(
      buildMockRequest({ path: '/api/admin/announcements', method: 'POST', body: { title: '维护公告', body: '今晚维护' } }),
      { params: Promise.resolve({}) },
    )
    expect(adminRes.status).toBe(403)

    mockAuthenticatedRole('owner-1', 'owner')
    const ownerRes = await mod.POST(
      buildMockRequest({
        path: '/api/admin/announcements',
        method: 'POST',
        body: {
          title: '维护公告',
          body: '今晚维护',
          type: 'maintenance',
          severity: 'warning',
          status: 'draft',
          locale: 'zh',
          surface: 'top_banner',
          audience: 'all',
          reason: '上线维护',
          payload: 'private prompt',
        },
        headers: {
          'x-forwarded-for': '198.51.100.9, 10.0.0.2',
          'user-agent': 'vitest-owner-client',
        },
      }),
      { params: Promise.resolve({}) },
    )

    const jsonText = JSON.stringify(await ownerRes.json())
    expect(ownerRes.status).toBe(200)
    expect(jsonText).not.toContain('private prompt')
    expect(announcementsMock.createAdminAnnouncement).toHaveBeenCalledWith(expect.objectContaining({
      title: '维护公告',
      body: '今晚维护',
      type: 'maintenance',
      severity: 'warning',
      status: 'draft',
      locale: 'zh',
      surface: 'top_banner',
      audience: 'all',
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
    }))
    expect(auditMock.writeAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actor: { id: 'owner-1', role: 'owner' },
      action: 'announcement.create',
      targetType: 'announcement',
      targetId: 'announcement-1',
      reason: '上线维护',
      ip: '198.51.100.9',
      userAgent: 'vitest-owner-client',
    }))
  })

  it('PATCH /api/admin/announcements/[announcementId] audits publish, pause, and archive actions', async () => {
    const mod = await import('@/app/api/admin/announcements/[announcementId]/route')
    const context = { params: Promise.resolve({ announcementId: 'announcement-1' }) }

    mockAuthenticatedRole('owner-1', 'owner')
    const publishRes = await mod.PATCH(
      buildMockRequest({
        path: '/api/admin/announcements/announcement-1',
        method: 'PATCH',
        body: { status: 'published', reason: '上线公告' },
      }),
      context,
    )

    expect(publishRes.status).toBe(200)
    expect(announcementsMock.updateAdminAnnouncement).toHaveBeenCalledWith('announcement-1', expect.objectContaining({
      status: 'published',
      updatedBy: 'owner-1',
    }))
    expect(auditMock.writeAdminAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'announcement.publish',
      targetType: 'announcement',
      targetId: 'announcement-1',
      reason: '上线公告',
    }))

    const pauseRes = await mod.PATCH(
      buildMockRequest({
        path: '/api/admin/announcements/announcement-1',
        method: 'PATCH',
        body: { status: 'paused', reason: '暂停投放' },
      }),
      context,
    )

    expect(pauseRes.status).toBe(200)
    expect(auditMock.writeAdminAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'announcement.pause',
      reason: '暂停投放',
    }))

    const archiveRes = await mod.PATCH(
      buildMockRequest({
        path: '/api/admin/announcements/announcement-1',
        method: 'PATCH',
        body: { status: 'archived', reason: '活动结束' },
      }),
      context,
    )

    expect(archiveRes.status).toBe(200)
    expect(auditMock.writeAdminAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'announcement.archive',
      reason: '活动结束',
    }))
  })

  it('PATCH /api/admin/feature-flags/[flagKey] requires owner and audits changes', async () => {
    const mod = await import('@/app/api/admin/feature-flags/[flagKey]/route')
    const context = { params: Promise.resolve({ flagKey: 'video_generation' }) }

    mockAuthenticatedRole('admin-1', 'admin')
    expect((await mod.PATCH(
      buildMockRequest({ path: '/api/admin/feature-flags/video_generation', method: 'PATCH', body: { enabled: false } }),
      context,
    )).status).toBe(403)

    mockAuthenticatedRole('owner-1', 'owner')
    const res = await mod.PATCH(
      buildMockRequest({
        path: '/api/admin/feature-flags/video_generation',
        method: 'PATCH',
        body: { enabled: false, rolloutPercent: 0, reason: '视频供应商故障' },
      }),
      context,
    )

    expect(res.status).toBe(200)
    expect(featureFlagsMock.updateAdminFeatureFlag).toHaveBeenCalledWith('video_generation', {
      enabled: false,
      rolloutPercent: 0,
      updatedBy: 'owner-1',
    })
    expect(auditMock.writeAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actor: { id: 'owner-1', role: 'owner' },
      action: 'feature_flag.update',
      targetType: 'feature_flag',
      targetId: 'video_generation',
      reason: '视频供应商故障',
    }))
  })

  it('POST /api/admin/user-groups requires owner and audits user group creation', async () => {
    const mod = await import('@/app/api/admin/user-groups/route')

    mockAuthenticatedRole('owner-1', 'owner')
    const res = await mod.POST(
      buildMockRequest({
        path: '/api/admin/user-groups',
        method: 'POST',
        body: {
          key: 'vip',
          name: 'VIP 用户',
          signupCredits: '100',
          dailyTaskLimit: 200,
          concurrentTaskLimit: 6,
          allowVideo: true,
          allowVoice: true,
          allowAdvancedModels: true,
          reason: '商业化上线',
        },
      }),
      { params: Promise.resolve({}) },
    )

    expect(res.status).toBe(200)
    expect(userGroupsMock.createAdminUserGroup).toHaveBeenCalledWith(expect.objectContaining({
      key: 'vip',
      name: 'VIP 用户',
      signupCredits: '100',
      dailyTaskLimit: 200,
      concurrentTaskLimit: 6,
      allowVideo: true,
      allowVoice: true,
      allowAdvancedModels: true,
    }))
    expect(auditMock.writeAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'user_group.create',
      targetType: 'user_group',
      targetId: 'vip',
      reason: '商业化上线',
    }))
  })

  it('admin cannot create commercial package or redeem code, but owner can with safe responses', async () => {
    const packageCreate = await import('@/app/api/admin/commercial/packages/route')
    const codeCreate = await import('@/app/api/admin/commercial/redeem-codes/route')

    mockAuthenticatedRole('admin-1', 'admin')
    const adminPackageRes = await packageCreate.POST(
      buildMockRequest({
        path: '/api/admin/commercial/packages',
        method: 'POST',
        body: { key: 'starter', name: 'Starter', price: '99', credits: '120', currency: 'CNY', reason: '上线套餐' },
      }),
      { params: Promise.resolve({}) },
    )
    const adminCodeRes = await codeCreate.POST(
      buildMockRequest({
        path: '/api/admin/commercial/redeem-codes',
        method: 'POST',
        body: { code: 'WELCOME100', credits: '100', maxRedemptions: 50, reason: '首批用户福利' },
      }),
      { params: Promise.resolve({}) },
    )
    expect(adminPackageRes.status).toBe(403)
    expect(adminCodeRes.status).toBe(403)
    expect(commercialMock.createAdminCommercialPackage).not.toHaveBeenCalled()
    expect(commercialMock.createAdminRedeemCode).not.toHaveBeenCalled()

    mockAuthenticatedRole('owner-1', 'owner')
    const packageRes = await packageCreate.POST(
      buildMockRequest({
        path: '/api/admin/commercial/packages',
        method: 'POST',
        body: {
          key: 'starter',
          name: 'Starter',
          price: '99',
          credits: '120',
          currency: 'CNY',
          reason: '上线套餐',
        },
      }),
      { params: Promise.resolve({}) },
    )
    const packageJsonText = JSON.stringify(await packageRes.json())
    expect(packageRes.status).toBe(200)
    expect(packageJsonText).not.toContain('transactionId')
    expect(packageJsonText).not.toContain('balanceAfter')
    expect(packageJsonText).not.toContain('payload')
    expect(auditMock.writeAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'commercial_package.create',
      targetType: 'commercial_package',
      targetId: 'starter',
      reason: '上线套餐',
    }))

    const codeRes = await codeCreate.POST(
      buildMockRequest({
        path: '/api/admin/commercial/redeem-codes',
        method: 'POST',
        body: {
          code: 'WELCOME100',
          credits: '100',
          maxRedemptions: 50,
          reason: '首批用户福利',
        },
      }),
      { params: Promise.resolve({}) },
    )
    const codeJsonText = JSON.stringify(await codeRes.json())
    expect(codeRes.status).toBe(200)
    expect(codeJsonText).not.toContain('transactionId')
    expect(codeJsonText).not.toContain('balanceAfter')
    expect(codeJsonText).not.toContain('payload')
    expect(auditMock.writeAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'redeem_code.create',
      targetType: 'redeem_code',
      targetId: 'WELCOME100',
      reason: '首批用户福利',
    }))
  })

  it('commercial package and redeem code write routes require reason before service or audit', async () => {
    mockAuthenticatedRole('owner-1', 'owner')
    const packageCreate = await import('@/app/api/admin/commercial/packages/route')
    const packageUpdate = await import('@/app/api/admin/commercial/packages/[packageKey]/route')
    const codeCreate = await import('@/app/api/admin/commercial/redeem-codes/route')
    const codeUpdate = await import('@/app/api/admin/commercial/redeem-codes/[code]/route')

    const responses = [
      await packageCreate.POST(buildMockRequest({ path: '/api/admin/commercial/packages', method: 'POST', body: { key: 'starter', name: 'Starter', reason: '' } }), { params: Promise.resolve({}) }),
      await packageUpdate.PATCH(buildMockRequest({ path: '/api/admin/commercial/packages/starter', method: 'PATCH', body: { status: 'active' } }), { params: Promise.resolve({ packageKey: 'starter' }) }),
      await codeCreate.POST(buildMockRequest({ path: '/api/admin/commercial/redeem-codes', method: 'POST', body: { code: 'WELCOME100', credits: '100' } }), { params: Promise.resolve({}) }),
      await codeUpdate.PATCH(buildMockRequest({ path: '/api/admin/commercial/redeem-codes/WELCOME100', method: 'PATCH', body: { status: 'paused', reason: '   ' } }), { params: Promise.resolve({ code: 'WELCOME100' }) }),
    ]

    expect(responses.map(response => response.status)).toEqual([400, 400, 400, 400])
    expect(commercialMock.createAdminCommercialPackage).not.toHaveBeenCalled()
    expect(commercialMock.updateAdminCommercialPackage).not.toHaveBeenCalled()
    expect(commercialMock.createAdminRedeemCode).not.toHaveBeenCalled()
    expect(commercialMock.updateAdminRedeemCode).not.toHaveBeenCalled()
    expect(auditMock.writeAdminAuditLog).not.toHaveBeenCalled()
  })

  it('commercial package update audits publish, archive, and normal update actions with safe summaries', async () => {
    const mod = await import('@/app/api/admin/commercial/packages/[packageKey]/route')
    const context = { params: Promise.resolve({ packageKey: 'starter' }) }
    mockAuthenticatedRole('owner-1', 'owner')

    commercialMock.updateAdminCommercialPackage.mockResolvedValueOnce({
      key: 'starter',
      name: 'Starter',
      status: 'active',
      price: '99',
      currency: 'CNY',
      credits: '120',
      bonusCredits: '0',
      payload: 'private prompt',
    })
    const publishRes = await mod.PATCH(
      buildMockRequest({ path: '/api/admin/commercial/packages/starter', method: 'PATCH', body: { status: 'active', reason: '公开销售' } }),
      context,
    )
    expect(publishRes.status).toBe(200)
    expect(commercialMock.getAdminCommercialPackageBefore).toHaveBeenCalledWith('starter')
    expect(auditMock.writeAdminAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'commercial_package.publish',
      before: expect.objectContaining({ status: 'paused', price: '99', credits: '120' }),
      after: expect.objectContaining({ status: 'active', price: '99', credits: '120' }),
      reason: '公开销售',
    }))
    expect(JSON.stringify(lastAuditCall())).not.toContain('private prompt')

    commercialMock.getAdminCommercialPackageBefore.mockResolvedValueOnce(commercialRecord({ status: 'active', price: '99', credits: '120' }))
    commercialMock.updateAdminCommercialPackage.mockResolvedValueOnce({
      key: 'starter',
      name: 'Starter',
      status: 'archived',
      price: '99',
      currency: 'CNY',
      credits: '120',
      bonusCredits: '0',
    })
    const archiveRes = await mod.PATCH(
      buildMockRequest({ path: '/api/admin/commercial/packages/starter', method: 'PATCH', body: { status: 'archived', reason: '活动结束' } }),
      context,
    )
    expect(archiveRes.status).toBe(200)
    expect(auditMock.writeAdminAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'commercial_package.archive',
      reason: '活动结束',
    }))

    commercialMock.getAdminCommercialPackageBefore.mockResolvedValueOnce(commercialRecord({ status: 'archived', price: '99', credits: '120' }))
    commercialMock.updateAdminCommercialPackage.mockResolvedValueOnce({
      key: 'starter',
      name: 'Archived Starter',
      status: 'archived',
      price: '99',
      currency: 'CNY',
      credits: '120',
      bonusCredits: '0',
    })
    const archivedUpdateRes = await mod.PATCH(
      buildMockRequest({ path: '/api/admin/commercial/packages/starter', method: 'PATCH', body: { name: 'Archived Starter', reason: '修正文案' } }),
      context,
    )
    expect(archivedUpdateRes.status).toBe(200)
    expect(auditMock.writeAdminAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'commercial_package.update',
      reason: '修正文案',
    }))

    commercialMock.getAdminCommercialPackageBefore.mockResolvedValueOnce(commercialRecord({ status: 'active', price: '99', credits: '120' }))
    commercialMock.updateAdminCommercialPackage.mockResolvedValueOnce({
      key: 'starter',
      name: 'Starter Plus',
      status: 'active',
      price: '109',
      currency: 'CNY',
      credits: '140',
      bonusCredits: '0',
    })
    const updateRes = await mod.PATCH(
      buildMockRequest({ path: '/api/admin/commercial/packages/starter', method: 'PATCH', body: { name: 'Starter Plus', price: '109', reason: '调整价格' } }),
      context,
    )
    expect(updateRes.status).toBe(200)
    expect(auditMock.writeAdminAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'commercial_package.update',
      reason: '调整价格',
    }))
  })

  it('redeem code pause and update routes audit redeem_code.update with safe summaries', async () => {
    const mod = await import('@/app/api/admin/commercial/redeem-codes/[code]/route')
    const context = { params: Promise.resolve({ code: 'WELCOME100' }) }
    mockAuthenticatedRole('owner-1', 'owner')

    const res = await mod.PATCH(
      buildMockRequest({ path: '/api/admin/commercial/redeem-codes/WELCOME100', method: 'PATCH', body: { status: 'paused', reason: '暂停发放' } }),
      context,
    )

    expect(res.status).toBe(200)
    expect(commercialMock.getAdminRedeemCodeBefore).toHaveBeenCalledWith('WELCOME100')
    expect(auditMock.writeAdminAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'redeem_code.update',
      targetType: 'redeem_code',
      targetId: 'WELCOME100',
      before: expect.objectContaining({ status: 'active', credits: '100', maxRedemptions: 50 }),
      after: expect.objectContaining({ status: 'paused', credits: '100', maxRedemptions: 50 }),
      reason: '暂停发放',
    }))
    const auditText = JSON.stringify(lastAuditCall())
    expect(auditText).not.toContain('transactionId')
    expect(auditText).not.toContain('balanceAfter')
    expect(auditText).not.toContain('payload')
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
      adminGroupKey: null,
      page: 2,
      pageSize: 10,
    })
  })

  it('GET /api/admin/users forwards group filter', async () => {
    mockAuthenticatedRole('admin-1', 'admin')
    const mod = await import('@/app/api/admin/users/route')
    const req = new NextRequest('http://localhost/api/admin/users?group=vip')
    const res = await mod.GET(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(200)
    expect(usersMock.listAdminUsers).toHaveBeenCalledWith(expect.objectContaining({
      adminGroupKey: 'vip',
    }))
  })

  it('PATCH /api/admin/users/[userId] requires owner, reason, and writes access audit logs', async () => {
    const mod = await import('@/app/api/admin/users/[userId]/route')
    const context = { params: Promise.resolve({ userId: 'user-2' }) }

    mockAuthenticatedRole('admin-1', 'admin')
    const adminRes = await mod.PATCH(
      buildMockRequest({ path: '/api/admin/users/user-2', method: 'PATCH', body: { role: 'admin' } }),
      context,
    )
    expect(adminRes.status).toBe(403)
    expect(usersMock.updateAdminUserAccess).not.toHaveBeenCalled()

    mockAuthenticatedRole('owner-1', 'owner')
    const missingReasonRes = await mod.PATCH(
      buildMockRequest({ path: '/api/admin/users/user-2', method: 'PATCH', body: { status: 'disabled' } }),
      context,
    )
    expect(missingReasonRes.status).toBe(400)
    await expect(missingReasonRes.json()).resolves.toEqual({ error: 'reason is required' })
    expect(usersMock.updateAdminUserAccess).not.toHaveBeenCalled()
    expect(auditMock.writeAdminAuditLog).not.toHaveBeenCalled()

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
    }, { actorId: 'owner-1' })
    expect(auditMock.writeAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actor: { id: 'owner-1', role: 'owner' },
      action: 'user.access.disable',
      targetType: 'user',
      targetId: 'user-2',
      before: { status: 'active' },
      after: { status: 'disabled' },
      reason: 'policy',
      ip: '203.0.113.10',
      userAgent: 'vitest-admin-client',
    }))
    expect(auditMock.writeAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'user.role.update',
      targetType: 'user',
      targetId: 'user-2',
      before: { role: 'user' },
      after: { role: 'admin' },
      reason: 'policy',
    }))
  })

  it('PATCH /api/admin/users/[userId] writes separate audit logs for enable, group, note, and session revoke', async () => {
    const mod = await import('@/app/api/admin/users/[userId]/route')
    const context = { params: Promise.resolve({ userId: 'user-2' }) }

    mockAuthenticatedRole('owner-1', 'owner')
    usersMock.getAdminUserAccessBefore.mockResolvedValueOnce({
      id: 'user-2',
      role: 'user',
      status: 'disabled',
      adminGroupKey: 'free',
      adminNote: '旧备注',
      sessionVersion: 4,
    })
    const res = await mod.PATCH(
      buildMockRequest({
        path: '/api/admin/users/user-2',
        method: 'PATCH',
        body: {
          status: 'active',
          adminGroupKey: 'vip',
          adminNote: '高价值客户',
          revokeSession: true,
          reason: '恢复并分配',
        },
      }),
      context,
    )

    expect(res.status).toBe(200)
    expect(usersMock.updateAdminUserAccess).toHaveBeenCalledWith('user-2', {
      status: 'active',
      adminGroupKey: 'vip',
      adminNote: '高价值客户',
      revokeSession: true,
    }, { actorId: 'owner-1' })
    expect(auditMock.writeAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actor: { id: 'owner-1', role: 'owner' },
      action: 'user.access.enable',
      targetType: 'user',
      targetId: 'user-2',
      before: { status: 'disabled' },
      after: { status: 'active' },
      reason: '恢复并分配',
    }))
    expect(auditMock.writeAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actor: { id: 'owner-1', role: 'owner' },
      action: 'user.group.assign',
      targetType: 'user',
      targetId: 'user-2',
      before: { adminGroupKey: 'free' },
      after: { adminGroupKey: 'vip' },
      reason: '恢复并分配',
    }))
    expect(auditMock.writeAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'user.note.create',
      targetType: 'user',
      targetId: 'user-2',
      before: { adminNote: '旧备注' },
      after: { adminNote: '高价值客户' },
      reason: '恢复并分配',
    }))
    expect(auditMock.writeAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'user.session.revoke',
      targetType: 'user',
      targetId: 'user-2',
      before: { sessionVersion: 4 },
      after: { sessionVersion: 5 },
      reason: '恢复并分配',
    }))
  })

  it('PATCH /api/admin/users/[userId] treats non-object JSON bodies as empty objects', async () => {
    mockAuthenticatedRole('owner-1', 'owner')
    const mod = await import('@/app/api/admin/users/[userId]/route')
    const res = await mod.PATCH(
      buildMockRequest({ path: '/api/admin/users/user-2', method: 'PATCH', body: null }),
      { params: Promise.resolve({ userId: 'user-2' }) },
    )

    expect(res.status).toBe(400)
    expect(usersMock.updateAdminUserAccess).not.toHaveBeenCalled()
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

    expect(res.status).toBe(400)
    expect(usersMock.updateAdminUserAccess).not.toHaveBeenCalled()
  })

  it('PATCH /api/admin/users/[userId] ignores primitive bodies and rejects non-string reasons', async () => {
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

    expect(stringBodyRes.status).toBe(400)
    expect(numberBodyRes.status).toBe(400)
    expect(nonStringReasonRes.status).toBe(400)
    expect(usersMock.updateAdminUserAccess).not.toHaveBeenCalled()
    expect(auditMock.writeAdminAuditLog).not.toHaveBeenCalled()
  })

  it('PATCH /api/admin/users/[userId] rejects invalid role and status values', async () => {
    mockAuthenticatedRole('owner-1', 'owner')
    const mod = await import('@/app/api/admin/users/[userId]/route')

    const invalidRoleRes = await mod.PATCH(
      buildMockRequest({
        path: '/api/admin/users/user-2',
        method: 'PATCH',
        body: { role: 'superadmin', reason: 'invalid role test' },
      }),
      { params: Promise.resolve({ userId: 'user-2' }) },
    )
    const invalidStatusRes = await mod.PATCH(
      buildMockRequest({
        path: '/api/admin/users/user-2',
        method: 'PATCH',
        body: { status: 'disable', reason: 'invalid status test' },
      }),
      { params: Promise.resolve({ userId: 'user-2' }) },
    )

    expect(invalidRoleRes.status).toBe(400)
    expect(invalidStatusRes.status).toBe(400)
    expect(usersMock.updateAdminUserAccess).not.toHaveBeenCalled()
    expect(auditMock.writeAdminAuditLog).not.toHaveBeenCalled()
  })

  it('admin billing write routes require owner, reason, audit, and safe DTO responses', async () => {
    const manualCredit = await import('@/app/api/admin/billing/manual-credit/route')

    mockAuthenticatedRole('admin-1', 'admin')
    const adminRes = await manualCredit.POST(
      buildMockRequest({
        path: '/api/admin/billing/manual-credit',
        method: 'POST',
        body: { userId: 'user-2', amount: 10, reason: '客服补偿' },
      }),
      { params: Promise.resolve({}) },
    )
    expect(adminRes.status).toBe(403)

    mockAuthenticatedRole('owner-1', 'owner')
    const missingReasonRes = await manualCredit.POST(
      buildMockRequest({
        path: '/api/admin/billing/manual-credit',
        method: 'POST',
        body: { userId: 'user-2', amount: 10 },
      }),
      { params: Promise.resolve({}) },
    )
    expect(missingReasonRes.status).toBe(400)
    expect(billingMock.manualCreditBalance).not.toHaveBeenCalled()

    const missingIdempotencyKeyRes = await manualCredit.POST(
      buildMockRequest({
        path: '/api/admin/billing/manual-credit',
        method: 'POST',
        body: { userId: 'user-2', amount: 10, reason: '客服补偿' },
      }),
      { params: Promise.resolve({}) },
    )
    expect(missingIdempotencyKeyRes.status).toBe(400)
    expect(billingMock.manualCreditBalance).not.toHaveBeenCalled()

    const creditRes = await manualCredit.POST(
      buildMockRequest({
        path: '/api/admin/billing/manual-credit',
        method: 'POST',
        body: {
          userId: 'user-2',
          amount: 10,
          reason: '客服补偿',
          idempotencyKey: 'credit-1',
          payload: 'private prompt',
          billingInfo: 'secret billing',
        },
        headers: {
          'x-forwarded-for': '198.51.100.8, 10.0.0.2',
          'user-agent': 'vitest-owner-client',
        },
      }),
      { params: Promise.resolve({}) },
    )
    const creditJsonText = JSON.stringify(await creditRes.json())
    expect(creditRes.status).toBe(200)
    expect(creditJsonText).not.toContain('private prompt')
    expect(creditJsonText).not.toContain('secret billing')
    expect(billingMock.manualCreditBalance).toHaveBeenCalledWith({
      userId: 'user-2',
      amount: 10,
      reason: '客服补偿',
      operatorId: 'owner-1',
      idempotencyKey: 'credit-1',
    })
    expect(auditMock.writeAdminAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({
      actor: { id: 'owner-1', role: 'owner' },
      action: 'billing.balance.credit',
      targetType: 'user',
      targetId: 'user-2',
      reason: '客服补偿',
      ip: '198.51.100.8',
      userAgent: 'vitest-owner-client',
    }))

    const manualDebit = await import('@/app/api/admin/billing/manual-debit/route')
    const missingDebitIdempotencyKeyRes = await manualDebit.POST(
      buildMockRequest({
        path: '/api/admin/billing/manual-debit',
        method: 'POST',
        body: { userId: 'user-2', amount: 3, reason: '误充值扣回' },
      }),
      { params: Promise.resolve({}) },
    )
    expect(missingDebitIdempotencyKeyRes.status).toBe(400)
    expect(billingMock.manualDebitBalance).not.toHaveBeenCalled()

    const debitRes = await manualDebit.POST(
      buildMockRequest({
        path: '/api/admin/billing/manual-debit',
        method: 'POST',
        body: { userId: 'user-2', amount: 3, reason: '误充值扣回', idempotencyKey: 'debit-1' },
      }),
      { params: Promise.resolve({}) },
    )
    expect(debitRes.status).toBe(200)
    expect(billingMock.manualDebitBalance).toHaveBeenCalledWith({
      userId: 'user-2',
      amount: 3,
      reason: '误充值扣回',
      operatorId: 'owner-1',
      idempotencyKey: 'debit-1',
    })
    expect(auditMock.writeAdminAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'billing.balance.debit',
      targetType: 'user',
      targetId: 'user-2',
      reason: '误充值扣回',
    }))

    const releaseFreeze = await import('@/app/api/admin/billing/freezes/[freezeId]/release/route')
    const releaseRes = await releaseFreeze.POST(
      buildMockRequest({
        path: '/api/admin/billing/freezes/freeze-1/release',
        method: 'POST',
        body: { reason: '任务失败释放' },
      }),
      { params: Promise.resolve({ freezeId: 'freeze-1' }) },
    )
    expect(releaseRes.status).toBe(200)
    expect(billingMock.releaseAdminFreeze).toHaveBeenCalledWith({
      freezeId: 'freeze-1',
      reason: '任务失败释放',
      operatorId: 'owner-1',
    })
    expect(auditMock.writeAdminAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'billing.freeze.release',
      targetType: 'balance_freeze',
      targetId: 'freeze-1',
      reason: '任务失败释放',
    }))

    const reconcile = await import('@/app/api/admin/billing/orders/[orderId]/reconcile/route')
    const reconcileRes = await reconcile.POST(
      buildMockRequest({
        path: '/api/admin/billing/orders/order-1/reconcile',
        method: 'POST',
        body: { reason: '支付回调补单' },
      }),
      { params: Promise.resolve({ orderId: 'order-1' }) },
    )
    expect(reconcileRes.status).toBe(200)
    expect(billingMock.reconcileAdminOrder).toHaveBeenCalledWith({
      orderId: 'order-1',
      reason: '支付回调补单',
      operatorId: 'owner-1',
    })
    expect(auditMock.writeAdminAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'billing.order.reconcile',
      targetType: 'admin_commercial_order',
      targetId: 'order-1',
      reason: '支付回调补单',
    }))

    const refund = await import('@/app/api/admin/billing/orders/[orderId]/refund/route')
    const refundRes = await refund.POST(
      buildMockRequest({
        path: '/api/admin/billing/orders/order-1/refund',
        method: 'POST',
        body: { reason: '用户退款' },
      }),
      { params: Promise.resolve({ orderId: 'order-1' }) },
    )
    expect(refundRes.status).toBe(200)
    expect(billingMock.refundAdminOrder).toHaveBeenCalledWith({
      orderId: 'order-1',
      reason: '用户退款',
      operatorId: 'owner-1',
    })
    expect(auditMock.writeAdminAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'billing.order.refund',
      targetType: 'admin_commercial_order',
      targetId: 'order-1',
      reason: '用户退款',
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
      after: {
        cancelled: true,
        status: 'canceled',
        freezeRolledBack: true,
      },
      reason: 'stuck',
      ip: '198.51.100.7',
      userAgent: 'vitest-owner-client',
    }))
  })

  it('POST /api/admin/tasks/[taskId] requires a cancellation reason', async () => {
    mockAuthenticatedRole('owner-1', 'owner')
    const mod = await import('@/app/api/admin/tasks/[taskId]/route')
    const emptyBodyRes = await mod.POST(
      buildMockRequest({ path: '/api/admin/tasks/task-1', method: 'POST', body: null }),
      { params: Promise.resolve({ taskId: 'task-1' }) },
    )
    const nonStringReasonRes = await mod.POST(
      buildMockRequest({ path: '/api/admin/tasks/task-1', method: 'POST', body: { reason: 123 } }),
      { params: Promise.resolve({ taskId: 'task-1' }) },
    )
    const blankReasonRes = await mod.POST(
      buildMockRequest({ path: '/api/admin/tasks/task-1', method: 'POST', body: { reason: '   ' } }),
      { params: Promise.resolve({ taskId: 'task-1' }) },
    )

    expect(emptyBodyRes.status).toBe(400)
    expect(nonStringReasonRes.status).toBe(400)
    expect(blankReasonRes.status).toBe(400)
    expect(tasksMock.cancelAdminTask).not.toHaveBeenCalled()
  })

  it('POST /api/admin/tasks/incidents requires owner, reason, and writes safe audit summary', async () => {
    const mod = await import('@/app/api/admin/tasks/incidents/route')

    mockAuthenticatedRole('admin-1', 'admin')
    const adminRes = await mod.POST(
      buildMockRequest({
        path: '/api/admin/tasks/incidents',
        method: 'POST',
        body: {
          title: '取消卡死任务',
          action: 'cancel',
          reason: '队列事故',
          filter: { status: ['queued'], limit: 20 },
        },
      }),
      { params: Promise.resolve({}) },
    )
    expect(adminRes.status).toBe(403)

    mockAuthenticatedRole('owner-1', 'owner')
    const missingReasonRes = await mod.POST(
      buildMockRequest({
        path: '/api/admin/tasks/incidents',
        method: 'POST',
        body: {
          title: '取消卡死任务',
          action: 'cancel',
          filter: { status: ['queued'] },
        },
      }),
      { params: Promise.resolve({}) },
    )
    expect(missingReasonRes.status).toBe(400)

    const emptyFilterRes = await mod.POST(
      buildMockRequest({
        path: '/api/admin/tasks/incidents',
        method: 'POST',
        body: {
          title: '取消卡死任务',
          action: 'cancel',
          reason: '队列事故',
          filter: {},
        },
      }),
      { params: Promise.resolve({}) },
    )
    const invalidStatusRes = await mod.POST(
      buildMockRequest({
        path: '/api/admin/tasks/incidents',
        method: 'POST',
        body: {
          title: '取消卡死任务',
          action: 'cancel',
          reason: '队列事故',
          filter: { status: ['typo'], type: ['video_panel'] },
        },
      }),
      { params: Promise.resolve({}) },
    )
    const unsupportedActionRes = await mod.POST(
      buildMockRequest({
        path: '/api/admin/tasks/incidents',
        method: 'POST',
        body: {
          title: '重试任务',
          action: 'retry',
          reason: '队列事故',
          filter: { status: ['queued'] },
        },
      }),
      { params: Promise.resolve({}) },
    )
    expect(emptyFilterRes.status).toBe(400)
    expect(invalidStatusRes.status).toBe(400)
    expect(unsupportedActionRes.status).toBe(400)
    expect(tasksMock.createTaskIncident).not.toHaveBeenCalled()

    const ownerRes = await mod.POST(
      buildMockRequest({
        path: '/api/admin/tasks/incidents',
        method: 'POST',
        body: {
          title: '取消卡死任务',
          action: 'cancel',
          reason: '队列事故',
          filter: { status: ['queued'], type: ['video_panel'], olderThanMinutes: 30, limit: 20 },
          payload: 'private prompt',
          billingInfo: 'private billing',
        },
        headers: {
          'x-forwarded-for': '198.51.100.9',
          'user-agent': 'vitest-owner-client',
        },
      }),
      { params: Promise.resolve({}) },
    )
    const json = await ownerRes.json()
    const auditCall = lastAuditCall()
    const auditText = JSON.stringify(auditCall)

    expect(ownerRes.status).toBe(200)
    expect(tasksMock.createTaskIncident).toHaveBeenCalledWith({
      title: '取消卡死任务',
      action: 'cancel',
      reason: '队列事故',
      createdBy: 'owner-1',
      filter: {
        status: ['queued'],
        type: ['video_panel'],
        olderThanMinutes: 30,
        limit: 20,
      },
    })
    expect(auditMock.writeAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actor: { id: 'owner-1', role: 'owner' },
      action: 'task.incident.batch_resolve',
      targetType: 'task_incident',
      targetId: 'incident-1',
      after: {
        id: 'incident-1',
        action: 'cancel',
        status: 'completed',
        counts: { total: 1, completed: 1, failed: 0 },
      },
      reason: '队列事故',
      ip: '198.51.100.9',
      userAgent: 'vitest-owner-client',
    }))
    expect(JSON.stringify(json)).not.toContain('payload')
    expect(JSON.stringify(json)).not.toContain('result')
    expect(JSON.stringify(json)).not.toContain('billingInfo')
    expect(JSON.stringify(json)).not.toContain('dedupeKey')
    expect(auditText).not.toContain('before')
    expect(auditText).not.toContain('afterJson')
    expect(auditText).not.toContain('private prompt')
    expect(auditText).not.toContain('private billing')
  })

  it('GET /api/admin/tasks/incidents/[incidentId] is admin-readable and returns safe DTO', async () => {
    const mod = await import('@/app/api/admin/tasks/incidents/[incidentId]/route')
    const context = { params: Promise.resolve({ incidentId: 'incident-1' }) }

    mockAuthenticatedRole('user-1', 'user')
    const userRes = await mod.GET(
      buildMockRequest({ path: '/api/admin/tasks/incidents/incident-1', method: 'GET' }),
      context,
    )
    expect(userRes.status).toBe(403)

    mockAuthenticatedRole('admin-1', 'admin')
    const adminRes = await mod.GET(
      buildMockRequest({ path: '/api/admin/tasks/incidents/incident-1', method: 'GET' }),
      context,
    )
    const jsonText = JSON.stringify(await adminRes.json())

    expect(adminRes.status).toBe(200)
    expect(tasksMock.getTaskIncident).toHaveBeenCalledWith('incident-1')
    expect(jsonText).toContain('incident-1')
    expect(jsonText).not.toContain('payload')
    expect(jsonText).not.toContain('result')
    expect(jsonText).not.toContain('billingInfo')
    expect(jsonText).not.toContain('dedupeKey')
  })

  it('GET /api/admin/system-health enforces admin auth and returns live check DTO', async () => {
    const mod = await import('@/app/api/admin/system-health/route')
    const req = buildMockRequest({ path: '/api/admin/system-health', method: 'GET' })

    mockUnauthenticated()
    expect((await mod.GET(req, { params: Promise.resolve({}) })).status).toBe(401)

    mockAuthenticatedRole('user-1', 'user')
    expect((await mod.GET(req, { params: Promise.resolve({}) })).status).toBe(403)

    mockAuthenticatedRole('admin-1', 'admin')
    const res = await mod.GET(req, { params: Promise.resolve({}) })
    const jsonText = JSON.stringify(await res.json())

    expect(res.status).toBe(200)
    expect(jsonText).toContain('checks')
    expect(jsonText).toContain('redis')
    expect(jsonText).toContain('bullmq')
    expect(jsonText).toContain('worker')
    expect(jsonText).toContain('minio')
    expect(jsonText).toContain('payment')
    expect(jsonText).toContain('modelChannels')
    expect(jsonText).not.toContain('dbpass')
    expect(jsonText).not.toContain('redispass')
    expect(jsonText).not.toContain('minio-secret')
    expect(jsonText).not.toContain('pay-secret')
    expect(jsonText).not.toContain('log-token')
    expect(jsonText).not.toContain('amz-secret')
    expect(jsonText).not.toContain('credential')
    expect(systemHealthMock.getAdminSystemHealth).toHaveBeenCalledTimes(1)
  })

  it('POST /api/admin/system-health writes a snapshot and audit log', async () => {
    const mod = await import('@/app/api/admin/system-health/route')

    mockAuthenticatedRole('user-1', 'user')
    expect((await mod.POST(
      buildMockRequest({ path: '/api/admin/system-health', method: 'POST', body: { reason: '巡检' } }),
      { params: Promise.resolve({}) },
    )).status).toBe(403)

    mockAuthenticatedRole('admin-1', 'admin')
    const missingReasonResponses = [
      await mod.POST(
        buildMockRequest({ path: '/api/admin/system-health', method: 'POST', body: {} }),
        { params: Promise.resolve({}) },
      ),
      await mod.POST(
        buildMockRequest({ path: '/api/admin/system-health', method: 'POST', body: { reason: '' } }),
        { params: Promise.resolve({}) },
      ),
      await mod.POST(
        buildMockRequest({ path: '/api/admin/system-health', method: 'POST', body: { reason: 123 } }),
        { params: Promise.resolve({}) },
      ),
    ]

    expect(missingReasonResponses.map(response => response.status)).toEqual([400, 400, 400])
    await expect(missingReasonResponses[0].json()).resolves.toEqual({ error: 'reason is required' })
    expect(systemHealthMock.getAdminSystemHealth).not.toHaveBeenCalled()
    expect(prismaMock.adminHealthCheckSnapshot.create).not.toHaveBeenCalled()
    expect(auditMock.writeAdminAuditLog).not.toHaveBeenCalled()

    const res = await mod.POST(
      buildMockRequest({
        path: '/api/admin/system-health',
        method: 'POST',
        body: { reason: '巡检', apiKey: 'must-not-leak' },
        headers: {
          'x-forwarded-for': '198.51.100.8',
          'user-agent': 'vitest-admin-client',
        },
      }),
      { params: Promise.resolve({}) },
    )

    expect(res.status).toBe(200)
    expect(prismaMock.adminHealthCheckSnapshot.create).toHaveBeenCalledWith({
      data: {
        status: 'warning',
        summary: 'impacted: 充值支付\nactions: 检查支付渠道配置',
        checksJson: expect.objectContaining({
          redis: { status: 'ok' },
          payment: { status: 'missing_config', configured: false },
        }),
        createdBy: 'admin-1',
      },
    })
    expect(auditMock.writeAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actor: { id: 'admin-1', role: 'admin' },
      action: 'system_health.check',
      targetType: 'system_health',
      targetId: null,
      reason: '巡检',
      ip: '198.51.100.8',
      userAgent: 'vitest-admin-client',
    }))
    const snapshotCall = (prismaMock.adminHealthCheckSnapshot.create.mock.calls as unknown as Array<[unknown]>)[0]?.[0]
    const auditCall = lastAuditCall()
    const responseText = JSON.stringify(await res.json())
    const snapshotText = JSON.stringify(snapshotCall)
    const auditText = JSON.stringify(auditCall)

    for (const secretValue of ['must-not-leak', 'dbpass', 'redispass', 'minio-secret', 'pay-secret', 'log-token', 'amz-secret', 'credential']) {
      expect(responseText).not.toContain(secretValue)
      expect(snapshotText).not.toContain(secretValue)
      expect(auditText).not.toContain(secretValue)
    }
    expect(snapshotText).not.toContain('message')
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
