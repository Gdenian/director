import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  installAuthMocks,
  mockAuthenticatedRole,
  mockUnauthenticated,
} from '../../../helpers/auth'
import { buildMockRequest, callRoute } from '../../../helpers/request'

installAuthMocks()

const commercialRuntimeMock = vi.hoisted(() => ({
  listAvailablePackages: vi.fn(),
  createCommercialOrderForUser: vi.fn(),
  getCommercialOrderForUser: vi.fn(),
  redeemCodeForUser: vi.fn(),
}))

const prismaMock = vi.hoisted(() => ({
  userBalance: { upsert: vi.fn() },
  balanceTransaction: { create: vi.fn() },
  adminRedeemCode: { update: vi.fn() },
}))

vi.mock('@/lib/admin/commercial-runtime', () => commercialRuntimeMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

async function readJson(response: Response) {
  return await response.json() as Record<string, unknown>
}

describe('commercial user routes contract', () => {
  beforeEach(() => {
    vi.resetModules()
    installAuthMocks()
    vi.clearAllMocks()
    mockAuthenticatedRole('user-1', 'user', 'active')
  })

  it('GET /api/commercial/packages returns active packages and no admin fields', async () => {
    commercialRuntimeMock.listAvailablePackages.mockResolvedValue([{
      key: 'starter',
      name: 'Starter',
      description: null,
      price: '20',
      currency: 'CNY',
      credits: '200',
      bonusCredits: '0',
      durationDays: null,
    }])

    const { GET } = await import('@/app/api/commercial/packages/route')
    const response = await GET(
      buildMockRequest({ path: '/api/commercial/packages', method: 'GET' }),
      { params: Promise.resolve({}) },
    )
    const payload = await readJson(response)

    expect(response.status).toBe(200)
    expect(payload.items).toEqual([expect.objectContaining({ key: 'starter' })])
    expect(JSON.stringify(payload)).not.toContain('targetUserIds')
    expect(JSON.stringify(payload)).not.toContain('createdBy')
  })

  it('commercial user routes require authentication', async () => {
    mockUnauthenticated()

    const packagesRoute = await import('@/app/api/commercial/packages/route')
    const packageListRes = await packagesRoute.GET(
      buildMockRequest({ path: '/api/commercial/packages', method: 'GET' }),
      { params: Promise.resolve({}) },
    )

    const redeemRoute = await import('@/app/api/redeem/route')
    const redeemRes = await redeemRoute.POST(
      buildMockRequest({ path: '/api/redeem', method: 'POST', body: { code: 'WELCOME' } }),
      { params: Promise.resolve({}) },
    )

    const ordersRoute = await import('@/app/api/commercial/orders/route')
    const orderCreateRes = await ordersRoute.POST(
      buildMockRequest({ path: '/api/commercial/orders', method: 'POST', body: { packageKey: 'starter' } }),
      { params: Promise.resolve({}) },
    )

    const orderRoute = await import('@/app/api/commercial/orders/[orderId]/route')
    const orderGetRes = await callRoute(orderRoute.GET, {
      path: '/api/commercial/orders/order-1',
      method: 'GET',
      context: { params: Promise.resolve({ orderId: 'order-1' }) },
    })

    expect(packageListRes.status).toBe(401)
    expect(redeemRes.status).toBe(401)
    expect(orderCreateRes.status).toBe(401)
    expect(orderGetRes.status).toBe(401)
    expect(commercialRuntimeMock.listAvailablePackages).not.toHaveBeenCalled()
    expect(commercialRuntimeMock.redeemCodeForUser).not.toHaveBeenCalled()
    expect(commercialRuntimeMock.createCommercialOrderForUser).not.toHaveBeenCalled()
    expect(commercialRuntimeMock.getCommercialOrderForUser).not.toHaveBeenCalled()
  })

  it('POST /api/redeem with paused code returns REDEEM_CODE_UNAVAILABLE', async () => {
    const { OperationPolicyError } = await import('@/lib/admin/operation-errors')
    commercialRuntimeMock.redeemCodeForUser.mockRejectedValue(
      new OperationPolicyError('REDEEM_CODE_UNAVAILABLE'),
    )

    const { POST } = await import('@/app/api/redeem/route')
    const response = await POST(
      buildMockRequest({
        path: '/api/redeem',
        method: 'POST',
        body: { code: 'PAUSED', idempotencyKey: 'redeem-idem-1' },
      }),
      { params: Promise.resolve({}) },
    )
    const payload = await readJson(response)

    expect(response.status).toBe(409)
    expect(payload.code).toBe('REDEEM_CODE_UNAVAILABLE')
    expect(payload.message).toBe('兑换码不可用或已过期')
  })

  it('POST /api/redeem successful redeem delegates once and returns redemption result', async () => {
    commercialRuntimeMock.redeemCodeForUser.mockResolvedValue({
      redeemed: true,
      duplicated: false,
      redemptionId: 'redemption-1',
      credits: '5',
    })

    const { POST } = await import('@/app/api/redeem/route')
    const response = await POST(
      buildMockRequest({
        path: '/api/redeem',
        method: 'POST',
        body: { code: 'WELCOME', idempotencyKey: 'redeem-idem-1' },
      }),
      { params: Promise.resolve({}) },
    )
    const payload = await readJson(response)

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({ redeemed: true, credits: '5' })
    expect(commercialRuntimeMock.redeemCodeForUser).toHaveBeenCalledTimes(1)
    expect(commercialRuntimeMock.redeemCodeForUser).toHaveBeenCalledWith({
      code: 'WELCOME',
      userId: 'user-1',
      idempotencyKey: 'redeem-idem-1',
    })
  })

  it('POST /api/commercial/orders with archived package returns PACKAGE_UNAVAILABLE', async () => {
    const { OperationPolicyError } = await import('@/lib/admin/operation-errors')
    commercialRuntimeMock.createCommercialOrderForUser.mockRejectedValue(
      new OperationPolicyError('PACKAGE_UNAVAILABLE'),
    )

    const { POST } = await import('@/app/api/commercial/orders/route')
    const response = await POST(
      buildMockRequest({
        path: '/api/commercial/orders',
        method: 'POST',
        body: { packageKey: 'archived', idempotencyKey: 'order-idem-1' },
      }),
      { params: Promise.resolve({}) },
    )
    const payload = await readJson(response)

    expect(response.status).toBe(409)
    expect(payload.code).toBe('PACKAGE_UNAVAILABLE')
  })

  it('POST /api/commercial/orders returns 409 when payment is not configured and does not credit balance', async () => {
    commercialRuntimeMock.createCommercialOrderForUser.mockResolvedValue({
      id: 'order-1',
      packageKey: 'starter',
      status: 'pending',
      amount: '20',
      currency: 'CNY',
      credits: '200',
      bonusCredits: '0',
      paymentConfigured: false,
    })

    const { POST } = await import('@/app/api/commercial/orders/route')
    const response = await POST(
      buildMockRequest({
        path: '/api/commercial/orders',
        method: 'POST',
        body: { packageKey: 'starter', idempotencyKey: 'order-idem-1' },
      }),
      { params: Promise.resolve({}) },
    )
    const payload = await readJson(response)

    expect(response.status).toBe(409)
    expect(payload.code).toBe('PACKAGE_UNAVAILABLE')
    expect(payload.message).toBe('支付暂未配置')
    expect(prismaMock.userBalance.upsert).not.toHaveBeenCalled()
    expect(prismaMock.balanceTransaction.create).not.toHaveBeenCalled()
  })

  it('GET /api/commercial/orders/[orderId] returns safe owned order DTO', async () => {
    commercialRuntimeMock.getCommercialOrderForUser.mockResolvedValue({
      id: 'order-1',
      packageKey: 'starter',
      status: 'pending',
      amount: '20',
      currency: 'CNY',
      credits: '200',
      bonusCredits: '0',
      paidAt: null,
      reconciledAt: null,
      refundedAt: null,
      createdAt: '2026-06-24T10:00:00.000Z',
    })

    const { GET } = await import('@/app/api/commercial/orders/[orderId]/route')
    const response = await callRoute(GET, {
      path: '/api/commercial/orders/order-1',
      method: 'GET',
      context: { params: Promise.resolve({ orderId: 'order-1' }) },
    })
    const payload = await readJson(response)

    expect(response.status).toBe(200)
    expect(payload.item).toMatchObject({ id: 'order-1', packageKey: 'starter' })
    expect(JSON.stringify(payload)).not.toContain('externalOrderId')
    expect(JSON.stringify(payload)).not.toContain('idempotencyKey')
  })
})
