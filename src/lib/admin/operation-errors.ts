import { getErrorSpec } from '@/lib/errors/codes'

export const OPERATION_ERROR_MESSAGES = {
  FEATURE_DISABLED: '该功能暂不可用，请稍后再试',
  MAINTENANCE_MODE: '系统维护中，请稍后再试',
  ACCOUNT_DISABLED: '账号已停用，请联系管理员',
  ENTITLEMENT_DENIED: '当前账号暂不支持该功能',
  TASK_DAILY_LIMIT_EXCEEDED: '今日任务次数已达上限',
  TASK_CONCURRENCY_LIMIT_EXCEEDED: '当前并发任务已达上限',
  MODEL_DISABLED: '模型暂不可用',
  MODEL_NOT_ALLOWED: '当前账号不可使用该模型',
  BILLING_FREEZE_LIMIT_EXCEEDED: '当前冻结金额已达上限',
  PACKAGE_UNAVAILABLE: '套餐暂不可购买',
  REDEEM_CODE_UNAVAILABLE: '兑换码不可用或已过期',
} as const

export type OperationErrorCode = keyof typeof OPERATION_ERROR_MESSAGES

const HTTP_STATUS: Record<OperationErrorCode, number> = {
  FEATURE_DISABLED: 403,
  MAINTENANCE_MODE: 503,
  ACCOUNT_DISABLED: 403,
  ENTITLEMENT_DENIED: 403,
  TASK_DAILY_LIMIT_EXCEEDED: 429,
  TASK_CONCURRENCY_LIMIT_EXCEEDED: 429,
  MODEL_DISABLED: 403,
  MODEL_NOT_ALLOWED: 403,
  BILLING_FREEZE_LIMIT_EXCEEDED: 402,
  PACKAGE_UNAVAILABLE: 409,
  REDEEM_CODE_UNAVAILABLE: 409,
}

export class OperationPolicyError extends Error {
  code: OperationErrorCode
  httpStatus: number
  details: Record<string, unknown>

  constructor(code: OperationErrorCode, options: { message?: string; [key: string]: unknown } = {}) {
    const { message, ...details } = options
    super(message || OPERATION_ERROR_MESSAGES[code])
    this.name = 'OperationPolicyError'
    this.code = code
    this.httpStatus = HTTP_STATUS[code]
    this.details = details
  }
}

export function operationErrorToApiPayload(error: OperationPolicyError) {
  const spec = getErrorSpec(error.code)

  return {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      retryable: spec.retryable,
      category: spec.category,
      userMessageKey: spec.userMessageKey,
      details: error.details,
    },
    code: error.code,
    message: error.message,
    ...error.details,
  }
}
