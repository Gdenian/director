import { describe, expect, it } from 'vitest'
import { OperationPolicyError, operationErrorToApiPayload } from '@/lib/admin/operation-errors'

describe('operation policy errors', () => {
  it('returns stable code and user-facing message', () => {
    const error = new OperationPolicyError('FEATURE_DISABLED', {
      message: '图片生成维护中',
      target: 'image_generation',
    })

    expect(error.code).toBe('FEATURE_DISABLED')
    expect(error.httpStatus).toBe(403)
    expect(operationErrorToApiPayload(error)).toMatchObject({
      success: false,
      error: {
        code: 'FEATURE_DISABLED',
        message: '图片生成维护中',
        category: 'SYSTEM',
        userMessageKey: 'errors.FEATURE_DISABLED',
      },
      code: 'FEATURE_DISABLED',
      message: '图片生成维护中',
      target: 'image_generation',
    })
  })

  it('uses default messages for all V3 operation codes', () => {
    const codes = [
      'FEATURE_DISABLED',
      'MAINTENANCE_MODE',
      'ACCOUNT_DISABLED',
      'ENTITLEMENT_DENIED',
      'TASK_DAILY_LIMIT_EXCEEDED',
      'TASK_CONCURRENCY_LIMIT_EXCEEDED',
      'MODEL_DISABLED',
      'MODEL_NOT_ALLOWED',
      'BILLING_FREEZE_LIMIT_EXCEEDED',
      'PACKAGE_UNAVAILABLE',
      'REDEEM_CODE_UNAVAILABLE',
    ] as const

    for (const code of codes) {
      const error = new OperationPolicyError(code)
      expect(error.message).toBeTruthy()
      expect(error.httpStatus).toBeGreaterThanOrEqual(400)
    }
  })
})
