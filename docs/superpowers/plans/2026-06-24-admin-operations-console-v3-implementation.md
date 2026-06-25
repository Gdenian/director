# 管理者运营控制台 V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/superpowers/specs/2026-06-24-admin-operations-console-v3-design.md` 一次性完成 P0/P1/P2，让管理后台从报表页升级为能真实运营网站的控制台。

**Architecture:** 在现有 V2 后台雏形上补齐统一运营策略层，并把策略接入注册、创建作品、模型列表、任务提交、计费冻结、购买兑换、worker 执行前置校验等用户端关键路径。后台写操作统一 owner/admin 权限、原因、二次确认和审计，所有 DTO 使用白名单和脱敏输出，禁止返回用户创作正文、prompt、媒体内容、任务 `payload/result/dedupeKey/billingInfo` 原文。

**Tech Stack:** Next.js 15 App Router, React 19, Prisma/MySQL, next-auth v4, BullMQ, React Query, Vitest, Tailwind CSS v4.

---

## Scope

本计划覆盖完整 P0/P1/P2，而不是只做 P0。

P0 必须交付：

- 功能开关真实拦截注册、创建作品、任务提交、维护模式。
- 用户禁用/恢复对旧 session 生效，并补齐踢出登录审计。
- 公告中心真实展示到 top banner、workspace notice、profile message，modal 可以先作为登录后全局弹窗实现。
- 任务事故取消时 DB、BullMQ、Run/TaskEvent 和余额冻结回滚一致。
- 统一运营错误码和用户提示。
- 管理后台 UI 变成可执行控制台，修复 select 白底白字、表单反馈、表格操作区、高危确认。

P1 必须交付：

- 用户组权益接入注册赠送、模型列表、任务提交、每日上限、并发上限、最大冻结金额、能力开关。
- 计费人工加款、扣款、解冻、退款/补单/订单对账，owner-only、必填原因、幂等。
- 套餐和兑换码接入用户购买、兑换、余额流水和兑换记录，状态变更立即生效。

P2 必须交付：

- 模型与渠道治理接入模型列表、任务提交和 worker 前置校验。
- 系统健康扩展到 MySQL、Redis、BullMQ、worker、MinIO、支付配置、模型渠道。
- 批量任务事故处理。
- 公告、功能开关、模型、套餐、兑换码支持更细人群、灰度和用户组投放。

## Working Rules

- 不回滚当前工作区已有 V2 实现改动；在此基础上增量实现。
- 管理端是运营控制台，不是用户创作内容 CMS。
- 后台页面 `/[locale]/admin` 服务端校验 `role/status`。
- 后台读接口使用 `requireAdminAuth()`。
- 高危写接口使用 `requireOwnerAuth()`。
- 普通用户 API 必须实时拒绝 disabled 用户旧 session。
- 任务类限制失败时必须在 `createTask()` 之前返回，不创建 Task、不入 BullMQ、不冻结余额。
- 所有后台写操作必须写 `AdminAuditLog`，`beforeJson/afterJson` 只保存运营字段摘要。
- 每个阶段完成后运行该阶段测试；全部完成后运行 `npm run typecheck`、`npm run test:unit:all`、`npm run test:integration:api`，最后按时间预算决定是否运行 `npm run build`。

## File Structure

### 数据模型

- Modify: `prisma/schema.prisma`
  - `User` 增加 `adminGroupKey String?`、`adminNote String?`、`sessionVersion Int @default(0)`、`lastLoginAt DateTime?`、`lastLoginIp String?`，用于用户运营、用户组绑定、踢出登录。
  - `AdminFeatureFlag` 增加 `userMessage String?`、`surfaces String?`、`groupKeys String?`、`ruleJson Json?`。
  - `AdminUserGroup` 增加 `allowText`、`allowImage`、`allowLipSync`、`maxTaskCost`、`maxFrozenAmount`、`modelTierJson`、`ruleJson`。
  - `AdminAnnouncement` 增加 `groupKeys String?`、`targetUserIds String?`、`ctaVariant String?`、`publishedAt DateTime?`、`archivedAt DateTime?`。
  - `AdminCommercialPackage` 增加 `groupKeys String?`、`startsAt DateTime?`、`endsAt DateTime?`、`purchaseLimitPerUser Int?`。
  - `AdminRedeemCode` 增加 `singleUserLimit Int @default(1)`、`groupKeys String?`、`targetUserIds String?`。
  - Create `AdminRedeemRedemption`：记录用户兑换，唯一约束 `(code, userId, idempotencyKey)`。
  - Create `AdminCommercialOrder`：记录套餐购买/补单/退款状态。
  - Create `AdminModelChannel`：模型/渠道治理状态。
  - Create `AdminTaskIncident`：批量事故处理批次。
  - Create `AdminTaskIncidentItem`：批量事故处理明细。
  - Create `AdminHealthCheckSnapshot`：健康检查快照。

### 统一运营策略层

- Create: `src/lib/admin/operation-errors.ts`
  - 运营错误码、默认文案、HTTP 状态。
- Create: `src/lib/admin/policy-types.ts`
  - `FeatureFlagKey`、`OperationCapability`、`OperationAudienceContext`、`PolicyDecision`。
- Create: `src/lib/admin/audience.ts`
  - 用户组、人群、灰度、时间窗口匹配。
- Create: `src/lib/admin/policy.ts`
  - `assertFeatureEnabled()`、`assertMaintenanceAllowsRequest()`、`assertUserEntitlement()`、`assertTaskAllowed()`、`assertBillingAllowed()`。
- Create: `src/lib/admin/task-capabilities.ts`
  - 任务类型到 `text/image/video/voice/lip_sync/advanced_models` 能力和模型字段映射。
- Create: `src/lib/admin/user-groups-runtime.ts`
  - 默认用户组、用户所属用户组解析、权益合并。
- Create: `src/lib/admin/model-governance-runtime.ts`
  - 模型渠道状态查询、模型过滤、任务提交/worker 前置校验。
- Create: `src/lib/admin/commercial-runtime.ts`
  - 套餐可购、兑换码可兑、订单补单、余额入账。
- Modify: `src/lib/errors/codes.ts`
  - 增加规格中的运营错误码。
- Modify: `src/lib/api-errors.ts`
  - 确认 `ApiError` 可以透出运营错误码、message、details。

### 用户端接入点

- Modify: `src/app/api/auth/register/route.ts`
  - 接入注册开关、默认用户组、注册送额度。
- Modify: `src/lib/auth.ts`
  - 登录拒绝 disabled，写入 `lastLoginAt/lastLoginIp`，JWT 带 `sessionVersion`。
- Modify: `src/lib/api-auth.ts`
  - 旧 session 对 disabled/sessionVersion 变更立即失效；普通用户写操作接维护模式。
- Modify: `src/app/api/projects/route.ts`
  - `POST` 接入 `create_work`、维护模式、用户组作品/任务限制。
- Modify: `src/lib/task/submitter.ts`
  - 在 `createTask()` 前调用 `assertTaskAllowed()`。
- Modify: `src/lib/billing/service.ts`
  - 在冻结前调用 `assertBillingAllowed()`。
- Modify: `src/app/api/user/models/route.ts`
  - 接入用户组权益和模型渠道治理过滤。
- Modify: worker 入口：
  - `src/lib/workers/text.worker.ts`
  - `src/lib/workers/image.worker.ts`
  - `src/lib/workers/video.worker.ts`
  - `src/lib/workers/voice.worker.ts`
  - 在执行前调用模型渠道前置校验。
- Modify: `src/app/[locale]/layout.tsx`
  - 全局公告 top banner 和 modal。
- Modify: `src/app/[locale]/workspace/[projectId]/page.tsx`
  - workspace notice。
- Modify: `src/app/[locale]/profile/page.tsx`
  - profile message、兑换入口、套餐入口或跳转按钮。
- Create: `src/app/api/commercial/packages/route.ts`
  - 用户端可购套餐列表。
- Create: `src/app/api/commercial/orders/route.ts`
  - 用户端创建购买订单；没有真实支付配置时返回可读错误，不伪造支付成功。
- Create: `src/app/api/commercial/orders/[orderId]/route.ts`
  - 用户端查询订单。
- Create: `src/app/api/redeem/route.ts`
  - 用户端兑换码兑换。

### 后台 API 和服务

- Modify existing:
  - `src/lib/admin/announcements.ts`
  - `src/lib/admin/feature-flags.ts`
  - `src/lib/admin/user-groups.ts`
  - `src/lib/admin/commercial.ts`
  - `src/lib/admin/billing.ts`
  - `src/lib/admin/tasks.ts`
  - `src/lib/admin/models.ts`
  - `src/lib/admin/system-health.ts`
  - `src/lib/admin/operations.ts`
  - `src/lib/admin/overview.ts`
  - `src/lib/admin/redaction.ts`
  - `src/lib/admin/route-utils.ts`
- Modify/create routes under:
  - `src/app/api/admin/announcements/**`
  - `src/app/api/admin/feature-flags/**`
  - `src/app/api/admin/user-groups/**`
  - `src/app/api/admin/users/**`
  - `src/app/api/admin/billing/**`
  - `src/app/api/admin/commercial/**`
  - `src/app/api/admin/models/**`
  - `src/app/api/admin/tasks/**`
  - `src/app/api/admin/system-health/**`
  - `src/app/api/admin/audit-logs/route.ts`

### 管理后台 UI

- Rewrite: `src/app/[locale]/admin/AdminConsoleClient.tsx`
  - 工具型后台布局：左侧导航、顶部状态条、右侧模块工作区。
  - 每个模块有表格、筛选、操作按钮、抽屉详情、确认弹窗、原因输入、保存状态。
- Modify: `src/app/[locale]/admin/admin-api.ts`
  - 所有后台接口 fetch/mutation 类型化，错误读取后端 `error.message`。
- Modify: `src/app/[locale]/admin/types.ts`
  - 覆盖完整 V3 DTO。
- Create: `src/app/[locale]/admin/admin-ui.tsx`
  - 复用表格、状态 pill、表单字段、确认弹窗、抽屉、分页、可读 select。
- Modify: `src/app/[locale]/admin/page.tsx`
  - 服务端校验后传递当前管理员角色。

### 测试

- Unit:
  - `tests/unit/admin/operation-errors.test.ts`
  - `tests/unit/admin/audience.test.ts`
  - `tests/unit/admin/policy.test.ts`
  - `tests/unit/admin/task-capabilities.test.ts`
  - `tests/unit/admin/user-groups-runtime.test.ts`
  - `tests/unit/admin/model-governance-runtime.test.ts`
  - `tests/unit/admin/commercial-runtime.test.ts`
  - `tests/unit/admin/redaction.test.ts`
  - `tests/unit/admin/data-services.test.ts`
  - `tests/unit/admin/admin-console-ui.test.tsx`
- Integration/API contract:
  - `tests/integration/api/contract/admin-routes.test.ts`
  - `tests/integration/api/contract/announcements-route.test.ts`
  - `tests/integration/api/contract/admin-policy-routes.test.ts`
  - `tests/integration/api/contract/commercial-routes.test.ts`
  - `tests/integration/api/contract/creative-engine-user-models.contract.test.ts`
  - `tests/integration/billing/admin-operations.integration.test.ts`
  - `tests/integration/billing/submitter.integration.test.ts`
  - `tests/integration/chain/model-governance.chain.test.ts`

---

## P0: 真实控制闭环

### Task 1: 补齐运营错误码和策略层骨架

**Files:**
- Create: `src/lib/admin/operation-errors.ts`
- Create: `src/lib/admin/policy-types.ts`
- Create: `src/lib/admin/audience.ts`
- Create: `src/lib/admin/policy.ts`
- Modify: `src/lib/errors/codes.ts`
- Test: `tests/unit/admin/operation-errors.test.ts`
- Test: `tests/unit/admin/audience.test.ts`
- Test: `tests/unit/admin/policy.test.ts`

- [ ] **Step 1: 写失败测试**

Create `tests/unit/admin/operation-errors.test.ts`:

```ts
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
```

Create `tests/unit/admin/audience.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { audienceMatches, rolloutMatches, withinWindow } from '@/lib/admin/audience'

describe('admin audience matching', () => {
  it('matches all, role audience, and group audience', () => {
    expect(audienceMatches({ audience: 'all' }, { userId: 'u1', role: 'user', groupKey: 'free' })).toBe(true)
    expect(audienceMatches({ audience: 'admins' }, { userId: 'u1', role: 'admin', groupKey: 'free' })).toBe(true)
    expect(audienceMatches({ audience: 'admins' }, { userId: 'u1', role: 'user', groupKey: 'free' })).toBe(false)
    expect(audienceMatches({ audience: 'group', groupKeys: ['vip'] }, { userId: 'u1', role: 'user', groupKey: 'vip' })).toBe(true)
    expect(audienceMatches({ audience: 'group', groupKeys: ['vip'] }, { userId: 'u1', role: 'user', groupKey: 'free' })).toBe(false)
  })

  it('matches target user ids and deterministic rollout', () => {
    expect(audienceMatches({ audience: 'target_users', targetUserIds: ['u1'] }, { userId: 'u1', role: 'user' })).toBe(true)
    expect(audienceMatches({ audience: 'target_users', targetUserIds: ['u2'] }, { userId: 'u1', role: 'user' })).toBe(false)
    expect(rolloutMatches('u1', 100)).toBe(true)
    expect(rolloutMatches('u1', 0)).toBe(false)
  })

  it('checks time windows inclusively', () => {
    const now = new Date('2026-06-24T10:00:00.000Z')
    expect(withinWindow({ startsAt: null, endsAt: null }, now)).toBe(true)
    expect(withinWindow({ startsAt: new Date('2026-06-24T09:00:00.000Z'), endsAt: null }, now)).toBe(true)
    expect(withinWindow({ startsAt: new Date('2026-06-24T11:00:00.000Z'), endsAt: null }, now)).toBe(false)
    expect(withinWindow({ startsAt: null, endsAt: new Date('2026-06-24T09:00:00.000Z') }, now)).toBe(false)
  })
})
```

Create `tests/unit/admin/policy.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OperationPolicyError } from '@/lib/admin/operation-errors'
import {
  assertFeatureEnabled,
  assertMaintenanceAllowsRequest,
  evaluateFeatureFlag,
} from '@/lib/admin/policy'

const prismaMock = vi.hoisted(() => ({
  adminFeatureFlag: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('admin operation policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows missing flags except maintenance mode', async () => {
    prismaMock.adminFeatureFlag.findUnique.mockResolvedValue(null)
    await expect(assertFeatureEnabled('registration', { userId: 'u1', role: 'user' })).resolves.toEqual({
      allowed: true,
    })
  })

  it('denies disabled feature with configured message', async () => {
    prismaMock.adminFeatureFlag.findUnique.mockResolvedValue({
      key: 'registration',
      enabled: false,
      audience: 'all',
      rolloutPercent: 100,
      startsAt: null,
      endsAt: null,
      userMessage: '注册暂不可用',
      groupKeys: null,
      ruleJson: null,
    })

    await expect(assertFeatureEnabled('registration', { userId: 'u1', role: 'user' }))
      .rejects.toMatchObject({
        code: 'FEATURE_DISABLED',
        message: '注册暂不可用',
      })
  })

  it('lets admins through maintenance mode but blocks ordinary writes', async () => {
    await expect(assertMaintenanceAllowsRequest({
      maintenanceEnabled: true,
      role: 'admin',
      write: true,
    })).resolves.toEqual({ allowed: true })

    await expect(assertMaintenanceAllowsRequest({
      maintenanceEnabled: true,
      role: 'user',
      write: true,
    })).rejects.toBeInstanceOf(OperationPolicyError)
  })

  it('evaluates inactive time window as allowed', () => {
    expect(evaluateFeatureFlag({
      key: 'payment',
      enabled: false,
      audience: 'all',
      rolloutPercent: 100,
      startsAt: new Date('2026-06-25T00:00:00.000Z'),
      endsAt: null,
      userMessage: '支付维护中',
      groupKeys: null,
      ruleJson: null,
    }, {
      now: new Date('2026-06-24T00:00:00.000Z'),
      userId: 'u1',
      role: 'user',
    })).toEqual({ allowed: true })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/admin/operation-errors.test.ts tests/unit/admin/audience.test.ts tests/unit/admin/policy.test.ts
```

