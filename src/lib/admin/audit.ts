import { Prisma } from '@prisma/client'

import { normalizeUserRole, type AdminRole } from '@/lib/admin/roles'
import { prisma } from '@/lib/prisma'

type JsonObject = Record<string, unknown>

export interface AdminAuditInput {
  actor: {
    id: string
    role: AdminRole | string
  }
  action: string
  targetType: string
  targetId?: string | null
  before?: JsonObject | null
  after?: JsonObject | null
  reason?: string | null
  ip?: string | null
  userAgent?: string | null
}

function toJson(value: JsonObject | null | undefined) {
  if (value === undefined || value === null) return Prisma.JsonNull
  return value as Prisma.InputJsonValue
}

function normalizeOptionalText(value: string | null | undefined) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || null
}

export async function writeAdminAuditLog(input: AdminAuditInput) {
  return await prisma.adminAuditLog.create({
    data: {
      actorUserId: input.actor.id,
      actorRole: normalizeUserRole(input.actor.role),
      action: input.action,
      targetType: input.targetType,
      targetId: normalizeOptionalText(input.targetId),
      beforeJson: toJson(input.before),
      afterJson: toJson(input.after),
      reason: normalizeOptionalText(input.reason),
      ip: normalizeOptionalText(input.ip),
      userAgent: normalizeOptionalText(input.userAgent),
    },
  })
}
