import { describe, expect, it } from 'vitest'
import { audienceMatches, parseList, rolloutMatches, withinWindow } from '@/lib/admin/audience'

describe('admin audience matching', () => {
  it('matches all, role audience, and group audience', () => {
    expect(audienceMatches({ audience: 'all' }, { userId: 'u1', role: 'user', groupKey: 'free' })).toBe(true)
    expect(audienceMatches({ audience: 'admins' }, { userId: 'u1', role: 'admin', groupKey: 'free' })).toBe(true)
    expect(audienceMatches({ audience: 'admins' }, { userId: 'u1', role: 'user', groupKey: 'free' })).toBe(false)
    expect(audienceMatches({ audience: 'group', groupKeys: ['vip'] }, { userId: 'u1', role: 'user', groupKey: 'vip' })).toBe(true)
    expect(audienceMatches({ audience: 'group', groupKeys: ['vip'] }, { userId: 'u1', role: 'user', groupKey: 'free' })).toBe(false)
  })

  it('matches target user ids and deterministic rollout', () => {
    expect(audienceMatches({ audience: 'target_users', targetUserIds: ['u1'] }, { userId: 'u1', role: 'user' })).toBe(true)
    expect(audienceMatches({ audience: 'target_users', targetUserIds: ['u2'] }, { userId: 'u1', role: 'user' })).toBe(false)
    expect(audienceMatches({ audience: 'target_users', targetUserIds: ['u2', 'u3'] }, { userId: 'u3', role: 'user' })).toBe(true)
    expect(rolloutMatches('u1', 100)).toBe(true)
    expect(rolloutMatches('u1', 0)).toBe(false)
    expect(rolloutMatches('u1', 150)).toBe(true)
    expect(rolloutMatches('u1', -10)).toBe(false)
    expect(rolloutMatches('u1', 50)).toBe(rolloutMatches('u1', 50))
  })

  it('parses comma lists and matches named operation groups', () => {
    expect(parseList('vip, internal, ,restricted')).toEqual(['vip', 'internal', 'restricted'])
    expect(audienceMatches({ audience: 'group', groupKeys: ['vip', 'internal'] }, { userId: 'u1', role: 'user', groupKeys: ['free', 'internal'] })).toBe(true)
    expect(audienceMatches({ audience: 'group', groupKeys: ['vip', 'internal'] }, { userId: 'u1', role: 'user', groupKeys: ['free', 'beta'] })).toBe(false)
    expect(audienceMatches({ audience: 'test_users' }, { userId: 'u1', role: 'user', groupKeys: ['free', 'test_users'] })).toBe(true)
    expect(audienceMatches({ audience: 'vip' }, { userId: 'u1', role: 'user', groupKey: 'vip' })).toBe(true)
    expect(audienceMatches({ audience: 'restricted' }, { userId: 'u1', role: 'user', groupKeys: ['restricted'] })).toBe(true)
  })

  it('checks time windows inclusively', () => {
    const now = new Date('2026-06-24T10:00:00.000Z')
    expect(withinWindow({ startsAt: null, endsAt: null }, now)).toBe(true)
    expect(withinWindow({ startsAt: new Date('2026-06-24T09:00:00.000Z'), endsAt: null }, now)).toBe(true)
    expect(withinWindow({ startsAt: now, endsAt: now }, now)).toBe(true)
    expect(withinWindow({ startsAt: new Date('2026-06-24T11:00:00.000Z'), endsAt: null }, now)).toBe(false)
    expect(withinWindow({ startsAt: null, endsAt: new Date('2026-06-24T09:00:00.000Z') }, now)).toBe(false)
  })
})