Expected: FAIL，缺少 `operation-errors.ts`、`audience.ts`、`policy.ts`。

- [ ] **Step 3: 实现运营错误码**

Create `src/lib/admin/operation-errors.ts`:

```ts
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
  return {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      retryable: error.code === 'MAINTENANCE_MODE',
      category: 'OPERATIONS',
      details: error.details,
    },
    code: error.code,
    message: error.message,
    ...error.details,
  }
}
```

Modify `src/lib/errors/codes.ts` by adding the same codes to `ERROR_CATALOG`:

```ts
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
```

- [ ] **Step 4: 实现策略类型和人群匹配**

Create `src/lib/admin/policy-types.ts`:

```ts
import type { AdminRole } from '@/lib/admin/roles'

export type FeatureFlagKey =
  | 'registration'
  | 'create_work'
  | 'text_generation'
  | 'image_generation'
  | 'video_generation'
  | 'voice_generation'
  | 'lip_sync'
  | 'payment'
  | 'redeem_code'
  | 'advanced_models'
  | 'maintenance_mode'

export type OperationCapability =
  | 'text'
  | 'image'
  | 'video'
  | 'voice'
  | 'lip_sync'
  | 'advanced_models'
  | 'payment'
  | 'redeem_code'
  | 'create_work'

export interface OperationAudienceContext {
  userId?: string | null
  role?: AdminRole | string | null
  groupKey?: string | null
  groupKeys?: string[]
}

export interface AudienceRule {
  audience?: string | null
  groupKeys?: string[] | null
  targetUserIds?: string[] | null
}

export interface TimeWindow {
  startsAt?: Date | string | null
  endsAt?: Date | string | null
}

export interface PolicyDecision {
  allowed: boolean
  code?: string
  message?: string
  target?: string
}
```

Create `src/lib/admin/audience.ts`:

```ts
import { isAdminRole } from '@/lib/admin/roles'
import type { AudienceRule, OperationAudienceContext, TimeWindow } from './policy-types'

function toDate(value: Date | string | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  if (typeof value !== 'string') return []
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

export function withinWindow(window: TimeWindow, now = new Date()) {
  const startsAt = toDate(window.startsAt)
  const endsAt = toDate(window.endsAt)
  if (startsAt && now < startsAt) return false
  if (endsAt && now > endsAt) return false
  return true
}

export function rolloutMatches(seed: string | null | undefined, percent: number | null | undefined) {
  const normalizedPercent = Math.max(0, Math.min(100, Math.floor(percent ?? 100)))
  if (normalizedPercent >= 100) return true
  if (normalizedPercent <= 0) return false
  const text = seed || 'anonymous'
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  }
  return hash % 100 < normalizedPercent
}

export function audienceMatches(rule: AudienceRule, context: OperationAudienceContext) {
  const audience = rule.audience || 'all'
  if (audience === 'all') return true
  if (audience === 'admins') return isAdminRole(context.role)
  if (audience === 'target_users') return !!context.userId && (rule.targetUserIds || []).includes(context.userId)
  if (audience === 'group') {
    const allowedGroups = new Set(rule.groupKeys || [])
    if (context.groupKey && allowedGroups.has(context.groupKey)) return true
    return (context.groupKeys || []).some(groupKey => allowedGroups.has(groupKey))
  }
  if (audience === 'test_users' || audience === 'vip' || audience === 'restricted') {
    const groups = new Set([context.groupKey, ...(context.groupKeys || [])].filter(Boolean))
    return groups.has(audience)
  }
  return false
}
```

- [ ] **Step 5: 实现功能开关和维护策略**

Create `src/lib/admin/policy.ts`:

```ts
import { isAdminRole } from '@/lib/admin/roles'
import { prisma } from '@/lib/prisma'
import { OperationPolicyError } from './operation-errors'
import { audienceMatches, parseList, rolloutMatches, withinWindow } from './audience'
import type { FeatureFlagKey, OperationAudienceContext } from './policy-types'

type StoredFeatureFlag = {
  key: string
  enabled: boolean
  audience: string | null
  rolloutPercent: number | null
  startsAt: Date | null
  endsAt: Date | null
  userMessage?: string | null
  groupKeys?: string | null
  ruleJson?: unknown
}

export function evaluateFeatureFlag(
  flag: StoredFeatureFlag | null,
  context: OperationAudienceContext & { now?: Date } = {},
) {
  if (!flag) return { allowed: true as const }
  const now = context.now || new Date()
  if (!withinWindow(flag, now)) return { allowed: true as const }
  const groupKeys = parseList(flag.groupKeys)
  const targetUserIds = typeof flag.ruleJson === 'object' && flag.ruleJson && !Array.isArray(flag.ruleJson)
    ? parseList((flag.ruleJson as Record<string, unknown>).targetUserIds)
    : []
  const matched = audienceMatches({
    audience: flag.audience,
    groupKeys,
    targetUserIds,
  }, context)
  if (!matched) return { allowed: true as const }
  if (!rolloutMatches(context.userId, flag.rolloutPercent ?? 100)) return { allowed: true as const }
  if (flag.enabled) return { allowed: true as const }
  return {
    allowed: false as const,
    message: flag.userMessage || undefined,
    target: flag.key,
  }
}

export async function getFeatureFlag(key: FeatureFlagKey) {
  return await prisma.adminFeatureFlag.findUnique({
    where: { key },
    select: {
      key: true,
      enabled: true,
      audience: true,
      rolloutPercent: true,
      startsAt: true,
      endsAt: true,
      userMessage: true,
      groupKeys: true,
      ruleJson: true,
    },
  })
}

export async function assertFeatureEnabled(key: FeatureFlagKey, context: OperationAudienceContext = {}) {
  const decision = evaluateFeatureFlag(await getFeatureFlag(key), context)
  if (!decision.allowed) {
    throw new OperationPolicyError(key === 'maintenance_mode' ? 'MAINTENANCE_MODE' : 'FEATURE_DISABLED', {
      message: decision.message,
      target: decision.target || key,
    })
  }
  return { allowed: true as const }
}

export async function assertMaintenanceAllowsRequest(params: {
  maintenanceEnabled: boolean
  role?: string | null
  write: boolean
  message?: string | null
}) {
  if (!params.maintenanceEnabled) return { allowed: true as const }
  if (isAdminRole(params.role)) return { allowed: true as const }
  if (!params.write) return { allowed: true as const }
  throw new OperationPolicyError('MAINTENANCE_MODE', {
    message: params.message || undefined,
    target: 'maintenance_mode',
  })
}
```

- [ ] **Step 6: 运行测试确认通过**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/admin/operation-errors.test.ts tests/unit/admin/audience.test.ts tests/unit/admin/policy.test.ts
```

Expected: PASS。

- [ ] **Step 7: 提交 P0 策略骨架**

Run:

```bash
git add src/lib/admin/operation-errors.ts src/lib/admin/policy-types.ts src/lib/admin/audience.ts src/lib/admin/policy.ts src/lib/errors/codes.ts tests/unit/admin/operation-errors.test.ts tests/unit/admin/audience.test.ts tests/unit/admin/policy.test.ts
git commit -m "feat: add admin operations policy foundation"
```

Expected: commit succeeds.

### Task 2: 扩展 Prisma 模型和默认运营配置

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/admin/feature-flags.ts`
- Modify: `src/lib/admin/user-groups.ts`
- Modify: `src/lib/admin/announcements.ts`
- Modify: `src/lib/admin/commercial.ts`
- Create: `tests/unit/admin/schema-contract.test.ts`
- Test: `tests/unit/admin/data-services.test.ts`

- [ ] **Step 1: 写 schema contract 测试**

Create `tests/unit/admin/schema-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('admin operations schema contract', () => {
  const schema = fs.readFileSync(path.join(process.cwd(), 'prisma/schema.prisma'), 'utf8')

  it('stores user operation fields needed for access and grouping', () => {
    expect(schema).toContain('adminGroupKey')
    expect(schema).toContain('sessionVersion')
    expect(schema).toContain('adminNote')
  })

  it('stores real commercial and model governance records', () => {
    expect(schema).toContain('model AdminRedeemRedemption')
    expect(schema).toContain('model AdminCommercialOrder')
    expect(schema).toContain('model AdminModelChannel')
    expect(schema).toContain('model AdminTaskIncident')
    expect(schema).toContain('model AdminHealthCheckSnapshot')
  })

  it('keeps redeem idempotency and user limits enforceable by database', () => {
    expect(schema).toContain('@@unique([code, userId, idempotencyKey]')
    expect(schema).toContain('singleUserLimit')
  })
})
```

- [ ] **Step 2: 运行 schema contract 确认失败**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/admin/schema-contract.test.ts
```

Expected: FAIL，schema 缺少 V3 表和字段。

- [ ] **Step 3: 修改 `prisma/schema.prisma`**

Add fields to `User`:

```prisma
  adminGroupKey  String?   @db.VarChar(64)
  adminNote      String?   @db.Text
  sessionVersion Int       @default(0)
  lastLoginAt    DateTime?
  lastLoginIp    String?   @db.VarChar(128)
```

Add indexes inside `User`:

```prisma
  @@index([adminGroupKey])
  @@index([sessionVersion])
```

Add fields to `AdminAnnouncement`:

```prisma
  groupKeys     String?   @db.Text
  targetUserIds String?   @db.Text
  ctaVariant    String?   @db.VarChar(32)
  publishedAt   DateTime?
  archivedAt    DateTime?
```

Add fields to `AdminFeatureFlag`:

```prisma
  userMessage String? @db.Text
  surfaces    String? @db.Text
  groupKeys   String? @db.Text
  ruleJson    Json?
```

Add fields to `AdminUserGroup`:

```prisma
  allowText        Boolean  @default(true)
  allowImage       Boolean  @default(true)
  allowLipSync     Boolean  @default(false)
  maxTaskCost      Decimal? @db.Decimal(18, 6)
  maxFrozenAmount  Decimal? @db.Decimal(18, 6)
  modelTierJson    Json?
  ruleJson         Json?
```

Add fields to `AdminCommercialPackage`:

```prisma
  groupKeys            String?   @db.Text
  startsAt             DateTime?
  endsAt               DateTime?
  purchaseLimitPerUser Int?
```

Add fields to `AdminRedeemCode`:

```prisma
  singleUserLimit Int     @default(1)
  groupKeys       String? @db.Text
  targetUserIds   String? @db.Text
```

Add new models:

```prisma
model AdminRedeemRedemption {
  id             String   @id @default(uuid())
  code           String   @db.VarChar(64)
  userId         String
  credits        Decimal  @db.Decimal(18, 6)
  balanceAfter   Decimal  @db.Decimal(18, 6)
  transactionId  String?
  idempotencyKey String   @db.VarChar(128)
  createdAt      DateTime @default(now())

  @@index([code])
  @@index([userId])
  @@unique([code, userId, idempotencyKey])
  @@map("admin_redeem_redemptions")
}

model AdminCommercialOrder {
  id              String    @id @default(uuid())
  userId          String
  packageKey      String
  status          String    @default("pending") @db.VarChar(32)
  amount          Decimal   @db.Decimal(18, 6)
  currency        String    @default("CNY") @db.VarChar(16)
  credits         Decimal   @db.Decimal(18, 6)
  bonusCredits    Decimal   @default(0) @db.Decimal(18, 6)
  externalOrderId String?   @db.VarChar(128)
  idempotencyKey  String?   @db.VarChar(128)
  paidAt          DateTime?
  reconciledAt    DateTime?
  refundedAt      DateTime?
  createdBy       String?
  updatedBy       String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([userId])
  @@index([packageKey])
  @@index([status])
  @@index([externalOrderId])
  @@unique([userId, packageKey, idempotencyKey])
  @@map("admin_commercial_orders")
}

model AdminModelChannel {
  key              String    @id @db.VarChar(160)
  provider         String    @db.VarChar(80)
  model            String    @db.VarChar(120)
  modelType        String    @db.VarChar(32)
  status           String    @default("active") @db.VarChar(32)
  isAdvanced       Boolean   @default(false)
  isDefault        Boolean   @default(false)
  groupKeys        String?   @db.Text
  costMultiplier   Decimal?  @db.Decimal(12, 6)
  userMessage      String?   @db.Text
  lastTestStatus   String?   @db.VarChar(32)
  lastTestMessage  String?   @db.Text
  lastTestAt       DateTime?
  createdBy        String?
  updatedBy        String?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  @@index([provider])
  @@index([modelType])
  @@index([status])
  @@index([isAdvanced])
  @@map("admin_model_channels")
}

model AdminTaskIncident {
  id          String   @id @default(uuid())
  title       String   @db.VarChar(160)
  action      String   @db.VarChar(32)
  status      String   @default("pending") @db.VarChar(32)
  reason      String   @db.Text
  filterJson  Json?
  createdBy   String
  completedAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  items       AdminTaskIncidentItem[]

  @@index([status])
  @@index([action])
  @@index([createdAt])
  @@map("admin_task_incidents")
}

model AdminTaskIncidentItem {
  id          String   @id @default(uuid())
  incidentId  String
  taskId      String
  status      String   @default("pending") @db.VarChar(32)
  beforeJson  Json?
  afterJson   Json?
  errorMessage String? @db.Text
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  incident     AdminTaskIncident @relation(fields: [incidentId], references: [id], onDelete: Cascade)

  @@index([incidentId])
  @@index([taskId])
  @@index([status])
  @@map("admin_task_incident_items")
}

model AdminHealthCheckSnapshot {
  id        String   @id @default(uuid())
  status    String   @db.VarChar(32)
  summary   String?  @db.Text
  checksJson Json
  createdBy String?
  createdAt DateTime @default(now())

  @@index([status])
  @@index([createdAt])
  @@map("admin_health_check_snapshots")
}
```

- [ ] **Step 4: 补齐默认功能开关**

Modify `src/lib/admin/feature-flags.ts` so `DEFAULT_FLAGS` contains all V3 keys:

```ts
  { key: 'lip_sync', name: '口型同步', category: 'generation', enabled: true, description: '控制口型同步任务。' },
  { key: 'redeem_code', name: '兑换码', category: 'billing', enabled: true, description: '控制兑换码兑换入口。' },
```

Also update parser to accept:

```ts
  userMessage?: unknown
  surfaces?: unknown
  groupKeys?: unknown
  ruleJson?: unknown
```

and write these fields in create/update.

- [ ] **Step 5: 更新用户组、公告、商业服务解析字段**

Modify `src/lib/admin/user-groups.ts`:

```ts
  allowText?: unknown
  allowImage?: unknown
  allowLipSync?: unknown
  maxTaskCost?: unknown
  maxFrozenAmount?: unknown
  modelTierJson?: unknown
  ruleJson?: unknown
