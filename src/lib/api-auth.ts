/**
 * 🔐 API 权限验证工具
 * 集中管理 Session 验证、项目权限检查等通用逻辑
 */

import { getServerSession } from 'next-auth/next'
import { NextResponse } from 'next/server'
import { headers as readHeaders } from 'next/headers'
import { authOptions } from '@/lib/auth'
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
import { prisma } from '@/lib/prisma'
import { withPrismaRetry } from '@/lib/prisma-retry'
import { extractModelKey } from '@/lib/config-service'
import { getErrorSpec, type UnifiedErrorCode } from '@/lib/errors/codes'
import { getLogContext, setLogContext } from '@/lib/logging/context'

// ============================================================
// 类型定义
// ============================================================

export interface AuthSession {
    user: {
        id: string
        name?: string | null
        email?: string | null
        role?: AdminRole
        status?: UserStatus
        sessionVersion?: number
        internal?: boolean
    }
}

function bindAuthLogContext(session: AuthSession, projectId?: string) {
    const context = getLogContext()
    if (!context.requestId) return
    setLogContext({
        userId: session.user.id,
        ...(projectId ? { projectId } : {}),
    })
}

async function getInternalTaskSession(): Promise<AuthSession | null> {
    const expectedToken = process.env.INTERNAL_TASK_TOKEN || ''

    const incomingHeaders = await readHeaders()
    const token = incomingHeaders.get('x-internal-task-token') || ''
    const userId = incomingHeaders.get('x-internal-user-id') || ''
    if (!userId) return null
    if (expectedToken) {
        if (token !== expectedToken) return null
    } else if (process.env.NODE_ENV === 'production') {
        return null
    }

    return {
        user: {
            id: userId,
            name: 'internal-worker',
            email: null,
            internal: true,
        }
    }
}

/**
 * 可选的关联数据加载配置
 */
export type ProjectAuthIncludes = {
    characters?: boolean
    locations?: boolean
    episodes?: boolean
}

interface AuthCharacterLike {
    name: string
    introduction?: string | null
    [key: string]: unknown
}

interface AuthLocationLike {
    name: string
    [key: string]: unknown
}

interface AuthEpisodeLike {
    id: string
    [key: string]: unknown
}

/**
 * 基础 novelData 类型
 */
export interface NovelDataBase {
    id: string
    [key: string]: unknown
}

/**
 * 根据 include 选项推断的 novelData 类型
 */
export type NovelDataWithIncludes<T extends ProjectAuthIncludes> = NovelDataBase
    & (T['characters'] extends true ? { characters: AuthCharacterLike[] } : Record<string, never>)
    & (T['locations'] extends true ? { locations: AuthLocationLike[] } : Record<string, never>)
    & (T['episodes'] extends true ? { episodes: AuthEpisodeLike[] } : Record<string, never>)

/**
 * 完整的认证上下文（带泛型）
 */
export interface ProjectAuthContextWithIncludes<T extends ProjectAuthIncludes = ProjectAuthIncludes> {
    session: AuthSession
    project: {
        id: string
        userId: string
        name: string
        [key: string]: unknown
    }
    novelData: NovelDataWithIncludes<T>
}

/**
 * 向后兼容的类型别名
 */
export type ProjectAuthContext = ProjectAuthContextWithIncludes<ProjectAuthIncludes>

// ============================================================
// 错误响应工具
// ============================================================

function buildErrorResponse(code: UnifiedErrorCode, message?: string, details: Record<string, unknown> = {}) {
    const spec = getErrorSpec(code)
    const finalMessage = message?.trim() || spec.defaultMessage
    return NextResponse.json(
        {
            success: false,
            error: {
                code,
                message: finalMessage,
                retryable: spec.retryable,
                category: spec.category,
                userMessageKey: spec.userMessageKey,
                details,
            },
            code,
            message: finalMessage,
            ...details,
        },
        { status: spec.httpStatus },
    )
}

export function unauthorized(message = 'Unauthorized') {
    return buildErrorResponse('UNAUTHORIZED', message)
}

export function forbidden(message = 'Forbidden') {
    return buildErrorResponse('FORBIDDEN', message)
}

