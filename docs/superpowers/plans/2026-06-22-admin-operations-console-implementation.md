# Admin Operations Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the phase-one admin operations console so only `admin` and `owner` users can enter it, while ordinary users cannot see or call admin surfaces.

**Architecture:** Add durable user roles and account status to Prisma, surface role/status through NextAuth, and centralize admin authorization in `src/lib/api-auth.ts`. Build read-only platform operations APIs and a localized `/[locale]/admin` dashboard shell that shows operational metadata only, with owner-only mutation paths for high-risk user/account actions and audit logs.

**Tech Stack:** Next.js 15 App Router, React 19, next-auth v4, next-intl, Prisma/MySQL, Vitest, Tailwind CSS v4.

---

## Scope

This plan implements phase one from `docs/superpowers/specs/2026-06-22-admin-operations-console-design.md`:

- `user / admin / owner` role model
- Account status needed for disabling/restoring users
- Admin-only navigation entry
- Server-side protection for `/[locale]/admin` and `/api/admin/**`
- Admin overview, users, billing, tasks, models, system health, and audit APIs
- Minimal operations console UI
- Admin audit logging
- Existing `/api/admin/download-logs` changed from "any signed-in user" to "admin/owner only"

This plan intentionally does not implement:

- User content review
- Viewing user story text, prompt payloads, generated images, videos, or audio
- Full user-group/product-plan/coupon systems
- Complex RBAC beyond `user / admin / owner`

## File Structure

### Data And Auth

- Modify: `prisma/schema.prisma`
  - Add `role` and `status` to `User`.
  - Add `AdminAuditLog` for high-risk operation traceability.
- Modify: `src/types/next-auth.d.ts`
  - Add `role` and `status` to `Session.user`, `User`, and `JWT`.
- Create: `src/lib/admin/roles.ts`
  - Central role/status constants and helpers.
- Create: `src/lib/admin/audit.ts`
  - Admin audit log writer.
- Modify: `src/lib/auth.ts`
  - Load role/status during credentials login.
  - Reject disabled users.
  - Store role/status in JWT/session.
- Modify: `src/lib/api-auth.ts`
  - Add `AdminSession`, `requireAdminAuth()`, and `requireOwnerAuth()`.

### Admin APIs

- Create: `src/lib/admin/redaction.ts`
  - Remove payload/result/media/prompt fields before returning task metadata.
- Create: `src/lib/admin/overview.ts`
  - Aggregates dashboard counts.
- Create: `src/lib/admin/users.ts`
  - User list and owner-only role/status updates.
- Create: `src/lib/admin/billing.ts`
  - Billing summary and transaction/freeze lists.
- Create: `src/lib/admin/tasks.ts`
  - Cross-user task metadata list and admin cancellation.
- Create: `src/lib/admin/models.ts`
  - Model/provider usage health from `UsageCost` and `Task` metadata.
- Create: `src/lib/admin/system-health.ts`
  - Database, Redis/queue, and log availability checks.
- Create: `src/app/api/admin/overview/route.ts`
- Create: `src/app/api/admin/users/route.ts`
- Create: `src/app/api/admin/users/[userId]/route.ts`
- Create: `src/app/api/admin/billing/route.ts`
- Create: `src/app/api/admin/tasks/route.ts`
- Create: `src/app/api/admin/tasks/[taskId]/route.ts`
- Create: `src/app/api/admin/models/route.ts`
- Create: `src/app/api/admin/system-health/route.ts`
- Create: `src/app/api/admin/audit-logs/route.ts`
- Modify: `src/app/api/admin/download-logs/route.ts`
  - Require admin role instead of ordinary user auth.

### Admin UI

- Modify: `src/components/Navbar.tsx`
  - Show `运营控制台` / `Operations` only for `admin` or `owner`.
  - Remove `下载日志` from ordinary user navigation.
- Modify: `messages/zh/nav.json`
- Modify: `messages/en/nav.json`
- Create: `messages/zh/admin.json`
- Create: `messages/en/admin.json`
- Create: `src/app/[locale]/admin/page.tsx`
  - Server-side admin gate.
- Create: `src/app/[locale]/admin/AdminConsoleClient.tsx`
  - Client-side operations dashboard shell.
- Create: `src/app/[locale]/admin/admin-api.ts`
  - Typed fetch helpers for admin APIs.
- Create: `src/app/[locale]/admin/types.ts`
  - Shared UI response types.

### Tests

- Modify: `tests/helpers/auth.ts`
  - Mock `requireAdminAuth()` and `requireOwnerAuth()`.
- Create: `tests/unit/admin/roles.test.ts`
- Create: `tests/unit/admin/redaction.test.ts`
- Create: `tests/unit/admin/audit.test.ts`
- Modify: `tests/unit/components/navbar-download-logs.test.ts`
  - Rename describe text in place; assert ordinary users do not see logs/admin, admins see console.
- Modify: `tests/integration/api/contract/infra-routes.test.ts`
  - Update `/api/admin/download-logs` expectations to require admin auth.
- Create: `tests/integration/api/contract/admin-routes.test.ts`
  - Cover auth gating and privacy of admin endpoints.

---

### Task 1: Add Role And Account Status Model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/admin/roles.ts`
- Create: `tests/unit/admin/roles.test.ts`

- [ ] **Step 1: Write role helper tests**

Create `tests/unit/admin/roles.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  ADMIN_ROLES,
  USER_STATUSES,
  isAdminRole,
  isOwnerRole,
  isActiveUserStatus,
  normalizeUserRole,
  normalizeUserStatus,
} from '@/lib/admin/roles'

describe('admin role helpers', () => {
  it('normalizes unknown roles to user', () => {
    expect(normalizeUserRole(null)).toBe(ADMIN_ROLES.USER)
    expect(normalizeUserRole('')).toBe(ADMIN_ROLES.USER)
    expect(normalizeUserRole('weird')).toBe(ADMIN_ROLES.USER)
  })

  it('recognizes admin and owner roles', () => {
    expect(isAdminRole(ADMIN_ROLES.USER)).toBe(false)
    expect(isAdminRole(ADMIN_ROLES.ADMIN)).toBe(true)
    expect(isAdminRole(ADMIN_ROLES.OWNER)).toBe(true)
    expect(isOwnerRole(ADMIN_ROLES.ADMIN)).toBe(false)
    expect(isOwnerRole(ADMIN_ROLES.OWNER)).toBe(true)
  })

  it('normalizes account status and detects active users', () => {
    expect(normalizeUserStatus(null)).toBe(USER_STATUSES.ACTIVE)
    expect(normalizeUserStatus('disabled')).toBe(USER_STATUSES.DISABLED)
    expect(normalizeUserStatus('unknown')).toBe(USER_STATUSES.ACTIVE)
    expect(isActiveUserStatus(USER_STATUSES.ACTIVE)).toBe(true)
    expect(isActiveUserStatus(USER_STATUSES.DISABLED)).toBe(false)
  })
})
```

- [ ] **Step 2: Run role helper test to verify it fails**

Run:

```bash
npm test -- tests/unit/admin/roles.test.ts
```

Expected: FAIL because `src/lib/admin/roles.ts` does not exist.

- [ ] **Step 3: Add role/status helpers**

Create `src/lib/admin/roles.ts`:

```ts
export const ADMIN_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  OWNER: 'owner',
} as const

export type AdminRole = (typeof ADMIN_ROLES)[keyof typeof ADMIN_ROLES]

export const USER_STATUSES = {
  ACTIVE: 'active',
  DISABLED: 'disabled',
} as const

export type UserStatus = (typeof USER_STATUSES)[keyof typeof USER_STATUSES]

const ROLE_VALUES = new Set<string>(Object.values(ADMIN_ROLES))
const STATUS_VALUES = new Set<string>(Object.values(USER_STATUSES))

export function normalizeUserRole(value: unknown): AdminRole {
  return typeof value === 'string' && ROLE_VALUES.has(value)
    ? (value as AdminRole)
    : ADMIN_ROLES.USER
}

export function normalizeUserStatus(value: unknown): UserStatus {
  return typeof value === 'string' && STATUS_VALUES.has(value)
    ? (value as UserStatus)
    : USER_STATUSES.ACTIVE
}

export function isAdminRole(value: unknown): boolean {
  const role = normalizeUserRole(value)
  return role === ADMIN_ROLES.ADMIN || role === ADMIN_ROLES.OWNER
}

export function isOwnerRole(value: unknown): boolean {
  return normalizeUserRole(value) === ADMIN_ROLES.OWNER
}

export function isActiveUserStatus(value: unknown): boolean {
  return normalizeUserStatus(value) === USER_STATUSES.ACTIVE
}
```

