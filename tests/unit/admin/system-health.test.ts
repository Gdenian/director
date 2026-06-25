import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  redactHealthMessage,
  sanitizeAdminSystemHealthForResponse,
  sanitizeHealthChecksForSnapshot,
  summarizeHealthChecks,
  type AdminHealthChecks,
} from '@/lib/admin/system-health'

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(async () => [{ ok: 1 }]),
  task: {
    count: vi.fn(async () => 0),
    findFirst: vi.fn(async () => null),
  },
  adminModelChannel: {
    groupBy: vi.fn(async (): Promise<Array<{
      status: string
      lastTestStatus: string | null
      isDefault: boolean
      _count: { _all: number }
    }>> => []),
  },
  adminFeatureFlag: {
    findUnique: vi.fn(async () => ({ enabled: true })),
  },
}))

const logsMock = vi.hoisted(() => ({
  readAllLogs: vi.fn(async () => ['log line']),
  getLogFilesList: vi.fn(async () => [{ name: 'app.log', sizeBytes: 12, modifiedAt: '2026-06-24T00:00:00.000Z' }]),
}))

const redisMock = vi.hoisted(() => ({
  redis: { ping: vi.fn(async () => 'PONG') },
}))

const queueCountsMock = vi.hoisted(() => vi.fn(async () => ({
  waiting: 0,
  active: 0,
  delayed: 0,
  failed: 0,
  completed: 0,
  paused: 0,
})))

