import { prisma } from '@/lib/prisma'
import { normalizeUserRole, normalizeUserStatus, type AdminRole, type UserStatus } from './roles'

interface ListAdminUsersParams {
  search?: string | null
  role?: string | null
  status?: string | null
  page?: number | null
  pageSize?: number | null
}

interface UpdateAdminUserAccessInput {
  role?: string | null
  status?: string | null
}

function clampPage(value: number | null | undefined) {
  return Math.max(1, Math.floor(value || 1))
}

function clampPageSize(value: number | null | undefined) {
  return Math.min(100, Math.max(1, Math.floor(value || 20)))
}

function decimalToString(value: unknown) {
  return value && typeof value === 'object' && 'toString' in value
    ? value.toString()
    : '0'
}

function serializeUser<T extends {
  role: string
  status: string
  balance: null | {
    balance: unknown
    frozenAmount: unknown
    totalSpent: unknown
  }
}>(user: T) {
  return {
    ...user,
    role: normalizeUserRole(user.role),
    status: normalizeUserStatus(user.status),
    balance: user.balance
      ? {
        balance: decimalToString(user.balance.balance),
        frozenAmount: decimalToString(user.balance.frozenAmount),
        totalSpent: decimalToString(user.balance.totalSpent),
      }
      : null,
  }
}

export async function listAdminUsers(params: ListAdminUsersParams = {}) {
  const page = clampPage(params.page)
  const pageSize = clampPageSize(params.pageSize)
  const search = params.search?.trim()
  const role = params.role == null ? null : normalizeUserRole(params.role)
  const status = params.status == null ? null : normalizeUserStatus(params.status)
  const where = {
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(search
      ? {
        OR: [
          { id: search },
          { name: { contains: search } },
          { email: { contains: search } },
        ],
      }
      : {}),
  }

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        balance: {
          select: {
            balance: true,
            frozenAmount: true,
            totalSpent: true,
          },
        },
        _count: {
          select: {
            projects: true,
            tasks: true,
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ])

  return {
    items: items.map(serializeUser),
    total,
    page,
    pageSize,
  }
}

export async function updateAdminUserAccess(userId: string, input: UpdateAdminUserAccessInput) {
  const data: { role?: AdminRole, status?: UserStatus } = {}
  if ('role' in input) data.role = normalizeUserRole(input.role)
  if ('status' in input) data.status = normalizeUserStatus(input.status)

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      updatedAt: true,
    },
  })

  return {
    ...user,
    role: normalizeUserRole(user.role),
    status: normalizeUserStatus(user.status),
  }
}
