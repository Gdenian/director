import { isAdminRole } from '@/lib/admin/roles'
import type { AudienceRule, OperationAudienceContext, TimeWindow } from './policy-types'

function toDate(value: Date | string | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function parseList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }
  if (typeof value !== 'string') return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function withinWindow(window: TimeWindow, now = new Date()) {
  const startsAt = toDate(window.startsAt)
  const endsAt = toDate(window.endsAt)
  if (startsAt && now < startsAt) return false
  if (endsAt && now > endsAt) return false
  return true
}

export function rolloutMatches(seed: string | null | undefined, percent: number | null | undefined) {
  const normalizedPercent = Math.max(0, Math.min(100, Math.floor(percent ?? 100)))
  if (normalizedPercent >= 100) return true
  if (normalizedPercent <= 0) return false

  const text = seed || 'anonymous'
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  }
  return hash % 100 < normalizedPercent
}

export function audienceMatches(rule: AudienceRule, context: OperationAudienceContext) {
  const audience = rule.audience || 'all'
  if (audience === 'all') return true
  if (audience === 'admins') return isAdminRole(context.role)
  if (audience === 'target_users') {
    return !!context.userId && (rule.targetUserIds || []).includes(context.userId)
  }
  if (audience === 'group') {
    const allowedGroups = new Set(rule.groupKeys || [])
    if (context.groupKey && allowedGroups.has(context.groupKey)) return true
    return (context.groupKeys || []).some((groupKey) => allowedGroups.has(groupKey))
  }
  if (audience === 'test_users' || audience === 'vip' || audience === 'restricted') {
    const groups = new Set([context.groupKey, ...(context.groupKeys || [])].filter(Boolean))
    return groups.has(audience)
  }
  return false
}
