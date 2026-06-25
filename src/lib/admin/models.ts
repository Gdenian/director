import { prisma } from '@/lib/prisma'
import {
  booleanValue,
  optionalNumber,
  optionalString,
} from './operation-utils'

const MODEL_CHANNEL_STATUSES = ['active', 'disabled', 'maintenance'] as const
const MODEL_TYPES = ['llm', 'image', 'video', 'audio', 'lipsync'] as const

export class AdminModelChannelInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdminModelChannelInputError'
  }
}

export interface AdminModelChannelUpdateInput {
  provider?: unknown
  model?: unknown
  modelType?: unknown
  status?: unknown
  isAdvanced?: unknown
  isDefault?: unknown
  groupKeys?: unknown
  costMultiplier?: unknown
  userMessage?: unknown
  updatedBy?: string | null
}

type AdminModelChannelLike = {
  key: string
  provider: string
  model: string
  modelType: string
  status: string
  isAdvanced: boolean
  isDefault: boolean
  groupKeys: string | null
  costMultiplier: unknown
  userMessage: string | null
  lastTestStatus: string | null
  lastTestMessage: string | null
  lastTestAt: Date | string | null
  createdAt?: Date | string
  updatedAt?: Date | string
  createdBy?: string | null
  updatedBy?: string | null
}

function decimalToNullableString(value: unknown) {
  if (value === null || value === undefined) return null
  return value && typeof value === 'object' && 'toString' in value ? value.toString() : String(value)
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function summarizeAdminModelChannel(channel: AdminModelChannelLike) {
  return {
    key: channel.key,
    provider: channel.provider,
    model: channel.model,
    modelType: channel.modelType,
    status: channel.status,
    isAdvanced: channel.isAdvanced,
    isDefault: channel.isDefault,
    groupKeys: channel.groupKeys,
    costMultiplier: decimalToNullableString(channel.costMultiplier),
    userMessage: channel.userMessage,
    lastTestStatus: channel.lastTestStatus,
    lastTestMessage: channel.lastTestMessage,
    lastTestAt: toIso(channel.lastTestAt),
    createdAt: toIso(channel.createdAt),
    updatedAt: toIso(channel.updatedAt),
    createdBy: channel.createdBy ?? null,
    updatedBy: channel.updatedBy ?? null,
  }
}

function parseProviderAndModel(modelKey: string) {
  const separatorIndex = modelKey.lastIndexOf('::')
  if (separatorIndex <= 0 || separatorIndex === modelKey.length - 2) {
    return { provider: 'unknown', model: modelKey }
  }
  return {
    provider: modelKey.slice(0, separatorIndex),
    model: modelKey.slice(separatorIndex + 2),
  }
}

function strictEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
) {
  if (typeof value === 'string' && allowed.includes(value as T)) return value as T
  throw new AdminModelChannelInputError(`Invalid ${field}`)
}

function parseChannelUpdateInput(modelKey: string, input: AdminModelChannelUpdateInput) {
  const parsed = parseProviderAndModel(modelKey)
  const data = {
    ...(input.provider !== undefined ? { provider: optionalString(input.provider) || parsed.provider } : {}),
    ...(input.model !== undefined ? { model: optionalString(input.model) || parsed.model } : {}),
    ...(input.modelType !== undefined ? { modelType: strictEnumValue(input.modelType, MODEL_TYPES, 'modelType') } : {}),
    ...(input.status !== undefined ? { status: strictEnumValue(input.status, MODEL_CHANNEL_STATUSES, 'status') } : {}),
    ...(input.isAdvanced !== undefined ? { isAdvanced: booleanValue(input.isAdvanced, false) } : {}),
    ...(input.isDefault !== undefined ? { isDefault: booleanValue(input.isDefault, false) } : {}),
    ...(input.groupKeys !== undefined ? { groupKeys: optionalString(input.groupKeys) } : {}),
    ...(input.costMultiplier !== undefined ? { costMultiplier: optionalNumber(input.costMultiplier) } : {}),
    ...(input.userMessage !== undefined ? { userMessage: optionalString(input.userMessage) } : {}),
    ...(input.updatedBy !== undefined ? { updatedBy: optionalString(input.updatedBy) } : {}),
  }
  if (Object.keys(data).length === 0) throw new AdminModelChannelInputError('At least one model channel field is required')
  return data
}

export async function getAdminModelHealth() {
  const [usageGroups, taskGroups, channels] = await Promise.all([
    prisma.usageCost.groupBy({
      by: ['apiType', 'model'],
      _sum: {
        cost: true,
        quantity: true,
      },
      _count: {
        _all: true,
      },
      orderBy: [
        { apiType: 'asc' },
        { model: 'asc' },
      ],
    }),
    prisma.task.groupBy({
      by: ['type', 'status'],
      _count: {
        _all: true,
      },
      orderBy: [
        { type: 'asc' },
        { status: 'asc' },
      ],
    }),
    prisma.adminModelChannel.findMany({
      orderBy: [
        { provider: 'asc' },
        { modelType: 'asc' },
        { model: 'asc' },
      ],
    }),
  ])

  return {
    usageByModel: usageGroups.map(group => ({
      apiType: group.apiType,
      model: group.model,
      cost: group._sum.cost?.toString() ?? '0',
      quantity: group._sum.quantity ?? 0,
      count: group._count._all,
    })),
    taskHealthByType: taskGroups.map(group => ({
      type: group.type,
      status: group.status,
      count: group._count._all,
    })),
    channels: channels.map((channel) => summarizeAdminModelChannel(channel as unknown as AdminModelChannelLike)),
  }
}

export async function getAdminModelChannelBefore(modelKey: string) {
  const channel = await prisma.adminModelChannel.findUnique({ where: { key: modelKey } })
  return channel ? summarizeAdminModelChannel(channel as unknown as AdminModelChannelLike) : null
}

export async function updateAdminModelChannel(modelKey: string, input: AdminModelChannelUpdateInput) {
  const parsed = parseProviderAndModel(modelKey)
  const data = parseChannelUpdateInput(modelKey, input)
  const channel = await prisma.adminModelChannel.upsert({
    where: { key: modelKey },
    create: {
      key: modelKey,
      provider: parsed.provider,
      model: parsed.model,
      modelType: 'llm',
      ...data,
      createdBy: optionalString(input.updatedBy),
    },
    update: data,
  })
  return summarizeAdminModelChannel(channel as unknown as AdminModelChannelLike)
}

export async function testAdminModelChannel(modelKey: string, input: { actorId?: string | null } = {}) {
  await prisma.adminModelChannel.update({
    where: { key: modelKey },
    data: {
      lastTestStatus: 'skipped',
      lastTestMessage: 'No provider test is configured for this model channel.',
      lastTestAt: new Date(),
      updatedBy: optionalString(input.actorId),
    },
  }).catch(() => null)

  return {
    key: modelKey,
    dryRun: true,
    status: 'skipped',
    message: 'No provider test is configured for this model channel.',
  }
}