export function notFound(resource = 'Resource') {
    return buildErrorResponse('NOT_FOUND', `${resource} not found`)
}

export function badRequest(message: string) {
    return buildErrorResponse('INVALID_PARAMS', message)
}

export function serverError(message = 'Internal server error') {
    return buildErrorResponse('INTERNAL_ERROR', message)
}

// ============================================================
// 权限验证函数
// ============================================================

/**
 * 验证用户 Session
 * @returns session 或 null
 */
export async function getAuthSession(): Promise<AuthSession | null> {
    const internalSession = await getInternalTaskSession()
    if (internalSession) return internalSession
    const session = await getServerSession(authOptions)
    return session as AuthSession | null
}

/**
 * 要求用户登录
 * @throws 返回 401 响应
 */
export async function requireAuth(): Promise<AuthSession> {
    const session = await getAuthSession()
    if (!session?.user?.id) {
        throw { response: unauthorized() }
    }
    bindAuthLogContext(session)
    return session
}

async function resolveLiveUserAccess(session: AuthSession) {
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, name: true, email: true, role: true, status: true, sessionVersion: true },
    })
    if (!user) return null
    return {
        ...user,
        role: normalizeUserRole(user.role),
        status: normalizeUserStatus(user.status),
    }
}

async function requireActiveAuthSession(projectId?: string): Promise<AuthSession | NextResponse> {
    const session = await getAuthSession()
    if (!session?.user?.id) {
        return unauthorized()
    }
    if (session.user.internal) {
        bindAuthLogContext(session, projectId)
        return session
    }

    const liveUser = await resolveLiveUserAccess(session)
    if (!liveUser || !isActiveUserStatus(liveUser.status)) {
        return buildErrorResponse('ACCOUNT_DISABLED')
    }
    if (
        typeof session.user.sessionVersion === 'number'
        && session.user.sessionVersion !== liveUser.sessionVersion
    ) {
        return forbidden('Session expired')
    }

    const activeSession: AuthSession = {
        user: {
            id: liveUser.id,
            name: liveUser.name,
            email: liveUser.email,
            role: liveUser.role,
            status: liveUser.status,
            sessionVersion: liveUser.sessionVersion,
        },
    }
    bindAuthLogContext(activeSession, projectId)
    return activeSession
}

/**
 * 验证项目访问权限
 * 包含：Session 验证 + 项目存在检查 + 所有权验证 + NovelPromotionData 检查
 * 
 * @param projectId 项目 ID
 * @param options 可选配置，支持按需加载关联数据
 * @returns 验证上下文（session, project, novelData）
 * @throws 返回对应的错误响应
 * 
 * @example
 * ```typescript
 * // 基础用法（不加载关联数据）
 * const authResult = await requireProjectAuth(projectId)
 * 
 * // 加载 characters 和 locations
 * const authResult = await requireProjectAuth(projectId, {
 *   include: { characters: true, locations: true }
 * })
 * // authResult.novelData.characters 和 locations 自动可用
 * ```
 */
