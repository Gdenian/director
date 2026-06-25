import { getLogFilesList } from '@/lib/logging/file-writer'
import { prisma } from '@/lib/prisma'
import { TASK_STATUS } from '@/lib/task/types'

type HealthStatus = 'ok' | 'warning' | 'critical' | 'error' | 'empty' | 'missing_config'

type BaseCheck = {
  status: HealthStatus
  message?: string
  impact?: string
}

type QueueCounts = {
  waiting: number
  active: number
  delayed: number
  failed: number
  completed: number
  paused: number
}

export type AdminHealthChecks = {
  database: BaseCheck
  redis: BaseCheck
  bullmq: BaseCheck & { queues?: Record<string, QueueCounts> }
  worker: BaseCheck & {
    queuedBacklog?: number
    running?: number
    staleRunning?: number
    latestHeartbeatAt?: string | null
  }
  minio: BaseCheck & { storageType?: string }
  payment: BaseCheck & { configured?: boolean }
  modelChannels: BaseCheck & {
    total?: number
    active?: number
    disabled?: number
    maintenance?: number
    failed?: number
    defaultProblems?: number
  }
  logs: BaseCheck & { files?: number; totalSizeBytes?: number }
}

export type AdminSystemHealthSummary = {
  status: Exclude<HealthStatus, 'empty'>
  impactedFeatures: string[]
  recommendedActions: string[]
}

const HEALTH_CHECK_IMPACTS: Record<keyof AdminHealthChecks, string> = {
  database: '管理后台、任务提交、用户登录态相关查询',
  redis: '任务提交、任务状态推送、队列调度',
  bullmq: '任务排队、异步生成、批量任务恢复',
  worker: '文本、图片、视频、配音生成处理',
  minio: '素材上传、预览、成片和资产存储',
  payment: '充值、套餐购买、余额入账',
  modelChannels: '模型选择、任务提交、生成链路',
  logs: '故障排查、审计辅助、运维定位',
}

function withImpact<K extends keyof AdminHealthChecks>(key: K, check: AdminHealthChecks[K]): AdminHealthChecks[K] {
  return {
    ...check,
    impact: check.impact || HEALTH_CHECK_IMPACTS[key],
  }
}