```

Use defaults:

```ts
allowText: typeof input.allowText === 'boolean' ? input.allowText : true,
allowImage: typeof input.allowImage === 'boolean' ? input.allowImage : true,
allowLipSync: typeof input.allowLipSync === 'boolean' ? input.allowLipSync : false,
maxTaskCost: input.maxTaskCost == null ? null : String(input.maxTaskCost),
maxFrozenAmount: input.maxFrozenAmount == null ? null : String(input.maxFrozenAmount),
modelTierJson: isRecord(input.modelTierJson) ? input.modelTierJson : undefined,
ruleJson: isRecord(input.ruleJson) ? input.ruleJson : undefined,
```

Modify `src/lib/admin/announcements.ts` to parse/serialize `groupKeys`、`targetUserIds`、`ctaVariant`、`publishedAt`、`archivedAt`.

Modify `src/lib/admin/commercial.ts` to parse/serialize:

```ts
groupKeys
startsAt
endsAt
purchaseLimitPerUser
singleUserLimit
targetUserIds
```

- [ ] **Step 6: 生成 Prisma Client 并运行 schema 测试**

Run:

```bash
npx prisma generate
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/admin/schema-contract.test.ts tests/unit/admin/data-services.test.ts
```

Expected: PASS。

- [ ] **Step 7: 提交数据模型**

Run:

```bash
git add prisma/schema.prisma src/lib/admin/feature-flags.ts src/lib/admin/user-groups.ts src/lib/admin/announcements.ts src/lib/admin/commercial.ts tests/unit/admin/schema-contract.test.ts tests/unit/admin/data-services.test.ts
git commit -m "feat: extend admin operations data model"
```

Expected: commit succeeds.

### Task 3: 接入注册、创建作品、维护模式和旧 session 失效

**Files:**
- Modify: `src/app/api/auth/register/route.ts`
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/api-auth.ts`
- Modify: `src/app/api/projects/route.ts`
- Modify: `src/lib/admin/policy.ts`
- Modify: `src/lib/admin/user-groups-runtime.ts`
- Test: `tests/integration/api/contract/admin-policy-routes.test.ts`
- Test: `tests/unit/admin/api-auth.test.ts`

- [ ] **Step 1: 写 API contract 测试**

Create `tests/integration/api/contract/admin-policy-routes.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callRoute } from '../helpers/call-route'

const prismaMock = vi.hoisted(() => ({
  adminFeatureFlag: { findUnique: vi.fn() },
  adminUserGroup: { findFirst: vi.fn(), findUnique: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  userBalance: { create: vi.fn() },
  project: { create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  novelPromotionProject: { create: vi.fn(), findMany: vi.fn() },
  userPreference: { findUnique: vi.fn() },
  usageCost: { groupBy: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)),
}))

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/styles/service', () => ({
  resolveDefaultStyleSnapshot: vi.fn(async () => ({
    styleAssetId: null,
    name: null,
    promptZh: null,
    promptEn: null,
    snapshotUpdatedAt: new Date('2026-06-24T00:00:00.000Z').toISOString(),
  })),
}))
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'hashed') } }))
vi.mock('@/lib/rate-limit', () => ({
  AUTH_REGISTER_LIMIT: { points: 1, duration: 1 },
  checkRateLimit: vi.fn(async () => ({ limited: false })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}))
vi.mock('@/lib/logging/semantic', () => ({ logAuthAction: vi.fn() }))

describe('api contract - admin policy user routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.adminFeatureFlag.findUnique.mockResolvedValue(null)
    prismaMock.adminUserGroup.findFirst.mockResolvedValue(null)
    prismaMock.adminUserGroup.findUnique.mockResolvedValue(null)
    authMock.requireUserAuth.mockResolvedValue({
      session: { user: { id: 'u1', role: 'user', status: 'active' } },
    })
  })

  it('blocks registration when registration flag is disabled before user creation', async () => {
    prismaMock.adminFeatureFlag.findUnique.mockResolvedValue({
      key: 'registration',
      enabled: false,
      audience: 'all',
      rolloutPercent: 100,
      startsAt: null,
      endsAt: null,
      userMessage: '注册暂不可用',
      groupKeys: null,
      ruleJson: null,
    })

    const route = await import('@/app/api/auth/register/route')
    const response = await callRoute(route.POST, {
      method: 'POST',
      body: { name: 'new-user', password: '123456' },
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      code: 'FEATURE_DISABLED',
      message: '注册暂不可用',
    })
    expect(prismaMock.user.create).not.toHaveBeenCalled()
    expect(prismaMock.userBalance.create).not.toHaveBeenCalled()
  })

  it('blocks project creation when create_work flag is disabled before project creation', async () => {
    prismaMock.adminFeatureFlag.findUnique.mockResolvedValue({
      key: 'create_work',
      enabled: false,
      audience: 'all',
      rolloutPercent: 100,
      startsAt: null,
      endsAt: null,
      userMessage: '创建作品维护中',
      groupKeys: null,
      ruleJson: null,
    })

    const route = await import('@/app/api/projects/route')
    const response = await callRoute(route.POST, {
      method: 'POST',
      body: { name: '作品 A' },
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      code: 'FEATURE_DISABLED',
      message: '创建作品维护中',
    })
    expect(prismaMock.project.create).not.toHaveBeenCalled()
    expect(prismaMock.novelPromotionProject.create).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/integration/api/contract/admin-policy-routes.test.ts tests/unit/admin/api-auth.test.ts
```

Expected: FAIL，注册和创建作品尚未调用策略层。

- [ ] **Step 3: 注册接入功能开关和默认用户组**

Modify `src/app/api/auth/register/route.ts`:

```ts
import { assertFeatureEnabled } from '@/lib/admin/policy'
import { resolveDefaultSignupGroup } from '@/lib/admin/user-groups-runtime'
import { OperationPolicyError, operationErrorToApiPayload } from '@/lib/admin/operation-errors'
```

At the top of POST after rate limit passes and before reading/creating user:

```ts
  try {
    await assertFeatureEnabled('registration', { role: 'user' })
  } catch (error) {
    if (error instanceof OperationPolicyError) {
      return NextResponse.json(operationErrorToApiPayload(error), { status: error.httpStatus })
    }
    throw error
  }
```

Inside transaction before user create:

```ts
    const signupGroup = await resolveDefaultSignupGroup(tx)
```

Set user:

```ts
        adminGroupKey: signupGroup?.key || null,
```

Set balance:

```ts
        balance: signupGroup?.signupCredits || 0,
```

If `signupCredits > 0`, create `BalanceTransaction` with type `recharge` and description `signup bonus`.

- [ ] **Step 4: 创建用户组 runtime**

Create `src/lib/admin/user-groups-runtime.ts`:

```ts
import type { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { toMoneyNumber } from '@/lib/billing/money'

type PrismaLike = PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

export interface RuntimeUserGroup {
  key: string
  status: string
  signupCredits: number
  dailyTaskLimit: number | null
  concurrentTaskLimit: number | null
  monthlyCredits: number
  allowedModelTiers: string | null
  allowText: boolean
  allowImage: boolean
  allowVideo: boolean
  allowVoice: boolean
  allowLipSync: boolean
  allowAdvancedModels: boolean
  maxTaskCost: number | null
  maxFrozenAmount: number | null
}

export const FALLBACK_USER_GROUP: RuntimeUserGroup = {
  key: 'default',
  status: 'active',
  signupCredits: 0,
  dailyTaskLimit: null,
  concurrentTaskLimit: null,
  monthlyCredits: 0,
  allowedModelTiers: null,
  allowText: true,
  allowImage: true,
  allowVideo: true,
  allowVoice: true,
  allowLipSync: true,
  allowAdvancedModels: true,
  maxTaskCost: null,
  maxFrozenAmount: null,
}

function serializeRuntimeGroup(group: Record<string, unknown>): RuntimeUserGroup {
  return {
    key: String(group.key || FALLBACK_USER_GROUP.key),
    status: String(group.status || 'active'),
    signupCredits: toMoneyNumber(group.signupCredits),
    dailyTaskLimit: typeof group.dailyTaskLimit === 'number' ? group.dailyTaskLimit : null,
    concurrentTaskLimit: typeof group.concurrentTaskLimit === 'number' ? group.concurrentTaskLimit : null,
    monthlyCredits: toMoneyNumber(group.monthlyCredits),
    allowedModelTiers: typeof group.allowedModelTiers === 'string' ? group.allowedModelTiers : null,
    allowText: group.allowText !== false,
    allowImage: group.allowImage !== false,
    allowVideo: group.allowVideo !== false,
    allowVoice: group.allowVoice !== false,
    allowLipSync: group.allowLipSync !== false,
    allowAdvancedModels: group.allowAdvancedModels !== false,
    maxTaskCost: group.maxTaskCost == null ? null : toMoneyNumber(group.maxTaskCost),
    maxFrozenAmount: group.maxFrozenAmount == null ? null : toMoneyNumber(group.maxFrozenAmount),
  }
}

export async function resolveDefaultSignupGroup(client: PrismaLike = prisma) {
  const group = await client.adminUserGroup.findFirst({
    where: { status: 'active' },
    orderBy: [{ priority: 'asc' }, { key: 'asc' }],
  })
  return group ? serializeRuntimeGroup(group as unknown as Record<string, unknown>) : null
}

export async function resolveUserRuntimeGroup(userId: string, client: PrismaLike = prisma) {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { adminGroupKey: true },
  })
  if (!user?.adminGroupKey) return FALLBACK_USER_GROUP
  const group = await client.adminUserGroup.findUnique({ where: { key: user.adminGroupKey } })
  if (!group || group.status !== 'active') return FALLBACK_USER_GROUP
  return serializeRuntimeGroup(group as unknown as Record<string, unknown>)
}
```

- [ ] **Step 5: 创建作品接入功能开关**

Modify `src/app/api/projects/route.ts` before body validation and before any create:

```ts
import { assertFeatureEnabled } from '@/lib/admin/policy'
import { OperationPolicyError, operationErrorToApiPayload } from '@/lib/admin/operation-errors'
```

After `const { session } = authResult`:

```ts
  try {
    await assertFeatureEnabled('create_work', {
      userId: session.user.id,
      role: session.user.role,
    })
  } catch (error) {
    if (error instanceof OperationPolicyError) {
      return NextResponse.json(operationErrorToApiPayload(error), { status: error.httpStatus })
    }
    throw error
  }
```

- [ ] **Step 6: `requireUserAuth()` 接旧 session 状态和 sessionVersion**

Modify `src/lib/api-auth.ts`:

```ts
select: { id: true, name: true, email: true, role: true, status: true, sessionVersion: true },
```

If session has `sessionVersion` and DB version differs, return `forbidden('Session expired')`.

Return disabled users with `ACCOUNT_DISABLED` by using `buildErrorResponse('ACCOUNT_DISABLED')` after Task 1 added catalog code.

- [ ] **Step 7: `src/lib/auth.ts` 登录拒绝 disabled 并更新登录元数据**

In credentials authorize after password success:

```ts
if (!isActiveUserStatus(user.status)) {
  throw new Error('ACCOUNT_DISABLED')
}
await prisma.user.update({
  where: { id: user.id },
  data: { lastLoginAt: new Date(), lastLoginIp: ip || null },
})
```

In JWT/session callbacks include:

```ts
token.role = user.role
token.status = user.status
token.sessionVersion = user.sessionVersion
session.user.role = normalizeUserRole(token.role)
session.user.status = normalizeUserStatus(token.status)
session.user.sessionVersion = Number(token.sessionVersion || 0)
```

- [ ] **Step 8: 运行 P0 接入测试**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/integration/api/contract/admin-policy-routes.test.ts tests/unit/admin/api-auth.test.ts
npm run typecheck
```

Expected: PASS。

- [ ] **Step 9: 提交注册/创建作品/账号状态接入**

Run:

```bash
git add src/app/api/auth/register/route.ts src/lib/auth.ts src/lib/api-auth.ts src/app/api/projects/route.ts src/lib/admin/user-groups-runtime.ts tests/integration/api/contract/admin-policy-routes.test.ts tests/unit/admin/api-auth.test.ts
git commit -m "feat: enforce admin access policies on user entrypoints"
```

Expected: commit succeeds.

### Task 4: 任务提交前统一拦截，不创建任务、不入队、不冻结

**Files:**
- Create: `src/lib/admin/task-capabilities.ts`
- Modify: `src/lib/admin/policy.ts`
- Modify: `src/lib/task/submitter.ts`
- Test: `tests/unit/admin/task-capabilities.test.ts`
- Test: `tests/integration/billing/submitter.integration.test.ts`
- Test: `tests/unit/guards/task-submit-compensation-guard.test.ts`

- [ ] **Step 1: 写 task capability 测试**

Create `tests/unit/admin/task-capabilities.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TASK_TYPE } from '@/lib/task/types'
import { getTaskOperationCapability, extractTaskModelKeys } from '@/lib/admin/task-capabilities'

describe('task operation capabilities', () => {
  it('maps task types to operation capabilities', () => {
    expect(getTaskOperationCapability(TASK_TYPE.ANALYZE_NOVEL)).toBe('text')
    expect(getTaskOperationCapability(TASK_TYPE.IMAGE_PANEL)).toBe('image')
    expect(getTaskOperationCapability(TASK_TYPE.VIDEO_PANEL)).toBe('video')
    expect(getTaskOperationCapability(TASK_TYPE.VOICE_LINE)).toBe('voice')
    expect(getTaskOperationCapability(TASK_TYPE.LIP_SYNC)).toBe('lip_sync')
  })

  it('extracts possible model keys from task payload without exposing prompt text', () => {
    expect(extractTaskModelKeys({
      model: 'openai::gpt-4o',
      imageModel: 'fal::flux',
      prompt: 'secret prompt',
      meta: { audioModel: 'fal::tts' },
    })).toEqual(['openai::gpt-4o', 'fal::flux', 'fal::tts'])
  })
})
```

- [ ] **Step 2: 写 submitter 拦截测试**

Add to `tests/integration/billing/submitter.integration.test.ts`:

```ts
it('blocks disabled operation before creating task, queue job, or freeze', async () => {
  await prisma.adminFeatureFlag.upsert({
    where: { key: 'video_generation' },
    create: {
      key: 'video_generation',
      name: '视频生成',
      category: 'generation',
      enabled: false,
      audience: 'all',
      rolloutPercent: 100,
      userMessage: '视频生成维护中',
    },
    update: { enabled: false, userMessage: '视频生成维护中' },
  })

  await expect(submitTask({
    userId: user.id,
    locale: 'zh',
    projectId: project.id,
    type: TASK_TYPE.VIDEO_PANEL,
    targetType: 'panel',
    targetId: 'panel-blocked',
    payload: { videoModel: 'fal::video-model', maxSeconds: 5 },
  })).rejects.toMatchObject({
    code: 'FEATURE_DISABLED',
  })

  expect(await prisma.task.count({ where: { targetId: 'panel-blocked' } })).toBe(0)
  expect(await prisma.balanceFreeze.count({ where: { userId: user.id } })).toBe(0)
})
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=1 vitest run tests/unit/admin/task-capabilities.test.ts tests/integration/billing/submitter.integration.test.ts
```

Expected: FAIL，缺少映射和 submitter 拦截。

- [ ] **Step 4: 实现 task capability 映射**

Create `src/lib/admin/task-capabilities.ts`:

```ts
import { TASK_TYPE, type TaskType } from '@/lib/task/types'
import type { FeatureFlagKey, OperationCapability } from './policy-types'