- [ ] **Step 4: Update Prisma schema**

In `prisma/schema.prisma`, update `User`:

```prisma
model User {
  id            String          @id @default(uuid())
  name          String          @unique(map: "User_name_key")
  email         String?
  emailVerified DateTime?
  image         String?
  password      String?
  role          String          @default("user")
  status        String          @default("active")
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @default(now()) @updatedAt
  accounts      Account[]
  projects      Project[]
  sessions      Session[]
  usageCosts    UsageCost[]
  balance       UserBalance?
  preferences   UserPreference?

  // 资产中心
  globalAssetFolders GlobalAssetFolder[]
  globalCharacters   GlobalCharacter[]
  globalLocations    GlobalLocation[]
  globalStyles       GlobalStyle[]
  globalVoices       GlobalVoice[]
  tasks              Task[]
  taskEvents         TaskEvent[]
  graphRuns          GraphRun[]
  graphEvents        GraphEvent[]

  @@index([role])
  @@index([status])
  @@map("user")
}
```

Add `AdminAuditLog` after `User`:

```prisma
model AdminAuditLog {
  id              String   @id @default(uuid())
  actorUserId     String
  actorRole       String
  action          String
  targetType      String
  targetId        String?
  beforeJson      Json?
  afterJson       Json?
  reason          String?  @db.Text
  ip              String?  @db.VarChar(128)
  userAgent       String?  @db.Text
  createdAt       DateTime @default(now())

  @@index([actorUserId])
  @@index([actorRole])
  @@index([action])
  @@index([targetType, targetId])
  @@index([createdAt])
  @@map("admin_audit_logs")
}
```

- [ ] **Step 5: Generate Prisma client**

Run:

```bash
npx prisma generate
```

Expected: exits 0 and regenerates Prisma client.

- [ ] **Step 6: Run role helper test**

Run:

```bash
npm test -- tests/unit/admin/roles.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/lib/admin/roles.ts tests/unit/admin/roles.test.ts
git commit -m "feat: add admin role model"
```

---

### Task 2: Propagate Role And Status Through Auth

**Files:**
- Modify: `src/types/next-auth.d.ts`
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/api-auth.ts`
- Test: `tests/unit/admin/roles.test.ts`

- [ ] **Step 1: Update NextAuth types**

Modify `src/types/next-auth.d.ts`:

```ts
import type { AdminRole, UserStatus } from '@/lib/admin/roles'

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      image?: string | null
      role?: AdminRole
      status?: UserStatus
    }
  }

  interface User {
    id: string
    name?: string | null
    image?: string | null
    role?: AdminRole
    status?: UserStatus
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role?: AdminRole
    status?: UserStatus
  }
}
```

- [ ] **Step 2: Update auth callback logic**

Modify `src/lib/auth.ts`:

```ts
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { logAuthAction } from './logging/semantic'
import { prisma } from './prisma'
import { normalizeUserRole, normalizeUserStatus, isActiveUserStatus } from '@/lib/admin/roles'
```

Inside `authorize`, after the password check and before success logging:

```ts
const status = normalizeUserStatus(user.status)
if (!isActiveUserStatus(status)) {
  logAuthAction('LOGIN', user.name, { userId: user.id, error: 'User disabled' })
  return null
}

const role = normalizeUserRole(user.role)
```

Return:

```ts
return {
  id: user.id,
  name: user.name,
  role,
  status,
}
```

Update callbacks:

```ts
async jwt({ token, user }: any) {
  if (user) {
    token.id = user.id
    token.role = normalizeUserRole(user.role)
    token.status = normalizeUserStatus(user.status)
  }
  return token
},
async session({ session, token }: any) {
  if (token && session.user) {
    session.user.id = token.id as string
    session.user.role = normalizeUserRole(token.role)
    session.user.status = normalizeUserStatus(token.status)
  }
  return session
}
```

- [ ] **Step 3: Expand API auth session type**

Modify `src/lib/api-auth.ts` imports:

```ts
import {
    ADMIN_ROLES,
    USER_STATUSES,
    isAdminRole,
    isActiveUserStatus,
    isOwnerRole,
    normalizeUserRole,
    normalizeUserStatus,
    type AdminRole,
    type UserStatus,
} from '@/lib/admin/roles'
```

Update `AuthSession`:

```ts
export interface AuthSession {
    user: {
        id: string
        name?: string | null
        email?: string | null
        role?: AdminRole
        status?: UserStatus
    }
}
```

Add after `requireUserAuth()`:

```ts
export interface AdminSession extends AuthSession {
    user: AuthSession['user'] & {
        role: typeof ADMIN_ROLES.ADMIN | typeof ADMIN_ROLES.OWNER
        status: typeof USER_STATUSES.ACTIVE
    }
}

async function resolveLiveUserAccess(session: AuthSession) {
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, name: true, email: true, role: true, status: true },
    })
    if (!user) return null
    return {
        ...user,
        role: normalizeUserRole(user.role),
        status: normalizeUserStatus(user.status),
    }
}

export async function requireAdminAuth(): Promise<{ session: AdminSession } | NextResponse> {
    const session = await getAuthSession()
    if (!session?.user?.id) {
        return unauthorized()
    }

    const liveUser = await resolveLiveUserAccess(session)
    if (!liveUser || !isActiveUserStatus(liveUser.status)) {
        return forbidden()
    }
    if (!isAdminRole(liveUser.role)) {
        return forbidden()
    }

    const adminSession: AdminSession = {
        user: {
            id: liveUser.id,
            name: liveUser.name,
            email: liveUser.email,
            role: liveUser.role,
            status: liveUser.status,
        },
    }
    bindAuthLogContext(adminSession)
    return { session: adminSession }
}

export async function requireOwnerAuth(): Promise<{ session: AdminSession } | NextResponse> {
    const authResult = await requireAdminAuth()
    if (authResult instanceof NextResponse) return authResult
    if (!isOwnerRole(authResult.session.user.role)) {
        return forbidden()
    }
    return authResult
}
```

- [ ] **Step 4: Typecheck**

Run:

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/types/next-auth.d.ts src/lib/auth.ts src/lib/api-auth.ts
git commit -m "feat: enforce admin auth roles"
```

---

### Task 3: Add Admin Audit Logging

**Files:**
- Create: `src/lib/admin/audit.ts`
- Create: `tests/unit/admin/audit.test.ts`

- [ ] **Step 1: Write audit tests**

Create `tests/unit/admin/audit.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  adminAuditLog: {
    create: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

describe('admin audit logging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes an audit log with normalized fields', async () => {
    const { writeAdminAuditLog } = await import('@/lib/admin/audit')
    await writeAdminAuditLog({
      actor: { id: 'owner-1', role: 'owner' },
      action: 'user.status.update',
      targetType: 'user',
      targetId: 'user-1',
      before: { status: 'active' },
      after: { status: 'disabled' },
      reason: 'billing abuse',
      ip: '127.0.0.1',
      userAgent: 'vitest',
    })

    expect(prismaMock.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'owner-1',
        actorRole: 'owner',
        action: 'user.status.update',
        targetType: 'user',
        targetId: 'user-1',
        beforeJson: { status: 'active' },
        afterJson: { status: 'disabled' },
        reason: 'billing abuse',
        ip: '127.0.0.1',
        userAgent: 'vitest',
      },
    })
  })
})
```

- [ ] **Step 2: Run audit test to verify it fails**

Run:

```bash
npm test -- tests/unit/admin/audit.test.ts
```

