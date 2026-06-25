import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { ADMIN_ROLES, USER_STATUSES } from '@/lib/admin/roles'

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  headers: vi.fn(),
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  userCount: vi.fn(),
  userUpdate: vi.fn(),
  adminUserGroupFindUnique: vi.fn(),
  projectFindUnique: vi.fn(),
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
      findMany: mocks.userFindMany,
      count: mocks.userCount,
      update: mocks.userUpdate,
    },
    adminUserGroup: {
      findUnique: mocks.adminUserGroupFindUnique,
    },
    project: {
      findUnique: mocks.projectFindUnique,
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

function mockSession(user: { id: string; role?: string; status?: string; sessionVersion?: number } = { id: 'user-1' }) {
  mocks.getServerSession.mockResolvedValue({
    user: {
      id: user.id,
      name: 'Session User',
      email: 'session@example.com',
      role: user.role,
      status: user.status,
      sessionVersion: user.sessionVersion,
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
    mocks.userFindMany.mockResolvedValue([])
    mocks.userCount.mockResolvedValue(0)
    mocks.adminUserGroupFindUnique.mockResolvedValue({ key: 'vip', status: 'active' })
    mocks.userUpdate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: 'user-1',
      name: null,
      email: null,
      role: args.data.role ?? 'user',
      status: args.data.status ?? 'active',
      adminGroupKey: args.data.adminGroupKey ?? 'free',
      adminNote: args.data.adminNote ?? null,
      sessionVersion: args.data.sessionVersion ? 2 : 1,
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    }))
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
      sessionVersion: 0,
    })

    const result = await requireUserAuth()

    expect(result).toBeInstanceOf(NextResponse)
    expect(await responseStatus(result as NextResponse)).toBe(403)
    await expect((result as NextResponse).json()).resolves.toMatchObject({
      code: 'ACCOUNT_DISABLED',
    })
  })

  it('rejects stale user sessions when sessionVersion changes', async () => {
    const { requireUserAuth } = await import('@/lib/api-auth')
    mockSession({ id: 'user-1', role: ADMIN_ROLES.USER, status: USER_STATUSES.ACTIVE, sessionVersion: 1 })
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Active User',
      email: 'active@example.com',
      role: ADMIN_ROLES.USER,
      status: USER_STATUSES.ACTIVE,
      sessionVersion: 2,
    })

    const result = await requireUserAuth()

    expect(result).toBeInstanceOf(NextResponse)
    expect(await responseStatus(result as NextResponse)).toBe(403)
    await expect((result as NextResponse).json()).resolves.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Session expired',
    })
  })

  it('rejects disabled old user sessions with ACCOUNT_DISABLED before stale-session checks', async () => {
    const { requireUserAuth } = await import('@/lib/api-auth')
    mockSession({ id: 'user-1', role: ADMIN_ROLES.USER, status: USER_STATUSES.ACTIVE, sessionVersion: 1 })
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Disabled User',
      email: 'disabled@example.com',
      role: ADMIN_ROLES.USER,
      status: USER_STATUSES.DISABLED,
      sessionVersion: 2,
    })

    const result = await requireUserAuth()

    expect(result).toBeInstanceOf(NextResponse)
    expect(await responseStatus(result as NextResponse)).toBe(403)
    await expect((result as NextResponse).json()).resolves.toMatchObject({
      code: 'ACCOUNT_DISABLED',
    })
  })

  it('parses admin user operation fields for note and session revoke', async () => {
    const { parseAdminUserAccessUpdate } = await import('@/lib/admin/users')

    expect(() => parseAdminUserAccessUpdate({ adminNote: 123 as unknown as string })).toThrow('Invalid admin note')
    expect(() => parseAdminUserAccessUpdate({ revokeSession: false })).toThrow('Invalid revoke session flag')
    expect(parseAdminUserAccessUpdate({ adminGroupKey: ' vip ', adminNote: ' 需要跟进 ', revokeSession: true })).toEqual({
      adminGroupKey: 'vip',
      adminNote: '需要跟进',
      revokeSession: true,
    })
  })

  it('lists admin users with safe operation fields for user management UI', async () => {
    const { listAdminUsers } = await import('@/lib/admin/users')

    await listAdminUsers()

    expect(mocks.userFindMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        adminGroupKey: true,
        adminNote: true,
        sessionVersion: true,
      }),
    }))
    expect(mocks.userFindMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.not.objectContaining({
        projects: true,
        tasks: true,
        payload: true,
        result: true,
      }),
    }))
  })

  it('ignores invalid user list role and status filters', async () => {
    const { listAdminUsers } = await import('@/lib/admin/users')

    await listAdminUsers({ role: 'superadmin', status: 'pending' })

    expect(mocks.userFindMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: {},
    }))
  })

  it('updates user operation fields and increments sessionVersion only for access or revoke changes', async () => {
    const { updateAdminUserAccess } = await import('@/lib/admin/users')

    mocks.userFindUnique.mockResolvedValueOnce({
      id: 'user-1',
      role: ADMIN_ROLES.USER,
      status: USER_STATUSES.ACTIVE,
      adminGroupKey: 'free',
      adminNote: null,
      sessionVersion: 0,
    })
    await updateAdminUserAccess('user-1', { adminNote: '高价值客户' }, { actorId: 'owner-1' })
    expect(mocks.userUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({
        sessionVersion: expect.anything(),
      }),
    }))

    mocks.userFindUnique.mockResolvedValueOnce({
      id: 'user-1',
      role: ADMIN_ROLES.USER,
      status: USER_STATUSES.ACTIVE,
      adminGroupKey: 'free',
      adminNote: '高价值客户',
      sessionVersion: 0,
    })
    await updateAdminUserAccess('user-1', { adminGroupKey: 'vip' }, { actorId: 'owner-1' })
    expect(mocks.userUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({
        sessionVersion: expect.anything(),
      }),
    }))

    mocks.userFindUnique.mockResolvedValueOnce({
      id: 'user-1',
      role: ADMIN_ROLES.USER,
      status: USER_STATUSES.ACTIVE,
      adminGroupKey: 'free',
      adminNote: null,
      sessionVersion: 0,
    })
    await updateAdminUserAccess('user-1', { status: USER_STATUSES.DISABLED }, { actorId: 'owner-1' })
    expect(mocks.userUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sessionVersion: { increment: 1 },
      }),
    }))

    mocks.userFindUnique.mockResolvedValueOnce({
      id: 'user-1',
      role: ADMIN_ROLES.USER,
      status: USER_STATUSES.DISABLED,
      adminGroupKey: 'free',
      adminNote: null,
      sessionVersion: 1,
    })
    await updateAdminUserAccess('user-1', { status: USER_STATUSES.ACTIVE }, { actorId: 'owner-1' })
    expect(mocks.userUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sessionVersion: { increment: 1 },
      }),
    }))

    mocks.userFindUnique.mockResolvedValueOnce({
      id: 'user-1',
      role: ADMIN_ROLES.USER,
      status: USER_STATUSES.ACTIVE,
      adminGroupKey: 'free',
      adminNote: null,
      sessionVersion: 1,
    })
    await updateAdminUserAccess('user-1', { revokeSession: true }, { actorId: 'owner-1' })
    expect(mocks.userUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sessionVersion: { increment: 1 },
      }),
    }))
  })

  it('rejects admin self promotion to owner before updating the user', async () => {
    const { updateAdminUserAccess } = await import('@/lib/admin/users')

    mocks.userFindUnique.mockResolvedValueOnce({
      id: 'owner-1',
      role: ADMIN_ROLES.ADMIN,
      status: USER_STATUSES.ACTIVE,
      adminGroupKey: 'free',
      adminNote: null,
      sessionVersion: 0,
    })
    await expect(updateAdminUserAccess('owner-1', { role: ADMIN_ROLES.OWNER }, { actorId: 'owner-1' }))
      .rejects.toThrow('cannot promote self to owner')
    expect(mocks.userUpdate).not.toHaveBeenCalled()
  })

  it('allows an owner to keep owner role while changing note', async () => {
    const { updateAdminUserAccess } = await import('@/lib/admin/users')

    mocks.userFindUnique.mockResolvedValueOnce({
      id: 'owner-1',
      role: ADMIN_ROLES.OWNER,
      status: USER_STATUSES.ACTIVE,
      adminGroupKey: 'free',
      adminNote: null,
      sessionVersion: 0,
    })
    await updateAdminUserAccess('owner-1', { role: ADMIN_ROLES.OWNER, adminNote: 'owner note' }, { actorId: 'owner-1' })

    expect(mocks.userUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        role: ADMIN_ROLES.OWNER,
        adminNote: 'owner note',
      }),
    }))
  })

  it('rejects disabled users before full project auth queries the project', async () => {
    const { requireProjectAuth } = await import('@/lib/api-auth')
    mockSession()
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Disabled User',
      email: 'disabled@example.com',
      role: ADMIN_ROLES.USER,
      status: USER_STATUSES.DISABLED,
      sessionVersion: 0,
    })

    const result = await requireProjectAuth('project-1')

    expect(result).toBeInstanceOf(NextResponse)
    expect(await responseStatus(result as NextResponse)).toBe(403)
    expect(mocks.projectFindUnique).not.toHaveBeenCalled()
  })

  it('rejects disabled users before light project auth queries the project', async () => {
    const { requireProjectAuthLight } = await import('@/lib/api-auth')
    mockSession()
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Disabled User',
      email: 'disabled@example.com',
      role: ADMIN_ROLES.USER,
      status: USER_STATUSES.DISABLED,
      sessionVersion: 0,
    })

    const result = await requireProjectAuthLight('project-1')

    expect(result).toBeInstanceOf(NextResponse)
    expect(await responseStatus(result as NextResponse)).toBe(403)
    expect(mocks.projectFindUnique).not.toHaveBeenCalled()
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
      sessionVersion: 0,
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
        sessionVersion: 0,
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

  it('rejects disabled admins with ACCOUNT_DISABLED in requireAdminAuth', async () => {
    const { requireAdminAuth } = await import('@/lib/api-auth')
    mockSession({ id: 'admin-1', role: ADMIN_ROLES.ADMIN, status: USER_STATUSES.ACTIVE, sessionVersion: 0 })
    mocks.userFindUnique.mockResolvedValue({
      id: 'admin-1',
      name: 'Disabled Admin',
      email: 'admin@example.com',
      role: ADMIN_ROLES.ADMIN,
      status: USER_STATUSES.DISABLED,
      sessionVersion: 0,
    })

    const result = await requireAdminAuth()

    expect(result).toBeInstanceOf(NextResponse)
    expect(await responseStatus(result as NextResponse)).toBe(403)
    await expect((result as NextResponse).json()).resolves.toMatchObject({
      code: 'ACCOUNT_DISABLED',
    })
  })

  it('rejects stale admin sessions in requireAdminAuth', async () => {
    const { requireAdminAuth } = await import('@/lib/api-auth')
    mockSession({ id: 'admin-1', role: ADMIN_ROLES.ADMIN, status: USER_STATUSES.ACTIVE, sessionVersion: 1 })
    mocks.userFindUnique.mockResolvedValue({
      id: 'admin-1',
      name: 'Admin User',
      email: 'admin@example.com',
      role: ADMIN_ROLES.ADMIN,
      status: USER_STATUSES.ACTIVE,
      sessionVersion: 2,
    })

    const result = await requireAdminAuth()

    expect(result).toBeInstanceOf(NextResponse)
    expect(await responseStatus(result as NextResponse)).toBe(403)
    await expect((result as NextResponse).json()).resolves.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Session expired',
    })
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
      sessionVersion: 0,
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
        sessionVersion: 0,
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
      sessionVersion: 0,
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
      sessionVersion: 0,
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
        sessionVersion: 0,
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
