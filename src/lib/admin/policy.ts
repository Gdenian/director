import { isAdminRole } from '@/lib/admin/roles'
import { parseCreativeModels } from '@/lib/creative-engine/persisted-config'
import type { CreativeModelConfig } from '@/lib/creative-engine/types'
import { prisma } from '@/lib/prisma'
import { TASK_STATUS, type TaskType } from '@/lib/task/types'
import { audienceMatches, parseList, rolloutMatches, withinWindow } from './audience'
import { OperationPolicyError } from './operation-errors'
import { extractTaskModelKeys, getFeatureFlagForCapability, getTaskOperationCapability } from './task-capabilities'
import { assertModelUsableForTask } from './model-governance-runtime'
import { isModelTierAllowed, resolveUserRuntimeGroup } from './user-groups-runtime'
import type { FeatureFlagKey, OperationAudienceContext } from './policy-types'

type StoredFeatureFlag = {
  key: string
  enabled: boolean
  audience: string | null
  rolloutPercent: number | null
  startsAt: Date | null
  endsAt: Date | null
  userMessage?: string | null
  groupKeys?: string | null
  ruleJson?: unknown
}

function getRuleTargetUserIds(ruleJson: unknown) {
  if (!ruleJson || typeof ruleJson !== 'object' || Array.isArray(ruleJson)) return []
  return parseList((ruleJson as Record<string, unknown>).targetUserIds)
}

export function evaluateFeatureFlag(
  flag: StoredFeatureFlag | null,
  context: OperationAudienceContext & { now?: Date } = {},
) {
  if (!flag) return { allowed: true as const }

  const now = context.now || new Date()
  if (!withinWindow(flag, now)) return { allowed: true as const }

  const matched = audienceMatches({
    audience: flag.audience,
    groupKeys: parseList(flag.groupKeys),
    targetUserIds: getRuleTargetUserIds(flag.ruleJson),
  }, context)
  if (!matched) return { allowed: true as const }

  if (!rolloutMatches(context.userId, flag.rolloutPercent ?? 100)) {
    return { allowed: true as const }
  }

  if (flag.enabled) return { allowed: true as const }

  return {
    allowed: false as const,
    message: flag.userMessage || undefined,
    target: flag.key,
  }
}

export async function getFeatureFlag(key: FeatureFlagKey) {
  const delegate = prisma.adminFeatureFlag as unknown as {
    findUnique: (args: {
      where: { key: string }
    }) => Promise<StoredFeatureFlag | null>
  }

  return await delegate.findUnique({
    where: { key },
  })
}

export async function assertFeatureEnabled(key: FeatureFlagKey, context: OperationAudienceContext = {}) {
  const decision = evaluateFeatureFlag(await getFeatureFlag(key), context)
  if (!decision.allowed) {
    throw new OperationPolicyError(key === 'maintenance_mode' ? 'MAINTENANCE_MODE' : 'FEATURE_DISABLED', {
      message: decision.message,
      target: decision.target || key,
    })
  }
  return { allowed: true as const }
}

export async function assertMaintenanceAllowsRequest(params: {
  maintenanceEnabled: boolean
  role?: string | null
  write: boolean
  message?: string | null
}) {
  if (!params.maintenanceEnabled) return { allowed: true as const }
  if (isAdminRole(params.role)) return { allowed: true as const }
  if (!params.write) return { allowed: true as const }
  throw new OperationPolicyError('MAINTENANCE_MODE', {
    message: params.message || undefined,
    target: 'maintenance_mode',
  })
}

type RuntimeGroup = Awaited<ReturnType<typeof resolveUserRuntimeGroup>>

function capabilityAllowed(group: RuntimeGroup, capability: string) {
  if (capability === 'text') return group.allowText
  if (capability === 'image') return group.allowImage
  if (capability === 'video') return group.allowVideo
  if (capability === 'voice') return group.allowVoice
  if (capability === 'lip_sync') return group.allowLipSync
  if (capability === 'advanced_models') return group.allowAdvancedModels
  return true
}

