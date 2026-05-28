import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import {
  createGlobalStyle,
  ensureDefaultStyles,
  listGlobalStyles,
  type GlobalStyleSummary,
} from '@/lib/styles/service'

function normalizeOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function requireText(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'STYLE_REQUIRED',
      message: 'Style name and promptZh are required',
    })
  }
  return value.trim()
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

function toStyleResponse(style: GlobalStyleSummary, defaultStyleId: string) {
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

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const userId = authResult.session.user.id

  const { defaultStyleId } = await ensureDefaultStyles(userId)
  const folderId = normalizeOptionalString(request.nextUrl.searchParams.get('folderId'))
  const styles = await listGlobalStyles(userId, folderId ?? undefined)

  return NextResponse.json({
    defaultStyleId,
    styles: styles.map((style) => toStyleResponse(style, defaultStyleId)),
  })
})

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const userId = authResult.session.user.id

  await ensureDefaultStyles(userId)
  const body = await request.json() as Record<string, unknown>
  const folderId = normalizeOptionalString(body.folderId)
  await validateFolderOwnership(userId, folderId)

  const style = await createGlobalStyle({
    userId,
    folderId,
    name: requireText(body.name),
    promptZh: requireText(body.promptZh),
    promptEn: normalizeOptionalString(body.promptEn),
    referenceImageUrl: normalizeOptionalString(body.referenceImageUrl),
    referenceImageMediaId: normalizeOptionalString(body.referenceImageMediaId),
    previewImageUrl: normalizeOptionalString(body.previewImageUrl),
    previewImageMediaId: normalizeOptionalString(body.previewImageMediaId),
  })
  const { defaultStyleId } = await ensureDefaultStyles(userId)

  return NextResponse.json({
    style: toStyleResponse(style, defaultStyleId),
  }, { status: 201 })
})