const TEXT_TASKS = new Set<TaskType>([
  TASK_TYPE.REGENERATE_STORYBOARD_TEXT,
  TASK_TYPE.INSERT_PANEL,
  TASK_TYPE.ANALYZE_NOVEL,
  TASK_TYPE.STORY_TO_SCRIPT_RUN,
  TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
  TASK_TYPE.SCREENPLAY_CONVERT,
  TASK_TYPE.VOICE_ANALYZE,
  TASK_TYPE.ANALYZE_GLOBAL,
  TASK_TYPE.AI_STORY_EXPAND,
  TASK_TYPE.AI_MODIFY_APPEARANCE,
  TASK_TYPE.AI_MODIFY_LOCATION,
  TASK_TYPE.AI_MODIFY_PROP,
  TASK_TYPE.AI_MODIFY_SHOT_PROMPT,
  TASK_TYPE.ANALYZE_SHOT_VARIANTS,
  TASK_TYPE.AI_CREATE_CHARACTER,
  TASK_TYPE.AI_CREATE_LOCATION,
  TASK_TYPE.REFERENCE_TO_CHARACTER,
  TASK_TYPE.CHARACTER_PROFILE_CONFIRM,
  TASK_TYPE.CHARACTER_PROFILE_BATCH_CONFIRM,
  TASK_TYPE.EPISODE_SPLIT_LLM,
  TASK_TYPE.ASSET_HUB_AI_DESIGN_CHARACTER,
  TASK_TYPE.ASSET_HUB_AI_DESIGN_LOCATION,
  TASK_TYPE.ASSET_HUB_AI_MODIFY_CHARACTER,
  TASK_TYPE.ASSET_HUB_AI_MODIFY_LOCATION,
  TASK_TYPE.ASSET_HUB_AI_MODIFY_PROP,
  TASK_TYPE.ASSET_HUB_REFERENCE_TO_CHARACTER,
  TASK_TYPE.AI_EDIT_ASSEMBLE,
  TASK_TYPE.AI_EDIT_REFINE,
  TASK_TYPE.CLIPS_BUILD,
])

const IMAGE_TASKS = new Set<TaskType>([
  TASK_TYPE.IMAGE_PANEL,
  TASK_TYPE.IMAGE_CHARACTER,
  TASK_TYPE.IMAGE_LOCATION,
  TASK_TYPE.MODIFY_ASSET_IMAGE,
  TASK_TYPE.REGENERATE_GROUP,
  TASK_TYPE.ASSET_HUB_IMAGE,
  TASK_TYPE.ASSET_HUB_MODIFY,
  TASK_TYPE.PANEL_VARIANT,
])

const VIDEO_TASKS = new Set<TaskType>([
  TASK_TYPE.VIDEO_PANEL,
  TASK_TYPE.AI_EDIT_TRANSITION_BRIDGE,
])

