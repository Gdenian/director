import { prisma } from '@/lib/prisma'

import { parseList } from './audience'
import {
  decimalToString,
  enumValue,
  optionalDate,
  optionalInt,
  optionalString,
  requiredString,
} from './operation-utils'

const COMMERCIAL_STATUSES = ['active', 'paused', 'archived'] as const

type CommercialImpactRecord = {
  userGroupKey?: unknown
  groupKeys?: unknown
  targetUserIds?: unknown
}

export interface AdminCommercialPackageInput {
  key?: unknown
  name?: unknown
  description?: unknown
  status?: unknown
  price?: unknown
  currency?: unknown
  credits?: unknown
  bonusCredits?: unknown
  durationDays?: unknown
  userGroupKey?: unknown
  groupKeys?: unknown
  startsAt?: unknown
  endsAt?: unknown
  purchaseLimitPerUser?: unknown
  sortOrder?: unknown
  createdBy?: string | null
  updatedBy?: string | null
}

export interface AdminRedeemCodeInput {
  code?: unknown
  status?: unknown
  credits?: unknown
  maxRedemptions?: unknown
  redeemedCount?: unknown
  singleUserLimit?: unknown
  startsAt?: unknown
  endsAt?: unknown
  userGroupKey?: unknown
  groupKeys?: unknown
  targetUserIds?: unknown
  createdBy?: string | null
  updatedBy?: string | null
}

function serializePackage<T extends {
  price: unknown
  credits: unknown
  bonusCredits: unknown
  startsAt?: Date | null
  endsAt?: Date | null
  createdAt: Date
  updatedAt: Date
  userGroupKey?: unknown
  groupKeys?: unknown
  targetUserIds?: unknown
}>(item: T) {
  return {
    ...item,
    price: moneySummaryString(item.price),
    credits: moneySummaryString(item.credits),
    bonusCredits: moneySummaryString(item.bonusCredits),
    startsAt: item.startsAt?.toISOString() ?? null,
    endsAt: item.endsAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    impactSummary: impactSummary(item, 'commercial'),
  }
}

function serializeRedeemCode<T extends {
  credits: unknown
  startsAt: Date | null
  endsAt: Date | null
  createdAt: Date
  updatedAt: Date
  userGroupKey?: unknown
  groupKeys?: unknown
  targetUserIds?: unknown
}>(item: T) {
  return {
    ...item,
    credits: moneySummaryString(item.credits),
    startsAt: item.startsAt?.toISOString() ?? null,
    endsAt: item.endsAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    impactSummary: impactSummary(item, 'redeem_code'),
  }
}

function moneySummaryString(value: unknown) {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return decimalToString(value)
}

