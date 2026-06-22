export const ADMIN_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  OWNER: 'owner',
} as const

export type AdminRole = (typeof ADMIN_ROLES)[keyof typeof ADMIN_ROLES]

export const USER_STATUSES = {
  ACTIVE: 'active',
  DISABLED: 'disabled',
} as const

export type UserStatus = (typeof USER_STATUSES)[keyof typeof USER_STATUSES]

const ROLE_VALUES = new Set<string>(Object.values(ADMIN_ROLES))
const STATUS_VALUES = new Set<string>(Object.values(USER_STATUSES))

export function normalizeUserRole(value: unknown): AdminRole {
  return typeof value === 'string' && ROLE_VALUES.has(value)
    ? (value as AdminRole)
    : ADMIN_ROLES.USER
}

export function normalizeUserStatus(value: unknown): UserStatus {
  return typeof value === 'string' && STATUS_VALUES.has(value)
    ? (value as UserStatus)
    : USER_STATUSES.ACTIVE
}

export function isAdminRole(value: unknown): boolean {
  const role = normalizeUserRole(value)
  return role === ADMIN_ROLES.ADMIN || role === ADMIN_ROLES.OWNER
}

export function isOwnerRole(value: unknown): boolean {
  return normalizeUserRole(value) === ADMIN_ROLES.OWNER
}

export function isActiveUserStatus(value: unknown): boolean {
  return normalizeUserStatus(value) === USER_STATUSES.ACTIVE
}
