import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

import { toMoneyNumber } from '@/lib/billing/money'
import { audienceMatches, parseList, withinWindow } from './audience'
import { OperationPolicyError } from './operation-errors'
import { assertFeatureEnabled } from './policy'
import type { OperationAudienceContext } from './policy-types'

type CommercialPackageRow = {
  key: string
  name: string
  description: string | null
  status: string
  price: unknown
  currency: string
  credits: unknown
  bonusCredits: unknown
  durationDays: number | null
  userGroupKey?: string | null
  groupKeys?: string | null
  startsAt: Date | null
  endsAt: Date | null
}

type RedeemCodeRow = {
  code: string
  status: string
  credits: unknown
  maxRedemptions: number
  redeemedCount: number
  singleUserLimit: number
  startsAt: Date | null
  endsAt: Date | null
  userGroupKey?: string | null
  groupKeys?: string | null
  targetUserIds?: string | null
}

type CommercialOrderRow = {
  id: string
  userId: string
  packageKey: string
  status: string
  amount: unknown
  currency: string
  credits: unknown
  bonusCredits: unknown
  paidAt: Date | null
  reconciledAt: Date | null
  refundedAt: Date | null
  createdAt: Date
  updatedAt?: Date
}

export type AvailableCommercialPackageDto = {
  key: string
  name: string
  description: string | null
  price: string
  currency: string
  credits: string
  bonusCredits: string
  durationDays: number | null
}

export type CommercialOrderDto = {
  id: string
  packageKey: string
  status: string
  amount: string
  currency: string
  credits: string
  bonusCredits: string
  paidAt: string | null
  reconciledAt: string | null
  refundedAt: string | null
  createdAt: string
  paymentConfigured?: boolean
}

function decimalString(value: unknown) {
  return typeof value === 'object' && value !== null && 'toString' in value
    ? String((value as { toString: () => string }).toString())
    : String(value ?? '0')
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase()
}

function hasPaymentProvider() {
  return Boolean(
    process.env.COMMERCIAL_PAYMENT_PROVIDER
    || process.env.PAYMENT_PROVIDER
    || process.env.STRIPE_SECRET_KEY
    || process.env.ALIPAY_APP_ID,
  )
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

async function getUserAudience(userId: string): Promise<OperationAudienceContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, adminGroupKey: true },
  })

  return {
    userId,
    role: user?.role || 'user',
    groupKey: user?.adminGroupKey || null,
    groupKeys: parseList(user?.adminGroupKey),
  }
}

function commercialAudienceMatches(
  item: { userGroupKey?: string | null; groupKeys?: string | null; targetUserIds?: string | null },
  context: OperationAudienceContext,
) {
  const groupKeys = [
    ...parseList(item.userGroupKey),
    ...parseList(item.groupKeys),
  ]
  const targetUserIds = parseList(item.targetUserIds)
  if (targetUserIds.length > 0) {
    return audienceMatches({ audience: 'target_users', targetUserIds }, context)
  }
  if (groupKeys.length > 0) {
    return audienceMatches({ audience: 'group', groupKeys }, context)
  }
  return true
}

function isPackageAvailable(item: CommercialPackageRow | null, context: OperationAudienceContext, now: Date) {
  return Boolean(
    item
    && item.status === 'active'
    && withinWindow(item, now)
    && commercialAudienceMatches(item, context),
  )
}

function isRedeemCodeAvailable(item: RedeemCodeRow | null, context: OperationAudienceContext, now: Date) {
  return Boolean(
    item
    && item.status === 'active'
    && withinWindow(item, now)
    && item.redeemedCount < item.maxRedemptions
    && commercialAudienceMatches(item, context),
  )
}

function serializePackage(item: CommercialPackageRow): AvailableCommercialPackageDto {
  return {
    key: item.key,
    name: item.name,
    description: item.description,
    price: decimalString(item.price),
    currency: item.currency,
    credits: decimalString(item.credits),
    bonusCredits: decimalString(item.bonusCredits),
    durationDays: item.durationDays,
  }
}

function serializeOrder(item: CommercialOrderRow, options?: { paymentConfigured?: boolean }): CommercialOrderDto {
  return {
    id: item.id,
    packageKey: item.packageKey,
    status: item.status,
    amount: decimalString(item.amount),
    currency: item.currency,
    credits: decimalString(item.credits),
    bonusCredits: decimalString(item.bonusCredits),
    paidAt: item.paidAt?.toISOString() ?? null,
    reconciledAt: item.reconciledAt?.toISOString() ?? null,
    refundedAt: item.refundedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    ...(options ? { paymentConfigured: options.paymentConfigured } : {}),
  }
}

async function findCommercialOrderByIdempotency(params: {
  userId: string
  packageKey: string
  idempotencyKey: string
}) {
  return await prisma.adminCommercialOrder.findFirst({
    where: params,
  }) as CommercialOrderRow | null
}

async function lockRedeemCodeRow(tx: { $queryRaw: typeof prisma.$queryRaw }, code: string) {
  await tx.$queryRaw(Prisma.sql`
    SELECT code
    FROM admin_redeem_codes
    WHERE code = ${code}
    FOR UPDATE
  `)
}

