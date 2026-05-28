import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { ensureDefaultStyles, setDefaultStyle } from '@/lib/styles/service'

function validateDefaultStyleIdField(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INVALID_DEFAULT_STYLE',
      field: 'defaultStyleId',
      message: 'defaultStyleId must be a non-empty string',
    })
  }
  const defaultStyleId = value.trim()
  if (!defaultStyleId) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INVALID_DEFAULT_STYLE',
      field: 'defaultStyleId',
      message: 'defaultStyleId must be a non-empty string',
    })
  }
  return defaultStyleId
}

// GET - 获取用户偏好配置
export const GET = apiHandler(async () => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  await ensureDefaultStyles(session.user.id)

  // 获取或创建用户偏好
  const preference = await prisma.userPreference.upsert({
    where: { userId: session.user.id },
    update: {},
    create: { userId: session.user.id }
  })

  return NextResponse.json({ preference })
})

// PATCH - 更新用户偏好配置
export const PATCH = apiHandler(async (request: NextRequest) => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json()

  // 只允许更新特定字段
  const allowedFields = [
    'analysisModel',
    'characterModel',
    'locationModel',
    'storyboardModel',
    'editModel',
    'videoModel',
    'audioModel',
    'lipSyncModel',
    'videoRatio',
    'ttsRate'
  ]

  let defaultStyleUpdated = false
  if (body.defaultStyleId !== undefined) {
    const defaultStyleId = validateDefaultStyleIdField(body.defaultStyleId)
    await setDefaultStyle(session.user.id, defaultStyleId)
    defaultStyleUpdated = true
  }

  const updateData: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field]
    }
  }

  if (Object.keys(updateData).length === 0 && !defaultStyleUpdated) {
    throw new ApiError('INVALID_PARAMS')
  }

  let preference
  if (Object.keys(updateData).length > 0) {
    // 更新或创建用户偏好
    preference = await prisma.userPreference.upsert({
      where: { userId: session.user.id },
      update: updateData,
      create: {
        userId: session.user.id,
        ...updateData
      }
    })
  } else {
    preference = await prisma.userPreference.findUnique({
      where: { userId: session.user.id },
    })
  }

  return NextResponse.json({ preference })
})
