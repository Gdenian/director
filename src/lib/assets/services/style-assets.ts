import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import {
  mapGlobalStyleToAsset,
  mapLegacySystemStyleToAsset,
  normalizeStyleTags as normalizeStyleTagsFromMapper,
} from '@/lib/assets/mappers'
import { listLegacySystemStyles } from '@/lib/style/legacy-system-styles'

export function normalizeStyleTags(value: string | null | undefined): string[] {
  return normalizeStyleTagsFromMapper(value)
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeRequiredString(value: unknown, field: string): string {
  const normalized = normalizeOptionalString(value)
  if (!normalized) {
    throw new ApiError('INVALID_PARAMS', { details: `${field} is required` })
  }
  return normalized
}

function normalizeTagList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

export async function listReadableGlobalStyleAssets(input: {
  userId: string
  folderId?: string | null
}) {
  const styles = await prisma.globalStyle.findMany({
    where: {
      userId: input.userId,
      ...(input.folderId ? { folderId: input.folderId } : {}),
    },
    include: {
      previewMedia: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  })

  const userStyles = styles.map((style) =>
    mapGlobalStyleToAsset(style as Parameters<typeof mapGlobalStyleToAsset>[0]),
  )

  if (input.folderId) {
    return userStyles
  }

  const systemStyles = listLegacySystemStyles('zh').map(mapLegacySystemStyleToAsset)
  return [...userStyles, ...systemStyles]
}

export async function createGlobalStyleAsset(input: {
  userId: string
  name: unknown
  description?: unknown
  positivePrompt: unknown
  negativePrompt?: unknown
  tags?: unknown
  folderId?: unknown
  previewMediaId?: unknown
  previewUrl?: unknown
  previewImageUrl?: unknown
  previewStorageKey?: unknown
  signedUrl?: unknown
}) {
  const created = await prisma.globalStyle.create({
    data: {
      userId: input.userId,
      source: 'user',
      name: normalizeRequiredString(input.name, 'name'),
      description: normalizeOptionalString(input.description),
      positivePrompt: normalizeRequiredString(input.positivePrompt, 'positivePrompt'),
      negativePrompt: normalizeOptionalString(input.negativePrompt),
      tags: JSON.stringify(normalizeTagList(input.tags)),
      folderId: normalizeOptionalString(input.folderId),
      previewMediaId: normalizeOptionalString(input.previewMediaId),
    },
  })

  return {
    success: true,
    assetId: created.id,
  }
}

export async function updateGlobalStyleAsset(input: {
  assetId: string
  userId: string
  name?: unknown
  description?: unknown
  positivePrompt?: unknown
  negativePrompt?: unknown
  tags?: unknown
  folderId?: unknown
  previewMediaId?: unknown
  previewUrl?: unknown
  previewImageUrl?: unknown
  previewStorageKey?: unknown
  signedUrl?: unknown
}) {
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) {
    data.name = normalizeRequiredString(input.name, 'name')
  }
  if (input.description !== undefined) {
    data.description = normalizeOptionalString(input.description)
  }
  if (input.positivePrompt !== undefined) {
    data.positivePrompt = normalizeRequiredString(input.positivePrompt, 'positivePrompt')
  }
  if (input.negativePrompt !== undefined) {
    data.negativePrompt = normalizeOptionalString(input.negativePrompt)
  }
  if (input.tags !== undefined) {
    data.tags = JSON.stringify(normalizeTagList(input.tags))
  }
  if (input.folderId !== undefined) {
    data.folderId = normalizeOptionalString(input.folderId)
  }
  if (input.previewMediaId !== undefined) {
    data.previewMediaId = normalizeOptionalString(input.previewMediaId)
  }

  const result = await prisma.globalStyle.updateMany({
    where: {
      id: input.assetId,
      userId: input.userId,
      source: 'user',
    },
    data,
  })

  if (result.count === 0) {
    throw new ApiError('NOT_FOUND')
  }

  return { success: true }
}

export async function deleteGlobalStyleAsset(input: {
  assetId: string
  userId: string
}) {
  const result = await prisma.globalStyle.deleteMany({
    where: {
      id: input.assetId,
      userId: input.userId,
      source: 'user',
    },
  })

  if (result.count === 0) {
    throw new ApiError('NOT_FOUND')
  }

  return { success: true }
}