const storageMock = vi.hoisted(() => ({
  checkStorageHealth: vi.fn(async (): Promise<{ status: string; storageType: string; message?: string }> => ({ status: 'ok', storageType: 'minio' })),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/logging/file-writer', () => logsMock)
vi.mock('@/lib/redis', () => redisMock)
vi.mock('@/lib/task/queues', () => ({
  textQueue: { getJobCounts: queueCountsMock },
  imageQueue: { getJobCounts: queueCountsMock },
  videoQueue: { getJobCounts: queueCountsMock },
  voiceQueue: { getJobCounts: queueCountsMock },
  renderQueue: { getJobCounts: queueCountsMock },
}))
vi.mock('@/lib/storage', () => storageMock)

describe('summarizeHealthChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('COMMERCIAL_PAYMENT_PROVIDER', '')
    vi.stubEnv('PAYMENT_PROVIDER', '')
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    vi.stubEnv('ALIPAY_APP_ID', '')
    storageMock.checkStorageHealth.mockResolvedValue({ status: 'ok', storageType: 'minio' })
    prismaMock.adminFeatureFlag.findUnique.mockResolvedValue({ enabled: true })
    prismaMock.adminModelChannel.groupBy.mockResolvedValue([])
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('marks redis/bullmq/worker/payment/model channel failures as critical with actions', () => {
    const checks: AdminHealthChecks = {
      database: { status: 'ok' },
      redis: { status: 'error', message: 'redis unavailable' },
      bullmq: { status: 'error', message: 'queue counts failed' },
      worker: { status: 'critical', queuedBacklog: 42, running: 3 },
      minio: { status: 'ok', storageType: 'local' },
      payment: { status: 'error', configured: false },
      modelChannels: { status: 'error', total: 5, disabled: 1, maintenance: 1, failed: 2 },
      logs: { status: 'ok' },
    }

    const summary = summarizeHealthChecks(checks)

    expect(summary.status).toBe('critical')
    expect(summary.impactedFeatures).toEqual(expect.arrayContaining(['任务提交', '充值支付']))
    expect(summary.recommendedActions).toEqual(expect.arrayContaining(['开启维护模式']))
  })

  it('uses the storage health probe instead of only reading the storage type', async () => {
    storageMock.checkStorageHealth.mockResolvedValueOnce({
      status: 'error',
      storageType: 'minio',
      message: 'bucket unavailable',
    })
    const { getAdminSystemHealth } = await import('@/lib/admin/system-health')

    const health = await getAdminSystemHealth()

    expect(storageMock.checkStorageHealth).toHaveBeenCalledTimes(1)
    expect(health.checks.minio).toMatchObject({
      status: 'error',
      storageType: 'minio',
      message: 'bucket unavailable',
    })
    expect(health.impactedFeatures).toContain('素材存储')
  })

  it('redacts connection strings and object-style secrets from health messages', () => {
    const redacted = redactHealthMessage(
      'DATABASE_URL="mysql://root:dbpass@127.0.0.1/app" redis://default:redispass@127.0.0.1:6379 {"apiKey":"sk-live","secretAccessKey":"minio-secret"} token: abc123 Bearer live-token https://s3.local/bucket?X-Amz-Signature=amz-secret&X-Amz-Credential=credential&safe=value',
    )

    expect(redacted).not.toContain('dbpass')
    expect(redacted).not.toContain('redispass')
    expect(redacted).not.toContain('sk-live')
    expect(redacted).not.toContain('minio-secret')
    expect(redacted).not.toContain('live-token')
    expect(redacted).not.toContain('amz-secret')
    expect(redacted).not.toContain('credential')
    expect(redacted).toContain('DATABASE_URL=***')
    expect(redacted).toContain('safe=value')
  })

  it('stores only a safe health snapshot summary', () => {
    const checks: AdminHealthChecks = {
      database: { status: 'error', message: 'mysql://root:secret@db/app' },
      redis: { status: 'error', message: 'redis://default:secret@redis:6379' },
      bullmq: { status: 'ok', queues: { text: { waiting: 1, active: 0, delayed: 0, failed: 0, completed: 0, paused: 0 } } },
      worker: { status: 'ok', queuedBacklog: 0, running: 0, staleRunning: 0, latestHeartbeatAt: null },
      minio: { status: 'error', storageType: 'minio', message: 'secretAccessKey: minio-secret' },
      payment: { status: 'missing_config', configured: false, message: 'apiKey=pay-secret' },
      modelChannels: { status: 'warning', total: 2, active: 1, disabled: 0, maintenance: 0, failed: 1, defaultProblems: 0 },
      logs: { status: 'ok', files: 1, totalSizeBytes: 12 },
    }

    const snapshot = sanitizeHealthChecksForSnapshot(checks)
    const text = JSON.stringify(snapshot)

    expect(text).not.toContain('secret')
    expect(text).not.toContain('apiKey')
    expect(snapshot.database).toEqual({ status: 'error' })
    expect(snapshot.minio).toEqual({ status: 'error', storageType: 'minio' })
  })

  it('redacts health messages in response DTOs', () => {
    const checks: AdminHealthChecks = {
      database: { status: 'error', message: 'mysql://root:secret@db/app' },
      redis: { status: 'error', message: 'redis://default:redis-secret@redis:6379' },
      bullmq: { status: 'ok', queues: {} },
      worker: { status: 'ok' },
      minio: { status: 'error', storageType: 'minio', message: 'secretAccessKey: minio-secret' },
      payment: { status: 'missing_config', configured: false, message: 'apiKey=pay-secret' },
      modelChannels: { status: 'ok' },
      logs: { status: 'ok', message: 'Bearer log-token' },
    }

    const health = sanitizeAdminSystemHealthForResponse({
      status: 'warning' as const,
      impactedFeatures: ['充值支付'],
      recommendedActions: ['检查支付渠道配置'],
      checks,
      database: checks.database,
      logs: checks.logs,
      checkedAt: '2026-06-24T00:00:00.000Z',
    })
    const text = JSON.stringify(health)

    expect(text).not.toContain('secret@db')
    expect(text).not.toContain('redis-secret')
    expect(text).not.toContain('minio-secret')
    expect(text).not.toContain('pay-secret')
    expect(text).not.toContain('log-token')
    expect(health.checks.payment.message).toContain('apiKey=***')
    expect(health.database?.message).toContain('root:***@')
  })

  it('keeps partial model channel failures at warning when active channels remain', async () => {
    prismaMock.adminModelChannel.groupBy.mockResolvedValueOnce([
      { status: 'active', lastTestStatus: null, isDefault: true, _count: { _all: 1 } },
      { status: 'active', lastTestStatus: 'failed', isDefault: false, _count: { _all: 1 } },
    ])
    const { getAdminSystemHealth } = await import('@/lib/admin/system-health')

    const health = await getAdminSystemHealth()

    expect(health.checks.modelChannels.status).toBe('warning')
    expect(health.status).toBe('warning')
    expect(health.recommendedActions).not.toContain('开启维护模式')
  })

  it('treats disabled payment feature as ok without provider config', async () => {
    prismaMock.adminFeatureFlag.findUnique.mockResolvedValueOnce({ enabled: false })
    const { getAdminSystemHealth } = await import('@/lib/admin/system-health')

    const health = await getAdminSystemHealth()

    expect(health.checks.payment).toMatchObject({
      status: 'ok',
      configured: false,
    })
    expect(health.impactedFeatures).not.toContain('充值支付')
  })

  it('marks enabled payment feature without provider as missing config warning', async () => {
    prismaMock.adminFeatureFlag.findUnique.mockResolvedValueOnce({ enabled: true })
    const { getAdminSystemHealth } = await import('@/lib/admin/system-health')

    const health = await getAdminSystemHealth()

    expect(health.checks.payment).toMatchObject({
      status: 'missing_config',
      configured: false,
    })
    expect(health.status).toBe('warning')
    expect(health.impactedFeatures).toContain('充值支付')
  })

  it('lists log files without reading complete log contents', async () => {
    const { getAdminSystemHealth } = await import('@/lib/admin/system-health')

    const health = await getAdminSystemHealth()

    expect(logsMock.getLogFilesList).toHaveBeenCalledTimes(1)
    expect(logsMock.readAllLogs).not.toHaveBeenCalled()
    expect(health.checks.logs).toMatchObject({
      status: 'ok',
      files: 1,
      totalSizeBytes: 12,
    })
  })
})
