import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { ADMIN_ROLES, USER_STATUSES } from '@/lib/admin/roles'

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  headers: vi.fn(),
  userFindUnique: vi.fn(),
  getLogContext: vi.fn(),
  setLogContext: vi.fn(),
}))

vi.mock('next-auth/next', () => ({
  getServerSession: mocks.getServerSession,
}))

vi.mock('next/headers', () => ({
  headers: mocks.headers,
}))

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}))

vi.mock('@/lib/logging/context', () => ({
  getLogContext: mocks.getLogContext,
  setLogContext: mocks.setLogContext,
}))

function mockHeaders(values: Record<string, string> = {}) {
  mocks.headers.mockResolvedValue({
    get: (name: string) => values[name] ?? '',
  })
}

function mockSession(user: { id: string; role?: string; status?: string } = { id: 'user-1' }) {
  mocks.getServerSession.mockResolvedValue({
    user: {
      id: user.id,
      name: 'Session User',
      email: 'session@example.com',
      role: user.role,
      status: user.status,
    },
  })
}

async function responseStatus(response: NextResponse) {
  return response.status
}

describe('api auth gates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.INTERNAL_TASK_TOKEN
    mockHeaders()
    mocks.getLogContext.mockReturnValue({ requestId: 'req-1' })
  })

  it('rejects disabled users in requireUserAuth', async () => {
    const { requireUserAuth } = await import('@/lib/api-auth')
    mockSession()
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Disabled User',
      email: 'disabled@example.com',
      role: ADMIN_ROLES.ADMIN,
      status: USER_STATUSES.DISABLED,
    })

    const result = await requireUserAuth()

    expect(result).toBeInstanceOf(NextResponse)
    expect(await responseStatus(result as NextResponse)).toBe(403)
  })

  it('returns normalized live session for active users in requireUserAuth', async () => {
    const { requireUserAuth } = await import('@/lib/api-auth')
    mockSession({ id: 'user-1', role: ADMIN_ROLES.OWNER, status: USER_STATUSES.ACTIVE })
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Active User',
      email: 'active@example.com',
      role: 'unexpected-role',
      status: 'unexpected-status',
    })

    const result = await requireUserAuth()

    expect(result).not.toBeInstanceOf(NextResponse)
    expect((result as Awaited<ReturnType<typeof requireUserAuth>> & { session: unknown }).session).toEqual({
      user: {
        id: 'user-1',
        name: 'Active User',
        email: 'active@example.com',
        role: ADMIN_ROLES.USER,
        status: USER_STATUSES.ACTIVE,
      },
    })
  })

  it('does not trust forged admin role in the session', async () => {
    const { requireAdminAuth } = await import('@/lib/api-auth')
    mockSession({ id: 'user-1', role: ADMIN_ROLES.ADMIN, status: USER_STATUSES.ACTIVE })
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Regular User',
      email: 'user@example.com',
      role: ADMIN_ROLES.USER,
      status: USER_STATUSES.ACTIVE,
    })

    const result = await requireAdminAuth()

    expect(result).toBeInstanceOf(NextResponse)
    expect(await responseStatus(result as NextResponse)).toBe(403)
  })

  it('allows active admins in requireAdminAuth', async () => {
    const { requireAdminAuth } = await import('@/lib/api-auth')
    mockSession()
    mocks.userFindUnique.mockResolvedValue({
      id: 'admin-1',
      name: 'Admin User',
      email: 'admin@example.com',
      role: ADMIN_ROLES.ADMIN,
      status: USER_STATUSES.ACTIVE,
    })

    const result = await requireAdminAuth()

    expect(result).not.toBeInstanceOf(NextResponse)
    expect((result as Awaited<ReturnType<typeof requireAdminAuth>> & { session: unknown }).session).toEqual({
      user: {
        id: 'admin-1',
        name: 'Admin User',
        email: 'admin@example.com',
        role: ADMIN_ROLES.ADMIN,
        status: USER_STATUSES.ACTIVE,
      },
    })
  })

  it('requires owner role in requireOwnerAuth', async () => {
    const { requireOwnerAuth } = await import('@/lib/api-auth')
    mockSession()
    mocks.userFindUnique.mockResolvedValueOnce({
      id: 'admin-1',
      name: 'Admin User',
      email: 'admin@example.com',
      role: ADMIN_ROLES.ADMIN,
      status: USER_STATUSES.ACTIVE,
    })

    const adminResult = await requireOwnerAuth()

    expect(adminResult).toBeInstanceOf(NextResponse)
    expect(await responseStatus(adminResult as NextResponse)).toBe(403)

    mocks.userFindUnique.mockResolvedValueOnce({
      id: 'owner-1',
      name: 'Owner User',
      email: 'owner@example.com',
      role: ADMIN_ROLES.OWNER,
      status: USER_STATUSES.ACTIVE,
    })

    const ownerResult = await requireOwnerAuth()

    expect(ownerResult).not.toBeInstanceOf(NextResponse)
    expect((ownerResult as Awaited<ReturnType<typeof requireOwnerAuth>> & { session: unknown }).session).toEqual({
      user: {
        id: 'owner-1',
        name: 'Owner User',
        email: 'owner@example.com',
        role: ADMIN_ROLES.OWNER,
        status: USER_STATUSES.ACTIVE,
      },
    })
  })

  it('allows internal worker sessions without database lookup', async () => {
    const { requireUserAuth } = await import('@/lib/api-auth')
    process.env.INTERNAL_TASK_TOKEN = 'internal-token'
    mockHeaders({
      'x-internal-task-token': 'internal-token',
      'x-internal-user-id': 'worker-1',
    })

    const result = await requireUserAuth()

    expect(result).not.toBeInstanceOf(NextResponse)
    expect(mocks.userFindUnique).not.toHaveBeenCalled()
    expect((result as Awaited<ReturnType<typeof requireUserAuth>> & { session: unknown }).session).toEqual({
      user: {
        id: 'worker-1',
        name: 'internal-worker',
        email: null,
        internal: true,
      },
    })
  })
})