Expected: FAIL because `src/lib/admin/audit.ts` does not exist.

- [ ] **Step 3: Implement audit writer**

Create `src/lib/admin/audit.ts`:

```ts
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { normalizeUserRole, type AdminRole } from '@/lib/admin/roles'

type JsonObject = Record<string, unknown>

export interface AdminAuditInput {
  actor: {
    id: string
    role: AdminRole | string
  }
  action: string
  targetType: string
  targetId?: string | null
  before?: JsonObject | null
  after?: JsonObject | null
  reason?: string | null
  ip?: string | null
  userAgent?: string | null
}

function toJson(value: JsonObject | null | undefined) {
  if (value === undefined || value === null) return Prisma.JsonNull
  return value as Prisma.InputJsonValue
}

function normalizeOptionalText(value: string | null | undefined) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || null
}

export async function writeAdminAuditLog(input: AdminAuditInput) {
  return await prisma.adminAuditLog.create({
    data: {
      actorUserId: input.actor.id,
      actorRole: normalizeUserRole(input.actor.role),
      action: input.action,
      targetType: input.targetType,
      targetId: normalizeOptionalText(input.targetId),
      beforeJson: toJson(input.before),
      afterJson: toJson(input.after),
      reason: normalizeOptionalText(input.reason),
      ip: normalizeOptionalText(input.ip),
      userAgent: normalizeOptionalText(input.userAgent),
    },
  })
}
```

- [ ] **Step 4: Run audit test**

Run:

```bash
npm test -- tests/unit/admin/audit.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/audit.ts tests/unit/admin/audit.test.ts
git commit -m "feat: add admin audit logging"
```

---

### Task 4: Hide Admin Entry From Ordinary Users And Protect Log Download

**Files:**
- Modify: `src/components/Navbar.tsx`
- Modify: `messages/zh/nav.json`
- Modify: `messages/en/nav.json`
- Modify: `src/app/api/admin/download-logs/route.ts`
- Modify: `tests/unit/components/navbar-download-logs.test.ts`
- Modify: `tests/integration/api/contract/infra-routes.test.ts`

- [ ] **Step 1: Update Navbar tests**

Replace `tests/unit/components/navbar-download-logs.test.ts` content with:

```ts
import * as React from 'react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import Navbar from '@/components/Navbar'

const useSessionMock = vi.fn()

vi.mock('next-auth/react', () => ({
  useSession: () => useSessionMock(),
}))

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: { alt: string } & Record<string, unknown>) => createElement('img', { alt, ...props }),
}))

vi.mock('@/components/LanguageSwitcher', () => ({
  default: () => createElement('div', null, 'LanguageSwitcher'),
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string | { pathname: string }
    children: React.ReactNode
  } & Record<string, unknown>) => {
    const resolvedHref = typeof href === 'string' ? href : href.pathname
    return createElement('a', { href: resolvedHref, ...props }, children)
  },
}))

const messages = {
  nav: {
    workspace: '工作区',
    assetHub: '资产中心',
    profile: '设置中心',
    adminConsole: '运营控制台',
    downloadLogs: '下载日志',
    signin: '登录',
    signup: '注册',
  },
  common: {
    appName: 'director',
  },
} as const

const renderWithIntl = (node: ReactElement) => {
  const providerProps: ComponentProps<typeof NextIntlClientProvider> = {
    locale: 'zh',
    messages: messages as unknown as AbstractIntlMessages,
    timeZone: 'Asia/Shanghai',
    children: node,
  }

  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, providerProps),
  )
}

describe('Navbar admin entry', () => {
  beforeEach(() => {
    useSessionMock.mockReset()
  })

  it('does not render admin controls for ordinary signed-in users', () => {
    Reflect.set(globalThis, 'React', React)
    useSessionMock.mockReturnValue({
      data: { user: { name: 'Earth', role: 'user' } },
      status: 'authenticated',
    })

    const html = renderWithIntl(createElement(Navbar))

    expect(html).toContain('工作区')
    expect(html).not.toContain('运营控制台')
    expect(html).not.toContain('下载日志')
    expect(html).not.toContain('/api/admin/download-logs')
  })

  it('renders the admin console entry for admin users', () => {
    Reflect.set(globalThis, 'React', React)
    useSessionMock.mockReturnValue({
      data: { user: { name: 'Admin', role: 'admin' } },
      status: 'authenticated',
    })

    const html = renderWithIntl(createElement(Navbar))

    expect(html).toContain('运营控制台')
    expect(html).toContain('href="/admin"')
    expect(html).not.toContain('/api/admin/download-logs')
  })

  it('renders the admin console entry for owner users', () => {
    Reflect.set(globalThis, 'React', React)
    useSessionMock.mockReturnValue({
      data: { user: { name: 'Owner', role: 'owner' } },
      status: 'authenticated',
    })

    const html = renderWithIntl(createElement(Navbar))

    expect(html).toContain('运营控制台')
    expect(html).toContain('href="/admin"')
  })

  it('does not render admin controls for signed-out users', () => {
    Reflect.set(globalThis, 'React', React)
    useSessionMock.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    })

    const html = renderWithIntl(createElement(Navbar))

    expect(html).not.toContain('运营控制台')
    expect(html).not.toContain('下载日志')
    expect(html).not.toContain('/api/admin/download-logs')
  })
})
```

- [ ] **Step 2: Run Navbar test to verify it fails**

Run:

```bash
npm test -- tests/unit/components/navbar-download-logs.test.ts
```

Expected: FAIL because `Navbar` still shows log download to signed-in users and lacks `adminConsole` nav text.

- [ ] **Step 3: Update translations**

Modify `messages/zh/nav.json`:

```json
{
  "workspace": "工作区",
  "assetHub": "资产中心",
  "profile": "设置中心",
  "adminConsole": "运营控制台",
  "downloadLogs": "下载日志",
  "signin": "登录",
  "signup": "注册",
  "logout": "退出登录"
}
```

Modify `messages/en/nav.json`:

```json
{
  "workspace": "Workspace",
  "assetHub": "Asset Hub",
  "profile": "Settings",
  "adminConsole": "Operations",
  "downloadLogs": "Download Logs",
  "signin": "Sign In",
  "signup": "Sign Up",
  "logout": "Logout"
}
```

- [ ] **Step 4: Update Navbar implementation**

In `src/components/Navbar.tsx`, remove `downloadLogsHref` and import `isAdminRole`:

```ts
import { isAdminRole } from '@/lib/admin/roles'
```

Inside the component:

```ts
const canAccessAdmin = isAdminRole(session?.user?.role)
```

In the authenticated link group, replace the download log `<a>` with:

```tsx
{canAccessAdmin && (
  <Link
    href={{ pathname: '/admin' }}
    className="text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors flex items-center gap-1"
  >
    <AppIcon name="settingsHexAlt" className="w-4 h-4" />
    {t('adminConsole')}
  </Link>
)}
```

- [ ] **Step 5: Update log download API to require admin**

Modify `src/app/api/admin/download-logs/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireAdminAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { readAllLogs } from '@/lib/logging/file-writer'

export const dynamic = 'force-dynamic'

export const GET = apiHandler(async () => {
    const authResult = await requireAdminAuth()
    if (isErrorResponse(authResult)) return authResult

    const logs = await readAllLogs()
    if (!logs) {
        return NextResponse.json({ error: 'No logs available' }, { status: 404 })
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `director-logs-${timestamp}.txt`

    return new NextResponse(logs, {
        status: 200,
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
        },
    })
})
```

- [ ] **Step 6: Update infra route test auth mock**

In `tests/integration/api/contract/infra-routes.test.ts`, replace `authState` with:

```ts
const authState = vi.hoisted(() => ({
  mode: 'unauthenticated' as 'unauthenticated' | 'user' | 'admin',
}))
```

Update `vi.mock('@/lib/api-auth', ...)` to include:

```ts
const forbidden = () => new Response(
  JSON.stringify({ error: { code: 'FORBIDDEN' } }),
  { status: 403, headers: { 'content-type': 'application/json' } },
)

return {
  isErrorResponse: (value: unknown) => value instanceof Response,
  requireUserAuth: async () => {
    if (authState.mode === 'unauthenticated') return unauthorized()
    return { session: { user: { id: 'user-1' } } }
  },
  requireAdminAuth: async () => {
    if (authState.mode === 'unauthenticated') return unauthorized()
    if (authState.mode !== 'admin') return forbidden()
    return { session: { user: { id: 'admin-1', role: 'admin', status: 'active' } } }
  },
}
```

Update `beforeEach`:

```ts
authState.mode = 'unauthenticated'
```

Replace download log tests:

```ts
it('GET /api/admin/download-logs rejects unauthenticated requests', async () => {
  const mod = await import('@/app/api/admin/download-logs/route')
  const req = buildMockRequest({
    path: '/api/admin/download-logs',
    method: 'GET',
  })

  const res = await mod.GET(req, { params: Promise.resolve({}) })
  expect(res.status).toBe(401)
  expect(loggingMock.readAllLogs).not.toHaveBeenCalled()
})

it('GET /api/admin/download-logs rejects ordinary users', async () => {
  authState.mode = 'user'
  const mod = await import('@/app/api/admin/download-logs/route')
  const req = buildMockRequest({
    path: '/api/admin/download-logs',
    method: 'GET',
  })

  const res = await mod.GET(req, { params: Promise.resolve({}) })
  expect(res.status).toBe(403)
  expect(loggingMock.readAllLogs).not.toHaveBeenCalled()
})

it('GET /api/admin/download-logs returns attachment headers for admins', async () => {
  authState.mode = 'admin'
  const mod = await import('@/app/api/admin/download-logs/route')
  const req = buildMockRequest({
    path: '/api/admin/download-logs',
    method: 'GET',
  })

  const res = await mod.GET(req, { params: Promise.resolve({}) })
  const text = await res.text()

  expect(res.status).toBe(200)
  expect(text).toContain('worker log line 1')
  expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
  expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="director-logs-/)
})
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm test -- tests/unit/components/navbar-download-logs.test.ts tests/integration/api/contract/infra-routes.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/Navbar.tsx messages/zh/nav.json messages/en/nav.json src/app/api/admin/download-logs/route.ts tests/unit/components/navbar-download-logs.test.ts tests/integration/api/contract/infra-routes.test.ts
git commit -m "feat: gate admin navigation and logs"
```

---

### Task 5: Add Redaction And Admin Data Services

**Files:**
- Create: `src/lib/admin/redaction.ts`
- Create: `src/lib/admin/overview.ts`
- Create: `src/lib/admin/users.ts`
- Create: `src/lib/admin/billing.ts`
- Create: `src/lib/admin/tasks.ts`
- Create: `src/lib/admin/models.ts`
- Create: `src/lib/admin/system-health.ts`
- Create: `tests/unit/admin/redaction.test.ts`

- [ ] **Step 1: Write redaction tests**

Create `tests/unit/admin/redaction.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { redactTaskForAdmin } from '@/lib/admin/redaction'

describe('admin task redaction', () => {
  it('removes payload and result content from task metadata', () => {
    const redacted = redactTaskForAdmin({
      id: 'task-1',
      userId: 'user-1',
      projectId: 'project-1',
      type: 'generate-video',
      targetType: 'panel',
      targetId: 'panel-1',
      status: 'failed',
      progress: 10,
      attempt: 1,
      maxAttempts: 5,
      priority: 0,
      dedupeKey: 'secret-dedupe',
      externalId: null,
      payload: {
        prompt: 'private prompt',
        imageUrl: 'https://private.example/image.png',
      },
      result: {
        videoUrl: 'https://private.example/video.mp4',
      },
      errorCode: 'MODEL_FAILED',
      errorMessage: 'provider failed with api_key=secret',
      billingInfo: { billable: true, model: 'model-a' },
      billedAt: null,
      queuedAt: new Date('2026-06-22T00:00:00Z'),
      startedAt: null,
      finishedAt: null,
      heartbeatAt: null,
      enqueuedAt: null,
      enqueueAttempts: 0,
      lastEnqueueError: null,
      createdAt: new Date('2026-06-22T00:00:00Z'),
      updatedAt: new Date('2026-06-22T00:00:00Z'),
    })

    expect(redacted).not.toHaveProperty('payload')
    expect(redacted).not.toHaveProperty('result')
    expect(redacted).not.toHaveProperty('dedupeKey')
    expect(JSON.stringify(redacted)).not.toContain('private prompt')
    expect(JSON.stringify(redacted)).not.toContain('private.example')
    expect(redacted.billingModel).toBe('model-a')
  })
})
```

- [ ] **Step 2: Run redaction test to verify it fails**

Run:

```bash
npm test -- tests/unit/admin/redaction.test.ts
```

Expected: FAIL because `src/lib/admin/redaction.ts` does not exist.

- [ ] **Step 3: Implement redaction helpers**

Create `src/lib/admin/redaction.ts`:

```ts
type TaskLike = Record<string, unknown>

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function maskSecretText(value: unknown): string | null {
  const text = readString(value)
  if (!text) return null
  return text
    .replace(/api[_-]?key\s*[:=]\s*[^,\s;]+/gi, 'api_key=[redacted]')
    .replace(/bearer\s+[a-z0-9._-]+/gi, 'Bearer [redacted]')
}

export function extractBillingModel(billingInfo: unknown): string | null {
  const info = toObject(billingInfo)
  return readString(info.model) || readString(info.modelKey) || null
}

export function redactTaskForAdmin<T extends TaskLike>(task: T) {
  const {
    payload: _payload,
    result: _result,
    dedupeKey: _dedupeKey,
    billingInfo,
    errorMessage,
    lastEnqueueError,
    ...safeTask
  } = task

  return {
    ...safeTask,
    errorMessage: maskSecretText(errorMessage),
    lastEnqueueError: maskSecretText(lastEnqueueError),
    billingModel: extractBillingModel(billingInfo),
    hasPayload: task.payload !== null && task.payload !== undefined,
    hasResult: task.result !== null && task.result !== undefined,
  }
}
```

- [ ] **Step 4: Implement admin overview service**

Create `src/lib/admin/overview.ts`:

```ts
import { prisma } from '@/lib/prisma'

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

export async function getAdminOverview() {
  const today = startOfToday()
  const [
    totalUsers,
    newUsersToday,
    tasksToday,
    failedTasks,
    queuedTasks,
    runningTasks,
    usageToday,
    balanceTotal,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: today } } }),
    prisma.task.count({ where: { createdAt: { gte: today } } }),
    prisma.task.count({ where: { status: 'failed' } }),
    prisma.task.count({ where: { status: 'queued' } }),
    prisma.task.count({ where: { status: 'processing' } }),
    prisma.usageCost.aggregate({
      where: { createdAt: { gte: today } },
      _sum: { cost: true },
    }),
    prisma.userBalance.aggregate({
      _sum: {
        balance: true,
        frozenAmount: true,
        totalSpent: true,
      },
    }),
  ])

  return {
    totalUsers,
    newUsersToday,
    tasksToday,
    failedTasks,
    queuedTasks,
    runningTasks,
    usageCostToday: usageToday._sum.cost?.toString() ?? '0',
    totalBalance: balanceTotal._sum.balance?.toString() ?? '0',
    totalFrozen: balanceTotal._sum.frozenAmount?.toString() ?? '0',
    totalSpent: balanceTotal._sum.totalSpent?.toString() ?? '0',
  }
}
```

- [ ] **Step 5: Implement admin users service**

Create `src/lib/admin/users.ts`:

```ts
import { prisma } from '@/lib/prisma'
import { normalizeUserRole, normalizeUserStatus, type AdminRole, type UserStatus } from '@/lib/admin/roles'

export async function listAdminUsers(params: {
  search?: string
  role?: AdminRole
  status?: UserStatus
  page?: number
  pageSize?: number
}) {
  const page = Math.max(1, params.page || 1)
  const pageSize = Math.min(Math.max(params.pageSize || 20, 1), 100)
  const where = {
    ...(params.search
      ? {
        OR: [
          { name: { contains: params.search } },
          { email: { contains: params.search } },
          { id: params.search },
        ],
      }
      : {}),
    ...(params.role ? { role: normalizeUserRole(params.role) } : {}),
    ...(params.status ? { status: normalizeUserStatus(params.status) } : {}),
  }

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        balance: {
          select: {
            balance: true,
            frozenAmount: true,
            totalSpent: true,
          },
        },
        _count: {
          select: {
            projects: true,
            tasks: true,
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ])

  return {
    items: items.map((user) => ({
      ...user,
      role: normalizeUserRole(user.role),
      status: normalizeUserStatus(user.status),
      balance: user.balance
        ? {
          balance: user.balance.balance.toString(),
          frozenAmount: user.balance.frozenAmount.toString(),
          totalSpent: user.balance.totalSpent.toString(),
        }
        : null,
    })),
    total,
    page,
    pageSize,
  }
}

export async function updateAdminUserAccess(userId: string, data: {
  role?: AdminRole
  status?: UserStatus
}) {
  return await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.role ? { role: normalizeUserRole(data.role) } : {}),
      ...(data.status ? { status: normalizeUserStatus(data.status) } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      updatedAt: true,
    },
  })
}
```

- [ ] **Step 6: Implement billing, tasks, models, and system health services**

Create `src/lib/admin/billing.ts`:

```ts
import { prisma } from '@/lib/prisma'

export async function getAdminBillingSummary(params: { page?: number; pageSize?: number }) {
  const page = Math.max(1, params.page || 1)
  const pageSize = Math.min(Math.max(params.pageSize || 20, 1), 100)
  const [balance, transactions, totalTransactions, freezes] = await Promise.all([
    prisma.userBalance.aggregate({
      _sum: { balance: true, frozenAmount: true, totalSpent: true },
    }),
    prisma.balanceTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        userId: true,
        type: true,
        amount: true,
        balanceAfter: true,
        description: true,
        relatedId: true,
        freezeId: true,
        operatorId: true,
        projectId: true,
        episodeId: true,
        taskType: true,
        createdAt: true,
      },
    }),
    prisma.balanceTransaction.count(),
    prisma.balanceFreeze.groupBy({
      by: ['status'],
      _count: { id: true },
      _sum: { amount: true },
    }),
  ])

  return {
    totals: {
      balance: balance._sum.balance?.toString() ?? '0',
      frozenAmount: balance._sum.frozenAmount?.toString() ?? '0',
      totalSpent: balance._sum.totalSpent?.toString() ?? '0',
    },
    freezes: freezes.map((item) => ({
      status: item.status,
      count: item._count.id,
      amount: item._sum.amount?.toString() ?? '0',
    })),
    transactions: transactions.map((item) => ({
      ...item,
      amount: item.amount.toString(),
      balanceAfter: item.balanceAfter.toString(),
    })),
    totalTransactions,
    page,
    pageSize,
  }
}
```

Create `src/lib/admin/tasks.ts`:

```ts
import { prisma } from '@/lib/prisma'
import { redactTaskForAdmin } from '@/lib/admin/redaction'
import { cancelTask } from '@/lib/task/service'
import { removeTaskJob } from '@/lib/task/queues'
import type { TaskStatus } from '@/lib/task/types'

export async function listAdminTasks(params: {
  status?: TaskStatus[]
  type?: string[]
  userId?: string
  projectId?: string
  page?: number
  pageSize?: number
}) {
  const page = Math.max(1, params.page || 1)
  const pageSize = Math.min(Math.max(params.pageSize || 50, 1), 200)
  const where = {
    ...(params.userId ? { userId: params.userId } : {}),
    ...(params.projectId ? { projectId: params.projectId } : {}),
    ...(params.status?.length ? { status: { in: params.status } } : {}),
    ...(params.type?.length ? { type: { in: params.type } } : {}),
  }
  const [items, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.task.count({ where }),
  ])
  return {
    items: items.map(redactTaskForAdmin),
    total,
    page,
    pageSize,
  }
}

export async function cancelAdminTask(taskId: string, reason: string) {
  const result = await cancelTask(taskId, reason || 'Task cancelled by admin')
  if (result.cancelled) {
    await removeTaskJob(taskId).catch(() => false)
  }
  return {
    cancelled: result.cancelled,
    task: result.task ? redactTaskForAdmin(result.task) : null,
  }
}
```

Create `src/lib/admin/models.ts`:

```ts
import { prisma } from '@/lib/prisma'

export async function getAdminModelHealth() {
  const [usageByModel, failuresByType] = await Promise.all([
    prisma.usageCost.groupBy({
      by: ['apiType', 'model'],
      _count: { id: true },
      _sum: { cost: true, quantity: true },
      orderBy: { _count: { id: 'desc' } },
      take: 100,
    }),
    prisma.task.groupBy({
      by: ['type', 'status'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 100,
    }),
  ])

  return {
    usageByModel: usageByModel.map((item) => ({
      apiType: item.apiType,
      model: item.model,
      calls: item._count.id,
      quantity: item._sum.quantity ?? 0,
      cost: item._sum.cost?.toString() ?? '0',
    })),
    taskHealthByType: failuresByType.map((item) => ({
      type: item.type,
      status: item.status,
      count: item._count.id,
    })),
  }
}
```

Create `src/lib/admin/system-health.ts`:

```ts
import { prisma } from '@/lib/prisma'
import { readAllLogs } from '@/lib/logging/file-writer'

async function checkDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return { status: 'ok' as const }
  } catch (error) {
    return { status: 'error' as const, message: error instanceof Error ? error.message : 'database check failed' }
  }
}

async function checkLogs() {
  try {
    const logs = await readAllLogs()
    return { status: logs ? 'ok' as const : 'empty' as const }
  } catch (error) {
    return { status: 'error' as const, message: error instanceof Error ? error.message : 'log check failed' }
  }
}

export async function getAdminSystemHealth() {
  const [database, logs] = await Promise.all([
    checkDatabase(),
    checkLogs(),
  ])
  return {
    database,
    logs,
    checkedAt: new Date().toISOString(),
  }
}
```

- [ ] **Step 7: Run redaction test and typecheck**

Run:

```bash
npm test -- tests/unit/admin/redaction.test.ts
npm run typecheck
```

Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/admin/redaction.ts src/lib/admin/overview.ts src/lib/admin/users.ts src/lib/admin/billing.ts src/lib/admin/tasks.ts src/lib/admin/models.ts src/lib/admin/system-health.ts tests/unit/admin/redaction.test.ts
git commit -m "feat: add admin data services"
```

---

### Task 6: Add Admin API Routes

**Files:**
- Create: `src/app/api/admin/overview/route.ts`
- Create: `src/app/api/admin/users/route.ts`
- Create: `src/app/api/admin/users/[userId]/route.ts`
- Create: `src/app/api/admin/billing/route.ts`
- Create: `src/app/api/admin/tasks/route.ts`
- Create: `src/app/api/admin/tasks/[taskId]/route.ts`
- Create: `src/app/api/admin/models/route.ts`
- Create: `src/app/api/admin/system-health/route.ts`
- Create: `src/app/api/admin/audit-logs/route.ts`
- Modify: `tests/helpers/auth.ts`
- Create: `tests/integration/api/contract/admin-routes.test.ts`

- [ ] **Step 1: Add admin auth mocks**

Modify `tests/helpers/auth.ts`:

```ts
type SessionUser = {
  id: string
  name?: string | null
  email?: string | null
  role?: 'user' | 'admin' | 'owner'
  status?: 'active' | 'disabled'
}
```

Inside `installAuthMocks()`, add:

```ts
    requireAdminAuth: async () => {
      if (!state.session) return unauthorizedResponse()
      const role = state.session.user.role || 'user'
      const status = state.session.user.status || 'active'
      if (status !== 'active' || (role !== 'admin' && role !== 'owner')) return forbiddenResponse()
      return { session: state.session }
    },
    requireOwnerAuth: async () => {
      if (!state.session) return unauthorizedResponse()
      const role = state.session.user.role || 'user'
      const status = state.session.user.status || 'active'
      if (status !== 'active' || role !== 'owner') return forbiddenResponse()
      return { session: state.session }
    },