export function redactHealthMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^/@\s:]+):([^/@\s]+)@/gi, '$1$2:***@')
    .replace(/([?&][^=\s&]*(?:api[_-]?key|token|secret|signature|credential|access[_-]?key)[^=\s&]*=)([^&\s]+)/gi, '$1***')
    .replace(/\b([A-Z0-9_]*(?:DATABASE_URL|REDIS_URL|MYSQL_URL|POSTGRES_URL|PASSWORD|SECRET|TOKEN|API[_-]?KEY|ACCESS[_-]?KEY)[A-Z0-9_-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=***')
    .replace(/(["']?(?:apiKey|api_key|secret|secretAccessKey|password|token|databaseUrl|redisUrl|mysqlUrl|postgresUrl)["']?\s*:\s*)("[^"]*"|'[^']*'|[^\s,}]+)/gi, '$1***')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1***')
}

export function sanitizeHealthChecksForSnapshot(checks: AdminHealthChecks) {
  return {
    database: { status: checks.database.status },
    redis: { status: checks.redis.status },
    bullmq: {
      status: checks.bullmq.status,
      queues: checks.bullmq.queues,
    },
    worker: {
      status: checks.worker.status,
      queuedBacklog: checks.worker.queuedBacklog,
      running: checks.worker.running,
      staleRunning: checks.worker.staleRunning,
      latestHeartbeatAt: checks.worker.latestHeartbeatAt,
    },
    minio: {
      status: checks.minio.status,
      storageType: checks.minio.storageType,
    },
    payment: {
      status: checks.payment.status,
      configured: checks.payment.configured,
    },
    modelChannels: {
      status: checks.modelChannels.status,
      total: checks.modelChannels.total,
      active: checks.modelChannels.active,
      disabled: checks.modelChannels.disabled,
      maintenance: checks.modelChannels.maintenance,
      failed: checks.modelChannels.failed,
      defaultProblems: checks.modelChannels.defaultProblems,
    },
    logs: {
      status: checks.logs.status,
      files: checks.logs.files,
      totalSizeBytes: checks.logs.totalSizeBytes,
    },
  }
}

function sanitizeHealthCheckForResponse<T extends BaseCheck>(check: T): T {
  if (!check.message) return check
  return {
    ...check,
    message: redactHealthMessage(check.message),
  }
}

export function sanitizeHealthChecksForResponse(checks: AdminHealthChecks): AdminHealthChecks {
  return {
    database: sanitizeHealthCheckForResponse(checks.database),
    redis: sanitizeHealthCheckForResponse(checks.redis),
    bullmq: sanitizeHealthCheckForResponse(checks.bullmq),
    worker: sanitizeHealthCheckForResponse(checks.worker),
    minio: sanitizeHealthCheckForResponse(checks.minio),
    payment: sanitizeHealthCheckForResponse(checks.payment),
    modelChannels: sanitizeHealthCheckForResponse(checks.modelChannels),
    logs: sanitizeHealthCheckForResponse(checks.logs),
  }
}

export function sanitizeAdminSystemHealthForResponse<
  T extends {
    checks: AdminHealthChecks
    database?: AdminHealthChecks['database']
    logs?: AdminHealthChecks['logs']
  },
>(health: T): T {
  const checks = sanitizeHealthChecksForResponse(health.checks)
  return {
    ...health,
    checks,
    database: health.database ? checks.database : health.database,
    logs: health.logs ? checks.logs : health.logs,
  }
}

function addUnique(items: string[], item: string) {
  if (!items.includes(item)) items.push(item)
}

function hasPaymentProvider() {
  return Boolean(
    process.env.COMMERCIAL_PAYMENT_PROVIDER
    || process.env.PAYMENT_PROVIDER
    || process.env.STRIPE_SECRET_KEY
    || process.env.ALIPAY_APP_ID,
  )
}

function mostSevere(statuses: HealthStatus[]): AdminSystemHealthSummary['status'] {
  if (statuses.some(status => status === 'critical' || status === 'error')) return 'critical'
  if (statuses.some(status => status === 'warning' || status === 'empty' || status === 'missing_config')) return 'warning'
  return 'ok'
}

export function summarizeHealthChecks(checks: AdminHealthChecks): AdminSystemHealthSummary {
  const impactedFeatures: string[] = []
  const recommendedActions: string[] = []

  if (checks.database.status !== 'ok') {
    addUnique(impactedFeatures, '管理后台')
    addUnique(impactedFeatures, '任务提交')
    addUnique(recommendedActions, '检查数据库连接')
  }

  if (checks.redis.status !== 'ok' || checks.bullmq.status !== 'ok') {
    addUnique(impactedFeatures, '任务提交')
    addUnique(recommendedActions, '检查 Redis 和 BullMQ')
  }

  if (checks.worker.status === 'critical' || checks.worker.status === 'error') {
    addUnique(impactedFeatures, '任务提交')
    addUnique(recommendedActions, '重启 worker')
  } else if (checks.worker.status === 'warning') {
    addUnique(impactedFeatures, '任务处理')
    addUnique(recommendedActions, '检查 worker backlog')
  }

  if (checks.minio.status !== 'ok') {
    addUnique(impactedFeatures, '素材存储')
    addUnique(recommendedActions, '检查存储服务')
  }

  if (checks.payment.status !== 'ok') {
    addUnique(impactedFeatures, '充值支付')
    addUnique(recommendedActions, '检查支付渠道配置')
  }

  if (checks.modelChannels.status !== 'ok') {
    addUnique(impactedFeatures, '任务提交')
    addUnique(recommendedActions, '检查模型渠道')
  }

  const status = mostSevere(Object.values(checks).map(check => check.status))
  if (status === 'critical') {
    addUnique(recommendedActions, '开启维护模式')
  }

  return { status, impactedFeatures, recommendedActions }
}

async function checkDatabase(): Promise<AdminHealthChecks['database']> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return { status: 'ok' }
  } catch (error) {
    return { status: 'error', message: redactHealthMessage(error) }
  }
}

async function checkRedis(): Promise<AdminHealthChecks['redis']> {
  try {
    const { redis } = await import('@/lib/redis')
    const pong = await redis.ping()
    return pong === 'PONG'
      ? { status: 'ok' }
      : { status: 'error', message: 'Redis ping did not return PONG' }
  } catch (error) {
    return { status: 'error', message: redactHealthMessage(error) }
  }
}

async function checkBullmq(): Promise<AdminHealthChecks['bullmq']> {
  try {
    const { imageQueue, renderQueue, textQueue, videoQueue, voiceQueue } = await import('@/lib/task/queues')
    const queues = [
      { key: 'text', queue: textQueue },
      { key: 'image', queue: imageQueue },
      { key: 'video', queue: videoQueue },
      { key: 'voice', queue: voiceQueue },
      { key: 'render', queue: renderQueue },
    ] as const
    const entries = await Promise.all(queues.map(async ({ key, queue }) => {
      const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'paused')
      return [key, {
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        delayed: counts.delayed || 0,
        failed: counts.failed || 0,
        completed: counts.completed || 0,
        paused: counts.paused || 0,
      }] as const
    }))

    return { status: 'ok', queues: Object.fromEntries(entries) }
  } catch (error) {
    return { status: 'error', message: redactHealthMessage(error) }
  }
}

