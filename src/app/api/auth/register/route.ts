import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { logAuthAction } from '@/lib/logging/semantic'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { OperationPolicyError, operationErrorToApiPayload } from '@/lib/admin/operation-errors'
import { assertFeatureEnabled } from '@/lib/admin/policy'
import { resolveDefaultSignupGroup } from '@/lib/admin/user-groups-runtime'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, getClientIp, AUTH_REGISTER_LIMIT } from '@/lib/rate-limit'

export const POST = apiHandler(async (request: NextRequest) => {
  // 🛡️ IP 限流
  const ip = getClientIp(request)
  const rateResult = await checkRateLimit('auth:register', ip, AUTH_REGISTER_LIMIT)
  if (rateResult.limited) {
    logAuthAction('REGISTER', 'unknown', { error: 'Rate limited', ip })
    return NextResponse.json(
      { success: false, message: `请求过于频繁，请 ${rateResult.retryAfterSeconds} 秒后再试` },
      {
        status: 429,
        headers: { 'Retry-After': String(rateResult.retryAfterSeconds) },
      },
    )
  }

  try {
    await assertFeatureEnabled('registration', { role: 'user' })
  } catch (error) {
    if (error instanceof OperationPolicyError) {
      return NextResponse.json(operationErrorToApiPayload(error), { status: error.httpStatus })
    }
    throw error
  }

  let name = 'unknown'
  const body = await request.json()
  name = body.name || 'unknown'
  const { password } = body

  // 验证输入
  if (!name || !password) {
    logAuthAction('REGISTER', name, { error: 'Missing credentials' })
    throw new ApiError('INVALID_PARAMS')
  }

  if (password.length < 6) {
    logAuthAction('REGISTER', name, { error: 'Password too short' })
    throw new ApiError('INVALID_PARAMS')
  }

  // 检查用户是否已存在
  const existingUser = await prisma.user.findUnique({
    where: { name }
  })

  if (existingUser) {
    logAuthAction('REGISTER', name, { error: 'Phone number already exists' })
    throw new ApiError('INVALID_PARAMS')
  }

  // 哈希密码
  const hashedPassword = await bcrypt.hash(password, 12)

  // 创建用户（事务）
  const user = await prisma.$transaction(async (tx) => {
    const signupGroup = await resolveDefaultSignupGroup(tx)

    // 创建用户
    const newUser = await tx.user.create({
      data: {
        name,
        password: hashedPassword,
        adminGroupKey: signupGroup?.key || null,
      }
    })

    // 💰 创建用户余额记录（初始余额为0）
    const signupCredits = signupGroup?.signupCredits || 0
    await tx.userBalance.create({
      data: {
        userId: newUser.id,
        balance: signupCredits,
        frozenAmount: 0,
        totalSpent: 0
      }
    })

    if (signupCredits > 0) {
      await tx.balanceTransaction.create({
        data: {
          userId: newUser.id,
          type: 'recharge',
          amount: signupCredits,
          balanceAfter: signupCredits,
          description: 'signup bonus',
          idempotencyKey: `signup:${newUser.id}`,
        },
      })
    }

    return newUser
  })

  logAuthAction('REGISTER', name, { userId: user.id, success: true })

  return NextResponse.json(
    {
      message: "注册成功",
      user: {
        id: user.id,
        name: user.name
      }
    },
    { status: 201 }
  )
})
