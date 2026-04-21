# Testing Patterns

**Analysis Date:** 2026-04-17

## Test Framework

**Runner:**
- Vitest `^2.1.8`，配置文件：`vitest.config.ts`。
- 测试环境为 `node`，`pool: 'forks'` 且 `maxForks: 1`，用于降低数据库、Redis、全局 mock 的并发干扰：`vitest.config.ts`。
- `setupFiles` 使用 `tests/setup/env.ts`，`globalSetup` 使用 `tests/setup/global-setup.ts`。
- `include` 只匹配 `**/*.test.ts`，因此新增测试文件必须以 `.test.ts` 结尾：`vitest.config.ts`。

**Assertion Library:**
- 使用 Vitest 内置 `expect`、`vi`、`describe`、`it`、`beforeEach`、`afterEach`：`tests/unit/billing/service.test.ts`、`tests/system/text-workflow.system.test.ts`。

**Run Commands:**
```bash
npm run test:unit:all              # 运行 tests/unit
npm run test:integration:api       # 运行 API 集成测试
npm run test:integration:provider  # 运行 provider 合约测试
npm run test:integration:chain     # 运行链路集成测试
npm run test:integration:task      # 运行任务集成测试
npm run test:system                # 运行 system tests，并启动测试依赖
npm run test:guards                # 运行脚本守卫和测试覆盖守卫
npm run test:all                   # 运行 guards、unit、integration、system、regression
npm run test:billing:coverage      # 运行 billing 覆盖率门槛
npm run check:requirements-matrix  # 运行需求矩阵合约测试
```

## Test File Organization

**Location:**
- 单元测试集中在 `tests/unit/**`，按领域目录分组：`tests/unit/billing`、`tests/unit/query`、`tests/unit/optimistic`、`tests/unit/guards`。
- 集成测试集中在 `tests/integration/**`：`tests/integration/api`、`tests/integration/provider`、`tests/integration/chain`、`tests/integration/task`、`tests/integration/billing`、`tests/integration/run-runtime`。
- 系统测试集中在 `tests/system/**`，会启动 worker 和测试服务：`tests/system/text-workflow.system.test.ts`。
- 回归测试集中在 `tests/regression/**`，用于防止跨故事板、任务恢复、账单回滚等历史行为退化。
- 少量源码旁测试存在于 `src/lib/**`：`src/lib/media/image-url.test.ts`、`src/lib/contracts/image-urls-contract.test.ts`。
- 测试 helper 集中在 `tests/helpers/**`、`tests/setup/**`、`tests/system/helpers/**`。

**Naming:**
- 普通单元测试：`*.test.ts`，例如 `tests/unit/task/error-message.test.ts`。
- 集成测试可加 `.integration.test.ts`：`tests/integration/billing/service.integration.test.ts`。
- 系统测试可加 `.system.test.ts`：`tests/system/generate-image.system.test.ts`。
- route 合约测试使用 `.route.test.ts` 或 contract 目录：`tests/integration/api/contract/run-cancel.route.test.ts`、`tests/integration/api/contract/crud-routes.test.ts`。

**Structure:**
```text
tests/
├── unit/              # 纯函数、hooks/mutations、组件静态渲染、guard 单测
├── integration/       # API/provider/chain/task/billing/run-runtime 集成测试
├── system/            # 端到端任务流和 worker 行为
├── regression/        # 历史 bug 回归场景
├── contracts/         # route/task type/requirements 矩阵
├── helpers/           # 请求、认证、fixture、fake server、mock query client
└── setup/             # env、global setup、global teardown
```

## Test Structure

**Suite Organization:**
```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'

const dependencyMock = vi.hoisted(() => ({
  method: vi.fn(),
}))

vi.mock('@/lib/dependency', () => dependencyMock)

describe('domain/module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dependencyMock.method.mockResolvedValue(...)
  })

  it('states the observable behavior', async () => {
    await expect(subject()).resolves.toEqual(...)
    expect(dependencyMock.method).toHaveBeenCalledWith(...)
  })
})
```