```

Add helper:

```ts
export function mockAuthenticatedRole(userId: string, role: 'user' | 'admin' | 'owner', status: 'active' | 'disabled' = 'active') {
  state = {
    ...state,
    session: {
      user: {
        ...defaultSession.user,
        id: userId,
        role,
        status,
      },
    },
  }
}
```

- [ ] **Step 2: Write admin API contract tests**

Create `tests/integration/api/contract/admin-routes.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installAuthMocks, mockAuthenticatedRole, mockUnauthenticated, resetAuthMockState } from '../../../helpers/auth'
import { buildMockRequest } from '../../../helpers/request'

const adminServices = vi.hoisted(() => ({
  overview: vi.fn(async () => ({ totalUsers: 1, failedTasks: 0 })),
  users: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20 })),
  billing: vi.fn(async () => ({ totals: { balance: '0', frozenAmount: '0', totalSpent: '0' }, transactions: [] })),
  tasks: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 50 })),
  models: vi.fn(async () => ({ usageByModel: [], taskHealthByType: [] })),
  systemHealth: vi.fn(async () => ({ database: { status: 'ok' }, logs: { status: 'ok' }, checkedAt: '2026-06-22T00:00:00.000Z' })),
}))

vi.mock('@/lib/admin/overview', () => ({ getAdminOverview: adminServices.overview }))
vi.mock('@/lib/admin/users', () => ({ listAdminUsers: adminServices.users, updateAdminUserAccess: vi.fn() }))
vi.mock('@/lib/admin/billing', () => ({ getAdminBillingSummary: adminServices.billing }))
vi.mock('@/lib/admin/tasks', () => ({ listAdminTasks: adminServices.tasks, cancelAdminTask: vi.fn() }))
vi.mock('@/lib/admin/models', () => ({ getAdminModelHealth: adminServices.models }))
vi.mock('@/lib/admin/system-health', () => ({ getAdminSystemHealth: adminServices.systemHealth }))
vi.mock('@/lib/admin/audit', () => ({ writeAdminAuditLog: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    adminAuditLog: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
  },
}))

describe('admin API routes', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resetAuthMockState()
    installAuthMocks()
  })

  it('rejects unauthenticated overview requests', async () => {
    mockUnauthenticated()
    const mod = await import('@/app/api/admin/overview/route')
    const res = await mod.GET(buildMockRequest({ path: '/api/admin/overview', method: 'GET' }), { params: Promise.resolve({}) })
    expect(res.status).toBe(401)
  })

  it('rejects ordinary users from overview requests', async () => {
    mockAuthenticatedRole('user-1', 'user')
    const mod = await import('@/app/api/admin/overview/route')
    const res = await mod.GET(buildMockRequest({ path: '/api/admin/overview', method: 'GET' }), { params: Promise.resolve({}) })
    expect(res.status).toBe(403)
  })

  it('allows admins to read overview metadata', async () => {
    mockAuthenticatedRole('admin-1', 'admin')
    const mod = await import('@/app/api/admin/overview/route')
    const res = await mod.GET(buildMockRequest({ path: '/api/admin/overview', method: 'GET' }), { params: Promise.resolve({}) })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.totalUsers).toBe(1)
  })

  it('allows admins to list task metadata without payloads', async () => {
    mockAuthenticatedRole('admin-1', 'admin')
    adminServices.tasks.mockResolvedValueOnce({
      items: [{ id: 'task-1', status: 'failed', hasPayload: true }],
      total: 1,
      page: 1,
      pageSize: 50,
    })
    const mod = await import('@/app/api/admin/tasks/route')
    const res = await mod.GET(buildMockRequest({ path: '/api/admin/tasks', method: 'GET' }), { params: Promise.resolve({}) })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(JSON.stringify(json)).not.toContain('prompt')
    expect(json.items[0].hasPayload).toBe(true)
  })
})
```

- [ ] **Step 3: Run admin API tests to verify they fail**

Run:

```bash
npm test -- tests/integration/api/contract/admin-routes.test.ts
```

Expected: FAIL because admin route files do not exist.

- [ ] **Step 4: Implement read-only admin routes**

Create `src/app/api/admin/overview/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireAdminAuth } from '@/lib/api-auth'
import { getAdminOverview } from '@/lib/admin/overview'

export const dynamic = 'force-dynamic'

export const GET = apiHandler(async () => {
  const authResult = await requireAdminAuth()
  if (isErrorResponse(authResult)) return authResult

  const data = await getAdminOverview()
  return NextResponse.json(data)
})
```

Create `src/app/api/admin/users/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireAdminAuth } from '@/lib/api-auth'
import { listAdminUsers } from '@/lib/admin/users'
import { normalizeUserRole, normalizeUserStatus } from '@/lib/admin/roles'

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value || '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, 1), max)
}

export const dynamic = 'force-dynamic'

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireAdminAuth()
  if (isErrorResponse(authResult)) return authResult

  const params = request.nextUrl.searchParams
  const role = params.get('role')
  const status = params.get('status')
  const data = await listAdminUsers({
    search: params.get('search') || undefined,
    role: role ? normalizeUserRole(role) : undefined,
    status: status ? normalizeUserStatus(status) : undefined,
    page: parsePositiveInt(params.get('page'), 1, 100000),
    pageSize: parsePositiveInt(params.get('pageSize'), 20, 100),
  })

  return NextResponse.json(data)
})
```

Create `src/app/api/admin/billing/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireAdminAuth } from '@/lib/api-auth'
import { getAdminBillingSummary } from '@/lib/admin/billing'

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value || '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, 1), max)
}

export const dynamic = 'force-dynamic'

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireAdminAuth()
  if (isErrorResponse(authResult)) return authResult

  const params = request.nextUrl.searchParams
  const data = await getAdminBillingSummary({
    page: parsePositiveInt(params.get('page'), 1, 100000),
    pageSize: parsePositiveInt(params.get('pageSize'), 20, 100),
  })

  return NextResponse.json(data)
})
```

Create `src/app/api/admin/tasks/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireAdminAuth } from '@/lib/api-auth'
import { listAdminTasks } from '@/lib/admin/tasks'
import type { TaskStatus } from '@/lib/task/types'

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value || '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, 1), max)
}

export const dynamic = 'force-dynamic'

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireAdminAuth()
  if (isErrorResponse(authResult)) return authResult

  const params = request.nextUrl.searchParams
  const data = await listAdminTasks({
    userId: params.get('userId') || undefined,
    projectId: params.get('projectId') || undefined,
    status: params.getAll('status') as TaskStatus[],
    type: params.getAll('type'),
    page: parsePositiveInt(params.get('page'), 1, 100000),
    pageSize: parsePositiveInt(params.get('pageSize'), 50, 200),
  })

  return NextResponse.json(data)
})
```

Create `src/app/api/admin/models/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireAdminAuth } from '@/lib/api-auth'
import { getAdminModelHealth } from '@/lib/admin/models'

export const dynamic = 'force-dynamic'

export const GET = apiHandler(async () => {
  const authResult = await requireAdminAuth()
  if (isErrorResponse(authResult)) return authResult

  const data = await getAdminModelHealth()
  return NextResponse.json(data)
})
```

Create `src/app/api/admin/system-health/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireAdminAuth } from '@/lib/api-auth'
import { getAdminSystemHealth } from '@/lib/admin/system-health'

export const dynamic = 'force-dynamic'

export const GET = apiHandler(async () => {
  const authResult = await requireAdminAuth()
  if (isErrorResponse(authResult)) return authResult

  const data = await getAdminSystemHealth()
  return NextResponse.json(data)
})
```

Create `src/app/api/admin/audit-logs/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireOwnerAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value || '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, 1), max)
}