export async function requireProjectAuth<T extends ProjectAuthIncludes = ProjectAuthIncludes>(
    projectId: string,
    options?: { include?: T }
): Promise<ProjectAuthContextWithIncludes<T> | NextResponse> {
    // 1. 验证 Session
    const session = await requireActiveAuthSession(projectId)
    if (session instanceof NextResponse) return session

    // 2. 构建动态 include 对象
    const novelPromotionIncludes: Record<string, boolean> = {}
    if (options?.include?.characters) {
        novelPromotionIncludes.characters = true
    }
    if (options?.include?.locations) {
        novelPromotionIncludes.locations = true
    }
    if (options?.include?.episodes) {
        novelPromotionIncludes.episodes = true
    }

    // 3. 获取项目（包含 novelPromotionData 及其可选关联）
    const hasIncludes = Object.keys(novelPromotionIncludes).length > 0
    const project = await withPrismaRetry(() =>
        prisma.project.findUnique({
            where: { id: projectId },
            include: {
                novelPromotionData: hasIncludes
                    ? { include: novelPromotionIncludes }
                    : true
            }
        })
    )

    // 4. 项目存在检查
    if (!project) {
        return notFound('Project')
    }

    // 5. 所有权验证
    if (project.userId !== session.user.id) {
        return forbidden()
    }

    // 6. NovelPromotionData 检查
    if (!project.novelPromotionData) {
        return notFound('Novel promotion data')
    }

    // 统一返回 modelKey（provider::modelId），禁止降级为纯 modelId
    const rawNovelData = project.novelPromotionData as {
        analysisModel?: string | null
        characterModel?: string | null
        locationModel?: string | null
        storyboardModel?: string | null
        editModel?: string | null
        videoModel?: string | null
        audioModel?: string | null
        [key: string]: unknown
    }
    const processedNovelData = {
        ...rawNovelData,
        analysisModel: extractModelKey(rawNovelData.analysisModel),
        characterModel: extractModelKey(rawNovelData.characterModel),
        locationModel: extractModelKey(rawNovelData.locationModel),
        storyboardModel: extractModelKey(rawNovelData.storyboardModel),
        editModel: extractModelKey(rawNovelData.editModel),
        videoModel: extractModelKey(rawNovelData.videoModel),
        audioModel: extractModelKey(rawNovelData.audioModel),
    }

    return {
        session,
        project,
        novelData: processedNovelData as unknown as NovelDataWithIncludes<T>
    }
}

/**
 * 仅验证 Session，不检查项目权限
 * 适用于用户级 API（如资产库）
 * 
 * @example
 * ```typescript
 * const authResult = await requireUserAuth()
 * if (authResult instanceof NextResponse) return authResult
 * 
 * const { session } = authResult
 * ```
 */
export async function requireUserAuth(): Promise<{ session: AuthSession } | NextResponse> {
    const session = await requireActiveAuthSession()
    if (session instanceof NextResponse) return session
    return { session }
}

export interface AdminSession extends AuthSession {
    user: AuthSession['user'] & {
        role: typeof ADMIN_ROLES.ADMIN | typeof ADMIN_ROLES.OWNER
        status: typeof USER_STATUSES.ACTIVE
    }
}

export async function requireAdminAuth(): Promise<{ session: AdminSession } | NextResponse> {
    const session = await getAuthSession()
    if (!session?.user?.id) return unauthorized()

    const liveUser = await resolveLiveUserAccess(session)
    if (!liveUser || !isActiveUserStatus(liveUser.status)) return buildErrorResponse('ACCOUNT_DISABLED')
    if (
        typeof session.user.sessionVersion === 'number'
        && session.user.sessionVersion !== liveUser.sessionVersion
    ) {
        return forbidden('Session expired')
    }
    if (!isAdminRole(liveUser.role)) return forbidden()

    const adminSession: AdminSession = {
        user: {
            id: liveUser.id,
            name: liveUser.name,
            email: liveUser.email,
            role: liveUser.role,
            status: USER_STATUSES.ACTIVE,
            sessionVersion: liveUser.sessionVersion,
        },
    }
    bindAuthLogContext(adminSession)
    return { session: adminSession }
}

export async function requireOwnerAuth(): Promise<{ session: AdminSession } | NextResponse> {
    const authResult = await requireAdminAuth()
    if (authResult instanceof NextResponse) return authResult
    if (!isOwnerRole(authResult.session.user.role)) return forbidden()
    return authResult
}

/**
 * 验证项目权限（不要求 NovelPromotionData）
 * 适用于某些不需要 novelPromotionData 的 API
 */
export async function requireProjectAuthLight(
    projectId: string
): Promise<{ session: AuthSession; project: { id: string; userId: string; name: string; [key: string]: unknown } } | NextResponse> {
    const session = await requireActiveAuthSession(projectId)
    if (session instanceof NextResponse) return session

    const project = await withPrismaRetry(() =>
        prisma.project.findUnique({
            where: { id: projectId }
        })
    )

    if (!project) {
        return notFound('Project')
    }

    if (project.userId !== session.user.id) {
        return forbidden()
    }

    return { session, project }
}

// ============================================================
// 类型守卫
// ============================================================

/**
 * 检查是否是错误响应
 */
export function isErrorResponse(result: unknown): result is NextResponse {
    return result instanceof NextResponse
}