**Patterns:**
- Mock 必须在被测模块 import 之前声明；需要 hoist 的状态使用 `vi.hoisted`：`tests/unit/billing/service.test.ts`。
- 每个 suite 在 `beforeEach` 中 `vi.clearAllMocks()` 并重设 mock 返回值：`tests/unit/billing/service.test.ts`、`tests/integration/api/contract/crud-routes.test.ts`。
- 异步错误断言使用 `await expect(promise).rejects...`：`tests/unit/billing/service.test.ts`。
- React 组件测试多用 `renderToStaticMarkup` 做服务端静态输出断言，而不是浏览器 DOM：`tests/unit/components/ai-data-modal.test.ts`。
- API route 测试用 `buildMockRequest` 或 `callRoute` 构造 `NextRequest`：`tests/helpers/request.ts`、`tests/integration/api/contract/crud-routes.test.ts`。
- 乐观更新测试直接调用 mutation option 的 `onMutate`/`onError`，并用 `MockQueryClient` 验证缓存：`tests/unit/optimistic/project-asset-mutations.test.ts`。

## Mocking

**Framework:** Vitest `vi.mock`、`vi.hoisted`、`vi.fn`、`vi.importActual`、`vi.stubGlobal`。

**Patterns:**
```typescript
const ledgerMock = vi.hoisted(() => ({
  freezeBalance: vi.fn(),
  rollbackFreeze: vi.fn(),
}))

vi.mock('@/lib/billing/ledger', () => ledgerMock)
```

```typescript
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => useQueryClientMock(),
  useMutation: (options: unknown) => useMutationMock(options),
}))
```

```typescript
vi.mock('@/lib/ai-runtime', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai-runtime')>('@/lib/ai-runtime')
  return {
    ...actual,
    executeAiTextStep: vi.fn(async () => ({ text: '{"ok":true}' })),
  }
})
```

**What to Mock:**
- 外部 AI/runtime/provider 调用必须 mock：`tests/system/text-workflow.system.test.ts`、`tests/unit/providers/bailian-video.test.ts`。
- Prisma 在 API contract 测试中 mock 到模型方法级别：`tests/integration/api/contract/crud-routes.test.ts`。
- React Query hooks/mutations 测试中 mock `useMutation` 和 `useQueryClient`：`tests/unit/optimistic/project-asset-mutations.test.ts`。
- 日志模块在 worker/component 测试中 mock，避免输出污染和文件写入：`tests/unit/worker/shared.direct-run-events.test.ts`。
- Next/Intl/browser API 在组件测试中 mock：`next-intl`、`react-dom/createPortal`、`document` in `tests/unit/components/ai-data-modal.test.ts`。

**What NOT to Mock:**
- 纯函数和领域计算不要 mock；直接断言行为：`tests/unit/billing/cost.test.ts`、`tests/unit/projects/validation.test.ts`。
- Guard inspection 函数不要只测 CLI；直接 import 纯函数测试 violations：`tests/unit/guards/changed-file-test-impact-guard.test.ts`。
- 需要验证数据库/Redis/worker 生命周期的 system/integration 测试不要 mock 存储层；使用测试服务和 fixtures：`tests/system/text-workflow.system.test.ts`、`tests/integration/billing/worker-lifecycle.integration.test.ts`。

## Fixtures and Factories

**Test Data:**
```typescript
const user = await createFixtureUser()
const project = await createFixtureProject(user.id)
const novelProject = await createFixtureNovelProject(project.id)
const episode = await createFixtureEpisode(novelProject.id)
```

**Location:**
- 通用 fixture 工厂在 `tests/helpers/fixtures.ts`。
- 认证 mock 在 `tests/helpers/auth.ts`。
- 请求构造 helper 在 `tests/helpers/request.ts`。
- DB reset 在 `tests/helpers/db-reset.ts`。
- Prisma 测试实例在 `tests/helpers/prisma.ts`。
- React Query mock client 在 `tests/helpers/mock-query-client.ts`。
- Fake provider/server 在 `tests/helpers/fakes/llm.ts`、`tests/helpers/fakes/providers.ts`、`tests/helpers/fakes/scenario-server.ts`。
- Billing JSON case fixture 在 `tests/fixtures/billing/cases.json`。

## Coverage

**Requirements:** 
- Vitest 覆盖率配置当前只对 billing 核心文件设置 80% thresholds：`vitest.config.ts`。
- 覆盖率输出目录为 `coverage/billing`，reporter 为 `text`、`html`、`json-summary`：`vitest.config.ts`。
- 行为覆盖还依赖 guard，而不是全仓覆盖率阈值：`scripts/guards/changed-file-test-impact-guard.mjs`、`scripts/guards/test-behavior-quality-guard.mjs`。