export async function listAvailablePackages(params: {
  userId: string
  now?: Date
}): Promise<AvailableCommercialPackageDto[]> {
  const context = await getUserAudience(params.userId)
  await assertFeatureEnabled('payment', context)

  const now = params.now || new Date()
  const items = await prisma.adminCommercialPackage.findMany({
    where: { status: 'active' },
    orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
  })

  return (items as CommercialPackageRow[])
    .filter((item) => isPackageAvailable(item, context, now))
    .map(serializePackage)
}

export async function redeemCodeForUser(params: {
  code: string
  userId: string
  idempotencyKey: string
}) {
  const context = await getUserAudience(params.userId)
  await assertFeatureEnabled('redeem_code', context)

  const code = normalizeCode(params.code)
  const idempotencyKey = params.idempotencyKey.trim()
  if (!code || !idempotencyKey) throw new OperationPolicyError('REDEEM_CODE_UNAVAILABLE')

  return await prisma.$transaction(async (tx) => {
    await lockRedeemCodeRow(tx, code)

    const existing = await tx.adminRedeemRedemption.findFirst({
      where: { code, userId: params.userId, idempotencyKey },
      select: { id: true, credits: true },
    })
    if (existing) {
      return {
        redeemed: true,
        duplicated: true,
        redemptionId: existing.id,
        credits: decimalString(existing.credits),
      }
    }

    const item = await tx.adminRedeemCode.findUnique({ where: { code } }) as RedeemCodeRow | null
    if (!item || !isRedeemCodeAvailable(item, context, new Date())) {
      throw new OperationPolicyError('REDEEM_CODE_UNAVAILABLE')
    }

    const userRedemptions = await tx.adminRedeemRedemption.count({
      where: { code, userId: params.userId },
    })
    if (userRedemptions >= item.singleUserLimit) {
      throw new OperationPolicyError('REDEEM_CODE_UNAVAILABLE', { message: '该兑换码已兑换' })
    }

    const reserved = await tx.adminRedeemCode.updateMany({
      where: {
        code,
        status: 'active',
        redeemedCount: { lt: item.maxRedemptions },
      },
      data: { redeemedCount: { increment: 1 } },
    })
    if (reserved.count !== 1) {
      throw new OperationPolicyError('REDEEM_CODE_UNAVAILABLE')
    }

    const credits = toMoneyNumber(decimalString(item.credits))
    const balance = await tx.userBalance.upsert({
      where: { userId: params.userId },
      create: { userId: params.userId, balance: credits, frozenAmount: 0, totalSpent: 0 },
      update: { balance: { increment: credits } },
    })
    const transaction = await tx.balanceTransaction.create({
      data: {
        userId: params.userId,
        type: 'redeem',
        amount: credits,
        balanceAfter: balance.balance,
        description: `redeem code ${code}`,
        relatedId: code,
        idempotencyKey,
      },
    })
    const redemption = await tx.adminRedeemRedemption.create({
      data: {
        code,
        userId: params.userId,
        credits,
        balanceAfter: balance.balance,
        transactionId: transaction.id,
        idempotencyKey,
      },
    })

    return {
      redeemed: true,
      duplicated: false,
      redemptionId: redemption.id,
      credits: decimalString(item.credits),
    }
  })
}

export async function createCommercialOrderForUser(params: {
  userId: string
  packageKey: string
  idempotencyKey: string
  now?: Date
}) {
  const context = await getUserAudience(params.userId)
  await assertFeatureEnabled('payment', context)

  const packageKey = params.packageKey.trim()
  const idempotencyKey = params.idempotencyKey.trim()
  if (!packageKey || !idempotencyKey) throw new OperationPolicyError('PACKAGE_UNAVAILABLE')

  const item = await prisma.adminCommercialPackage.findUnique({ where: { key: packageKey } }) as CommercialPackageRow | null
  if (!item || !isPackageAvailable(item, context, params.now || new Date())) {
    throw new OperationPolicyError('PACKAGE_UNAVAILABLE')
  }

  const existing = await findCommercialOrderByIdempotency({
    userId: params.userId,
    packageKey,
    idempotencyKey,
  })
  const order = existing || await prisma.adminCommercialOrder.create({
    data: {
      userId: params.userId,
      packageKey,
      status: 'pending',
      amount: decimalString(item.price),
      currency: item.currency,
      credits: decimalString(item.credits),
      bonusCredits: decimalString(item.bonusCredits),
      idempotencyKey,
    },
  }).catch(async (error: unknown) => {
    if (!isUniqueConstraintError(error)) throw error
    const racedOrder = await findCommercialOrderByIdempotency({
      userId: params.userId,
      packageKey,
      idempotencyKey,
    })
    if (!racedOrder) throw error
    return racedOrder
  }) as CommercialOrderRow

  return serializeOrder(order, { paymentConfigured: hasPaymentProvider() })
}

export async function getCommercialOrderForUser(params: {
  userId: string
  orderId: string
}) {
  const order = await prisma.adminCommercialOrder.findUnique({
    where: { id: params.orderId },
  }) as CommercialOrderRow | null
  if (!order || order.userId !== params.userId) {
    throw new OperationPolicyError('PACKAGE_UNAVAILABLE')
  }
  return serializeOrder(order)
}
