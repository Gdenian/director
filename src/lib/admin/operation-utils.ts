import { Prisma } from '@prisma/client'

export function clampPage(value: number | null | undefined) {
  return Math.max(1, Math.floor(value || 1))
}

export function clampPageSize(value: number | null | undefined, max = 100, fallback = 20) {
  return Math.min(max, Math.max(1, Math.floor(value || fallback)))
}

export function decimalToString(value: unknown) {
  return value && typeof value === 'object' && 'toString' in value
    ? value.toString()
    : '0'
}

export function optionalString(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

export function requiredString(value: unknown, field: string) {
  const trimmed = optionalString(value)
  if (!trimmed) throw new Error(`${field} is required`)
  return trimmed
}

export function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
) {
  return typeof value === 'string' && allowed.includes(value as T)
    ? (value as T)
    : fallback
}

export function optionalDate(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function optionalInt(value: unknown) {
  const number = optionalNumber(value)
  return number === null ? null : Math.floor(number)
}

export function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

export function percentValue(value: unknown, fallback = 100) {
  const number = optionalInt(value)
  if (number === null) return fallback
  return Math.min(100, Math.max(0, number))
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function optionalJsonObject(value: unknown): Prisma.InputJsonObject | typeof Prisma.JsonNull | undefined {
  if (value === null) return Prisma.JsonNull
  return isRecord(value) ? (value as Prisma.InputJsonObject) : undefined
}