async function checkWorker(): Promise<AdminHealthChecks['worker']> {
  try {
    const staleHeartbeatBefore = new Date(Date.now() - 5 * 60 * 1000)
    const [queuedBacklog, running, staleRunning, latestRunning] = await Promise.all([
      prisma.task.count({ where: { status: TASK_STATUS.QUEUED } }),
      prisma.task.count({ where: { status: TASK_STATUS.PROCESSING } }),
      prisma.task.count({
        where: {
          status: TASK_STATUS.PROCESSING,
          OR: [
            { heartbeatAt: null },
            { heartbeatAt: { lt: staleHeartbeatBefore } },
          ],
        },
      }),
      prisma.task.findFirst({
        where: {
          status: TASK_STATUS.PROCESSING,
          heartbeatAt: { not: null },
        },
        orderBy: { heartbeatAt: 'desc' },
        select: { heartbeatAt: true },
      }),
    ])

    const status: HealthStatus = staleRunning > 0
      ? 'critical'
      : queuedBacklog > 0 && running === 0
        ? 'warning'
        : 'ok'

    return {
      status,
      queuedBacklog,
      running,
      staleRunning,
      latestHeartbeatAt: latestRunning?.heartbeatAt?.toISOString() ?? null,
    }
  } catch (error) {
    return { status: 'error', message: redactHealthMessage(error) }
  }
}

async function checkStorage(): Promise<AdminHealthChecks['minio']> {
  try {
    const { checkStorageHealth } = await import('@/lib/storage')
    return await checkStorageHealth()
  } catch (error) {
    return { status: 'error', message: redactHealthMessage(error) }
  }
}

async function checkPayment(): Promise<AdminHealthChecks['payment']> {
  const flag = await prisma.adminFeatureFlag.findUnique({
    where: { key: 'payment' },
    select: { enabled: true },
  }).catch(() => null)
  if (flag?.enabled === false) {
    return { status: 'ok', configured: false, message: 'Payment feature is disabled' }
  }

  const configured = hasPaymentProvider()
  return configured
    ? { status: 'ok', configured }
    : { status: 'missing_config', configured, message: 'Payment provider is not configured' }
}

async function checkModelChannels(): Promise<AdminHealthChecks['modelChannels']> {
  try {
    const channels = await prisma.adminModelChannel.groupBy({
      by: ['status', 'lastTestStatus', 'isDefault'],
      _count: { _all: true },
    })
    let total = 0
    let active = 0
    let disabled = 0
    let maintenance = 0
    let failed = 0
    let defaultProblems = 0

    for (const channel of channels) {
      const count = channel._count._all
      total += count
      if (channel.status === 'active') active += count
      if (channel.status === 'disabled') disabled += count
      if (channel.status === 'maintenance') maintenance += count
      if (channel.lastTestStatus === 'failed' || channel.lastTestStatus === 'error') failed += count
      if (channel.isDefault && (
        channel.status !== 'active'
        || channel.lastTestStatus === 'failed'
        || channel.lastTestStatus === 'error'
      )) {
        defaultProblems += count
      }
    }

    const status: HealthStatus = (active === 0 && total > 0) || defaultProblems > 0
      ? 'error'
      : disabled > 0 || maintenance > 0 || failed > 0
        ? 'warning'
        : 'ok'

    return { status, total, active, disabled, maintenance, failed, defaultProblems }
  } catch (error) {
    return { status: 'error', message: redactHealthMessage(error) }
  }
}

async function checkLogs(): Promise<AdminHealthChecks['logs']> {
  try {
    const logs = await getLogFilesList()
    const totalSizeBytes = logs.reduce((sum, item) => sum + item.sizeBytes, 0)
    return logs.length > 0
      ? { status: 'ok', files: logs.length, totalSizeBytes }
      : { status: 'empty', files: 0, totalSizeBytes: 0 }
  } catch (error) {
    return { status: 'error', message: redactHealthMessage(error) }
  }
}

export async function getAdminSystemHealth() {
  const [
    database,
    redisCheck,
    bullmq,
    worker,
    minio,
    payment,
    modelChannels,
    logs,
  ] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkBullmq(),
    checkWorker(),
    checkStorage(),
    checkPayment(),
    checkModelChannels(),
    checkLogs(),
  ])
  const checks: AdminHealthChecks = {
    database: withImpact('database', database),
    redis: withImpact('redis', redisCheck),
    bullmq: withImpact('bullmq', bullmq),
    worker: withImpact('worker', worker),
    minio: withImpact('minio', minio),
    payment: withImpact('payment', payment),
    modelChannels: withImpact('modelChannels', modelChannels),
    logs: withImpact('logs', logs),
  }
  const summary = summarizeHealthChecks(checks)

  return {
    ...summary,
    checks,
    database,
    logs,
    checkedAt: new Date().toISOString(),
  }
}
