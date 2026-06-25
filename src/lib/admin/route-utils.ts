import type { NextRequest } from 'next/server'

import { isRecord, optionalString } from './operation-utils'

export async function readJsonObject(request: NextRequest): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => ({}))
  return isRecord(body) ? body : {}
}

export function getRequestIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || request.headers.get('x-real-ip') || null
}

export function getAuditReason(body: Record<string, unknown>) {
  return optionalString(body.reason)
}

export function stripAuditFields<T extends Record<string, unknown>>(body: T) {
  const rest: Record<string, unknown> = { ...body }
  delete rest.reason
  delete rest.payload
  delete rest.result
  delete rest.dedupeKey
  delete rest.billingInfo
  return rest
}
