# Coding Conventions

**Analysis Date:** 2026-04-17

## Naming Patterns

**Files:**
- 使用 kebab-case 或领域短语命名模块文件：`src/lib/query/mutations/character-base-mutations.ts`、`src/lib/query/task-target-overlay.ts`、`scripts/guards/changed-file-test-impact-guard.mjs`。
- React 组件文件使用 PascalCase：`src/components/ui/SegmentedControl.tsx`、`src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/AIDataModal.tsx`。
- Hook 文件使用 `useXxx.ts` 或组件目录内 `hooks/useXxx.ts`：`src/lib/query/hooks/useProjectAssets.ts`、`src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceExecution.ts`。
- 测试文件统一使用 `.test.ts`，Vitest 配置只匹配 `**/*.test.ts`：`vitest.config.ts`、`tests/unit/billing/service.test.ts`、`src/lib/media/outbound-image.test.ts`。

**Functions:**
- 普通函数和 hook 使用 camelCase；hook 必须以 `use` 开头：`useProjectAssets`、`useSelectProjectCharacterImage` in `src/lib/query/mutations/character-base-mutations.ts`。
- API route handler 使用 Next.js 方法名常量导出：`export const GET = apiHandler(...)`、`export const POST = apiHandler(...)` in `src/app/api/runs/route.ts`。
- 领域转换函数使用动词开头并写清输入输出：`mapAssetGroupsToProjectAssetsData`、`applyCharacterSelectionToProject` in `src/lib/query/hooks/useProjectAssets.ts` and `src/lib/query/mutations/character-base-mutations.ts`。
- Guard 脚本导出可测试的纯函数，再提供 CLI main：`inspectChangedFiles` in `scripts/guards/changed-file-test-impact-guard.mjs`、`inspectRouteContract` in `scripts/guards/api-route-contract-guard.mjs`。

**Variables:**
- 常量使用 UPPER_SNAKE_CASE：`ERROR_CODES` in `src/lib/error-handler.ts`、`RUN_STATUS` in `src/app/api/runs/route.ts`。
- Mock 对象使用 `xxxMock` 后缀，并通过 `vi.hoisted` 提前声明：`ledgerMock`、`modeMock` in `tests/unit/billing/service.test.ts`。
- Query key 变量使用具体领域名：`assetsQueryKey`、`projectQueryKey` in `src/lib/query/mutations/character-base-mutations.ts`。
- 布尔变量使用 `is/has/should` 前缀：`isActiveRunStatus`、`shouldAuditUserOperation` in `src/app/api/runs/route.ts` and `src/lib/api-errors.ts`。

**Types:**
- 领域类型使用 PascalCase，并靠近实现文件导出：`ProjectAssetsData` in `src/lib/query/hooks/useProjectAssets.ts`。
- Mutation 上下文类型使用操作名 + `Context`：`SelectProjectCharacterImageContext`、`DeleteProjectCharacterContext` in `src/lib/query/mutations/character-base-mutations.ts`。
- 测试局部类型用于 mock 状态和 route context：`AuthState`、`RouteContext` in `tests/integration/api/contract/crud-routes.test.ts`。
- 错误码类型从统一 catalog 推导：`UnifiedErrorCode` in `src/lib/errors/codes.ts`、`ApiErrorCode` in `src/lib/api-errors.ts`。

## Code Style

**Formatting:**
- 未检测到 Prettier 配置；按现有 TypeScript 风格写无分号代码，字符串优先单引号，缩进在多数源码中为 2 空格，部分旧文件使用 4 空格。
- 新增代码应优先匹配相邻文件格式。例如 `src/lib/query/mutations/mutation-shared.ts` 使用 2 空格，`src/lib/query/keys.ts` 当前使用 4 空格。
- JSX 组件保持显式 props interface/type，并优先用函数组件：`src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/StoryboardGroupDialogs.tsx`。
- 服务端 route 保持小型输入解析 helper + `apiHandler` 包装的形状：`src/app/api/runs/route.ts`。

**Linting:**
- ESLint 使用 flat config：`eslint.config.mjs` 扩展 `next/core-web-vitals` 和 `next/typescript`。
- 旧 `.eslintrc.json` 仍存在，规则允许 `any`、将未使用变量和 `next/no-img-element` 降为 warn；实际 lint 命令为 `npm run lint -- .` in `package.json`。
- `src/**/*.{ts,tsx}` 禁止直接从 `lucide-react` 导入图标；统一从 `@/components/ui/icons` 使用：`eslint.config.mjs`。
- `src/**/*.{ts,tsx}` 禁止内联 `<svg>`，使用 `AppIcon` 或 icons 模块：`eslint.config.mjs`、`src/components/ui/icons/AppIcon.tsx`。
- 控制台输出由 guard 限制；业务代码使用日志封装，不直接使用 `console.*`：`scripts/check-no-console.ts`、`src/lib/logging/core.ts`。