**View Coverage:**
```bash
npm run test:billing:coverage
```

## Test Types

**Unit Tests:**
- 适合纯函数、错误映射、billing、query cache、组件静态渲染、guard 逻辑：`tests/unit/billing/service.test.ts`、`tests/unit/optimistic/project-asset-mutations.test.ts`、`tests/unit/guards/api-route-contract-guard.test.ts`。
- 对 mutation 乐观更新必须断言 `onMutate` 修改缓存、`onError` 回滚缓存，以及 stale rollback 不覆盖新状态：`tests/unit/optimistic/project-asset-mutations.test.ts`。
- 对组件渲染可使用 `react-dom/server` 的 `renderToStaticMarkup`：`tests/unit/components/ai-data-modal.test.ts`。

**Integration Tests:**
- API contract 测试验证 route 认证、方法存在、响应状态和兼容字段：`tests/integration/api/contract/crud-routes.test.ts`。
- Provider contract 测试验证 provider payload/response 行为：`tests/integration/provider/fal-provider.contract.test.ts`、`tests/integration/provider/openai-compat-provider.contract.test.ts`。
- Billing/run-runtime/task 集成测试验证数据库状态、生命周期和幂等：`tests/integration/billing/service.integration.test.ts`、`tests/integration/run-runtime/retry-failed-step.integration.test.ts`。

**E2E Tests:**
- 未检测到 Playwright/Cypress E2E 配置。
- 当前端到端行为由 Vitest system tests 覆盖，启动 MySQL/Redis/Docker 服务和 worker：`tests/system/text-workflow.system.test.ts`、`tests/system/helpers/workers.ts`。

## Common Patterns

**Async Testing:**
```typescript
await expect(
  withTextBilling(...),
).rejects.toThrow('boom')
```

```typescript
const response = await invokeRouteMethod(routeFile, method)
expect(response.status).toBe(...)
```

**Error Testing:**
```typescript
await expect(subject()).rejects.toBeInstanceOf(InsufficientBalanceError)
expect(rollbackMock).toHaveBeenCalledWith('freeze_rollback')
```

```typescript
const response = handleBillingError(new InsufficientBalanceError(1.2, 0.3))
expect(response?.status).toBe(402)
const body = await response?.json()
expect(body?.code).toBe('INSUFFICIENT_BALANCE')
```

**Network and Environment Controls:**
- `tests/setup/env.ts` 会读取 `.env.test`（如果存在）并设置测试默认值；不要在文档或日志中输出 env 内容。
- `tests/setup/env.ts` 默认阻止非 `localhost`/`127.0.0.1` 网络请求，除非 `ALLOW_TEST_NETWORK=1`。
- `tests/setup/global-setup.ts` 仅在 `BILLING_TEST_BOOTSTRAP=1` 或 `SYSTEM_TEST_BOOTSTRAP=1` 时启动 `docker-compose.test.yml` 中的 MySQL/Redis 并执行 `prisma db push`。
- `tests/setup/global-teardown.ts` 默认关闭测试服务；`BILLING_TEST_KEEP_SERVICES=1` 可保留服务。

## Guards and Quality Gates

**Script Guards:**
- API route 必须使用 `apiHandler` 并执行认证，例外在 allowlist 中维护：`scripts/guards/api-route-contract-guard.mjs`。
- 改动 `src/app/api/**`、`src/lib/workers/**`、`src/lib/task/**`、`src/lib/media/**`、provider/gateway 相关目录时，必须配套对应测试改动：`scripts/guards/changed-file-test-impact-guard.mjs`。
- 禁止业务代码直接使用 `console.*`：`scripts/check-no-console.ts`。
- 任务、prompt、media、locale、model config 等领域有独立 guard：`scripts/guards/task-submit-compensation-guard.mjs`、`scripts/guards/prompt-i18n-guard.mjs`、`scripts/guards/image-reference-normalization-guard.mjs`、`scripts/guards/locale-navigation-guard.mjs`。

**Guard Tests:**
- Guard 脚本自身应有单测，直接 import inspection 函数：`tests/unit/guards/changed-file-test-impact-guard.test.ts`、`tests/unit/guards/api-route-contract-guard.test.ts`。
- `npm run test:guards` 聚合 API handler、image reference、task compensation、coverage guard、requirements matrix、locale navigation 等检查：`package.json`。

---

*Testing analysis: 2026-04-17*