function getRuntimeModelTier(model: CreativeModelConfig) {
  const tier = typeof model.tier === 'string' ? model.tier.trim() : ''
  return tier || null
}

function isRuntimeAdvancedModel(model: CreativeModelConfig) {
  return getRuntimeModelTier(model) === 'advanced'
    || model.tags?.includes('advanced')
    || model.callName.includes('pro')
}

async function assertTaskModelTiersAllowed(params: {
  userId: string
  group: RuntimeGroup
  payload?: Record<string, unknown> | null
}) {
  const modelKeys = extractTaskModelKeys(params.payload)
  if (modelKeys.length === 0) return

  const pref = await prisma.userPreference.findUnique({
    where: { userId: params.userId },
    select: { customModels: true },
  })
  const models = pref?.customModels ? parseCreativeModels(pref.customModels) : []
  const modelsByKey = new Map(models.map((model) => [model.modelKey, model]))

  for (const modelKey of modelKeys) {
    const model = modelsByKey.get(modelKey)
    if (model) {
      if (!isModelTierAllowed(params.group, {
        isAdvanced: isRuntimeAdvancedModel(model),
        tier: getRuntimeModelTier(model),
        value: modelKey,
      })) {
        throw new OperationPolicyError('MODEL_NOT_ALLOWED', { target: modelKey })
      }
      continue
    }

    if (!params.group.allowAdvancedModels && (modelKey.includes('advanced') || modelKey.includes('pro'))) {
      throw new OperationPolicyError('MODEL_NOT_ALLOWED', { target: 'advanced_models' })
    }
  }
}

export async function assertTaskAllowed(params: {
  userId: string
  role?: string | null
  type: TaskType
  payload?: Record<string, unknown> | null
}) {
  const capability = getTaskOperationCapability(params.type)
  await assertFeatureEnabled(getFeatureFlagForCapability(capability), {
    userId: params.userId,
    role: params.role,
  })

  const group = await resolveUserRuntimeGroup(params.userId)
  if (!capabilityAllowed(group, capability)) {
    throw new OperationPolicyError('ENTITLEMENT_DENIED', { target: capability })
  }

  await assertTaskModelTiersAllowed({
    userId: params.userId,
    group,
    payload: params.payload,
  })

  for (const modelKey of extractTaskModelKeys(params.payload)) {
    await assertModelUsableForTask({
      modelKey,
      userId: params.userId,
      groupKey: group.key,
    })
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  if (group.dailyTaskLimit !== null) {
    const count = await prisma.task.count({
      where: {
        userId: params.userId,
        createdAt: { gte: todayStart },
      },
    })
    if (count >= group.dailyTaskLimit) {
      throw new OperationPolicyError('TASK_DAILY_LIMIT_EXCEEDED')
    }
  }

  if (group.concurrentTaskLimit !== null) {
    const activeCount = await prisma.task.count({
      where: {
        userId: params.userId,
        status: { in: [TASK_STATUS.QUEUED, TASK_STATUS.PROCESSING] },
      },
    })
    if (activeCount >= group.concurrentTaskLimit) {
      throw new OperationPolicyError('TASK_CONCURRENCY_LIMIT_EXCEEDED')
    }
  }

  return { allowed: true as const, capability }
}

export async function assertBillingAllowed(params: {
  userId: string
  amount: number
}) {
  const group = await resolveUserRuntimeGroup(params.userId)
  if (group.maxTaskCost !== null && params.amount > group.maxTaskCost) {
    throw new OperationPolicyError('BILLING_FREEZE_LIMIT_EXCEEDED', { target: 'maxTaskCost' })
  }
  if (group.maxFrozenAmount !== null) {
    const balance = await prisma.userBalance.findUnique({
      where: { userId: params.userId },
      select: { frozenAmount: true },
    })
    const currentFrozen = balance ? Number(balance.frozenAmount) : 0
    if (currentFrozen + params.amount > group.maxFrozenAmount) {
      throw new OperationPolicyError('BILLING_FREEZE_LIMIT_EXCEEDED', { target: 'maxFrozenAmount' })
    }
  }
  return { allowed: true as const, maxFrozenAmount: group.maxFrozenAmount }
}
