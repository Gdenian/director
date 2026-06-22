import { describe, expect, it } from 'vitest'
import {
  ADMIN_ROLES,
  USER_STATUSES,
  isAdminRole,
  isOwnerRole,
  isActiveUserStatus,
  normalizeUserRole,
  normalizeUserStatus,
} from '@/lib/admin/roles'

describe('admin role helpers', () => {
  it('normalizes unknown roles to user', () => {
    expect(normalizeUserRole(null)).toBe(ADMIN_ROLES.USER)
    expect(normalizeUserRole('')).toBe(ADMIN_ROLES.USER)
    expect(normalizeUserRole('weird')).toBe(ADMIN_ROLES.USER)
  })

  it('recognizes admin and owner roles', () => {
    expect(isAdminRole(ADMIN_ROLES.USER)).toBe(false)
    expect(isAdminRole(ADMIN_ROLES.ADMIN)).toBe(true)
    expect(isAdminRole(ADMIN_ROLES.OWNER)).toBe(true)
    expect(isOwnerRole(ADMIN_ROLES.ADMIN)).toBe(false)
    expect(isOwnerRole(ADMIN_ROLES.OWNER)).toBe(true)
  })

  it('normalizes account status and detects active users', () => {
    expect(normalizeUserStatus(null)).toBe(USER_STATUSES.ACTIVE)
    expect(normalizeUserStatus('disabled')).toBe(USER_STATUSES.DISABLED)
    expect(normalizeUserStatus('unknown')).toBe(USER_STATUSES.ACTIVE)
    expect(isActiveUserStatus(USER_STATUSES.ACTIVE)).toBe(true)
    expect(isActiveUserStatus(USER_STATUSES.DISABLED)).toBe(false)
  })
})
