import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { PRIMARY_APPEARANCE_INDEX } from '@/lib/constants'
import {
    resolveAssetStyleSnapshot,
    resolveDefaultStyleSnapshot,
    resolveGlobalStyleSnapshot,
    styleSnapshotToColumns,
} from '@/lib/styles/service'

// 更新形象描述
export const PATCH = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ characterId: string; appearanceIndex: string }> }
) => {
    const { characterId, appearanceIndex } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const character = await prisma.globalCharacter.findUnique({
        where: { id: characterId }
    })

    if (!character || character.userId !== session.user.id) {
        throw new ApiError('FORBIDDEN')
    }

    const body = await request.json()
    const { description, descriptionIndex, changeReason, styleAssetId } = body

    const appearance = await prisma.globalCharacterAppearance.findFirst({
        where: { characterId, appearanceIndex: parseInt(appearanceIndex, 10) }
    })

    if (!appearance) {
        throw new ApiError('NOT_FOUND')
    }

    const updateData: Record<string, unknown> = {}

    if (description !== undefined) {
        const trimmedDescription = description.trim()
        let descriptions: string[] = []
        if (appearance.descriptions) {
            try { descriptions = JSON.parse(appearance.descriptions) } catch { }
        }
        if (descriptions.length === 0) {
            descriptions = [appearance.description || '']
        }
        if (descriptionIndex !== undefined && descriptionIndex !== null) {
            descriptions[descriptionIndex] = trimmedDescription
        } else {
            descriptions[0] = trimmedDescription
        }
        updateData.descriptions = JSON.stringify(descriptions)
        updateData.description = descriptions[0]
    }

    if (changeReason !== undefined) {
        updateData.changeReason = changeReason
    }
    if (styleAssetId !== undefined) {
        const normalizedStyleAssetId = typeof styleAssetId === 'string' ? styleAssetId.trim() : ''
        if (!normalizedStyleAssetId) {
            throw new ApiError('INVALID_PARAMS', {
                code: 'INVALID_STYLE_ASSET',
                message: 'styleAssetId must be a non-empty string',
            })
        }
        const styleSnapshot = await resolveGlobalStyleSnapshot(session.user.id, normalizedStyleAssetId)
        Object.assign(updateData, styleSnapshotToColumns(styleSnapshot))
    }

    await prisma.globalCharacterAppearance.update({
        where: { id: appearance.id },
        data: updateData
    })

    return NextResponse.json({ success: true })
})

// 添加新形象
export const POST = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ characterId: string; appearanceIndex: string }> }
) => {
    const { characterId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const character = await prisma.globalCharacter.findUnique({
        where: { id: characterId },
        include: { appearances: true }
    })

    if (!character || character.userId !== session.user.id) {
        throw new ApiError('FORBIDDEN')
    }

    const body = await request.json()
    const { description, changeReason, styleAssetId } = body

    if (!description) {
        throw new ApiError('INVALID_PARAMS')
    }

    const maxIndex = character.appearances.reduce((max, a) => Math.max(max, a.appearanceIndex), 0)
    const newIndex = maxIndex + 1
    const normalizedStyleAssetId = typeof styleAssetId === 'string' ? styleAssetId.trim() : ''
    const primaryAppearance = character.appearances.find((item) => item.appearanceIndex === PRIMARY_APPEARANCE_INDEX)
        || character.appearances[0]
    const inheritedSnapshot = primaryAppearance
        ? await resolveAssetStyleSnapshot(primaryAppearance)
        : null
    const styleSnapshot = normalizedStyleAssetId
        ? await resolveGlobalStyleSnapshot(session.user.id, normalizedStyleAssetId)
        : inheritedSnapshot ?? await resolveDefaultStyleSnapshot(session.user.id)

    const appearance = await prisma.globalCharacterAppearance.create({
        data: {
            characterId,
            appearanceIndex: newIndex,
            changeReason: changeReason || '形象变化',
            ...styleSnapshotToColumns(styleSnapshot),
            description: description.trim(),
            descriptions: JSON.stringify([description.trim()]),
            imageUrls: encodeImageUrls([]),
            previousImageUrls: encodeImageUrls([])}
    })

    return NextResponse.json({ success: true, appearance })
})

// 删除形象
export const DELETE = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ characterId: string; appearanceIndex: string }> }
) => {
    const { characterId, appearanceIndex } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const character = await prisma.globalCharacter.findUnique({
        where: { id: characterId },
        include: { appearances: true }
    })

    if (!character || character.userId !== session.user.id) {
        throw new ApiError('FORBIDDEN')
    }

    if (character.appearances.length <= 1) {
        throw new ApiError('INVALID_PARAMS')
    }

    const appearance = await prisma.globalCharacterAppearance.findFirst({
        where: { characterId, appearanceIndex: parseInt(appearanceIndex, 10) }
    })

    if (!appearance) {
        throw new ApiError('NOT_FOUND')
    }

    await prisma.globalCharacterAppearance.delete({
        where: { id: appearance.id }
    })

    return NextResponse.json({ success: true })
})
