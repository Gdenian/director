import { prisma } from '@/lib/prisma'

import {
  decimalToString,
  enumValue,
  optionalInt,
  optionalJsonObject,
  optionalString,
  requiredString,
} from './operation-utils'

const GROUP_STATUSES = ['active', 'paused', 'archived'] as const

export interface AdminUserGroupInput {
  key?: unknown
  name?: unknown
  description?: unknown
  status?: unknown
  priority?: unknown
  signupCredits?: unknown
  dailyTaskLimit?: unknown
  concurrentTaskLimit?: unknown
  monthlyCredits?: unknown
  allowedModelTiers?: unknown
  allowText?: unknown
  allowImage?: unknown
  allowVideo?: unknown
  allowVoice?: unknown
  allowLipSync?: unknown
  allowAdvancedModels?: unknown
  maxTaskCost?: unknown
  maxFrozenAmount?: unknown
  modelTierJson?: unknown
  ruleJson?: unknown
  createdBy?: string | null
  updatedBy?: string | null
}

function serializeGroup<T extends {
  signupCredits: unknown
  monthlyCredits: unknown
  maxTaskCost?: unknown
  maxFrozenAmount?: unknown
  createdAt: Date
  updatedAt: Date
}>(group: T) {
  return {
    ...group,
    signupCredits: decimalToString(group.signupCredits),
    monthlyCredits: decimalToString(group.monthlyCredits),
    maxTaskCost: group.maxTaskCost == null ? null : decimalToString(group.maxTaskCost),
    maxFrozenAmount: group.maxFrozenAmount == null ? null : decimalToString(group.maxFrozenAmount),
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  }
}

function parseGroupCreateInput(input: AdminUserGroupInput) {
  return {
    key: requiredString(input.key, 'key'),
    name: requiredString(input.name, 'name'),
    description: optionalString(input.description),
    status: enumValue(input.status, GROUP_STATUSES, 'active'),
    priority: optionalInt(input.priority) ?? 100,
    signupCredits: String(input.signupCredits || 0),
    dailyTaskLimit: optionalInt(input.dailyTaskLimit),
    concurrentTaskLimit: optionalInt(input.concurrentTaskLimit),
    monthlyCredits: String(input.monthlyCredits || 0),
    allowedModelTiers: optionalString(input.allowedModelTiers),
    allowText: typeof input.allowText === 'boolean' ? input.allowText : true,
    allowImage: typeof input.allowImage === 'boolean' ? input.allowImage : true,
    allowVideo: typeof input.allowVideo === 'boolean' ? input.allowVideo : false,
    allowVoice: typeof input.allowVoice === 'boolean' ? input.allowVoice : false,
    allowLipSync: typeof input.allowLipSync === 'boolean' ? input.allowLipSync : false,
    allowAdvancedModels: typeof input.allowAdvancedModels === 'boolean' ? input.allowAdvancedModels : false,
    maxTaskCost: input.maxTaskCost == null ? null : String(input.maxTaskCost),
    maxFrozenAmount: input.maxFrozenAmount == null ? null : String(input.maxFrozenAmount),
    modelTierJson: optionalJsonObject(input.modelTierJson),
    ruleJson: optionalJsonObject(input.ruleJson),
    createdBy: optionalString(input.createdBy),
    updatedBy: optionalString(input.updatedBy),
  }
}

function parseGroupUpdateInput(input: AdminUserGroupInput) {
  const data = {
    ...(input.name !== undefined ? { name: requiredString(input.name, 'name') } : {}),
    ...(input.description !== undefined ? { description: optionalString(input.description) } : {}),
    ...(input.status !== undefined ? { status: enumValue(input.status, GROUP_STATUSES, 'active') } : {}),
    ...(input.priority !== undefined ? { priority: optionalInt(input.priority) ?? 100 } : {}),
    ...(input.signupCredits !== undefined ? { signupCredits: String(input.signupCredits || 0) } : {}),
    ...(input.dailyTaskLimit !== undefined ? { dailyTaskLimit: optionalInt(input.dailyTaskLimit) } : {}),
    ...(input.concurrentTaskLimit !== undefined ? { concurrentTaskLimit: optionalInt(input.concurrentTaskLimit) } : {}),
    ...(input.monthlyCredits !== undefined ? { monthlyCredits: String(input.monthlyCredits || 0) } : {}),
    ...(input.allowedModelTiers !== undefined ? { allowedModelTiers: optionalString(input.allowedModelTiers) } : {}),
    ...(input.allowText !== undefined && typeof input.allowText === 'boolean' ? { allowText: input.allowText } : {}),
    ...(input.allowImage !== undefined && typeof input.allowImage === 'boolean' ? { allowImage: input.allowImage } : {}),
    ...(input.allowVideo !== undefined && typeof input.allowVideo === 'boolean' ? { allowVideo: input.allowVideo } : {}),
    ...(input.allowVoice !== undefined && typeof input.allowVoice === 'boolean' ? { allowVoice: input.allowVoice } : {}),
    ...(input.allowLipSync !== undefined && typeof input.allowLipSync === 'boolean' ? { allowLipSync: input.allowLipSync } : {}),
    ...(input.allowAdvancedModels !== undefined && typeof input.allowAdvancedModels === 'boolean' ? { allowAdvancedModels: input.allowAdvancedModels } : {}),
    ...(input.maxTaskCost !== undefined ? { maxTaskCost: input.maxTaskCost == null ? null : String(input.maxTaskCost) } : {}),
    ...(input.maxFrozenAmount !== undefined ? { maxFrozenAmount: input.maxFrozenAmount == null ? null : String(input.maxFrozenAmount) } : {}),
    ...(input.modelTierJson !== undefined ? { modelTierJson: optionalJsonObject(input.modelTierJson) } : {}),
    ...(input.ruleJson !== undefined ? { ruleJson: optionalJsonObject(input.ruleJson) } : {}),
    ...(input.createdBy !== undefined ? { createdBy: optionalString(input.createdBy) } : {}),
    ...(input.updatedBy !== undefined ? { updatedBy: optionalString(input.updatedBy) } : {}),
  }
  if (Object.keys(data).length === 0) throw new Error('At least one user group field is required')
  return data
}

export async function listAdminUserGroups() {
  const items = await prisma.adminUserGroup.findMany({
    orderBy: [
      { priority: 'asc' },
      { key: 'asc' },
    ],
  })
  return {
    items: items.map(serializeGroup),
  }
}

export async function createAdminUserGroup(input: AdminUserGroupInput) {
  const group = await prisma.adminUserGroup.create({
    data: parseGroupCreateInput(input),
  })
  return serializeGroup(group)
}

export async function updateAdminUserGroup(key: string, input: AdminUserGroupInput) {
  const group = await prisma.adminUserGroup.update({
    where: { key },
    data: parseGroupUpdateInput(input),
  })
  return serializeGroup(group)
}
