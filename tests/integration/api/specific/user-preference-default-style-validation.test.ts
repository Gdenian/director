import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(async () => ({
      userId: 'user-1',
      defaultStyleId: 'style-2',
    })),
    upsert: vi.fn(async () => ({
      userId: 'user-1',
      defaultStyleId: 'style-1',
    })),
  },
}))

const styleServiceMock = vi.hoisted(() => ({
  ensureDefaultStyles: vi.fn(async () => ({ defaultStyleId: 'style-1' })),
  setDefaultStyle: vi.fn(async () => ({ defaultStyleId: 'style-2' })),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/styles/service', () => styleServiceMock)

describe('api specific - user preference default style validation', () => {
  const routeContext = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ensures default styles before returning preference', async () => {
    const mod = await import('@/app/api/user-preference/route')
    const req = buildMockRequest({
      path: '/api/user-preference',
      method: 'GET',
    })

    const res = await mod.GET(req, routeContext)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(styleServiceMock.ensureDefaultStyles).toHaveBeenCalledWith('user-1')
    expect(body.preference.defaultStyleId).toBe('style-1')
  })

  it('accepts defaultStyleId and delegates ownership validation to style service', async () => {
    const mod = await import('@/app/api/user-preference/route')
    const req = buildMockRequest({
      path: '/api/user-preference',
      method: 'PATCH',
      body: { defaultStyleId: '  style-2  ' },
    })

    const res = await mod.PATCH(req, routeContext)
    expect(res.status).toBe(200)
    expect(styleServiceMock.setDefaultStyle).toHaveBeenCalledWith('user-1', 'style-2')
    expect(prismaMock.userPreference.findUnique).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('rejects invalid defaultStyleId with invalid params', async () => {
    const mod = await import('@/app/api/user-preference/route')
    const req = buildMockRequest({
      path: '/api/user-preference',
      method: 'PATCH',
      body: { defaultStyleId: '   ' },
    })

    const res = await mod.PATCH(req, routeContext)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_PARAMS')
    expect(styleServiceMock.setDefaultStyle).not.toHaveBeenCalled()
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('does not accept legacy artStyle updates', async () => {
    const mod = await import('@/app/api/user-preference/route')
    const req = buildMockRequest({
      path: '/api/user-preference',
      method: 'PATCH',
      body: { artStyle: 'realistic' },
    })

    const res = await mod.PATCH(req, routeContext)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_PARAMS')
    expect(styleServiceMock.setDefaultStyle).not.toHaveBeenCalled()
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })
})
