import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import {
  deleteGlobalStyle,
  ensureDefaultStyles,
  updateGlobalStyle,
  type GlobalStyleSummary,
} from '@/lib/styles/service'

function normalizeOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toStyleResponse(style: GlobalStyleSummary, defaultStyleId: string | null) {
  return {
    id: style.id,
    folderId: style.folderId,
    name: style.name,
    promptZh: style.promptZh,
    promptEn: style.promptEn,
    referenceImageUrl: style.referenceImageUrl,
    referenceImageMediaId: style.referenceImageMediaId,
    previewImageUrl: style.previewImageUrl,
    previewImageMediaId: style.previewImageMediaId,
    isDefault: style.id === defaultStyleId,
    isSystemSeed: style.isSystemSeed,
    createdAt: style.createdAt,
    updatedAt: style.updatedAt,
  }
}

async function validateFolderOwnership(userId: string, folderId: string | null | undefined) {
  if (!folderId) return
  const folder = await prisma.globalAssetFolder.findFirst({
    where: { id: folderId, userId },
    select: { id: true },
  })
  if (!folder) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'FOLDER_NOT_FOUND',
      message: 'Folder not found',
    })
  }
}

export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ styleId: string }> },
) => {
  const { styleId } = await context.params
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const userId = authResult.session.user.id

  const body = await request.json() as Record<string, unknown>
  const folderId = normalizeOptionalString(body.folderId)
  await validateFolderOwnership(userId, folderId)

  const style = await updateGlobalStyle({
    userId,
    styleId,
    folderId,
    name: typeof body.name === 'string' ? body.name : undefined,
    promptZh: typeof body.promptZh === 'string' ? body.promptZh : undefined,
    promptEn: normalizeOptionalString(body.promptEn),
    referenceImageUrl: normalizeOptionalString(body.referenceImageUrl),
    referenceImageMediaId: normalizeOptionalString(body.referenceImageMediaId),
    previewImageUrl: normalizeOptionalString(body.previewImageUrl),
    previewImageMediaId: normalizeOptionalString(body.previewImageMediaId),
  })
  const { defaultStyleId } = await ensureDefaultStyles(userId)

  return NextResponse.json({
    style: toStyleResponse(style, defaultStyleId),
  })
})

export const DELETE = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ styleId: string }> },
) => {
  const { styleId } = await context.params
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const result = await deleteGlobalStyle({
    userId: authResult.session.user.id,
    styleId,
  })

  return NextResponse.json(result)
})
