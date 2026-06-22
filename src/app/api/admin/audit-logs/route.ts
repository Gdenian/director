import { NextRequest, NextResponse } from 'next/server'

import { isErrorResponse, requireAdminAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function clampPage(value: string | null) {
  const number = Number(value || 1)
  return Math.max(1, Math.floor(Number.isFinite(number) ? number : 1))
}

function clampPageSize(value: string | null) {
  const number = Number(value || 20)
  return Math.min(100, Math.max(1, Math.floor(Number.isFinite(number) ? number : 20)))
}

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireAdminAuth()
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = request.nextUrl
  const page = clampPage(searchParams.get('page'))
  const pageSize = clampPageSize(searchParams.get('pageSize'))
  const [items, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        actorUserId: true,
        actorRole: true,
        action: true,
        targetType: true,
        targetId: true,
        reason: true,
        ip: true,
        userAgent: true,
        createdAt: true,
      },
    }),
    prisma.adminAuditLog.count(),
  ])

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
  })
})