## Import Organization

**Order:**
1. 框架和运行时导入：`next/server`、`react`、`@tanstack/react-query`，例：`src/app/api/runs/route.ts`、`src/lib/query/mutations/character-base-mutations.ts`。
2. `@/` 路径别名导入业务模块：`@/lib/prisma`、`@/lib/api-errors`、`@/types/project`。
3. 相对路径导入同层模块：`../keys`、`./mutation-shared` in `src/lib/query/mutations/character-base-mutations.ts`。
4. type-only import 使用 `import type`：`import type { Character, Project } from '@/types/project'` in `src/lib/query/mutations/character-base-mutations.ts`。

**Path Aliases:**
- TypeScript 和 Vitest 都配置 `@` 指向 `src`：`tsconfig.json`、`vitest.config.ts`。
- 测试可以直接 mock `@/lib/...` 模块：`tests/unit/billing/service.test.ts`、`tests/system/text-workflow.system.test.ts`。
- scripts 通过 `tsx` 或 Node 运行时也使用 `@/`，例如 `scripts/check-api-handler.ts`、`scripts/check-image-urls-contract.ts`。

## Error Handling

**Patterns:**
- API routes 必须使用 `apiHandler` 包装，并通过 `ApiError` 抛统一错误码：`src/lib/api-errors.ts`、`src/app/api/runs/route.ts`。
- API route 必须先调用 `requireUserAuth`、`requireProjectAuth` 或 `requireProjectAuthLight`，公开 route 只能加入 allowlist：`scripts/guards/api-route-contract-guard.mjs`。
- `ApiError` 从 `src/lib/errors/codes.ts` 取 HTTP 状态、retryable、category 和 userMessageKey；不要手写分散的错误响应。
- 任意未知错误通过 `normalizeAnyError` 映射为统一错误：`src/lib/errors/normalize.ts`、`src/lib/api-errors.ts`。
- Fetch/mutation 错误统一用 `requestJsonWithError`、`requestVoidWithError`、`requestTaskResponseWithError` 或 `requestBlobWithError` 包装：`src/lib/query/mutations/mutation-shared.ts`。
- 前端 API response 检查使用 `checkApiResponse` 或 `handleApiError`，不要只判断 `res.ok` 后丢失服务端错误码：`src/lib/error-handler.ts`。
- Worker/底层领域逻辑可以抛 `Error`，但面向 API 或任务状态前要通过统一 normalizer：`src/lib/workers/handlers/script-to-storyboard.ts`、`src/lib/errors/normalize.ts`。

## Logging

**Framework:** 自研结构化日志封装。

**Patterns:**
- 使用 `logInfo`、`logWarn`、`logError` 或 `createScopedLogger`，来源为 `src/lib/logging/core.ts`。
- 需要 requestId、projectId、taskId、provider 等上下文时使用 `createScopedLogger` 或 `withLogContext`：`src/lib/api-errors.ts`、`scripts/watchdog.ts`。
- 日志事件会 JSON 序列化、脱敏并写全局/项目日志；脱敏逻辑在 `src/lib/logging/redact.ts`，配置在 `src/lib/logging/config.ts`。
- 直接 `console.*` 只允许在日志核心和少数 guard allowlist 中出现；新增业务代码不得直接使用 `console.*`：`scripts/check-no-console.ts`。
- API 请求开始、结束、错误和用户生成类操作审计由 `apiHandler` 统一记录：`src/lib/api-errors.ts`。
- 测试中 mock 日志模块以降低噪声：`tests/unit/novel-promotion/use-tts-generation.test.ts`、`tests/unit/worker/shared.direct-run-events.test.ts`。

## Comments

**When to Comment:**
- 注释用于解释领域规则、缓存一致性或 guard 意图，而不是重复代码动作：`src/lib/query/keys.ts`、`src/lib/query/client.ts`。
- API 和 auth helper 中允许中文段落注释说明安全边界和用法：`src/lib/api-auth.ts`。
- 复杂异步行为和乐观更新中的注释应解释为什么等待或回滚：`src/lib/query/mutations/location-management-mutations.ts`、`src/lib/query/mutations/character-base-mutations.ts`。

