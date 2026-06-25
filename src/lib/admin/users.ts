import { prisma } from '@/lib/prisma'
import { ADMIN_ROLES, USER_STATUSES, normalizeUserRole, normalizeUserStatus, type AdminRole, type UserStatus } from './roles'

interface ListAdminUsersParams {
  search?: string | null
  role?: string | null
  status?: string | null
  adminGroupKey?: string | null
  page?: number | null
  pageSize?: number | null
}

interface UpdateAdminUserAccessInput {
  role?: string | null
  status?: string | null
  adminGroupKey?: string | null
  adminNote?: string | null
  revokeSession?: boolean
}

export interface AdminUserAccessBefore {
  id: string
  role: AdminRole
  status: UserStatus
  adminGroupKey: string | null
  adminNote: string | null
  sessionVersion: number
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

function isAdminRoleValue(value: unknown): value is AdminRole {
  return typeof value === 'string' && Object.values(ADMIN_ROLES).includes(value as AdminRole)
}

function isUserStatusValue(value: unknown): value is UserStatus {
  return typeof value === 'string' && Object.values(USER_STATUSES).includes(value as UserStatus)
}

export function parseAdminUserAccessUpdate(input: UpdateAdminUserAccessInput) {
  const data: {
    role?: AdminRole
    status?: UserStatus
    adminGroupKey?: string | null
    adminNote?: string | null
    revokeSession?: boolean
  } = {}
  const hasRole = 'role' in input
  const hasStatus = 'status' in input
  const hasAdminGroupKey = 'adminGroupKey' in input
  const hasAdminNote = 'adminNote' in input
  const hasRevokeSession = 'revokeSession' in input

  if (!hasRole && !hasStatus && !hasAdminGroupKey && !hasAdminNote && !hasRevokeSession) {
    throw new Error('At least one access field is required')
  }
  if (hasRole) {
    if (!isAdminRoleValue(input.role)) throw new Error('Invalid user role')
    data.role = input.role
  }
  if (hasStatus) {
    if (!isUserStatusValue(input.status)) throw new Error('Invalid user status')
    data.status = input.status
  }
  if (hasAdminGroupKey) {
    if (input.adminGroupKey !== null && typeof input.adminGroupKey !== 'string') {
      throw new Error('Invalid admin group key')
    }
    const groupKey = input.adminGroupKey?.trim() || null
    data.adminGroupKey = groupKey
  }
  if (hasAdminNote) {
    if (input.adminNote !== null && typeof input.adminNote !== 'string') {
      throw new Error('Invalid admin note')
    }
    const note = input.adminNote?.trim() || null
    data.adminNote = note
  }
  if (hasRevokeSession) {
    if (input.revokeSession !== true) throw new Error('Invalid revoke session flag')
    data.revokeSession = true
  }
  return data
}

async function assertActiveAdminGroup(key: string) {
  const group = await prisma.adminUserGroup.findUnique({
    where: { key },
    select: { key: true, status: true },
  })
  if (!group || group.status !== 'active') {
    throw new Error('Invalid admin group key')
  }
}

export async function listAdminUsers(params: ListAdminUsersParams = {}) {
  const page = clampPage(params.page)
  const pageSize = clampPageSize(params.pageSize)
  const search = params.search?.trim()
  const role = isAdminRoleValue(params.role) ? params.role : null
  const status = isUserStatusValue(params.status) ? params.status : null
  const adminGroupKey = params.adminGroupKey?.trim()
  const where = {
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(adminGroupKey
      ? { adminGroupKey: adminGroupKey === '__none' ? null : adminGroupKey }
      : {}),
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
        adminGroupKey: true,
        adminNote: true,
        sessionVersion: true,
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

export async function updateAdminUserAccess(
  userId: string,
  input: UpdateAdminUserAccessInput,
  context: { actorId?: string | null } = {},
) {
  const data = parseAdminUserAccessUpdate(input)
  if (data.adminGroupKey) {
    await assertActiveAdminGroup(data.adminGroupKey)
  }
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true },
  })
  if (!current) throw new Error('User not found')
  const currentRole = normalizeUserRole(current.role)
  if (context.actorId === userId && data.role === ADMIN_ROLES.OWNER && currentRole !== ADMIN_ROLES.OWNER) {
    throw new Error('cannot promote self to owner')
  }
  const sessionChanging = ('role' in data && data.role !== normalizeUserRole(current.role))
    || ('status' in data && data.status !== normalizeUserStatus(current.status))
    || data.revokeSession === true

  const { revokeSession: _revokeSession, ...updateData } = data

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...updateData,
      ...(sessionChanging ? { sessionVersion: { increment: 1 } } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      adminGroupKey: true,
      adminNote: true,
      sessionVersion: true,
      updatedAt: true,
    },
  })

  return {
    ...user,
    role: normalizeUserRole(user.role),
    status: normalizeUserStatus(user.status),
  }
}

export async function getAdminUserAccessBefore(userId: string): Promise<AdminUserAccessBefore | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      status: true,
      adminGroupKey: true,
      adminNote: true,
      sessionVersion: true,
    },
  })
  if (!user) return null
  return {
    id: user.id,
    role: normalizeUserRole(user.role),
    status: normalizeUserStatus(user.status),
    adminGroupKey: user.adminGroupKey,
    adminNote: user.adminNote,
    sessionVersion: user.sessionVersion,
  }
}
