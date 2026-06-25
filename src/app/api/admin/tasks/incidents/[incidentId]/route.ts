import { NextRequest, NextResponse } from 'next/server'

import { isErrorResponse, requireAdminAuth } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { getTaskIncident } from '@/lib/admin/tasks'

export const dynamic = 'force-dynamic'

export const GET = apiHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<{ incidentId: string }> },
) => {
  const authResult = await requireAdminAuth()
  if (isErrorResponse(authResult)) return authResult

  const { incidentId } = await params
  const incident = await getTaskIncident(incidentId)
  if (!incident) return NextResponse.json({ error: 'Incident not found' }, { status: 404 })

  return NextResponse.json(incident)
})