**JSDoc/TSDoc:**
- 公共 helper 和 auth API 使用 TSDoc 描述参数、返回和示例：`src/lib/api-auth.ts`。
- Query hooks 使用短注释区分查询、刷新、缓存用途：`src/lib/query/hooks/useProjectAssets.ts`。
- 大多数内部纯函数不使用 JSDoc；保持函数名和类型足够清晰。

## Function Design

**Size:** 
- 新增函数优先拆成输入读取、校验、转换、执行四类小函数；参考 `readString`、`normalizeStatuses`、`isActiveRunStatus` in `src/app/api/runs/route.ts`。
- 大型 route 或 UI 文件存在，但新增逻辑应放入领域 helper 或 hooks，避免继续膨胀 `src/app/api/user/api-config/route.ts` 这类长文件。

**Parameters:** 
- 参数对象用于多字段调用，尤其是 mutations 和服务函数：`requestJsonWithError(input, init, fallbackMessage)` in `src/lib/query/mutations/mutation-shared.ts`、`createRun({...})` in `src/app/api/runs/route.ts`。
- 输入参数使用 `unknown` 后显式解析，不直接信任 request body：`readProjectDraftBody` in `src/app/api/projects/route.ts`、`POST` in `src/app/api/runs/route.ts`。

**Return Values:** 
- API route 返回 `NextResponse.json(...)`，错误通过 throw 交给 `apiHandler`：`src/app/api/runs/route.ts`。
- Hooks 返回 React Query 原始结果加领域化 `data` 投影：`src/lib/query/hooks/useProjectAssets.ts`。
- Guard inspection 函数返回 violations 数组，CLI main 再决定 `process.exit`：`scripts/guards/api-route-contract-guard.mjs`、`scripts/guards/changed-file-test-impact-guard.mjs`。

## Module Design

**Exports:** 
- 领域模块优先命名导出；默认导出主要用于 Next/Vitest 配置或 global setup：`vitest.config.ts`、`tests/setup/global-setup.ts`。
- `src/lib/query/keys.ts` 集中导出 `queryKeys`，新增 React Query key 必须加到这里，不要在组件内手写分散 key。
- `src/lib/query/mutations/index.ts` 和 `src/lib/query/hooks/index.ts` 作为 query 层 barrel 文件；新增 hooks/mutations 时同步考虑导出。
- API 错误统一从 `src/lib/api-errors.ts` 导出 `apiHandler`、`ApiError`、`throwApiError`。

**Barrel Files:** 
- Query hooks/mutations 使用 barrel 文件：`src/lib/query/hooks/index.ts`、`src/lib/query/mutations/index.ts`。
- UI primitives 使用 barrel 文件：`src/components/ui/primitives/index.ts`。
- 图标使用统一入口：`src/components/ui/icons/index.ts`，配合 `eslint.config.mjs` 的 restricted import。

## React and Query Conventions

**Client Components:**
- 使用 React hooks 或浏览器 API 的文件必须保留 `'use client'`：`src/lib/query/hooks/useProjectAssets.ts`、`src/app/[locale]/workspace/[projectId]/page.tsx`。
- UI 状态放在组件目录内 hooks 中，领域数据访问放在 `src/lib/query/hooks` 和 `src/lib/query/mutations`。

**Query Hooks:**
- 查询 key 必须来自 `queryKeys`：`src/lib/query/keys.ts`。
- QueryClient 默认配置在 `src/lib/query/client.ts`，新增 query 不要局部重写 retry/staleTime，除非有明确领域原因。
- 项目资产统一经过 `useAssets` + `groupAssetsByKind` 投影到旧结构：`src/lib/query/hooks/useProjectAssets.ts`。

**Mutations:**
- mutation 文件按领域拆分在 `src/lib/query/mutations/`，使用 `useMutation` 和 `useQueryClient`。
- 需要缓存一致性时使用 `invalidateQueryTemplates`：`src/lib/query/mutations/mutation-shared.ts`。
- 乐观更新必须保存 previous cache，并在 `onError` 回滚：`src/lib/query/mutations/character-base-mutations.ts`、`src/lib/query/mutations/location-image-mutations.ts`。
- 异步任务类 mutation 使用 task target overlay 反映运行中状态：`upsertTaskTargetOverlay`、`clearTaskTargetOverlay` in `src/lib/query/task-target-overlay.ts`。

---

*Convention analysis: 2026-04-17*
