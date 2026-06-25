export const ERROR_CATEGORY = {
  AUTH: 'AUTH',
  BILLING: 'BILLING',
  CONTENT: 'CONTENT',
  PROVIDER: 'PROVIDER',
  SYSTEM: 'SYSTEM',
  VALIDATION: 'VALIDATION',
} as const

export type ErrorCategory = (typeof ERROR_CATEGORY)[keyof typeof ERROR_CATEGORY]

export const ERROR_CATALOG = {
  UNAUTHORIZED: {
    httpStatus: 401,
    retryable: false,
    category: ERROR_CATEGORY.AUTH,
    userMessageKey: 'errors.UNAUTHORIZED',
    defaultMessage: 'Unauthorized',
  },
  FORBIDDEN: {
    httpStatus: 403,
    retryable: false,
    category: ERROR_CATEGORY.AUTH,
    userMessageKey: 'errors.FORBIDDEN',
    defaultMessage: 'Forbidden',
  },
  NOT_FOUND: {
    httpStatus: 404,
    retryable: false,
    category: ERROR_CATEGORY.VALIDATION,
    userMessageKey: 'errors.NOT_FOUND',
    defaultMessage: 'Resource not found',
  },
  INVALID_PARAMS: {
    httpStatus: 400,
    retryable: false,
    category: ERROR_CATEGORY.VALIDATION,
    userMessageKey: 'errors.INVALID_PARAMS',
    defaultMessage: 'Invalid parameters',
  },
  MISSING_CONFIG: {
    httpStatus: 400,
    retryable: false,
    category: ERROR_CATEGORY.VALIDATION,
    userMessageKey: 'errors.MISSING_CONFIG',
    defaultMessage: 'Missing required configuration',
  },
  CONFLICT: {
    httpStatus: 409,
    retryable: false,
    category: ERROR_CATEGORY.VALIDATION,
    userMessageKey: 'errors.CONFLICT',
    defaultMessage: 'Conflict',
  },
  TASK_NOT_READY: {
    httpStatus: 202,
    retryable: true,
    category: ERROR_CATEGORY.SYSTEM,
    userMessageKey: 'errors.TASK_NOT_READY',
    defaultMessage: 'Task is not ready',
  },
  NO_RESULT: {
    httpStatus: 404,
    retryable: false,
    category: ERROR_CATEGORY.SYSTEM,
    userMessageKey: 'errors.NO_RESULT',
    defaultMessage: 'No task result',
  },
  RATE_LIMIT: {
    httpStatus: 429,
    retryable: true,
    category: ERROR_CATEGORY.PROVIDER,
    userMessageKey: 'errors.RATE_LIMIT',
    defaultMessage: 'Rate limit exceeded',
  },
  MODEL_NOT_OPEN: {
    httpStatus: 403,
    retryable: false,
    category: ERROR_CATEGORY.PROVIDER,
    userMessageKey: 'errors.MODEL_NOT_OPEN',
    defaultMessage: 'Model is not activated for this account',
  },
  MODEL_NOT_REGISTERED: {
    httpStatus: 400,
    retryable: false,
    category: ERROR_CATEGORY.PROVIDER,
    userMessageKey: 'errors.MODEL_NOT_REGISTERED',
    defaultMessage: 'Model is not registered',
  },
  MODEL_NOT_CONFIGURED: {
    httpStatus: 400,
    retryable: false,
    category: ERROR_CATEGORY.PROVIDER,
    userMessageKey: 'errors.MODEL_NOT_CONFIGURED',
    defaultMessage: 'Model is not configured. Please add a model in the settings first.',
  },
  FEATURE_DISABLED: {
    httpStatus: 403,
    retryable: false,
    category: ERROR_CATEGORY.SYSTEM,
    userMessageKey: 'errors.FEATURE_DISABLED',
    defaultMessage: '该功能暂不可用，请稍后再试',
  },
  MAINTENANCE_MODE: {
    httpStatus: 503,
    retryable: true,
    category: ERROR_CATEGORY.SYSTEM,
    userMessageKey: 'errors.MAINTENANCE_MODE',
    defaultMessage: '系统维护中，请稍后再试',
  },
  ACCOUNT_DISABLED: {
    httpStatus: 403,
    retryable: false,
    category: ERROR_CATEGORY.AUTH,
    userMessageKey: 'errors.ACCOUNT_DISABLED',
    defaultMessage: '账号已停用，请联系管理员',
  },
  ENTITLEMENT_DENIED: {
    httpStatus: 403,
    retryable: false,
    category: ERROR_CATEGORY.AUTH,
    userMessageKey: 'errors.ENTITLEMENT_DENIED',
    defaultMessage: '当前账号暂不支持该功能',
  },
  TASK_DAILY_LIMIT_EXCEEDED: {
    httpStatus: 429,
    retryable: false,
    category: ERROR_CATEGORY.SYSTEM,
    userMessageKey: 'errors.TASK_DAILY_LIMIT_EXCEEDED',
    defaultMessage: '今日任务次数已达上限',
  },
  TASK_CONCURRENCY_LIMIT_EXCEEDED: {
    httpStatus: 429,
    retryable: false,
    category: ERROR_CATEGORY.SYSTEM,
    userMessageKey: 'errors.TASK_CONCURRENCY_LIMIT_EXCEEDED',
    defaultMessage: '当前并发任务已达上限',
  },
  MODEL_DISABLED: {
    httpStatus: 403,
    retryable: false,
    category: ERROR_CATEGORY.PROVIDER,
    userMessageKey: 'errors.MODEL_DISABLED',
    defaultMessage: '模型暂不可用',
  },
  MODEL_NOT_ALLOWED: {
    httpStatus: 403,
    retryable: false,
    category: ERROR_CATEGORY.PROVIDER,
    userMessageKey: 'errors.MODEL_NOT_ALLOWED',
    defaultMessage: '当前账号不可使用该模型',
  },
  BILLING_FREEZE_LIMIT_EXCEEDED: {
    httpStatus: 402,
    retryable: false,
    category: ERROR_CATEGORY.BILLING,
    userMessageKey: 'errors.BILLING_FREEZE_LIMIT_EXCEEDED',
    defaultMessage: '当前冻结金额已达上限',
  },
  PACKAGE_UNAVAILABLE: {
    httpStatus: 409,
    retryable: false,
    category: ERROR_CATEGORY.BILLING,
    userMessageKey: 'errors.PACKAGE_UNAVAILABLE',
    defaultMessage: '套餐暂不可购买',
  },
  REDEEM_CODE_UNAVAILABLE: {
    httpStatus: 409,
    retryable: false,
    category: ERROR_CATEGORY.BILLING,
    userMessageKey: 'errors.REDEEM_CODE_UNAVAILABLE',
    defaultMessage: '兑换码不可用或已过期',
  },
  QUOTA_EXCEEDED: {
    httpStatus: 429,
    retryable: true,
    category: ERROR_CATEGORY.PROVIDER,
    userMessageKey: 'errors.QUOTA_EXCEEDED',
    defaultMessage: 'Quota exceeded',
  },
  EXTERNAL_ERROR: {
    httpStatus: 502,
    retryable: true,
    category: ERROR_CATEGORY.PROVIDER,
    userMessageKey: 'errors.EXTERNAL_ERROR',
    defaultMessage: 'External service failed',
  },
  NETWORK_ERROR: {
    httpStatus: 502,
    retryable: true,
    category: ERROR_CATEGORY.PROVIDER,
    userMessageKey: 'errors.NETWORK_ERROR',
    defaultMessage: 'Network request failed',
  },
  EMPTY_RESPONSE: {
    httpStatus: 502,
    retryable: true,
    category: ERROR_CATEGORY.PROVIDER,
    userMessageKey: 'errors.EMPTY_RESPONSE',
    defaultMessage: 'Model returned empty response',
  },
  INSUFFICIENT_BALANCE: {
    httpStatus: 402,
    retryable: false,
    category: ERROR_CATEGORY.BILLING,
    userMessageKey: 'errors.INSUFFICIENT_BALANCE',
    defaultMessage: 'Insufficient balance',
  },
  SENSITIVE_CONTENT: {
    httpStatus: 422,
    retryable: false,
    category: ERROR_CATEGORY.CONTENT,
    userMessageKey: 'errors.SENSITIVE_CONTENT',
    defaultMessage: 'Sensitive content detected',
  },
  GENERATION_TIMEOUT: {
    httpStatus: 504,
    retryable: true,
    category: ERROR_CATEGORY.PROVIDER,
    userMessageKey: 'errors.GENERATION_TIMEOUT',
    defaultMessage: 'Generation timed out',
  },
  VIDEO_API_FORMAT_UNSUPPORTED: {
    httpStatus: 400,
    retryable: false,
    category: ERROR_CATEGORY.VALIDATION,
    userMessageKey: 'errors.VIDEO_API_FORMAT_UNSUPPORTED',
    defaultMessage: 'Video API format is unsupported',
  },
  GENERATION_FAILED: {
    httpStatus: 500,
    retryable: true,
    category: ERROR_CATEGORY.PROVIDER,
    userMessageKey: 'errors.GENERATION_FAILED',
    defaultMessage: 'Generation failed',
  },
  WATCHDOG_TIMEOUT: {
    httpStatus: 500,
    retryable: true,
    category: ERROR_CATEGORY.SYSTEM,
    userMessageKey: 'errors.WATCHDOG_TIMEOUT',
    defaultMessage: 'Task heartbeat timeout',
  },
  WORKER_EXECUTION_ERROR: {
    httpStatus: 500,
    retryable: true,
    category: ERROR_CATEGORY.SYSTEM,
    userMessageKey: 'errors.WORKER_EXECUTION_ERROR',
    defaultMessage: 'Worker execution failed',
  },
  INTERNAL_ERROR: {
    httpStatus: 500,
    retryable: false,
    category: ERROR_CATEGORY.SYSTEM,
    userMessageKey: 'errors.INTERNAL_ERROR',
    defaultMessage: 'Internal server error',
  },
} as const

export type UnifiedErrorCode = keyof typeof ERROR_CATALOG

export const DEFAULT_ERROR_CODE: UnifiedErrorCode = 'INTERNAL_ERROR'

export const LEGACY_ERROR_CODE_ALIASES: Record<string, UnifiedErrorCode> = {
  OPERATION_FAILED: 'INTERNAL_ERROR',
}

export function isKnownErrorCode(code: unknown): code is UnifiedErrorCode {
  return typeof code === 'string' && code in ERROR_CATALOG
}

export function resolveUnifiedErrorCode(code: unknown): UnifiedErrorCode | null {
  if (isKnownErrorCode(code)) return code
  if (typeof code !== 'string') return null
  const normalized = code.trim().toUpperCase()
  return LEGACY_ERROR_CODE_ALIASES[normalized] || null
}

export function getErrorSpec(code: UnifiedErrorCode) {
  return ERROR_CATALOG[code]
}
