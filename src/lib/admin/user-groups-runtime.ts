import type { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { toMoneyNumber, type MoneyValue } from '@/lib/billing/money'

type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]
type PrismaLike = PrismaClient | TransactionClient

export interface RuntimeUserGroup {
  key: string
  status: string
  signupCredits: number
  dailyTaskLimit: number | null
  concurrentTaskLimit: number | null
  monthlyCredits: number
  allowedModelTiers: string | null
  allowText: boolean
  allowImage: boolean
  allowVideo: boolean
  allowVoice: boolean
  allowLipSync: boolean
  allowAdvancedModels: boolean
  maxTaskCost: number | null
  maxFrozenAmount: number | null
}

export const FALLBACK_USER_GROUP: RuntimeUserGroup = {
  key: 'default',
  status: 'active',
  signupCredits: 0,
  dailyTaskLimit: null,
  concurrentTaskLimit: null,
  monthlyCredits: 0,
  allowedModelTiers: null,
  allowText: true,
  allowImage: true,
  allowVideo: true,
  allowVoice: true,
  allowLipSync: true,
  allowAdvancedModels: true,
  maxTaskCost: null,
  maxFrozenAmount: null,
}

export function inactiveAssignedUserGroup(key: string): RuntimeUserGroup {
  return {
    key,
    status: 'inactive',
    signupCredits: 0,
    dailyTaskLimit: 0,
    concurrentTaskLimit: 0,
    monthlyCredits: 0,
    allowedModelTiers: '',
    allowText: false,
    allowImage: false,
    allowVideo: false,
    allowVoice: false,
    allowLipSync: false,
    allowAdvancedModels: false,
    maxTaskCost: 0,
    maxFrozenAmount: 0,
  }
}

function toRuntimeMoney(value: unknown) {
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'string') {
    return toMoneyNumber(value)
  }
  if (typeof value === 'object' && ('toNumber' in value || 'toString' in value)) {
    return toMoneyNumber(value as MoneyValue)
  }
  return 0
}

function serializeRuntimeGroup(group: Record<string, unknown>): RuntimeUserGroup {
  return {
    key: String(group.key || FALLBACK_USER_GROUP.key),
    status: String(group.status || 'active'),
    signupCredits: toRuntimeMoney(group.signupCredits),
    dailyTaskLimit: typeof group.dailyTaskLimit === 'number' ? group.dailyTaskLimit : null,
    concurrentTaskLimit: typeof group.concurrentTaskLimit === 'number' ? group.concurrentTaskLimit : null,
    monthlyCredits: toRuntimeMoney(group.monthlyCredits),
    allowedModelTiers: typeof group.allowedModelTiers === 'string' ? group.allowedModelTiers : null,
    allowText: group.allowText !== false,
    allowImage: group.allowImage !== false,
    allowVideo: group.allowVideo !== false,
    allowVoice: group.allowVoice !== false,
    allowLipSync: group.allowLipSync !== false,
    allowAdvancedModels: group.allowAdvancedModels !== false,
    maxTaskCost: group.maxTaskCost == null ? null : toRuntimeMoney(group.maxTaskCost),
    maxFrozenAmount: group.maxFrozenAmount == null ? null : toRuntimeMoney(group.maxFrozenAmount),
  }
}

export async function resolveDefaultSignupGroup(client: PrismaLike = prisma) {
  const group = await client.adminUserGroup.findFirst({
    where: { status: 'active' },
    orderBy: [{ priority: 'asc' }, { key: 'asc' }],
  })
  return group ? serializeRuntimeGroup(group as unknown as Record<string, unknown>) : null
}

export async function resolveUserRuntimeGroup(userId: string, client: PrismaLike = prisma) {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { adminGroupKey: true },
  })
  if (!user?.adminGroupKey) return FALLBACK_USER_GROUP
  const group = await client.adminUserGroup.findUnique({ where: { key: user.adminGroupKey } })
  if (!group || group.status !== 'active') return inactiveAssignedUserGroup(user.adminGroupKey)
  return serializeRuntimeGroup(group as unknown as Record<string, unknown>)
}

export function isModelTierAllowed(
  group: RuntimeUserGroup,
  option: { isAdvanced?: boolean; tier?: string | null; value?: string },
) {
  if (option.isAdvanced && !group.allowAdvancedModels) return false
  if (!group.allowedModelTiers) return true

  const allowed = new Set(
    group.allowedModelTiers
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
  if (allowed.size === 0) return true
  return !!option.tier && allowed.has(option.tier)
}