export const dynamic = 'force-dynamic'

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireOwnerAuth()
  if (isErrorResponse(authResult)) return authResult

  const params = request.nextUrl.searchParams
  const page = parsePositiveInt(params.get('page'), 1, 100000)
  const pageSize = parsePositiveInt(params.get('pageSize'), 50, 100)
  const [items, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.adminAuditLog.count(),
  ])
  return NextResponse.json({ items, total, page, pageSize })
})
```

- [ ] **Step 4.5: Update route catalog for new admin routes**

Modify `tests/contracts/route-catalog.ts`:

1. Add `'admin'` to `RouteCategory`.
2. Add `'admin-routes'` to `RouteContractGroup`.
3. Add these route files to `ROUTE_FILES` near the existing admin download route:

```ts
  'src/app/api/admin/audit-logs/route.ts',
  'src/app/api/admin/billing/route.ts',
  'src/app/api/admin/models/route.ts',
  'src/app/api/admin/overview/route.ts',
  'src/app/api/admin/system-health/route.ts',
  'src/app/api/admin/tasks/[taskId]/route.ts',
  'src/app/api/admin/tasks/route.ts',
  'src/app/api/admin/users/[userId]/route.ts',
  'src/app/api/admin/users/route.ts',
```

4. At the top of `resolveCategory()`, before the existing asset checks, add:

```ts
  if (routeFile.startsWith('src/app/api/admin/')) return 'admin'
```

5. At the top of `resolveContractGroup()`, before generation-route checks, add:

```ts
  if (routeFile.startsWith('src/app/api/admin/')) return 'admin-routes'
```

- [ ] **Step 5: Implement owner-only user mutation route**

Create `src/app/api/admin/users/[userId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireOwnerAuth } from '@/lib/api-auth'
import { updateAdminUserAccess } from '@/lib/admin/users'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { normalizeUserRole, normalizeUserStatus } from '@/lib/admin/roles'

export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) => {
  const authResult = await requireOwnerAuth()
  if (isErrorResponse(authResult)) return authResult

  const { userId } = await context.params
  const body = await request.json().catch(() => null) as { role?: string; status?: string; reason?: string } | null
  if (!body) throw new ApiError('INVALID_PARAMS')

  const data = {
    ...(body.role ? { role: normalizeUserRole(body.role) } : {}),
    ...(body.status ? { status: normalizeUserStatus(body.status) } : {}),
  }
  if (!data.role && !data.status) throw new ApiError('INVALID_PARAMS')

  const updated = await updateAdminUserAccess(userId, data)
  await writeAdminAuditLog({
    actor: { id: authResult.session.user.id, role: authResult.session.user.role },
    action: 'user.access.update',
    targetType: 'user',
    targetId: userId,
    after: data,
    reason: body.reason || null,
  })

  return NextResponse.json({ user: updated })
})
```

Create `src/app/api/admin/tasks/[taskId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireAdminAuth } from '@/lib/api-auth'
import { cancelAdminTask } from '@/lib/admin/tasks'
import { writeAdminAuditLog } from '@/lib/admin/audit'

export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> },
) => {
  const authResult = await requireAdminAuth()
  if (isErrorResponse(authResult)) return authResult

  const { taskId } = await context.params
  const body = await request.json().catch(() => ({})) as { reason?: string }
  const result = await cancelAdminTask(taskId, body.reason || 'Task cancelled by admin')
  if (!result.task) throw new ApiError('NOT_FOUND')

  await writeAdminAuditLog({
    actor: { id: authResult.session.user.id, role: authResult.session.user.role },
    action: 'task.cancel',
    targetType: 'task',
    targetId: taskId,
    after: { cancelled: result.cancelled },
    reason: body.reason || null,
  })

  return NextResponse.json(result)
})
```

- [ ] **Step 6: Run admin route tests**

Run:

```bash
npm test -- tests/integration/api/contract/admin-routes.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/admin/overview/route.ts src/app/api/admin/users/route.ts src/app/api/admin/users/[userId]/route.ts src/app/api/admin/billing/route.ts src/app/api/admin/tasks/route.ts src/app/api/admin/tasks/[taskId]/route.ts src/app/api/admin/models/route.ts src/app/api/admin/system-health/route.ts src/app/api/admin/audit-logs/route.ts tests/helpers/auth.ts tests/integration/api/contract/admin-routes.test.ts
git commit -m "feat: add admin API routes"
```

---

### Task 7: Add Admin Console Page

**Files:**
- Create: `messages/zh/admin.json`
- Create: `messages/en/admin.json`
- Create: `src/app/[locale]/admin/types.ts`
- Create: `src/app/[locale]/admin/admin-api.ts`
- Create: `src/app/[locale]/admin/AdminConsoleClient.tsx`
- Create: `src/app/[locale]/admin/page.tsx`

- [ ] **Step 1: Add admin translation files**

Create `messages/zh/admin.json`:

```json
{
  "title": "运营控制台",
  "subtitle": "管理网站运行、计费、任务、模型和系统健康",
  "forbidden": "无权访问运营控制台",
  "tabs": {
    "overview": "运营总览",
    "users": "用户管理",
    "billing": "计费与余额",
    "tasks": "任务监控",
    "models": "模型与渠道",
    "system": "系统健康",
    "audit": "管理员审计"
  },
  "cards": {
    "totalUsers": "总用户",
    "newUsersToday": "今日新增",
    "tasksToday": "今日任务",
    "failedTasks": "失败任务",
    "queuedTasks": "排队任务",
    "runningTasks": "运行任务",
    "usageCostToday": "今日消耗",
    "totalBalance": "余额总量"
  },
  "actions": {
    "refresh": "刷新",
    "downloadLogs": "下载日志"
  },
  "empty": "暂无数据",
  "loading": "加载中...",
  "error": "加载失败"
}
```

Create `messages/en/admin.json`:

```json
{
  "title": "Operations Console",
  "subtitle": "Manage platform health, billing, tasks, models, and system status",
  "forbidden": "You do not have access to the operations console",
  "tabs": {
    "overview": "Overview",
    "users": "Users",
    "billing": "Billing",
    "tasks": "Tasks",
    "models": "Models",
    "system": "System",
    "audit": "Audit"
  },
  "cards": {
    "totalUsers": "Total Users",
    "newUsersToday": "New Today",
    "tasksToday": "Tasks Today",
    "failedTasks": "Failed Tasks",
    "queuedTasks": "Queued Tasks",
    "runningTasks": "Running Tasks",
    "usageCostToday": "Usage Today",
    "totalBalance": "Total Balance"
  },
  "actions": {
    "refresh": "Refresh",
    "downloadLogs": "Download Logs"
  },
  "empty": "No data",
  "loading": "Loading...",
  "error": "Failed to load"
}
```

- [ ] **Step 2: Add admin UI types**

Create `src/app/[locale]/admin/types.ts`:

```ts
export interface AdminOverviewResponse {
  totalUsers: number
  newUsersToday: number
  tasksToday: number
  failedTasks: number
  queuedTasks: number
  runningTasks: number
  usageCostToday: string
  totalBalance: string
  totalFrozen: string
  totalSpent: string
}
```

- [ ] **Step 3: Add admin fetch helper**

Create `src/app/[locale]/admin/admin-api.ts`:

```ts
import { apiFetch } from '@/lib/api-fetch'
import type { AdminOverviewResponse } from './types'

async function readJson<T>(url: string): Promise<T> {
  const response = await apiFetch(url, { method: 'GET' })
  if (!response.ok) {
    throw new Error(`Admin API failed: ${response.status}`)
  }
  return await response.json() as T
}

export function fetchAdminOverview() {
  return readJson<AdminOverviewResponse>('/api/admin/overview')
}

export function fetchAdminUsers() {
  return readJson('/api/admin/users?pageSize=20')
}

export function fetchAdminBilling() {
  return readJson('/api/admin/billing?pageSize=20')
}

export function fetchAdminTasks() {
  return readJson('/api/admin/tasks?pageSize=50')
}

export function fetchAdminModels() {
  return readJson('/api/admin/models')
}

export function fetchAdminSystemHealth() {
  return readJson('/api/admin/system-health')
}