function nonNegativeMoneyString(value: unknown, field: string) {
  const number = Number(value ?? 0)
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${field} must be non-negative`)
  }
  return String(value ?? 0)
}

function impactSummary(item: CommercialImpactRecord, surface: string) {
  const groupKeys = [
    ...parseList(item.userGroupKey),
    ...parseList(item.groupKeys),
  ]
  return {
    surfaces: [surface],
    groupKeys: Array.from(new Set(groupKeys)),
    targetUserCount: parseList(item.targetUserIds).length,
  }
}

function serializePackageSummary<T extends {
  key?: string
  name?: string
  description?: string | null
  status?: string
  price?: unknown
  currency?: string
  credits?: unknown
  bonusCredits?: unknown
  durationDays?: number | null
  userGroupKey?: string | null
  groupKeys?: string | null
  startsAt?: Date | string | null
  endsAt?: Date | string | null
  purchaseLimitPerUser?: number | null
  sortOrder?: number
}>(item: T | null) {
  if (!item) return null
  return {
    key: item.key,
    name: item.name,
    description: item.description ?? null,
    status: item.status,
    price: moneySummaryString(item.price),
    currency: item.currency,
    credits: moneySummaryString(item.credits),
    bonusCredits: moneySummaryString(item.bonusCredits),
    durationDays: item.durationDays ?? null,
    userGroupKey: item.userGroupKey ?? null,
    groupKeys: item.groupKeys ?? null,
    startsAt: item.startsAt instanceof Date ? item.startsAt.toISOString() : (item.startsAt ?? null),
    endsAt: item.endsAt instanceof Date ? item.endsAt.toISOString() : (item.endsAt ?? null),
    purchaseLimitPerUser: item.purchaseLimitPerUser ?? null,
    sortOrder: item.sortOrder,
    impactSummary: impactSummary(item, 'commercial'),
  }
}

function serializeRedeemCodeSummary<T extends {
  code?: string
  status?: string
  credits?: unknown
  maxRedemptions?: number
  redeemedCount?: number
  singleUserLimit?: number
  startsAt?: Date | string | null
  endsAt?: Date | string | null
  userGroupKey?: string | null
  groupKeys?: string | null
  targetUserIds?: string | null
}>(item: T | null) {
  if (!item) return null
  return {
    code: item.code,
    status: item.status,
    credits: moneySummaryString(item.credits),
    maxRedemptions: item.maxRedemptions,
    redeemedCount: item.redeemedCount,
    singleUserLimit: item.singleUserLimit,
    startsAt: item.startsAt instanceof Date ? item.startsAt.toISOString() : (item.startsAt ?? null),
    endsAt: item.endsAt instanceof Date ? item.endsAt.toISOString() : (item.endsAt ?? null),
    userGroupKey: item.userGroupKey ?? null,
    groupKeys: item.groupKeys ?? null,
    targetUserIds: item.targetUserIds ?? null,
    impactSummary: impactSummary(item, 'redeem_code'),
  }
}

function parsePackageCreateInput(input: AdminCommercialPackageInput) {
  return {
    key: requiredString(input.key, 'key'),
    name: requiredString(input.name, 'name'),
    description: optionalString(input.description),
    status: enumValue(input.status, COMMERCIAL_STATUSES, 'active'),
    price: nonNegativeMoneyString(input.price, 'price'),
    currency: optionalString(input.currency) || 'CNY',
    credits: nonNegativeMoneyString(input.credits, 'credits'),
    bonusCredits: nonNegativeMoneyString(input.bonusCredits, 'bonusCredits'),
    durationDays: optionalInt(input.durationDays),
    userGroupKey: optionalString(input.userGroupKey),
    groupKeys: optionalString(input.groupKeys),
    startsAt: optionalDate(input.startsAt),
    endsAt: optionalDate(input.endsAt),
    purchaseLimitPerUser: optionalInt(input.purchaseLimitPerUser),
    sortOrder: optionalInt(input.sortOrder) ?? 100,
    createdBy: optionalString(input.createdBy),
    updatedBy: optionalString(input.updatedBy),
  }
}

function parsePackageUpdateInput(input: AdminCommercialPackageInput) {
  const data = {
    ...(input.name !== undefined ? { name: requiredString(input.name, 'name') } : {}),
    ...(input.description !== undefined ? { description: optionalString(input.description) } : {}),
    ...(input.status !== undefined ? { status: enumValue(input.status, COMMERCIAL_STATUSES, 'active') } : {}),
    ...(input.price !== undefined ? { price: nonNegativeMoneyString(input.price, 'price') } : {}),
    ...(input.currency !== undefined ? { currency: optionalString(input.currency) || 'CNY' } : {}),
    ...(input.credits !== undefined ? { credits: nonNegativeMoneyString(input.credits, 'credits') } : {}),
    ...(input.bonusCredits !== undefined ? { bonusCredits: nonNegativeMoneyString(input.bonusCredits, 'bonusCredits') } : {}),
    ...(input.durationDays !== undefined ? { durationDays: optionalInt(input.durationDays) } : {}),
    ...(input.userGroupKey !== undefined ? { userGroupKey: optionalString(input.userGroupKey) } : {}),
    ...(input.groupKeys !== undefined ? { groupKeys: optionalString(input.groupKeys) } : {}),
    ...(input.startsAt !== undefined ? { startsAt: optionalDate(input.startsAt) } : {}),
    ...(input.endsAt !== undefined ? { endsAt: optionalDate(input.endsAt) } : {}),
    ...(input.purchaseLimitPerUser !== undefined ? { purchaseLimitPerUser: optionalInt(input.purchaseLimitPerUser) } : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: optionalInt(input.sortOrder) ?? 100 } : {}),
    ...(input.createdBy !== undefined ? { createdBy: optionalString(input.createdBy) } : {}),
    ...(input.updatedBy !== undefined ? { updatedBy: optionalString(input.updatedBy) } : {}),
  }
  if (Object.keys(data).length === 0) throw new Error('At least one package field is required')
  return data
}

function parseRedeemCodeCreateInput(input: AdminRedeemCodeInput) {
  return {
    code: requiredString(input.code, 'code').toUpperCase(),
    status: enumValue(input.status, COMMERCIAL_STATUSES, 'active'),
    credits: nonNegativeMoneyString(input.credits, 'credits'),
    maxRedemptions: Math.max(1, optionalInt(input.maxRedemptions) ?? 1),
    redeemedCount: Math.max(0, optionalInt(input.redeemedCount) ?? 0),
    singleUserLimit: Math.max(1, optionalInt(input.singleUserLimit) ?? 1),
    startsAt: optionalDate(input.startsAt),
    endsAt: optionalDate(input.endsAt),
    userGroupKey: optionalString(input.userGroupKey),
    groupKeys: optionalString(input.groupKeys),
    targetUserIds: optionalString(input.targetUserIds),
    createdBy: optionalString(input.createdBy),
    updatedBy: optionalString(input.updatedBy),
  }
}

function parseRedeemCodeUpdateInput(input: AdminRedeemCodeInput) {
  const data = {
    ...(input.status !== undefined ? { status: enumValue(input.status, COMMERCIAL_STATUSES, 'active') } : {}),
    ...(input.credits !== undefined ? { credits: nonNegativeMoneyString(input.credits, 'credits') } : {}),
    ...(input.maxRedemptions !== undefined ? { maxRedemptions: Math.max(1, optionalInt(input.maxRedemptions) ?? 1) } : {}),
    ...(input.redeemedCount !== undefined ? { redeemedCount: Math.max(0, optionalInt(input.redeemedCount) ?? 0) } : {}),
    ...(input.singleUserLimit !== undefined ? { singleUserLimit: Math.max(1, optionalInt(input.singleUserLimit) ?? 1) } : {}),
    ...(input.startsAt !== undefined ? { startsAt: optionalDate(input.startsAt) } : {}),
    ...(input.endsAt !== undefined ? { endsAt: optionalDate(input.endsAt) } : {}),
    ...(input.userGroupKey !== undefined ? { userGroupKey: optionalString(input.userGroupKey) } : {}),
    ...(input.groupKeys !== undefined ? { groupKeys: optionalString(input.groupKeys) } : {}),
    ...(input.targetUserIds !== undefined ? { targetUserIds: optionalString(input.targetUserIds) } : {}),
    ...(input.createdBy !== undefined ? { createdBy: optionalString(input.createdBy) } : {}),
    ...(input.updatedBy !== undefined ? { updatedBy: optionalString(input.updatedBy) } : {}),
  }
  if (Object.keys(data).length === 0) throw new Error('At least one redeem code field is required')
  return data
}

export async function getAdminCommercial() {
  const [packages, redeemCodes] = await Promise.all([
    prisma.adminCommercialPackage.findMany({
      orderBy: [
        { sortOrder: 'asc' },
        { key: 'asc' },
      ],
    }),
    prisma.adminRedeemCode.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ])

  return {
    packages: packages.map(serializePackage),
    redeemCodes: redeemCodes.map(serializeRedeemCode),
  }
}

export async function getAdminCommercialPackageBefore(key: string) {
  const item = await prisma.adminCommercialPackage.findUnique({
    where: { key },
    select: {
      key: true,
      name: true,
      description: true,
      status: true,
      price: true,
      currency: true,
      credits: true,
      bonusCredits: true,
      durationDays: true,
      userGroupKey: true,
      groupKeys: true,
      startsAt: true,
      endsAt: true,
      purchaseLimitPerUser: true,
      sortOrder: true,
    },
  })
  return serializePackageSummary(item)
}

export async function getAdminRedeemCodeBefore(code: string) {
  const item = await prisma.adminRedeemCode.findUnique({
    where: { code: code.toUpperCase() },
    select: {
      code: true,
      status: true,
      credits: true,
      maxRedemptions: true,
      redeemedCount: true,
      singleUserLimit: true,
      startsAt: true,
      endsAt: true,
      userGroupKey: true,
      groupKeys: true,
      targetUserIds: true,
    },
  })
  return serializeRedeemCodeSummary(item)
}

export function summarizeAdminCommercialPackage(item: Awaited<ReturnType<typeof createAdminCommercialPackage>>) {
  return serializePackageSummary(item)
}

export function summarizeAdminRedeemCode(item: Awaited<ReturnType<typeof createAdminRedeemCode>>) {
  return serializeRedeemCodeSummary(item)
}

export async function createAdminCommercialPackage(input: AdminCommercialPackageInput) {
  const item = await prisma.adminCommercialPackage.create({
    data: parsePackageCreateInput(input),
  })
  return serializePackage(item)
}

export async function updateAdminCommercialPackage(key: string, input: AdminCommercialPackageInput) {
  const item = await prisma.adminCommercialPackage.update({
    where: { key },
    data: parsePackageUpdateInput(input),
  })
  return serializePackage(item)
}

export async function createAdminRedeemCode(input: AdminRedeemCodeInput) {
  const item = await prisma.adminRedeemCode.create({
    data: parseRedeemCodeCreateInput(input),
  })
  return serializeRedeemCode(item)
}

export async function updateAdminRedeemCode(code: string, input: AdminRedeemCodeInput) {
  const item = await prisma.adminRedeemCode.update({
    where: { code: code.toUpperCase() },
    data: parseRedeemCodeUpdateInput(input),
  })
  return serializeRedeemCode(item)
}