const VOICE_TASKS = new Set<TaskType>([
  TASK_TYPE.VOICE_LINE,
  TASK_TYPE.VOICE_DESIGN,
  TASK_TYPE.ASSET_HUB_VOICE_DESIGN,
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function getTaskOperationCapability(type: TaskType): OperationCapability {
  if (TEXT_TASKS.has(type)) return 'text'
  if (IMAGE_TASKS.has(type)) return 'image'
  if (VIDEO_TASKS.has(type)) return 'video'
  if (VOICE_TASKS.has(type)) return 'voice'
  if (type === TASK_TYPE.LIP_SYNC) return 'lip_sync'
  return 'text'
}

export function getFeatureFlagForCapability(capability: OperationCapability): FeatureFlagKey {
  if (capability === 'text') return 'text_generation'
  if (capability === 'image') return 'image_generation'
  if (capability === 'video') return 'video_generation'
  if (capability === 'voice') return 'voice_generation'
  if (capability === 'lip_sync') return 'lip_sync'
  if (capability === 'payment') return 'payment'
  if (capability === 'redeem_code') return 'redeem_code'
  if (capability === 'create_work') return 'create_work'
  return 'advanced_models'
}

export function extractTaskModelKeys(payload: unknown): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  const keys = ['model', 'modelId', 'modelKey', 'analysisModel', 'imageModel', 'videoModel', 'audioModel', 'voiceModel', 'lipSyncModel']

  function push(value: unknown) {
    if (typeof value !== 'string') return
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    result.push(trimmed)
  }

  function visit(value: unknown, depth: number) {
    if (depth > 2 || !isRecord(value)) return
    for (const key of keys) push(value[key])
    if (isRecord(value.meta)) visit(value.meta, depth + 1)
  }

  visit(payload, 0)
  return result
}
```

- [ ] **Step 5: 实现 `assertTaskAllowed()`**

Modify `src/lib/admin/policy.ts`:

```ts
import { TASK_STATUS, type TaskType } from '@/lib/task/types'
import { getFeatureFlagForCapability, getTaskOperationCapability, extractTaskModelKeys } from './task-capabilities'
import { resolveUserRuntimeGroup } from './user-groups-runtime'
```

Add:

```ts
function capabilityAllowed(group: Awaited<ReturnType<typeof resolveUserRuntimeGroup>>, capability: string) {
  if (capability === 'text') return group.allowText
  if (capability === 'image') return group.allowImage
  if (capability === 'video') return group.allowVideo
  if (capability === 'voice') return group.allowVoice
  if (capability === 'lip_sync') return group.allowLipSync
  if (capability === 'advanced_models') return group.allowAdvancedModels
  return true
}

export async function assertTaskAllowed(params: {
  userId: string
  role?: string | null
  type: TaskType
  payload?: Record<string, unknown> | null
}) {
  const capability = getTaskOperationCapability(params.type)
  await assertFeatureEnabled(getFeatureFlagForCapability(capability), {
    userId: params.userId,
    role: params.role,
  })

  const group = await resolveUserRuntimeGroup(params.userId)
  if (!capabilityAllowed(group, capability)) {
    throw new OperationPolicyError('ENTITLEMENT_DENIED', { target: capability })
  }

  if (!group.allowAdvancedModels) {
    const modelKeys = extractTaskModelKeys(params.payload)
    const usesAdvanced = modelKeys.some(modelKey => modelKey.includes('advanced') || modelKey.includes('pro'))
    if (usesAdvanced) {
      throw new OperationPolicyError('MODEL_NOT_ALLOWED', { target: 'advanced_models' })
    }
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  if (group.dailyTaskLimit !== null) {
    const count = await prisma.task.count({
      where: {
        userId: params.userId,
        createdAt: { gte: todayStart },
      },
    })
    if (count >= group.dailyTaskLimit) {
      throw new OperationPolicyError('TASK_DAILY_LIMIT_EXCEEDED')
    }
  }

  if (group.concurrentTaskLimit !== null) {
    const activeCount = await prisma.task.count({
      where: {
        userId: params.userId,
        status: { in: [TASK_STATUS.QUEUED, TASK_STATUS.PROCESSING] },
      },
    })
    if (activeCount >= group.concurrentTaskLimit) {
      throw new OperationPolicyError('TASK_CONCURRENCY_LIMIT_EXCEEDED')
    }
  }

  return { allowed: true as const, capability }
}
```

- [ ] **Step 6: 在 submitter 创建任务前拦截**

Modify `src/lib/task/submitter.ts` imports:

```ts
import { assertTaskAllowed } from '@/lib/admin/policy'
```

In `submitTask()` after logger and before `normalizeTaskPayload()`:

```ts
  await assertTaskAllowed({
    userId: params.userId,
    role: undefined,
    type: params.type,
    payload: params.payload || null,
  })
```

Do not catch this error inside submitter. Modify `src/lib/api-errors.ts` so `apiHandler()` serializes operation policy errors:

```ts
import { OperationPolicyError, operationErrorToApiPayload } from '@/lib/admin/operation-errors'
```

Inside the `catch` branch before `normalizeAnyError(error)`:

```ts
if (error instanceof OperationPolicyError) {
  return NextResponse.json(operationErrorToApiPayload(error), { status: error.httpStatus })
}
```

- [ ] **Step 7: 运行任务提交测试和补偿 guard**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=1 vitest run tests/unit/admin/task-capabilities.test.ts tests/integration/billing/submitter.integration.test.ts
npm run check:task-submit-compensation
```

Expected: PASS；新增测试确认被禁用功能不创建 task、不冻结。

- [ ] **Step 8: 提交任务拦截**

Run:

```bash
git add src/lib/admin/task-capabilities.ts src/lib/admin/policy.ts src/lib/task/submitter.ts src/lib/api-errors.ts tests/unit/admin/task-capabilities.test.ts tests/integration/billing/submitter.integration.test.ts
git commit -m "feat: enforce operations policy before task creation"
```

Expected: commit succeeds.

### Task 5: 公告中心真实展示到用户端

**Files:**
- Modify: `src/lib/announcements/public.ts`
- Modify: `src/app/api/announcements/route.ts`
- Modify: `src/components/announcements/AnnouncementBanner.tsx`
- Create: `src/components/announcements/AnnouncementModal.tsx`
- Create: `src/components/announcements/WorkspaceAnnouncementNotice.tsx`
- Create: `src/components/announcements/ProfileAnnouncementMessages.tsx`
- Modify: `src/app/[locale]/layout.tsx`
- Modify: `src/app/[locale]/workspace/[projectId]/page.tsx`
- Modify: `src/app/[locale]/profile/page.tsx`
- Test: `tests/integration/api/contract/announcements-route.test.ts`
- Test: `tests/unit/admin/announcements-public.test.ts`

- [ ] **Step 1: 写公告过滤测试**

Create `tests/unit/admin/announcements-public.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPublicAnnouncements } from '@/lib/announcements/public'

const prismaMock = vi.hoisted(() => ({
  adminAnnouncement: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('public announcements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      role: 'user',
      adminGroupKey: 'vip',
    })
  })

  it('returns only current surface, locale, time window, and user group matches', async () => {
    prismaMock.adminAnnouncement.findMany.mockResolvedValue([
      {
        id: 'a1',
        title: 'VIP 公告',
        body: 'body',
        type: 'general',
        severity: 'info',
        status: 'published',
        locale: 'zh',
        surface: 'workspace_notice',
        audience: 'group',
        groupKeys: 'vip',
        targetUserIds: null,
        startsAt: null,
        endsAt: null,
        dismissible: true,
        ctaLabel: null,
        ctaHref: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const result = await getPublicAnnouncements({
      userId: 'u1',
      locale: 'zh',
      surface: 'workspace_notice',
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      id: 'a1',
      title: 'VIP 公告',
      body: 'body',
    })
    expect(JSON.stringify(result)).not.toContain('createdBy')
    expect(JSON.stringify(result)).not.toContain('updatedBy')
  })
})
```

- [ ] **Step 2: 运行测试确认失败或覆盖不足**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/admin/announcements-public.test.ts tests/integration/api/contract/announcements-route.test.ts
```

Expected: FAIL 或缺少 surface/group/modal 行为。

- [ ] **Step 3: 实现 `getPublicAnnouncements(context)` 完整过滤**

Modify `src/lib/announcements/public.ts` exported signature:

```ts
export async function getPublicAnnouncements(context: {
  userId?: string | null
  locale: string
  surface?: 'top_banner' | 'modal' | 'workspace_notice' | 'profile_message'
  now?: Date
}) {
  // 1. 读取 user role/adminGroupKey
  // 2. 查询 status=published，surface 匹配，locale in [context.locale, 'all']
  // 3. 服务端过滤 groupKeys、targetUserIds、startsAt/endsAt
  // 4. 返回白名单字段：id,title,body,type,severity,locale,surface,dismissible,ctaLabel,ctaHref,updatedAt
}
```

The DTO must not include `createdBy`、`updatedBy`、`publishedAt`、`archivedAt`、`groupKeys`、`targetUserIds`.

- [ ] **Step 4: API 支持 surface 参数**

Modify `src/app/api/announcements/route.ts`:

```ts
const surface = searchParams.get('surface') || 'top_banner'
const locale = searchParams.get('locale') || 'zh'
return NextResponse.json(await getPublicAnnouncements({
  userId: session?.user?.id || null,
  locale,
  surface: surface as PublicAnnouncementSurface,
}))
```

Use optional auth if current route is public; if route requires login, use `requireUserAuth()` and still return `{ items: [] }` for unauthorized public pages only if layout calls it before login.

- [ ] **Step 5: 用户端接入不同展示位**

Modify `src/components/announcements/AnnouncementBanner.tsx` to call:

```ts
fetch(`/api/announcements?surface=top_banner&locale=${locale}`)
```

Create `AnnouncementModal.tsx` with localStorage dismissal key:

```ts
director-announcement-modal-dismissed:${id}
```

Create `WorkspaceAnnouncementNotice.tsx` to render `workspace_notice` as compact inline alert above workspace main content, with no decorative card nesting.

Create `ProfileAnnouncementMessages.tsx` to render `profile_message` above profile billing/settings section.

Modify:

- `src/app/[locale]/layout.tsx`: render banner and modal.
- `src/app/[locale]/workspace/[projectId]/page.tsx`: render workspace notice after Navbar.
- `src/app/[locale]/profile/page.tsx`: render profile messages near top.

- [ ] **Step 6: 后台发布/暂停审计和 preview**

Modify admin announcement routes so status changes write specific actions:

- `announcement.create`
- `announcement.update`
- `announcement.publish`
- `announcement.pause`
- `announcement.archive`

When PATCH body status changes from draft/scheduled/paused to `published`, set `publishedAt = new Date()`.
When status changes to `archived`, set `archivedAt = new Date()`.

- [ ] **Step 7: 运行公告测试**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/admin/announcements-public.test.ts tests/integration/api/contract/announcements-route.test.ts tests/integration/api/contract/admin-routes.test.ts
npm run typecheck
```

Expected: PASS。

- [ ] **Step 8: 提交公告闭环**

Run:

```bash
git add src/lib/announcements/public.ts src/app/api/announcements/route.ts src/components/announcements src/app/[locale]/layout.tsx src/app/[locale]/workspace/[projectId]/page.tsx src/app/[locale]/profile/page.tsx src/lib/admin/announcements.ts src/app/api/admin/announcements tests/unit/admin/announcements-public.test.ts tests/integration/api/contract/announcements-route.test.ts tests/integration/api/contract/admin-routes.test.ts
git commit -m "feat: connect admin announcements to user surfaces"
```

Expected: commit succeeds.

### Task 6: 任务事故取消、冻结回滚、事件可见

**Files:**
- Modify: `src/lib/admin/tasks.ts`
- Modify: `src/app/api/admin/tasks/[taskId]/route.ts`
- Modify: `src/lib/task/service.ts`
- Test: `tests/integration/task/admin-task-incident.integration.test.ts`
- Test: `tests/integration/api/contract/admin-routes.test.ts`

- [ ] **Step 1: 写取消和回滚集成测试**

Create `tests/integration/task/admin-task-incident.integration.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { cancelAdminTask } from '@/lib/admin/tasks'
import { freezeBalance } from '@/lib/billing/ledger'

describe('admin task incident handling', () => {
  it('cancels queued task, removes queue job, rolls back pending freeze, and writes user-visible event', async () => {
    const user = await prisma.user.create({ data: { name: `incident-${Date.now()}` } })
    await prisma.userBalance.create({ data: { userId: user.id, balance: 10, frozenAmount: 0, totalSpent: 0 } })
    const project = await prisma.project.create({ data: { userId: user.id, name: 'Incident Project' } })
    const task = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: project.id,
        type: 'video_panel',
        targetType: 'panel',
        targetId: 'panel-1',
        status: 'queued',
        progress: 0,
      },
    })
    const freezeId = await freezeBalance(user.id, 2, {
      source: 'task',
      taskId: task.id,
      idempotencyKey: `incident-${task.id}`,
    })
    await prisma.task.update({
      where: { id: task.id },
      data: { billingInfo: { freezeId, billable: true, modeSnapshot: 'ENFORCE' } },
    })

    const result = await cancelAdminTask(task.id, '运营取消')

    expect(result.cancelled).toBe(true)
    const reloaded = await prisma.task.findUnique({ where: { id: task.id } })
    expect(reloaded?.status).toBe('canceled')
    const freeze = await prisma.balanceFreeze.findUnique({ where: { id: freezeId! } })
    expect(freeze?.status).toBe('rolled_back')
    const event = await prisma.taskEvent.findFirst({ where: { taskId: task.id, eventType: 'task.failed' } })
    expect(event).toBeTruthy()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=1 vitest run tests/integration/task/admin-task-incident.integration.test.ts
```

Expected: FAIL，当前 cancel 没有保证冻结回滚和事件。

- [ ] **Step 3: 修改取消服务**

Modify `src/lib/admin/tasks.ts`:

```ts
import { rollbackTaskBillingForTask } from '@/lib/task/service'
import { publishTaskEvent } from '@/lib/task/publisher'
import { TASK_EVENT_TYPE } from '@/lib/task/types'
```

Inside `cancelAdminTask()` after `cancelTask()` succeeds:

```ts
  if (result.cancelled && result.task) {
    await rollbackTaskBillingForTask(result.task.id).catch(() => null)
    await publishTaskEvent({
      taskId: result.task.id,
      userId: result.task.userId,
      projectId: result.task.projectId,
      type: TASK_EVENT_TYPE.FAILED,
      taskType: result.task.type,
      targetType: result.task.targetType,
      targetId: result.task.targetId,
      episodeId: result.task.episodeId,
      payload: {
        stage: 'cancelled',
        cancelled: true,
        reason,
        source: 'admin',
      },
    }).catch(() => null)
  }
```

If existing publisher signature differs, use the existing event helper in `src/lib/task/publisher.ts` and keep payload free of user content.

- [ ] **Step 4: 管理端 route 强制原因**

Modify `src/app/api/admin/tasks/[taskId]/route.ts`:

```ts
if (!reason) {
  return NextResponse.json({ error: 'reason is required' }, { status: 400 })
}
```

Add audit `after`:

```ts
after: {
  cancelled: result.cancelled,
  status: result.task?.status,
  freezeRolledBack: result.freezeRolledBack ?? null,
}
```

- [ ] **Step 5: 运行任务事故测试**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=1 vitest run tests/integration/task/admin-task-incident.integration.test.ts tests/integration/api/contract/admin-routes.test.ts
```

Expected: PASS。

- [ ] **Step 6: 提交任务事故取消闭环**

Run:

```bash
git add src/lib/admin/tasks.ts src/app/api/admin/tasks/[taskId]/route.ts tests/integration/task/admin-task-incident.integration.test.ts tests/integration/api/contract/admin-routes.test.ts
git commit -m "feat: rollback billing on admin task cancellation"
```

Expected: commit succeeds.

### Task 7: 后台 UI 升级为可执行控制台

**Files:**
- Rewrite: `src/app/[locale]/admin/AdminConsoleClient.tsx`
- Modify: `src/app/[locale]/admin/admin-api.ts`
- Modify: `src/app/[locale]/admin/types.ts`
- Create: `src/app/[locale]/admin/admin-ui.tsx`
- Modify: `src/app/[locale]/admin/page.tsx`
- Test: `tests/unit/admin/admin-console-ui.test.tsx`

- [ ] **Step 1: 写 UI 关键行为测试**

Create `tests/unit/admin/admin-console-ui.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AdminStatusPill, AdminSelect, AdminConfirmDialog } from '@/app/[locale]/admin/admin-ui'

describe('admin console ui primitives', () => {
  it('renders readable select in dark admin surface', () => {
    const html = renderToStaticMarkup(
      <AdminSelect label="状态" value="active" onChange={() => undefined} options={[
        { value: 'active', label: '启用' },
        { value: 'paused', label: '暂停' },
      ]} />,
    )

    expect(html).toContain('bg-white')
    expect(html).toContain('text-slate-950')
    expect(html).toContain('<option')
  })

  it('requires reason for destructive confirmation', () => {
    const html = renderToStaticMarkup(
      <AdminConfirmDialog
        open
        title="取消任务"
        danger
        reason=""
        confirmLabel="确认取消"
        onReasonChange={() => undefined}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    )

    expect(html).toContain('原因')
    expect(html).toContain('disabled')
  })

  it('renders status pills with consistent labels', () => {
    expect(renderToStaticMarkup(<AdminStatusPill status="active" />)).toContain('active')
    expect(renderToStaticMarkup(<AdminStatusPill status="paused" />)).toContain('paused')
    expect(renderToStaticMarkup(<AdminStatusPill status="maintenance" />)).toContain('maintenance')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/admin/admin-console-ui.test.tsx
```

Expected: FAIL，缺少 `admin-ui.tsx`。

- [ ] **Step 3: 创建后台 UI 基础组件**

Create `src/app/[locale]/admin/admin-ui.tsx`:

```tsx
'use client'

import type { ReactNode } from 'react'

export function AdminStatusPill({ status }: { status: string }) {
  const tone = status === 'active' || status === 'ok'
    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : status === 'paused' || status === 'maintenance'
      ? 'bg-amber-100 text-amber-800 border-amber-200'
      : status === 'disabled' || status === 'failed' || status === 'critical'
        ? 'bg-rose-100 text-rose-800 border-rose-200'
        : 'bg-slate-100 text-slate-700 border-slate-200'
  return <span className={`inline-flex h-6 items-center rounded px-2 text-xs font-medium border ${tone}`}>{status}</span>
}

export function AdminSelect(props: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-slate-600">
      {props.label}
      <select
        className="h-9 rounded border border-slate-300 bg-white px-2 text-sm text-slate-950 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.options.map(option => (
          <option key={option.value} value={option.value} className="bg-white text-slate-950">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function AdminButton(props: {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type={props.type || 'button'}
      disabled={props.disabled}
      onClick={props.onClick}
      className={`inline-flex h-9 items-center justify-center rounded px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
        props.danger ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-slate-900 text-white hover:bg-slate-800'
      }`}
    >
      {props.children}
    </button>
  )
}

export function AdminConfirmDialog(props: {
  open: boolean
  title: string
  reason: string
  confirmLabel: string
  danger?: boolean
  onReasonChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!props.open) return null
  const disabled = props.reason.trim().length < 3
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded border border-slate-200 bg-white p-4 shadow-xl">
        <h2 className="text-base font-semibold text-slate-950">{props.title}</h2>
        <label className="mt-4 grid gap-1 text-sm text-slate-700">
          原因
          <textarea
            value={props.reason}
            onChange={(event) => props.onReasonChange(event.target.value)}
            className="min-h-24 rounded border border-slate-300 bg-white p-2 text-sm text-slate-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={props.onCancel} className="h-9 rounded border border-slate-300 px-3 text-sm text-slate-700">取消</button>
          <AdminButton danger={props.danger} disabled={disabled} onClick={props.onConfirm}>{props.confirmLabel}</AdminButton>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 重写 AdminConsoleClient 信息架构**

Rewrite `src/app/[locale]/admin/AdminConsoleClient.tsx` around this state:

```ts
type AdminModule =
  | 'overview'
  | 'announcements'
  | 'featureFlags'
  | 'users'
  | 'groups'
  | 'billing'
  | 'commercial'
  | 'models'
  | 'tasks'
  | 'health'
  | 'audit'
```

Required layout:

- Left nav fixed at desktop width.
- Top bar shows environment, maintenance status, incident count, disabled feature count, last refresh.
- Every module has a primary action:
  - overview: refresh health / toggle maintenance if owner.
  - announcements: create announcement.
  - feature flags: edit flag.
  - users: search/filter, disable/restore, assign group.
  - groups: create/copy group.
  - billing: manual credit/debit/release freeze/reconcile.
  - commercial: create package/redeem code.
  - models: create/update/test/disable model channel.
  - tasks: cancel/retry/batch resolve.
  - health: refresh and jump to impacted module.
  - audit: filter logs.
- All select/input/textarea classes use readable white or slate background and dark text.
- All mutation buttons show saving/success/error state.
- Destructive actions open `AdminConfirmDialog` and require reason.

- [ ] **Step 5: admin-api 错误提示**

Modify `src/app/[locale]/admin/admin-api.ts`:

```ts
async function readAdminError(response: Response) {
  const body = await response.json().catch(() => null)
  if (body && typeof body === 'object') {
    const message = (body as { message?: unknown; error?: { message?: unknown } }).message
      || (body as { error?: { message?: unknown } }).error?.message
    if (typeof message === 'string' && message.trim()) return message
  }
  return `Admin request failed: ${response.status}`
}
```

Use it:

```ts
if (!response.ok) throw new Error(await readAdminError(response))
```

Add mutation helpers for all new actions.

- [ ] **Step 6: 运行 UI 测试和 typecheck**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/admin/admin-console-ui.test.tsx
npm run typecheck
```

Expected: PASS。

- [ ] **Step 7: 提交后台 UI**

Run:

```bash
git add src/app/[locale]/admin/AdminConsoleClient.tsx src/app/[locale]/admin/admin-api.ts src/app/[locale]/admin/types.ts src/app/[locale]/admin/admin-ui.tsx src/app/[locale]/admin/page.tsx tests/unit/admin/admin-console-ui.test.tsx
git commit -m "feat: upgrade admin console into operations workspace"
```

Expected: commit succeeds.

---

## P1: 资源和财务闭环

### Task 8: 用户组权益接入模型列表、任务限制和计费冻结

**Files:**
- Modify: `src/lib/admin/user-groups-runtime.ts`
- Modify: `src/lib/admin/policy.ts`
- Modify: `src/app/api/user/models/route.ts`
- Modify: `src/lib/billing/service.ts`
- Modify: `src/app/api/admin/users/[userId]/route.ts`
- Test: `tests/unit/admin/user-groups-runtime.test.ts`
- Test: `tests/integration/api/contract/creative-engine-user-models.contract.test.ts`
- Test: `tests/integration/billing/submitter.integration.test.ts`

- [ ] **Step 1: 写权益测试**

Create `tests/unit/admin/user-groups-runtime.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveUserRuntimeGroup } from '@/lib/admin/user-groups-runtime'

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  adminUserGroup: { findUnique: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('runtime user groups', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns configured group entitlements', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ adminGroupKey: 'restricted' })
    prismaMock.adminUserGroup.findUnique.mockResolvedValue({
      key: 'restricted',
      status: 'active',
      signupCredits: 0,
      dailyTaskLimit: 2,
      concurrentTaskLimit: 1,
      monthlyCredits: 0,
      allowedModelTiers: 'basic',
      allowText: true,
      allowImage: false,
      allowVideo: false,
      allowVoice: true,
      allowLipSync: false,
      allowAdvancedModels: false,
      maxTaskCost: '1.5',
      maxFrozenAmount: '3',
    })

    await expect(resolveUserRuntimeGroup('u1')).resolves.toMatchObject({
      key: 'restricted',
      dailyTaskLimit: 2,
      allowImage: false,
      maxTaskCost: 1.5,
      maxFrozenAmount: 3,
    })
  })
})
```

- [ ] **Step 2: 扩展模型列表 contract 测试**

Add to `tests/integration/api/contract/creative-engine-user-models.contract.test.ts`:

```ts
it('filters advanced models when user group disallows advanced models', async () => {
  prismaMock.user.findUnique.mockResolvedValue({ adminGroupKey: 'free' })
  prismaMock.adminUserGroup.findUnique.mockResolvedValue({
    key: 'free',
    status: 'active',
    allowedModelTiers: 'basic',
    allowAdvancedModels: false,
    allowText: true,
    allowImage: true,
    allowVideo: true,
    allowVoice: true,
    allowLipSync: true,
  })

  const response = await callRoute(route.GET, { method: 'GET' })
  const body = await response.json()

  expect(JSON.stringify(body)).not.toContain('advanced')
  expect(JSON.stringify(body)).not.toContain('pro-only')
})
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/admin/user-groups-runtime.test.ts tests/integration/api/contract/creative-engine-user-models.contract.test.ts
```

Expected: FAIL，模型列表未接用户组过滤。

- [ ] **Step 4: 完善用户组 runtime**

Ensure `resolveUserRuntimeGroup()` returns all V3 fields and add:

```ts
export function isModelTierAllowed(group: RuntimeUserGroup, option: { isAdvanced?: boolean; tier?: string | null; value?: string }) {
  if (option.isAdvanced && !group.allowAdvancedModels) return false
  if (!group.allowedModelTiers) return true
  const allowed = new Set(group.allowedModelTiers.split(',').map(item => item.trim()).filter(Boolean))
  if (allowed.size === 0) return true
  return !!option.tier && allowed.has(option.tier)
}
```

- [ ] **Step 5: `/api/user/models` 接权益过滤**

Modify `src/app/api/user/models/route.ts`:

```ts
import { resolveUserRuntimeGroup, isModelTierAllowed } from '@/lib/admin/user-groups-runtime'
```

After `const userId = session.user.id`:

```ts
const runtimeGroup = await resolveUserRuntimeGroup(userId)
```

Before pushing each option:

```ts
const isAdvanced = model.tier === 'advanced' || model.tags?.includes('advanced') || model.callName.includes('pro')
if (!isModelTierAllowed(runtimeGroup, {
  isAdvanced,
  tier: typeof model.tier === 'string' ? model.tier : null,
  value: modelKey,
})) {
  continue
}
if (modelType === 'video' && !runtimeGroup.allowVideo) continue
if (modelType === 'audio' && !runtimeGroup.allowVoice) continue
if (modelType === 'lipsync' && !runtimeGroup.allowLipSync) continue
if (modelType === 'image' && !runtimeGroup.allowImage) continue
if (modelType === 'llm' && !runtimeGroup.allowText) continue
```

- [ ] **Step 6: 计费冻结接最大冻结金额**

Modify `src/lib/admin/policy.ts`:

```ts
export async function assertBillingAllowed(params: {
  userId: string
  amount: number
}) {
  const group = await resolveUserRuntimeGroup(params.userId)
  if (group.maxTaskCost !== null && params.amount > group.maxTaskCost) {
    throw new OperationPolicyError('BILLING_FREEZE_LIMIT_EXCEEDED', { target: 'maxTaskCost' })
  }
  if (group.maxFrozenAmount !== null) {
    const balance = await prisma.userBalance.findUnique({
      where: { userId: params.userId },
      select: { frozenAmount: true },
    })
    const currentFrozen = balance ? Number(balance.frozenAmount) : 0
    if (currentFrozen + params.amount > group.maxFrozenAmount) {
      throw new OperationPolicyError('BILLING_FREEZE_LIMIT_EXCEEDED', { target: 'maxFrozenAmount' })
    }
  }
  return { allowed: true as const }
}
```

Modify `src/lib/billing/service.ts` before `freezeBalance()` in `prepareTaskBilling()`:

```ts
await assertBillingAllowed({ userId: task.userId, amount: quotedCost })
```

- [ ] **Step 7: 用户运营可分配用户组**

Modify `src/app/api/admin/users/[userId]/route.ts` so owner can PATCH:

```json
{ "adminGroupKey": "vip", "reason": "升级 VIP" }
```

Implementation:

- Validate target group exists and active unless value is null.
- Update `user.adminGroupKey`.
- Increment `sessionVersion` only when status/role changes; group change does not need forced logout.
- Audit action `user.group.assign`.

- [ ] **Step 8: 运行 P1 用户组测试**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/admin/user-groups-runtime.test.ts tests/integration/api/contract/creative-engine-user-models.contract.test.ts
cross-env BILLING_TEST_BOOTSTRAP=1 vitest run tests/integration/billing/submitter.integration.test.ts
npm run typecheck
```

Expected: PASS。

- [ ] **Step 9: 提交用户组权益闭环**

Run:

```bash
git add src/lib/admin/user-groups-runtime.ts src/lib/admin/policy.ts src/app/api/user/models/route.ts src/lib/billing/service.ts src/app/api/admin/users/[userId]/route.ts tests/unit/admin/user-groups-runtime.test.ts tests/integration/api/contract/creative-engine-user-models.contract.test.ts tests/integration/billing/submitter.integration.test.ts
git commit -m "feat: enforce admin user group entitlements"
```

Expected: commit succeeds.

### Task 9: 人工财务动作 owner-only、幂等、流水一致

**Files:**
- Modify: `src/lib/admin/billing.ts`
- Create: `src/app/api/admin/billing/manual-credit/route.ts`
- Create: `src/app/api/admin/billing/manual-debit/route.ts`
- Create: `src/app/api/admin/billing/freezes/[freezeId]/release/route.ts`
- Create: `src/app/api/admin/billing/orders/[orderId]/reconcile/route.ts`
- Create: `src/app/api/admin/billing/orders/[orderId]/refund/route.ts`
- Test: `tests/integration/billing/admin-operations.integration.test.ts`
- Test: `tests/integration/api/contract/admin-routes.test.ts`

- [ ] **Step 1: 写财务集成测试**

Create `tests/integration/billing/admin-operations.integration.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  manualCreditBalance,
  manualDebitBalance,
  releaseAdminFreeze,
} from '@/lib/admin/billing'
import { freezeBalance } from '@/lib/billing/ledger'

describe('admin billing operations', () => {
  it('credits and debits balance with idempotent transactions', async () => {
    const user = await prisma.user.create({ data: { name: `billing-${Date.now()}` } })
    await prisma.userBalance.create({ data: { userId: user.id, balance: 0, frozenAmount: 0, totalSpent: 0 } })

    await manualCreditBalance({
      userId: user.id,
      amount: 10,
      reason: '客服补偿',
      operatorId: 'owner-1',
      idempotencyKey: 'credit-1',
    })
    await manualCreditBalance({
      userId: user.id,
      amount: 10,
      reason: '客服补偿',
      operatorId: 'owner-1',
      idempotencyKey: 'credit-1',
    })
    await manualDebitBalance({
      userId: user.id,
      amount: 3,
      reason: '误充值扣回',
      operatorId: 'owner-1',
      idempotencyKey: 'debit-1',
    })

    const balance = await prisma.userBalance.findUnique({ where: { userId: user.id } })
    expect(Number(balance?.balance)).toBe(7)
    expect(await prisma.balanceTransaction.count({ where: { userId: user.id, idempotencyKey: 'credit-1' } })).toBe(1)
  })

  it('releases pending freeze exactly once', async () => {
    const user = await prisma.user.create({ data: { name: `freeze-${Date.now()}` } })
    await prisma.userBalance.create({ data: { userId: user.id, balance: 8, frozenAmount: 0, totalSpent: 0 } })
    const freezeId = await freezeBalance(user.id, 4, { source: 'task', idempotencyKey: 'freeze-release' })

    const first = await releaseAdminFreeze({ freezeId: freezeId!, reason: '任务失败释放', operatorId: 'owner-1' })
    const second = await releaseAdminFreeze({ freezeId: freezeId!, reason: '重复点击', operatorId: 'owner-1' })

    expect(first.released).toBe(true)
    expect(second.released).toBe(false)
    const balance = await prisma.userBalance.findUnique({ where: { userId: user.id } })
    expect(Number(balance?.balance)).toBe(8)
    expect(Number(balance?.frozenAmount)).toBe(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=1 vitest run tests/integration/billing/admin-operations.integration.test.ts
```

Expected: FAIL，财务函数不存在。

- [ ] **Step 3: 实现 `manualCreditBalance()`**

Modify `src/lib/admin/billing.ts`:

```ts
import { toMoneyNumber, roundMoney } from '@/lib/billing/money'
import { rollbackFreeze } from '@/lib/billing/ledger'
```

Add:

```ts
function requirePositiveAmount(amount: number) {
  const normalized = roundMoney(Number(amount), 6)
  if (!Number.isFinite(normalized) || normalized <= 0) throw new Error('amount must be positive')
  return normalized
}

function requireReason(reason: string) {
  const text = reason.trim()
  if (text.length < 3) throw new Error('reason is required')
  return text
}

export async function manualCreditBalance(params: {
  userId: string
  amount: number
  reason: string
  operatorId: string
  idempotencyKey: string
}) {
  const amount = requirePositiveAmount(params.amount)
  const reason = requireReason(params.reason)
  return await prisma.$transaction(async (tx) => {
    const existing = await tx.balanceTransaction.findFirst({
      where: { userId: params.userId, type: 'manual_credit', idempotencyKey: params.idempotencyKey },
    })
    if (existing) return { transactionId: existing.id, duplicated: true }
    const balance = await tx.userBalance.upsert({
      where: { userId: params.userId },
      create: { userId: params.userId, balance: amount, frozenAmount: 0, totalSpent: 0 },
      update: { balance: { increment: amount } },
    })
    const latest = await tx.userBalance.findUniqueOrThrow({ where: { userId: params.userId } })
    const transaction = await tx.balanceTransaction.create({
      data: {
        userId: params.userId,
        type: 'manual_credit',
        amount,
        balanceAfter: latest.balance,
        operatorId: params.operatorId,
        idempotencyKey: params.idempotencyKey,
        description: `manual credit | audit=${JSON.stringify({ reason })}`,
      },
    })
    return { transactionId: transaction.id, duplicated: false, balanceAfter: toMoneyNumber(latest.balance) }
  })
}
```

- [ ] **Step 4: 实现 debit 和 release freeze**

Add:

```ts
export async function manualDebitBalance(params: {
  userId: string
  amount: number
  reason: string
  operatorId: string
  idempotencyKey: string
}) {
  const amount = requirePositiveAmount(params.amount)
  const reason = requireReason(params.reason)
  return await prisma.$transaction(async (tx) => {
    const existing = await tx.balanceTransaction.findFirst({
      where: { userId: params.userId, type: 'manual_debit', idempotencyKey: params.idempotencyKey },
    })
    if (existing) return { transactionId: existing.id, duplicated: true }
    const updated = await tx.userBalance.updateMany({
      where: { userId: params.userId, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    })
    if (updated.count === 0) throw new Error('insufficient balance')
    const latest = await tx.userBalance.findUniqueOrThrow({ where: { userId: params.userId } })
    const transaction = await tx.balanceTransaction.create({
      data: {
        userId: params.userId,
        type: 'manual_debit',
        amount: -amount,
        balanceAfter: latest.balance,
        operatorId: params.operatorId,
        idempotencyKey: params.idempotencyKey,
        description: `manual debit | audit=${JSON.stringify({ reason })}`,
      },
    })
    return { transactionId: transaction.id, duplicated: false, balanceAfter: toMoneyNumber(latest.balance) }
  })
}

export async function releaseAdminFreeze(params: {
  freezeId: string
  reason: string
  operatorId: string
}) {
  requireReason(params.reason)
  const freeze = await prisma.balanceFreeze.findUnique({ where: { id: params.freezeId } })
  if (!freeze || freeze.status !== 'pending') return { released: false }
  const released = await rollbackFreeze(params.freezeId)
  if (!released) return { released: false }
  await prisma.balanceTransaction.create({
    data: {
      userId: freeze.userId,
      type: 'freeze_release',
      amount: freeze.amount,
      balanceAfter: (await prisma.userBalance.findUniqueOrThrow({ where: { userId: freeze.userId } })).balance,
      freezeId: freeze.id,
      operatorId: params.operatorId,
      description: `freeze release | audit=${JSON.stringify({ reason: params.reason })}`,
    },
  })
  return { released: true }
}
```

- [ ] **Step 5: 实现 admin billing routes**

For each new route:

- Use `requireOwnerAuth()`.
- Read JSON with `readJsonObject()`.
- Require `reason`.
- Call service.
- Write audit:
  - `billing.balance.credit`
  - `billing.balance.debit`
  - `billing.freeze.release`
  - `billing.order.reconcile`
  - `billing.order.refund`

For reconcile/refund use `AdminCommercialOrder`:

- Reconcile paid order credits if `status` is `paid` or external check says paid.
- Refund only if order has been credited and not refunded.
- Store `reconciledAt`/`refundedAt`.
- Write `BalanceTransaction` with `externalOrderId` and idempotency.

- [ ] **Step 6: 运行财务测试**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=1 vitest run tests/integration/billing/admin-operations.integration.test.ts
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/integration/api/contract/admin-routes.test.ts
```

Expected: PASS。

- [ ] **Step 7: 提交财务动作**

Run:

```bash
git add src/lib/admin/billing.ts src/app/api/admin/billing tests/integration/billing/admin-operations.integration.test.ts tests/integration/api/contract/admin-routes.test.ts
git commit -m "feat: add owner-only billing operations"
```

Expected: commit succeeds.

### Task 10: 套餐购买和兑换码用户端闭环

**Files:**
- Modify: `src/lib/admin/commercial-runtime.ts`
- Create: `src/app/api/commercial/packages/route.ts`
- Create: `src/app/api/commercial/orders/route.ts`
- Create: `src/app/api/commercial/orders/[orderId]/route.ts`
- Create: `src/app/api/redeem/route.ts`
- Modify: `src/app/[locale]/profile/page.tsx`
- Test: `tests/unit/admin/commercial-runtime.test.ts`
- Test: `tests/integration/api/contract/commercial-routes.test.ts`

- [ ] **Step 1: 写商业 runtime 测试**

Create `tests/unit/admin/commercial-runtime.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listAvailablePackages, redeemCodeForUser } from '@/lib/admin/commercial-runtime'

const prismaMock = vi.hoisted(() => ({
  adminCommercialPackage: { findMany: vi.fn() },
  adminRedeemCode: { findUnique: vi.fn(), update: vi.fn() },
  adminRedeemRedemption: { count: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn() },
  userBalance: { upsert: vi.fn(), findUniqueOrThrow: vi.fn() },
  balanceTransaction: { create: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('commercial runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.user.findUnique.mockResolvedValue({ adminGroupKey: 'vip' })
  })

  it('lists only active packages for user group and time window', async () => {
    prismaMock.adminCommercialPackage.findMany.mockResolvedValue([
      { key: 'vip-100', status: 'active', groupKeys: 'vip', startsAt: null, endsAt: null },
    ])

    await expect(listAvailablePackages({ userId: 'u1', now: new Date() })).resolves.toHaveLength(1)
  })

  it('redeems active code once per idempotency key', async () => {
    prismaMock.adminRedeemCode.findUnique.mockResolvedValue({
      code: 'WELCOME',
      status: 'active',
      credits: '5',
      redeemedCount: 0,
      maxRedemptions: 10,
      singleUserLimit: 1,
      startsAt: null,
      endsAt: null,
      groupKeys: null,
      targetUserIds: null,
    })
    prismaMock.adminRedeemRedemption.findFirst.mockResolvedValue(null)
    prismaMock.adminRedeemRedemption.count.mockResolvedValue(0)
    prismaMock.userBalance.upsert.mockResolvedValue({ balance: 5 })
    prismaMock.userBalance.findUniqueOrThrow.mockResolvedValue({ balance: 5 })
    prismaMock.balanceTransaction.create.mockResolvedValue({ id: 'tx1' })
    prismaMock.adminRedeemRedemption.create.mockResolvedValue({ id: 'redemption1' })

    await expect(redeemCodeForUser({
      code: 'WELCOME',
      userId: 'u1',
      idempotencyKey: 'idem-1',
    })).resolves.toMatchObject({ redeemed: true })

    expect(prismaMock.adminRedeemCode.update).toHaveBeenCalled()
    expect(prismaMock.balanceTransaction.create).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 写 API contract 测试**

Create `tests/integration/api/contract/commercial-routes.test.ts` with cases:

- `GET /api/commercial/packages` returns only active packages and no admin fields.
- `POST /api/redeem` with paused code returns `REDEEM_CODE_UNAVAILABLE`.
- Successful redeem creates balance transaction and increments count once.
- `POST /api/commercial/orders` with archived package returns `PACKAGE_UNAVAILABLE`.

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/admin/commercial-runtime.test.ts tests/integration/api/contract/commercial-routes.test.ts
```

Expected: FAIL，runtime/routes 不存在。

- [ ] **Step 4: 实现 commercial runtime**

Create `src/lib/admin/commercial-runtime.ts`:

```ts
import { prisma } from '@/lib/prisma'
import { toMoneyNumber } from '@/lib/billing/money'
import { OperationPolicyError } from './operation-errors'
import { assertFeatureEnabled } from './policy'
import { audienceMatches, parseList, withinWindow } from './audience'

async function getUserAudience(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, adminGroupKey: true },
  })
  return { userId, role: user?.role || 'user', groupKey: user?.adminGroupKey || null }
}

export async function listAvailablePackages(params: { userId: string; now?: Date }) {
  await assertFeatureEnabled('payment', { userId: params.userId, role: 'user' })
  const context = await getUserAudience(params.userId)
  const now = params.now || new Date()
  const packages = await prisma.adminCommercialPackage.findMany({
    where: { status: 'active' },
    orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
  })
  return packages
    .filter(item => withinWindow(item, now))
    .filter(item => audienceMatches({ audience: item.groupKeys ? 'group' : 'all', groupKeys: parseList(item.groupKeys) }, context))
    .map(item => ({
      key: item.key,
      name: item.name,
      description: item.description,
      price: item.price.toString(),
      currency: item.currency,
      credits: item.credits.toString(),
      bonusCredits: item.bonusCredits.toString(),
      durationDays: item.durationDays,
    }))
}

export async function redeemCodeForUser(params: {
  code: string
  userId: string
  idempotencyKey: string
}) {
  await assertFeatureEnabled('redeem_code', { userId: params.userId, role: 'user' })
  const code = params.code.trim().toUpperCase()
  if (!code) throw new OperationPolicyError('REDEEM_CODE_UNAVAILABLE')

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.adminRedeemRedemption.findFirst({
      where: { code, userId: params.userId, idempotencyKey: params.idempotencyKey },
    })
    if (existing) return { redeemed: true, duplicated: true, redemptionId: existing.id }

    const item = await tx.adminRedeemCode.findUnique({ where: { code } })
    const now = new Date()
    if (!item || item.status !== 'active' || !withinWindow(item, now) || item.redeemedCount >= item.maxRedemptions) {
      throw new OperationPolicyError('REDEEM_CODE_UNAVAILABLE')
    }

    const userRedemptions = await tx.adminRedeemRedemption.count({ where: { code, userId: params.userId } })
    if (userRedemptions >= item.singleUserLimit) {
      throw new OperationPolicyError('REDEEM_CODE_UNAVAILABLE', { message: '该兑换码已兑换' })
    }

    const credits = toMoneyNumber(item.credits)
    await tx.userBalance.upsert({
      where: { userId: params.userId },
      create: { userId: params.userId, balance: credits, frozenAmount: 0, totalSpent: 0 },
      update: { balance: { increment: item.credits } },
    })
    const balance = await tx.userBalance.findUniqueOrThrow({ where: { userId: params.userId } })
    const transaction = await tx.balanceTransaction.create({
      data: {
        userId: params.userId,
        type: 'redeem',
        amount: item.credits,
        balanceAfter: balance.balance,
        relatedId: code,
        idempotencyKey: params.idempotencyKey,
        description: `redeem code ${code}`,
      },
    })
    const redemption = await tx.adminRedeemRedemption.create({
      data: {
        code,
        userId: params.userId,
        credits: item.credits,
        balanceAfter: balance.balance,
        transactionId: transaction.id,
        idempotencyKey: params.idempotencyKey,
      },
    })
    await tx.adminRedeemCode.update({
      where: { code },
      data: { redeemedCount: { increment: 1 } },
    })
    return { redeemed: true, duplicated: false, redemptionId: redemption.id, credits: item.credits.toString() }
  })
}
```

- [ ] **Step 5: 实现用户端 routes**

`src/app/api/commercial/packages/route.ts`:

```ts
export const GET = apiHandler(async () => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  return NextResponse.json({ items: await listAvailablePackages({ userId: authResult.session.user.id }) })
})
```

`src/app/api/redeem/route.ts`:

```ts
export const POST = apiHandler(async (request) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const body = await request.json().catch(() => ({}))
  const result = await redeemCodeForUser({
    code: typeof body.code === 'string' ? body.code : '',
    userId: authResult.session.user.id,
    idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : crypto.randomUUID(),
  })
  return NextResponse.json(result)
})
```

Order routes:

- Create `AdminCommercialOrder` with `pending`.
- If payment provider is not configured, return `409` with `PACKAGE_UNAVAILABLE` message `支付暂未配置`.
- Do not credit balance until order is reconciled/paid.

- [ ] **Step 6: Profile 接入口**

Modify `src/app/[locale]/profile/page.tsx`:

- Add “套餐” tab/section listing `/api/commercial/packages`.
- Add redeem form calling `/api/redeem`.
- On success invalidate/refetch `/api/user/balance` and `/api/user/transactions`.
- Show backend error message exactly, e.g. “兑换码不可用或已过期”.

- [ ] **Step 7: 运行商业闭环测试**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/admin/commercial-runtime.test.ts tests/integration/api/contract/commercial-routes.test.ts
npm run typecheck
```

Expected: PASS。

- [ ] **Step 8: 提交套餐和兑换码闭环**

Run:

```bash
git add src/lib/admin/commercial-runtime.ts src/app/api/commercial src/app/api/redeem src/app/[locale]/profile/page.tsx tests/unit/admin/commercial-runtime.test.ts tests/integration/api/contract/commercial-routes.test.ts
git commit -m "feat: connect packages and redeem codes to users"
```

Expected: commit succeeds.

### Task 11: 后台商业配置完整操作和审计

**Files:**
- Modify: `src/app/api/admin/commercial/packages/route.ts`
- Modify: `src/app/api/admin/commercial/packages/[packageKey]/route.ts`
- Modify: `src/app/api/admin/commercial/redeem-codes/route.ts`
- Modify: `src/app/api/admin/commercial/redeem-codes/[code]/route.ts`
- Modify: `src/lib/admin/commercial.ts`
- Modify: `src/app/[locale]/admin/AdminConsoleClient.tsx`
- Test: `tests/integration/api/contract/admin-routes.test.ts`

- [ ] **Step 1: 扩展 admin route 测试**

Add cases to `tests/integration/api/contract/admin-routes.test.ts`:

- admin cannot create package; owner can.
- package publish/archive writes `commercial_package.publish/archive`.
- redeem code pause writes `redeem_code.update`.
- routes require `reason`.
- response does not include redemption internal audit details unless owner and explicit route.

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/integration/api/contract/admin-routes.test.ts
```

Expected: FAIL，审计动作还不完整。

- [ ] **Step 3: 路由按状态变化写不同审计动作**

In package PATCH route:

```ts
const action = item.status === 'active' && previous.status !== 'active'
  ? 'commercial_package.publish'
  : item.status === 'archived'
    ? 'commercial_package.archive'
    : 'commercial_package.update'
```

In redeem PATCH:

```ts
const action = 'redeem_code.update'
```

All create/update/archive must require reason for writes except create can use `reason || 'create commercial object'`.

- [ ] **Step 4: 后台 UI 补齐商业操作**

In `AdminConsoleClient.tsx` commercial module:

- Table packages with status, price, credits, group, time window, operations.
- Table redeem codes with status, credits, max/redemptions, single-user limit, operations.
- Actions: create, edit, publish, pause, archive, copy.
- All destructive/state changes open reason dialog.

- [ ] **Step 5: 运行 admin routes 和 UI typecheck**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/integration/api/contract/admin-routes.test.ts
npm run typecheck
```

Expected: PASS。

- [ ] **Step 6: 提交商业后台操作**

Run:

```bash
git add src/app/api/admin/commercial src/lib/admin/commercial.ts src/app/[locale]/admin/AdminConsoleClient.tsx tests/integration/api/contract/admin-routes.test.ts
git commit -m "feat: complete admin commercial operations"
```

Expected: commit succeeds.

### Task 12: 用户运营操作：禁用、恢复、角色、用户组、备注、踢出登录

**Files:**
- Modify: `src/lib/admin/users.ts`
- Modify: `src/app/api/admin/users/[userId]/route.ts`
- Modify: `src/app/[locale]/admin/AdminConsoleClient.tsx`
- Test: `tests/integration/api/contract/admin-routes.test.ts`
- Test: `tests/unit/admin/api-auth.test.ts`

- [ ] **Step 1: 扩展测试**

Add tests:

- owner disables user increments `sessionVersion`.
- disabled user old session returns `ACCOUNT_DISABLED`.
- restore user increments `sessionVersion`.
- admin cannot promote self to owner.
- owner can assign group and note.
- revoke session increments `sessionVersion` and audits `user.session.revoke`.

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/integration/api/contract/admin-routes.test.ts tests/unit/admin/api-auth.test.ts
```

Expected: FAIL，用户运营动作不完整。

- [ ] **Step 3: 实现用户更新服务**

Modify `src/lib/admin/users.ts`:

```ts
export async function updateAdminUserOperation(params: {
  actorId: string
  targetUserId: string
  role?: string | null
  status?: string | null
  adminGroupKey?: string | null
  adminNote?: string | null
  revokeSession?: boolean
}) {
  if (params.actorId === params.targetUserId && params.role === 'owner') {
    throw new Error('cannot promote self to owner')
  }
  const sessionChanging = params.status !== undefined || params.role !== undefined || params.revokeSession
  return await prisma.user.update({
    where: { id: params.targetUserId },
    data: {
      ...(params.role !== undefined ? { role: params.role } : {}),
      ...(params.status !== undefined ? { status: params.status } : {}),
      ...(params.adminGroupKey !== undefined ? { adminGroupKey: params.adminGroupKey } : {}),
      ...(params.adminNote !== undefined ? { adminNote: params.adminNote } : {}),
      ...(sessionChanging ? { sessionVersion: { increment: 1 } } : {}),
    },
    select: ADMIN_USER_SELECT,
  })
}
```

- [ ] **Step 4: 路由审计动作**

In user PATCH route map:

- status disabled: `user.access.disable`
- status active from disabled: `user.access.enable`
- role changed: `user.role.update`
- group changed: `user.group.assign`
- adminNote changed: `user.note.create`
- revokeSession: `user.session.revoke`

Each write requires reason.

- [ ] **Step 5: UI 补齐用户操作**

Users module:

- Search/filter by role/status/group.
- Row actions: disable/restore, change group, add note, revoke session.
- owner-only role dropdown.
- User detail drawer shows balance/task metadata only; no project content text/media.

- [ ] **Step 6: 运行测试**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/integration/api/contract/admin-routes.test.ts tests/unit/admin/api-auth.test.ts
npm run typecheck
```

Expected: PASS。

- [ ] **Step 7: 提交用户运营**

Run:

```bash
git add src/lib/admin/users.ts src/app/api/admin/users/[userId]/route.ts src/app/[locale]/admin/AdminConsoleClient.tsx tests/integration/api/contract/admin-routes.test.ts tests/unit/admin/api-auth.test.ts
git commit -m "feat: complete admin user operations"
```

Expected: commit succeeds.

---

## P2: 供应链和高级运营

### Task 13: 模型与渠道治理接入模型列表、任务提交和 worker 前置校验

**Files:**
- Create: `src/lib/admin/model-governance-runtime.ts`
- Modify: `src/lib/admin/models.ts`
- Modify: `src/app/api/admin/models/route.ts`
- Create: `src/app/api/admin/models/[modelKey]/route.ts`
- Create: `src/app/api/admin/models/[modelKey]/test/route.ts`
- Modify: `src/app/api/user/models/route.ts`
- Modify: `src/lib/admin/policy.ts`
- Modify: `src/lib/workers/text.worker.ts`
- Modify: `src/lib/workers/image.worker.ts`
- Modify: `src/lib/workers/video.worker.ts`
- Modify: `src/lib/workers/voice.worker.ts`
- Test: `tests/unit/admin/model-governance-runtime.test.ts`
- Test: `tests/integration/chain/model-governance.chain.test.ts`

- [ ] **Step 1: 写模型治理测试**

Create `tests/unit/admin/model-governance-runtime.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertModelUsableForTask,
  filterModelOptionsForGovernance,
} from '@/lib/admin/model-governance-runtime'

const prismaMock = vi.hoisted(() => ({
  adminModelChannel: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('model governance runtime', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters disabled model options', async () => {
    prismaMock.adminModelChannel.findMany.mockResolvedValue([
      { key: 'fal::video', status: 'disabled', groupKeys: null, isAdvanced: false },
    ])
    const result = await filterModelOptionsForGovernance({
      userId: 'u1',
      groupKey: null,
      options: [{ value: 'fal::video', label: 'Video' }, { value: 'fal::image', label: 'Image' }],
    })
    expect(result.map(item => item.value)).toEqual(['fal::image'])
  })

  it('rejects disabled model before worker execution', async () => {
    prismaMock.adminModelChannel.findUnique.mockResolvedValue({
      key: 'fal::video',
      status: 'maintenance',
      userMessage: '模型渠道维护中',
      groupKeys: null,
    })

    await expect(assertModelUsableForTask({
      modelKey: 'fal::video',
      userId: 'u1',
      groupKey: null,
    })).rejects.toMatchObject({
      code: 'MODEL_DISABLED',
      message: '模型渠道维护中',
    })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/admin/model-governance-runtime.test.ts
```

Expected: FAIL，runtime 不存在。

- [ ] **Step 3: 实现模型治理 runtime**

Create `src/lib/admin/model-governance-runtime.ts`:

```ts
import { prisma } from '@/lib/prisma'
import { OperationPolicyError } from './operation-errors'
import { audienceMatches, parseList } from './audience'

export async function filterModelOptionsForGovernance<T extends { value: string }>(params: {
  userId: string
  groupKey?: string | null
  options: T[]
}) {
  const keys = params.options.map(item => item.value)
  if (keys.length === 0) return params.options
  const channels = await prisma.adminModelChannel.findMany({ where: { key: { in: keys } } })
  const byKey = new Map(channels.map(channel => [channel.key, channel]))
  return params.options.filter(option => {
    const channel = byKey.get(option.value)
    if (!channel) return true
    if (channel.status !== 'active') return false
    return audienceMatches({
      audience: channel.groupKeys ? 'group' : 'all',
      groupKeys: parseList(channel.groupKeys),
    }, {
      userId: params.userId,
      role: 'user',
      groupKey: params.groupKey,
    })
  })
}

export async function assertModelUsableForTask(params: {
  modelKey: string
  userId: string
  groupKey?: string | null
}) {
  const channel = await prisma.adminModelChannel.findUnique({ where: { key: params.modelKey } })
  if (!channel) return { allowed: true as const }
  if (channel.status !== 'active') {
    throw new OperationPolicyError('MODEL_DISABLED', {
      message: channel.userMessage || undefined,
      target: params.modelKey,
    })
  }
  if (!audienceMatches({
    audience: channel.groupKeys ? 'group' : 'all',
    groupKeys: parseList(channel.groupKeys),
  }, {
    userId: params.userId,
    groupKey: params.groupKey,
    role: 'user',
  })) {
    throw new OperationPolicyError('MODEL_NOT_ALLOWED', { target: params.modelKey })
  }
  return { allowed: true as const }
}
```

- [ ] **Step 4: 接入用户模型列表**

After grouped options are built in `src/app/api/user/models/route.ts`, call `filterModelOptionsForGovernance()` for each group with `runtimeGroup.key`.

```ts
grouped.llm = await filterModelOptionsForGovernance({ userId, groupKey: runtimeGroup.key, options: grouped.llm })
```

- [ ] **Step 5: 接入任务提交**

Modify `assertTaskAllowed()`:

```ts
for (const modelKey of extractTaskModelKeys(params.payload)) {
  await assertModelUsableForTask({ modelKey, userId: params.userId, groupKey: group.key })
}
```

- [ ] **Step 6: 接入 worker 前置校验**

In each worker before handler execution:

- Extract model keys from task payload using `extractTaskModelKeys()`.
- Resolve user group.
- Call `assertModelUsableForTask()`.
- If rejected, mark task failed with `MODEL_DISABLED` or `MODEL_NOT_ALLOWED`, and do not call provider.

Keep user-facing event generic; do not include provider key details beyond model key.

- [ ] **Step 7: 后台模型 API**

Modify `src/lib/admin/models.ts`:

- List `AdminModelChannel` with usage/failure summary from `Task` and `UsageCost`.
- Create/update model channel.
- Test connection route only calls provider light test if API key exists in user's own provider config or platform config; never returns API key.
- Audit actions:
  - `model_channel.create`
  - `model_channel.update`
  - `model_channel.disable`
  - `model_default.update`
  - `model_channel.test`

- [ ] **Step 8: 运行模型治理测试**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/admin/model-governance-runtime.test.ts tests/integration/api/contract/creative-engine-user-models.contract.test.ts
cross-env BILLING_TEST_BOOTSTRAP=1 vitest run tests/integration/chain/model-governance.chain.test.ts
npm run typecheck
```

Expected: PASS。

- [ ] **Step 9: 提交模型治理**

Run:

```bash
git add src/lib/admin/model-governance-runtime.ts src/lib/admin/models.ts src/app/api/admin/models src/app/api/user/models/route.ts src/lib/admin/policy.ts src/lib/workers/text.worker.ts src/lib/workers/image.worker.ts src/lib/workers/video.worker.ts src/lib/workers/voice.worker.ts tests/unit/admin/model-governance-runtime.test.ts tests/integration/chain/model-governance.chain.test.ts
git commit -m "feat: enforce admin model governance"
```

Expected: commit succeeds.

### Task 14: 系统健康扩展到 Redis、BullMQ、worker、MinIO、支付和模型渠道

**Files:**
- Modify: `src/lib/admin/system-health.ts`
- Modify: `src/app/api/admin/system-health/route.ts`
- Modify: `src/lib/admin/overview.ts`
- Modify: `src/lib/admin/operations.ts`
- Modify: `src/app/[locale]/admin/AdminConsoleClient.tsx`
- Test: `tests/unit/admin/system-health.test.ts`
- Test: `tests/integration/api/contract/admin-routes.test.ts`

- [ ] **Step 1: 写健康检查测试**

Create `tests/unit/admin/system-health.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { summarizeHealthChecks } from '@/lib/admin/system-health'

describe('admin system health', () => {
  it('summarizes impacted features from failed dependencies', () => {
    const summary = summarizeHealthChecks({
      database: { status: 'ok' },
      redis: { status: 'error', message: 'connection refused' },
      bullmq: { status: 'error' },
      worker: { status: 'stale' },
      minio: { status: 'ok' },
      payment: { status: 'missing_config' },
      modelChannels: { status: 'warning' },
    })

    expect(summary.status).toBe('critical')
    expect(summary.impactedFeatures).toContain('任务提交')
    expect(summary.impactedFeatures).toContain('充值支付')
    expect(summary.recommendedActions).toContain('开启维护模式')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/admin/system-health.test.ts
```

Expected: FAIL，summary 函数不存在或不完整。

- [ ] **Step 3: 实现健康检查**

Modify `src/lib/admin/system-health.ts`:

Add checks:

- database: `prisma.$queryRaw\`SELECT 1\``.
- redis: use existing Redis connection factory from queue module.
- bullmq: queue counts for text/image/video/voice/render.
- worker: stale heartbeat from worker/watchdog state if available; if no heartbeat table exists, infer from recent processing task heartbeat and queued backlog.
- minio: use storage client/head bucket from `src/lib/storage`.
- payment: config env presence and no secret echo.
- modelChannels: count disabled/maintenance/error test statuses.

Return:

```ts
{
  status: 'ok' | 'warning' | 'critical',
  checks: {
    database,
    redis,
    bullmq,
    worker,
    minio,
    payment,
    modelChannels,
  },
  impactedFeatures: string[],
  recommendedActions: string[],
  checkedAt: string,
}
```

Add `summarizeHealthChecks(checks)` exported pure function for tests.

- [ ] **Step 4: 存健康快照并审计**

In `/api/admin/system-health/route.ts`:

- GET returns latest live check.
- POST refreshes live check, writes `AdminHealthCheckSnapshot`, audits `system_health.check`.
- If owner toggles maintenance from health UI, use feature flag route/action `system.maintenance.enable` or `system.maintenance.disable`.

- [ ] **Step 5: UI 显示影响范围和跳转**

Health module:

- Table check item/status/message/impact.
- Buttons jump to feature flags, task incidents, model channels, billing.
- Top overview uses same summary.

- [ ] **Step 6: 运行健康测试**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/admin/system-health.test.ts tests/integration/api/contract/admin-routes.test.ts
npm run typecheck
```

Expected: PASS。

- [ ] **Step 7: 提交系统健康**

Run:

```bash
git add src/lib/admin/system-health.ts src/app/api/admin/system-health/route.ts src/lib/admin/overview.ts src/lib/admin/operations.ts src/app/[locale]/admin/AdminConsoleClient.tsx tests/unit/admin/system-health.test.ts tests/integration/api/contract/admin-routes.test.ts
git commit -m "feat: expand admin system health checks"
```

Expected: commit succeeds.

### Task 15: 批量任务事故处理

**Files:**
- Modify: `src/lib/admin/tasks.ts`
- Create: `src/app/api/admin/tasks/incidents/route.ts`
- Create: `src/app/api/admin/tasks/incidents/[incidentId]/route.ts`
- Modify: `src/app/[locale]/admin/AdminConsoleClient.tsx`
- Test: `tests/integration/task/admin-task-incident.integration.test.ts`
- Test: `tests/integration/api/contract/admin-routes.test.ts`

- [ ] **Step 1: 写批量事故测试**

Add to `tests/integration/task/admin-task-incident.integration.test.ts`:

```ts
it('batch cancels stale queued tasks and records incident items', async () => {
  const user = await prisma.user.create({ data: { name: `batch-${Date.now()}` } })
  const project = await prisma.project.create({ data: { userId: user.id, name: 'Batch Project' } })
  await prisma.task.createMany({
    data: [
      { userId: user.id, projectId: project.id, type: 'video_panel', targetType: 'panel', targetId: 'p1', status: 'queued', progress: 0 },
      { userId: user.id, projectId: project.id, type: 'video_panel', targetType: 'panel', targetId: 'p2', status: 'queued', progress: 0 },
    ],
  })

  const incident = await createTaskIncident({
    title: '取消卡死视频任务',
    action: 'cancel',
    reason: '队列事故',
    createdBy: 'owner-1',
    filter: { status: ['queued'], type: ['video_panel'] },
  })

  const items = await prisma.adminTaskIncidentItem.findMany({ where: { incidentId: incident.id } })
  expect(items).toHaveLength(2)
  expect(await prisma.task.count({ where: { status: 'canceled', type: 'video_panel' } })).toBeGreaterThanOrEqual(2)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=1 vitest run tests/integration/task/admin-task-incident.integration.test.ts
```

Expected: FAIL，批量函数不存在。

- [ ] **Step 3: 实现批量事故服务**

Modify `src/lib/admin/tasks.ts`:

```ts
export async function createTaskIncident(params: {
  title: string
  action: 'cancel' | 'retry' | 'release_freeze'
  reason: string
  createdBy: string
  filter: {
    status?: string[]
    type?: string[]
    userId?: string
    projectId?: string
    olderThanMinutes?: number
    limit?: number
  }
}) {
  const tasks = await prisma.task.findMany({
    where: {
      ...(params.filter.status?.length ? { status: { in: params.filter.status } } : {}),
      ...(params.filter.type?.length ? { type: { in: params.filter.type } } : {}),
      ...(params.filter.userId ? { userId: params.filter.userId } : {}),
      ...(params.filter.projectId ? { projectId: params.filter.projectId } : {}),
      ...(params.filter.olderThanMinutes ? { updatedAt: { lt: new Date(Date.now() - params.filter.olderThanMinutes * 60_000) } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: Math.min(Math.max(params.filter.limit || 50, 1), 200),
    select: ADMIN_TASK_SELECT,
  })

  const incident = await prisma.adminTaskIncident.create({
    data: {
      title: params.title,
      action: params.action,
      reason: params.reason,
      createdBy: params.createdBy,
      filterJson: params.filter,
      items: {
        create: tasks.map(task => ({
          taskId: task.id,
          status: 'pending',
          beforeJson: redactTaskForAdmin(task),
        })),
      },
    },
  })

  for (const task of tasks) {
    try {
      const result = params.action === 'cancel'
        ? await cancelAdminTask(task.id, params.reason)
        : { task: null, cancelled: false }
      await prisma.adminTaskIncidentItem.updateMany({
        where: { incidentId: incident.id, taskId: task.id },
        data: { status: 'completed', afterJson: result.task || {} },
      })
    } catch (error) {
      await prisma.adminTaskIncidentItem.updateMany({
        where: { incidentId: incident.id, taskId: task.id },
        data: { status: 'failed', errorMessage: error instanceof Error ? error.message : String(error) },
      })
    }
  }

  await prisma.adminTaskIncident.update({
    where: { id: incident.id },
    data: { status: 'completed', completedAt: new Date() },
  })

  return await prisma.adminTaskIncident.findUniqueOrThrow({
    where: { id: incident.id },
    include: { items: true },
  })
}
```

- [ ] **Step 4: 实现批量事故 routes 和审计**

`POST /api/admin/tasks/incidents`:

- owner-only.
- body requires title/action/reason/filter.
- Calls `createTaskIncident`.
- Audits `task.incident.batch_resolve`.

`GET /api/admin/tasks/incidents/[incidentId]`:

- admin read.
- Returns incident and redacted items.

- [ ] **Step 5: UI 加批量操作**

Tasks module:

- Filters: status/type/userId/projectId/stale threshold.
- Preview count before action.
- Batch action opens confirmation with reason.
- Incident drawer shows each item status and redacted before/after.

- [ ] **Step 6: 运行批量事故测试**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=1 vitest run tests/integration/task/admin-task-incident.integration.test.ts
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/integration/api/contract/admin-routes.test.ts
npm run typecheck
```

Expected: PASS。

- [ ] **Step 7: 提交批量事故处理**

Run:

```bash
git add src/lib/admin/tasks.ts src/app/api/admin/tasks/incidents src/app/[locale]/admin/AdminConsoleClient.tsx tests/integration/task/admin-task-incident.integration.test.ts tests/integration/api/contract/admin-routes.test.ts
git commit -m "feat: add batch task incident handling"
```

Expected: commit succeeds.

### Task 16: 高级投放、人群灰度和总览闭环

**Files:**
- Modify: `src/lib/admin/audience.ts`
- Modify: `src/lib/admin/feature-flags.ts`
- Modify: `src/lib/admin/announcements.ts`
- Modify: `src/lib/admin/commercial.ts`
- Modify: `src/lib/admin/overview.ts`
- Modify: `src/lib/admin/operations.ts`
- Modify: `src/app/[locale]/admin/AdminConsoleClient.tsx`
- Test: `tests/unit/admin/audience.test.ts`
- Test: `tests/unit/admin/data-services.test.ts`
- Test: `tests/integration/api/contract/admin-routes.test.ts`

- [ ] **Step 1: 扩展高级投放测试**

Add to `tests/unit/admin/audience.test.ts`:

```ts
it('supports multiple user groups and explicit target users for operations rollout', () => {
  expect(audienceMatches({
    audience: 'group',
    groupKeys: ['vip', 'internal'],
  }, {
    userId: 'u1',
    role: 'user',
    groupKeys: ['free', 'internal'],
  })).toBe(true)

  expect(audienceMatches({
    audience: 'target_users',
    targetUserIds: ['u2', 'u3'],
  }, {
    userId: 'u3',
    role: 'user',
  })).toBe(true)
})
```

Add to `tests/unit/admin/data-services.test.ts`:

- Feature flag serializes impacted surfaces and user message.
- Announcement serializes target group summary but public route does not expose target internals.
- Overview disabled flag count matches feature flag module.

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/admin/audience.test.ts tests/unit/admin/data-services.test.ts
```

Expected: FAIL 或覆盖不足。

- [ ] **Step 3: 完善投放字段解析和摘要**

In `feature-flags.ts`, `announcements.ts`, `commercial.ts`:

- Parse comma-separated `groupKeys`.
- Parse comma-separated `targetUserIds`.
- Keep raw internal fields in admin DTO only; public DTO hides them.
- Add `impactSummary`:

```ts
impactSummary: {
  surfaces: parseList(item.surfaces),
  groupKeys: parseList(item.groupKeys),
  targetUserCount: parseList(item.targetUserIds).length,
}
```

- [ ] **Step 4: 总览每个异常都有入口**

Modify `src/lib/admin/overview.ts` and `operations.ts`:

Return:

```ts
actionItems: Array<{
  id: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  module: 'featureFlags' | 'tasks' | 'billing' | 'models' | 'health' | 'announcements'
  action: string
  count?: number
}>
```

Examples:

- disabled flags count -> module `featureFlags`.
- stale running tasks -> module `tasks`.
- pending freezes older than threshold -> module `billing`.
- disabled/maintenance models -> module `models`.
- health critical -> module `health`.
- no published announcement during maintenance -> module `announcements`.

- [ ] **Step 5: UI overview 入口**

In `AdminConsoleClient.tsx`:

- Overview cards become dense metrics plus action list.
- Every action item is clickable and switches module/filter.
- Top bar disabled flag count equals feature flag data.
- No module is just numbers; each module has executable action.

- [ ] **Step 6: 运行高级投放和总览测试**

Run:

```bash
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/admin/audience.test.ts tests/unit/admin/data-services.test.ts tests/integration/api/contract/admin-routes.test.ts
npm run typecheck
```

Expected: PASS。

- [ ] **Step 7: 提交高级运营闭环**

Run:

```bash
git add src/lib/admin/audience.ts src/lib/admin/feature-flags.ts src/lib/admin/announcements.ts src/lib/admin/commercial.ts src/lib/admin/overview.ts src/lib/admin/operations.ts src/app/[locale]/admin/AdminConsoleClient.tsx tests/unit/admin/audience.test.ts tests/unit/admin/data-services.test.ts tests/integration/api/contract/admin-routes.test.ts
git commit -m "feat: add advanced admin targeting and action overview"
```

Expected: commit succeeds.

---

## Final Verification

- [ ] **Step 1: 运行完整单元测试**

Run:

```bash
npm run test:unit:all
```

Expected: PASS。

- [ ] **Step 2: 运行 API 集成测试**

Run:

```bash
npm run test:integration:api
```

Expected: PASS。

- [ ] **Step 3: 运行计费和任务相关集成测试**

Run:

```bash
npm run test:billing:integration
npm run test:integration:task
```

Expected: PASS。

- [ ] **Step 4: 运行类型检查和关键 guard**

Run:

```bash
npm run typecheck
npm run check:task-submit-compensation
npm run check:test-route-coverage
```

Expected: PASS。

- [ ] **Step 5: 构建验证**

Run:

```bash
npm run build
```

Expected: PASS。

- [ ] **Step 6: 手动浏览器验收**

Run:

```bash
npm run dev
```

Open `http://localhost:3000/zh/admin` and verify:

- 普通用户没有导航入口，直接访问后台被拒绝。
- admin/owner 可以进入后台。
- select/options 在暗色和浅色区域均可读。
- 关闭注册后，注册提交返回 `FEATURE_DISABLED`，不创建用户和余额。
- 关闭创建作品后，首页快速创建作品失败且不创建 Project。
- 关闭视频生成后，直接调用视频任务 API 不创建 Task、不入队、不冻结。
- 发布 top banner 公告后目标用户刷新可见，暂停后不可见。
- 发布 workspace_notice 后仅工作区可见。
- 禁用用户后旧 session 调普通用户 API 返回 `ACCOUNT_DISABLED`。
- 取消任务后任务终态、TaskEvent、冻结回滚一致。
- 人工加款/扣款/解冻必须填写原因，并写审计。
- 下架套餐不可购买，暂停/过期兑换码不可兑换。
- 禁用模型后模型列表不可见，强行提交被拒绝。
- 健康检查异常有影响范围和可点击处理入口。

- [ ] **Step 7: 最终提交或确认无未提交计划外改动**

Run:

```bash
git status --short
```

Expected: 只剩用户刻意保留的无关改动；本计划相关改动都已提交。

## Acceptance Matrix

| 规格要求 | 计划任务 |
| --- | --- |
| 功能开关真实接入注册 | Task 1, Task 3 |
| 功能开关真实接入创建作品 | Task 1, Task 3 |
| 功能开关真实接入任务提交 | Task 1, Task 4 |
| 维护模式控制普通用户写操作 | Task 1, Task 3, Task 14 |
| disabled 用户旧 session 失效 | Task 3, Task 12 |
| 公告展示 top banner/modal/workspace/profile | Task 5 |
| 任务事故取消和余额回滚 | Task 6 |
| 后台 UI 可执行、可读、可反馈 | Task 7 |
| 用户组权益、每日、并发、模型过滤 | Task 8 |
| 人工加款、扣款、解冻、补单、退款 | Task 9 |
| 套餐购买和兑换码兑换 | Task 10, Task 11 |
| 模型渠道管理接入用户端和 worker | Task 13 |
| 系统健康扩展 | Task 14 |
| 批量任务事故处理 | Task 15 |
| 更细人群、灰度、用户组投放 | Task 16 |
| 所有后台写操作审计 | Task 5, Task 6, Task 9, Task 11, Task 12, Task 13, Task 14, Task 15 |
| 后台 DTO 脱敏 | Task 5, Task 6, Task 7, Task 12, Task 15 |
