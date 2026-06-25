import { prisma } from '@/lib/prisma'
import { parseList } from './audience'
import { OperationPolicyError } from './operation-errors'

type ModelGovernanceChannel = {
  key: string
  status: string
  groupKeys: string | null
  userMessage: string | null
}

type ModelOption = {
  value: string
}

const MODEL_CHANNEL_SELECT = {
  key: true,
  status: true,
  groupKeys: true,
  userMessage: true,
}

function modelChannelDelegate() {
  return prisma.adminModelChannel as unknown as {
    findMany: (args: {
      where: { key: { in: string[] } }
      select: typeof MODEL_CHANNEL_SELECT
    }) => Promise<ModelGovernanceChannel[]>
    findUnique: (args: {
      where: { key: string }
      select: typeof MODEL_CHANNEL_SELECT
    }) => Promise<ModelGovernanceChannel | null>
  }
}

function groupAllowed(channel: ModelGovernanceChannel, groupKey?: string | null) {
  const groups = parseList(channel.groupKeys)
  if (groups.length === 0) return true
  return !!groupKey && groups.includes(groupKey)
}

function assertChannelAllowsModel(channel: ModelGovernanceChannel | null, modelKey: string, groupKey?: string | null) {
  if (!channel) return
  if (channel.status !== 'active') {
    throw new OperationPolicyError('MODEL_DISABLED', {
      message: channel.userMessage || undefined,
      target: modelKey,
    })
  }
  if (!groupAllowed(channel, groupKey)) {
    throw new OperationPolicyError('MODEL_NOT_ALLOWED', { target: modelKey })
  }
}

export async function filterModelOptionsForGovernance<T extends ModelOption>(params: {
  userId: string
  groupKey?: string | null
  options: T[]
}) {
  const modelKeys = Array.from(new Set(
    params.options
      .map((option) => option.value.trim())
      .filter(Boolean),
  ))
  if (modelKeys.length === 0) return params.options

  const channels = await modelChannelDelegate().findMany({
    where: { key: { in: modelKeys } },
    select: MODEL_CHANNEL_SELECT,
  })
  const channelsByKey = new Map(channels.map((channel) => [channel.key, channel]))

  return params.options.filter((option) => {
    const channel = channelsByKey.get(option.value)
    if (!channel) return true
    if (channel.status !== 'active') return false
    return groupAllowed(channel, params.groupKey)
  })
}

export async function assertModelUsableForTask(params: {
  modelKey: string
  userId: string
  groupKey?: string | null
}) {
  const modelKey = params.modelKey.trim()
  if (!modelKey) return { allowed: true as const }

  const channel = await modelChannelDelegate().findUnique({
    where: { key: modelKey },
    select: MODEL_CHANNEL_SELECT,
  })
  assertChannelAllowsModel(channel, modelKey, params.groupKey)
  return { allowed: true as const }
}