export function fetchAdminAuditLogs() {
  return readJson('/api/admin/audit-logs?pageSize=50')
}
```

- [ ] **Step 4: Add client console**

Create `src/app/[locale]/admin/AdminConsoleClient.tsx`:

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import { AppIcon } from '@/components/ui/icons'
import {
  fetchAdminAuditLogs,
  fetchAdminBilling,
  fetchAdminModels,
  fetchAdminOverview,
  fetchAdminSystemHealth,
  fetchAdminTasks,
  fetchAdminUsers,
} from './admin-api'
import type { AdminOverviewResponse } from './types'

type TabId = 'overview' | 'users' | 'billing' | 'tasks' | 'models' | 'system' | 'audit'

const tabs: TabId[] = ['overview', 'users', 'billing', 'tasks', 'models', 'system', 'audit']

function JsonPanel({ value }: { value: unknown }) {
  return (
    <pre className="max-h-[520px] overflow-auto rounded-lg border border-[var(--glass-stroke-base)] bg-black/20 p-4 text-xs text-[var(--glass-text-secondary)]">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function OverviewCards({ overview }: { overview: AdminOverviewResponse | null }) {
  const t = useTranslations('admin')
  const cards = useMemo(() => {
    if (!overview) return []
    return [
      ['totalUsers', overview.totalUsers],
      ['newUsersToday', overview.newUsersToday],
      ['tasksToday', overview.tasksToday],
      ['failedTasks', overview.failedTasks],
      ['queuedTasks', overview.queuedTasks],
      ['runningTasks', overview.runningTasks],
      ['usageCostToday', overview.usageCostToday],
      ['totalBalance', overview.totalBalance],
    ] as const
  }, [overview])

  if (!overview) return null

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([key, value]) => (
        <div key={key} className="glass-surface-soft rounded-lg border border-[var(--glass-stroke-base)] p-4">
          <div className="text-xs text-[var(--glass-text-tertiary)]">{t(`cards.${key}`)}</div>
          <div className="mt-2 text-xl font-semibold text-[var(--glass-text-primary)]">{String(value)}</div>
        </div>
      ))}
    </div>
  )
}

export default function AdminConsoleClient({ role }: { role: 'admin' | 'owner' }) {
  const t = useTranslations('admin')
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<Record<TabId, unknown>>({
    overview: null,
    users: null,
    billing: null,
    tasks: null,
    models: null,
    system: null,
    audit: null,
  })

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [overview, users, billing, tasksData, models, system, audit] = await Promise.all([
        fetchAdminOverview(),
        fetchAdminUsers(),
        fetchAdminBilling(),
        fetchAdminTasks(),
        fetchAdminModels(),
        fetchAdminSystemHealth(),
        role === 'owner' ? fetchAdminAuditLogs() : Promise.resolve({ items: [], ownerOnly: true }),
      ])
      setData({ overview, users, billing, tasks: tasksData, models, system, audit })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [])

  return (
    <div className="glass-page min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-[1440px] px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--glass-text-primary)]">{t('title')}</h1>
            <p className="mt-1 text-sm text-[var(--glass-text-secondary)]">{t('subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/api/admin/download-logs"
              download
              className="glass-btn-base px-3 py-2 text-sm"
            >
              <AppIcon name="download" className="h-4 w-4" />
              {t('actions.downloadLogs')}
            </a>
            <button onClick={() => void loadAll()} className="glass-btn-base px-3 py-2 text-sm">
              <AppIcon name="refresh" className="h-4 w-4" />
              {t('actions.refresh')}
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <aside className="glass-surface-elevated rounded-lg border border-[var(--glass-stroke-base)] p-3">
            <nav className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                    activeTab === tab
                      ? 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-primary)]'
                      : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)]'
                  }`}
                >
                  {t(`tabs.${tab}`)}
                </button>
              ))}
            </nav>
          </aside>

          <section className="glass-surface-elevated rounded-lg border border-[var(--glass-stroke-base)] p-5">
            {loading ? (
              <div className="text-sm text-[var(--glass-text-secondary)]">{t('loading')}</div>
            ) : error ? (
              <div className="text-sm text-red-300">{error}</div>
            ) : (
              <div className="space-y-5">
                {activeTab === 'overview' && <OverviewCards overview={data.overview as AdminOverviewResponse | null} />}
                <JsonPanel value={data[activeTab]} />
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Add server-gated admin page**

Create `src/app/[locale]/admin/page.tsx`:

```tsx
import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdminRole, normalizeUserRole, normalizeUserStatus, isActiveUserStatus } from '@/lib/admin/roles'
import AdminConsoleClient from './AdminConsoleClient'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, status: true },
  })

  const role = normalizeUserRole(user?.role)
  const status = normalizeUserStatus(user?.status)

  if (!isActiveUserStatus(status) || !isAdminRole(role)) {
    redirect('/home')
  }

  return <AdminConsoleClient role={role === 'owner' ? 'owner' : 'admin'} />
}
```

- [ ] **Step 6: Typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add messages/zh/admin.json messages/en/admin.json src/app/[locale]/admin/types.ts src/app/[locale]/admin/admin-api.ts src/app/[locale]/admin/AdminConsoleClient.tsx src/app/[locale]/admin/page.tsx
git commit -m "feat: add admin console page"
```

---

### Task 8: Final Verification

**Files:**
- None. This task only verifies the completed implementation.

- [ ] **Step 1: Run focused test suite**

Run:

```bash
npm test -- tests/unit/admin/roles.test.ts tests/unit/admin/audit.test.ts tests/unit/admin/redaction.test.ts tests/unit/components/navbar-download-logs.test.ts tests/integration/api/contract/admin-routes.test.ts tests/integration/api/contract/infra-routes.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run route contract guard**

Run:

```bash
npm run check:api-handler
```

Expected: PASS.

- [ ] **Step 4: Run build if local infrastructure is not required**

Run:

```bash
npm run build
```

Expected: PASS. If the local environment lacks required MySQL/Redis/MinIO setup, record the exact missing dependency and run `npm run typecheck` plus the focused tests instead.

- [ ] **Step 5: Manual acceptance checks**

Use a local database seeded with:

```text
ordinary user: role=user, status=active
admin user: role=admin, status=active
owner user: role=owner, status=active
disabled admin: role=admin, status=disabled
```

Verify:

```text
ordinary user does not see 运营控制台 in Navbar
ordinary user GET /api/admin/overview returns 403
admin user sees 运营控制台
admin user opens /zh/admin
admin user GET /api/admin/audit-logs returns 403
owner user GET /api/admin/audit-logs returns 200
disabled admin cannot log in
admin dashboard JSON panels do not include payload, prompt, imageUrl, videoUrl, or generated content fields
```

- [ ] **Step 6: Stop on verification defects**

If any verification step fails, stop execution and add a new concrete task to this plan for the exact failing behavior before changing implementation code. The new task must name the failing command, expected failure, exact files to modify, exact code to change, and its own verification command. If all verification steps pass, do not create a final empty commit.


---

## Self-Review

Spec coverage:

- Ordinary users cannot see admin entry: Task 4.
- Ordinary users cannot access admin page/API: Tasks 2, 6, 7.
- `admin / owner` can enter: Tasks 2, 4, 7.
- Owner-only high-risk operations: Tasks 3 and 6.
- No user creative content in admin APIs: Task 5 redaction, Task 6 route tests, Task 8 manual checks.
- Audit logging: Tasks 1, 3, 6.
- First phase operations dashboard: Tasks 5, 6, 7.

Deferred by design:

- User groups and permissions UI.
- Packages, subscriptions, coupons, and redeem codes.
- Announcement and feature flag editor.
- Full payment provider configuration.
- Automated risk control and alerting.

Placeholder scan:

- Completed. The plan contains concrete file paths, code blocks, commands, and expected outcomes for each implementation task.

Type consistency:

- Roles use `user | admin | owner`.
- Status values use `active | disabled`.
- Admin route access uses `requireAdminAuth()` and owner-only access uses `requireOwnerAuth()`.
