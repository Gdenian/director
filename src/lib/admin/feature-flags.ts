import { prisma } from '@/lib/prisma'

import { parseList } from './audience'
import {
  enumValue,
  optionalDate,
  optionalJsonObject,
  optionalString,
  percentValue,
} from './operation-utils'

const FLAG_CATEGORIES = ['access', 'generation', 'billing', 'system', 'experiment'] as const
const FLAG_AUDIENCES = ['all', 'admins', 'test_users', 'vip', 'restricted', 'group', 'target_users'] as const

const DEFAULT_FLAGS = [
  { key: 'registration', name: '注册入口', category: 'access', enabled: true, description: '控制新用户注册。' },
  { key: 'create_work', name: '创建作品', category: 'access', enabled: true, description: '控制用户创建新作品。' },
  { key: 'text_generation', name: '文本生成', category: 'generation', enabled: true, description: '控制故事、剧本和分镜文本生成。' },
  { key: 'image_generation', name: '图片生成', category: 'generation', enabled: true, description: '控制角色、场景、分镜图片生成。' },
  { key: 'video_generation', name: '视频生成', category: 'generation', enabled: true, description: '控制视频生成任务。' },
  { key: 'voice_generation', name: '语音生成', category: 'generation', enabled: true, description: '控制配音和音色设计任务。' },
  { key: 'lip_sync', name: '口型同步', category: 'generation', enabled: true, description: '控制口型同步任务。' },
  { key: 'payment', name: '充值支付', category: 'billing', enabled: true, description: '控制充值和支付入口。' },
  { key: 'redeem_code', name: '兑换码', category: 'billing', enabled: true, description: '控制兑换码兑换入口。' },
  { key: 'advanced_models', name: '高级模型', category: 'generation', enabled: true, description: '控制高级模型可用性。' },
  { key: 'maintenance_mode', name: '维护模式', category: 'system', enabled: false, description: '开启后可在用户端显示维护状态。' },
] as const

type TargetableRecord = {
  surfaces?: unknown
  groupKeys?: unknown
  targetUserIds?: unknown
  ruleJson?: unknown
}

export interface AdminFeatureFlagUpdateInput {
  name?: unknown
  description?: unknown
  category?: unknown
  enabled?: unknown
  audience?: unknown
  rolloutPercent?: unknown
  startsAt?: unknown
  endsAt?: unknown
  userMessage?: unknown
  surfaces?: unknown
  groupKeys?: unknown
  ruleJson?: unknown
  updatedBy?: string | null
}

function ruleJsonTargetUserIds(ruleJson: unknown) {
  if (!ruleJson || typeof ruleJson !== 'object' || Array.isArray(ruleJson)) return []
  return parseList((ruleJson as Record<string, unknown>).targetUserIds)
}

function impactSummary(item: TargetableRecord) {
  const directTargetUserIds = parseList(item.targetUserIds)
  return {
    surfaces: parseList(item.surfaces),
    groupKeys: parseList(item.groupKeys),
    targetUserCount: (directTargetUserIds.length > 0 ? directTargetUserIds : ruleJsonTargetUserIds(item.ruleJson)).length,
  }
}

function serializeFlag<T extends {
  createdAt: Date
  updatedAt: Date
  startsAt: Date | null
  endsAt: Date | null
  surfaces?: unknown
  groupKeys?: unknown
  targetUserIds?: unknown
  ruleJson?: unknown
}>(flag: T) {
  return {
    ...flag,
    startsAt: flag.startsAt?.toISOString() ?? null,
    endsAt: flag.endsAt?.toISOString() ?? null,
    createdAt: flag.createdAt.toISOString(),
    updatedAt: flag.updatedAt.toISOString(),
    impactSummary: impactSummary(flag),
  }
}

function parseFlagUpdate(input: AdminFeatureFlagUpdateInput) {
  const data = {
    ...(input.name !== undefined ? { name: optionalString(input.name) || undefined } : {}),
    ...(input.description !== undefined ? { description: optionalString(input.description) } : {}),
    ...(input.category !== undefined ? { category: enumValue(input.category, FLAG_CATEGORIES, 'system') } : {}),
    ...(input.enabled !== undefined && typeof input.enabled === 'boolean' ? { enabled: input.enabled } : {}),
    ...(input.audience !== undefined ? { audience: enumValue(input.audience, FLAG_AUDIENCES, 'all') } : {}),
    ...(input.rolloutPercent !== undefined ? { rolloutPercent: percentValue(input.rolloutPercent) } : {}),
    ...(input.startsAt !== undefined ? { startsAt: optionalDate(input.startsAt) } : {}),
    ...(input.endsAt !== undefined ? { endsAt: optionalDate(input.endsAt) } : {}),
    ...(input.userMessage !== undefined ? { userMessage: optionalString(input.userMessage) } : {}),
    ...(input.surfaces !== undefined ? { surfaces: optionalString(input.surfaces) } : {}),
    ...(input.groupKeys !== undefined ? { groupKeys: optionalString(input.groupKeys) } : {}),
    ...(input.ruleJson !== undefined ? { ruleJson: optionalJsonObject(input.ruleJson) } : {}),
    ...(input.updatedBy !== undefined ? { updatedBy: optionalString(input.updatedBy) } : {}),
  }
  if (Object.keys(data).length === 0) throw new Error('At least one feature flag field is required')
  return data
}

export async function ensureDefaultFeatureFlags() {
  await Promise.all(DEFAULT_FLAGS.map(flag => prisma.adminFeatureFlag.upsert({
    where: { key: flag.key },
    create: {
      ...flag,
      audience: 'all',
      rolloutPercent: 100,
      userMessage: null,
      surfaces: null,
      groupKeys: null,
      ruleJson: undefined,
    },
    update: {},
  })))
}

export async function listAdminFeatureFlags() {
  await ensureDefaultFeatureFlags()
  const items = await prisma.adminFeatureFlag.findMany({
    orderBy: [
      { category: 'asc' },
      { key: 'asc' },
    ],
  })

  return {
    items: items.map(serializeFlag),
  }
}

export async function updateAdminFeatureFlag(key: string, input: AdminFeatureFlagUpdateInput) {
  const flag = await prisma.adminFeatureFlag.upsert({
    where: { key },
    create: {
      key,
      name: optionalString(input.name) || key,
      description: optionalString(input.description),
      category: enumValue(input.category, FLAG_CATEGORIES, 'system'),
      enabled: typeof input.enabled === 'boolean' ? input.enabled : true,
      audience: enumValue(input.audience, FLAG_AUDIENCES, 'all'),
      rolloutPercent: percentValue(input.rolloutPercent),
      startsAt: optionalDate(input.startsAt),
      endsAt: optionalDate(input.endsAt),
      userMessage: optionalString(input.userMessage),
      surfaces: optionalString(input.surfaces),
      groupKeys: optionalString(input.groupKeys),
      ruleJson: optionalJsonObject(input.ruleJson),
      updatedBy: optionalString(input.updatedBy),
    },
    update: parseFlagUpdate(input),
  })
  return serializeFlag(flag)
}
