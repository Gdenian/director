import { beforeEach, describe, expect, it, vi } from 'vitest'

const getServerSessionMock = vi.hoisted(() => vi.fn())
const headersMock = vi.hoisted(() => vi.fn(async () => new Headers()))
const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
}))

vi.mock('next-auth/next', () => ({
  getServerSession: getServerSessionMock,
}))

vi.mock('next/headers', () => ({
  headers: headersMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

describe('api-auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('treats stale NextAuth sessions as unauthorized when the user row no longer exists', async () => {
    getServerSessionMock.mockResolvedValue({
      user: {
        id: 'missing-user',
        name: 'ghost',
      },
    })
    prismaMock.user.findUnique.mockResolvedValue(null)

    const { requireUserAuth } = await import('@/lib/api-auth')
    const result = await requireUserAuth()

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'missing-user' },
      select: { id: true, name: true, email: true },
    })
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
  })

  it('returns a normalized live session when the user row still exists', async () => {
    getServerSessionMock.mockResolvedValue({
      user: {
        id: 'user-1',
        name: 'stale-name',
        email: null,
      },
    })
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'live-name',
      email: 'live@example.com',
    })

    const { requireUserAuth } = await import('@/lib/api-auth')
    const result = await requireUserAuth()

    expect(result).toEqual({
      session: {
        user: {
          id: 'user-1',
          name: 'live-name',
          email: 'live@example.com',
        },
      },
    })
  })
})
