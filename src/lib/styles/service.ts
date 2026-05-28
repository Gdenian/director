import type { Prisma } from '@prisma/client'
import { ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { DEFAULT_STYLE_SEEDS } from './defaults'
import type { StyleSnapshot } from './types'

export type GlobalStyleSummary = {
  id: string
  userId: string
  folderId: string | null
  name: string
  promptZh: string
  promptEn: string | null
  referenceImageUrl: string | null
  referenceImageMediaId: string | null
  previewImageUrl: string | null
  previewImageMediaId: string | null
  isSystemSeed: boolean
  createdAt: string
  updatedAt: string
}

export type CreateGlobalStyleInput = {
  userId: string
  folderId?: string | null
  name: string
  promptZh: string
  promptEn?: string | null
  referenceImageUrl?: string | null
  referenceImageMediaId?: string | null
  previewImageUrl?: string | null
  previewImageMediaId?: string | null
}

export type UpdateGlobalStyleInput = {
  userId: string
  styleId: string
  folderId?: string | null
  name?: string
  promptZh?: string
  promptEn?: string | null
  referenceImageUrl?: string | null
  referenceImageMediaId?: string | null
  previewImageUrl?: string | null
  previewImageMediaId?: string | null
}

export type ResolveAssetStyleSnapshotInput = {
  styleAssetId?: string | null
  styleSnapshotName?: string | null
  stylePromptZh?: string | null
  stylePromptEn?: string | null
  styleSnapshotUpdatedAt?: Date | string | null
}

export type ResolveEffectiveStyleSnapshotInput = {
  projectId: string
  assetSnapshot?: ResolveAssetStyleSnapshotInput | null
}

export type StyleSnapshotState = {
  styleSnapshot: StyleSnapshot | null
  styleSnapshotStale: boolean
  styleSnapshotStaleMessage: string | null
}

type GlobalStyleRecord = {
  id: string
  userId: string
  folderId: string | null
  name: string
  promptZh: string
  promptEn: string | null
  referenceImageUrl: string | null
  referenceImageMediaId: string | null
  previewImageUrl: string | null
  previewImageMediaId: string | null
  isSystemSeed: boolean
  createdAt: Date
  updatedAt: Date
}

export type StyleSnapshotRecord = {
  styleAssetId: string | null
  styleSnapshotName: string | null
  stylePromptZh: string | null
  stylePromptEn: string | null
  styleSnapshotUpdatedAt: Date | string | null
}

export const STYLE_SNAPSHOT_STALE_MESSAGE = '该风格已有更新，可重新选择刷新状态'

const defaultSeed = DEFAULT_STYLE_SEEDS.find((seed) => seed.isDefault) ?? DEFAULT_STYLE_SEEDS[0]

export async function ensureDefaultStyles(userId: string): Promise<{ defaultStyleId: string }> {
  assertRequired(userId)

  const preference = await prisma.userPreference.findUnique({
    where: { userId },
    select: { defaultStyleId: true },
  })

  if (preference?.defaultStyleId) {
    const existingDefault = await prisma.globalStyle.findFirst({
      where: { id: preference.defaultStyleId, userId },
      select: { id: true },
    })
    if (existingDefault) {
      return { defaultStyleId: existingDefault.id }
    }
  }

  const existingStyle = await prisma.globalStyle.findFirst({
    where: { userId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  if (existingStyle) {
    await prisma.userPreference.upsert({
      where: { userId },
      update: { defaultStyleId: existingStyle.id },
      create: { userId, defaultStyleId: existingStyle.id },
    })
    return { defaultStyleId: existingStyle.id }
  }

  const defaultStyleId = await prisma.$transaction(async (tx) => {
    let createdDefaultId: string | null = null

    for (const seed of DEFAULT_STYLE_SEEDS) {
      const style = await tx.globalStyle.create({
        data: {
          userId,
          name: seed.name,
          promptZh: seed.promptZh,
          promptEn: seed.promptEn,
          isSystemSeed: true,
        },
        select: { id: true },
      })
      if (seed.name === defaultSeed.name) {
        createdDefaultId = style.id
      }
    }

    if (!createdDefaultId) {
      const firstStyle = await tx.globalStyle.findFirst({
        where: { userId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      })
      createdDefaultId = firstStyle?.id ?? null
    }

    if (!createdDefaultId) throwStyleRequired()

    await tx.userPreference.upsert({
      where: { userId },
      update: { defaultStyleId: createdDefaultId },
      create: { userId, defaultStyleId: createdDefaultId },
    })

    return createdDefaultId
  })

  return { defaultStyleId }
}

export async function listGlobalStyles(userId: string, folderId?: string | null): Promise<GlobalStyleSummary[]> {
  assertRequired(userId)

  const styles = await prisma.globalStyle.findMany({
    where: {
      userId,
      ...(folderId !== undefined ? { folderId } : {}),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })

  return styles.map(toSummary)
}

export async function createGlobalStyle(input: CreateGlobalStyleInput): Promise<GlobalStyleSummary> {
  assertRequired(input.userId)
  const name = requireText(input.name)
  const promptZh = requireText(input.promptZh)

  const style = await prisma.globalStyle.create({
    data: {
      userId: input.userId,
      folderId: input.folderId ?? null,
      name,
      promptZh,
      promptEn: normalizeOptionalText(input.promptEn),
      referenceImageUrl: input.referenceImageUrl ?? null,
      referenceImageMediaId: input.referenceImageMediaId ?? null,
      previewImageUrl: input.previewImageUrl ?? null,
      previewImageMediaId: input.previewImageMediaId ?? null,
      isSystemSeed: false,
    },
  })

  return toSummary(style)
}

export async function updateGlobalStyle(input: UpdateGlobalStyleInput): Promise<GlobalStyleSummary> {
  assertRequired(input.userId)
  assertRequired(input.styleId)

  const style = await prisma.globalStyle.findFirst({
    where: { id: input.styleId, userId: input.userId },
    select: { id: true },
  })
  if (!style) throwStyleNotFound()

  const data: Prisma.GlobalStyleUncheckedUpdateInput = {}
  if (input.folderId !== undefined) data.folderId = input.folderId
  if (input.name !== undefined) data.name = requireText(input.name)
  if (input.promptZh !== undefined) data.promptZh = requireText(input.promptZh)
  if (input.promptEn !== undefined) data.promptEn = normalizeOptionalText(input.promptEn)
  if (input.referenceImageUrl !== undefined) data.referenceImageUrl = input.referenceImageUrl
  if (input.referenceImageMediaId !== undefined) data.referenceImageMediaId = input.referenceImageMediaId
  if (input.previewImageUrl !== undefined) data.previewImageUrl = input.previewImageUrl
  if (input.previewImageMediaId !== undefined) data.previewImageMediaId = input.previewImageMediaId

  const updated = await prisma.globalStyle.update({
    where: { id: input.styleId },
    data,
  })

  return toSummary(updated)
}

export async function deleteGlobalStyle(input: { userId: string; styleId: string }): Promise<{ success: true; defaultStyleId: string | null }> {
  assertRequired(input.userId)
  assertRequired(input.styleId)

  const style = await prisma.globalStyle.findFirst({
    where: { id: input.styleId, userId: input.userId },
    select: { id: true },
  })
  if (!style) throwStyleNotFound()

  const styleCount = await prisma.globalStyle.count({ where: { userId: input.userId } })
  if (styleCount <= 1) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'STYLE_DELETE_LAST_FORBIDDEN',
      message: 'Cannot delete the last style',
    })
  }

  const defaultStyleId = await prisma.$transaction(async (tx) => {
    const preference = await tx.userPreference.findUnique({
      where: { userId: input.userId },
      select: { defaultStyleId: true },
    })

    await tx.globalStyle.delete({ where: { id: input.styleId } })

    if (preference?.defaultStyleId !== input.styleId) {
      return preference?.defaultStyleId ?? null
    }

    const nextStyle = await tx.globalStyle.findFirst({
      where: { userId: input.userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    })

    await tx.userPreference.upsert({
      where: { userId: input.userId },
      update: { defaultStyleId: nextStyle?.id ?? null },
      create: { userId: input.userId, defaultStyleId: nextStyle?.id ?? null },
    })

    return nextStyle?.id ?? null
  })

  return { success: true, defaultStyleId }
}

export async function setDefaultStyle(userId: string, styleId: string): Promise<{ defaultStyleId: string }> {
  assertRequired(userId)
  assertRequired(styleId)

  const style = await prisma.globalStyle.findFirst({
    where: { id: styleId, userId },
    select: { id: true },
  })
  if (!style) throwStyleNotFound()

  await prisma.userPreference.upsert({
    where: { userId },
    update: { defaultStyleId: style.id },
    create: { userId, defaultStyleId: style.id },
  })

  return { defaultStyleId: style.id }
}

export async function resolveDefaultStyleSnapshot(userId: string): Promise<StyleSnapshot> {
  assertRequired(userId)

  const { defaultStyleId } = await ensureDefaultStyles(userId)
  const style = await prisma.globalStyle.findFirst({
    where: { id: defaultStyleId, userId },
    select: {
      id: true,
      name: true,
      promptZh: true,
      promptEn: true,
      updatedAt: true,
    },
  })
  if (!style) throwStyleNotFound()

  return buildStyleSnapshot(style)
}

export function buildStyleSnapshot(style: { id: string; name: string; promptZh: string; promptEn: string | null; updatedAt: Date }): StyleSnapshot {
  return {
    styleAssetId: style.id,
    name: style.name,
    promptZh: style.promptZh,
    promptEn: style.promptEn,
    snapshotUpdatedAt: style.updatedAt.toISOString(),
  }
}

export async function applyProjectStyleSnapshot(projectId: string, userId: string, styleId: string): Promise<StyleSnapshot> {
  assertRequired(projectId)
  assertRequired(userId)
  assertRequired(styleId)

  const style = await prisma.globalStyle.findFirst({
    where: { id: styleId, userId },
  })
  if (!style) throwStyleNotFound()

  const project = await prisma.novelPromotionProject.findFirst({
    where: { projectId, project: { userId } },
    select: { id: true },
  })
  if (!project) throwStyleNotFound()

  const snapshot = buildStyleSnapshot(style)
  await prisma.novelPromotionProject.update({
    where: { id: project.id },
    data: toSnapshotColumns(snapshot),
  })

  return snapshot
}

export async function resolveProjectStyleSnapshot(projectId: string): Promise<StyleSnapshot> {
  assertRequired(projectId)

  const project = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    select: {
      styleAssetId: true,
      styleSnapshotName: true,
      stylePromptZh: true,
      stylePromptEn: true,
      styleSnapshotUpdatedAt: true,
    },
  })
  if (!project) throwStyleNotFound()

  const snapshot = snapshotFromRecord(project)
  if (!snapshot) throwStyleRequired()
  return snapshot
}

export async function resolveAssetStyleSnapshot(input: ResolveAssetStyleSnapshotInput): Promise<StyleSnapshot | null> {
  return snapshotFromRecord({
    styleAssetId: input.styleAssetId ?? null,
    styleSnapshotName: input.styleSnapshotName ?? null,
    stylePromptZh: input.stylePromptZh ?? null,
    stylePromptEn: input.stylePromptEn ?? null,
    styleSnapshotUpdatedAt: input.styleSnapshotUpdatedAt ?? null,
  })
}

export async function resolveStyleSnapshotState(
  userId: string,
  record: StyleSnapshotRecord,
): Promise<StyleSnapshotState> {
  assertRequired(userId)

  const styleSnapshot = snapshotFromRecord(record)
  if (!styleSnapshot) {
    return {
      styleSnapshot: null,
      styleSnapshotStale: false,
      styleSnapshotStaleMessage: null,
    }
  }

  let styleUpdatedAt: Date | null = null
  if (styleSnapshot.styleAssetId) {
    const globalStyle = await prisma.globalStyle.findFirst({
      where: { id: styleSnapshot.styleAssetId, userId },
      select: { updatedAt: true },
    })
    styleUpdatedAt = globalStyle?.updatedAt ?? null
  }

  const styleSnapshotStale = isGlobalStyleStale(styleSnapshot, styleUpdatedAt)
  return {
    styleSnapshot,
    styleSnapshotStale,
    styleSnapshotStaleMessage: styleSnapshotStale ? STYLE_SNAPSHOT_STALE_MESSAGE : null,
  }
}

export async function resolveEffectiveStyleSnapshot(input: ResolveEffectiveStyleSnapshotInput): Promise<StyleSnapshot> {
  const assetSnapshot = input.assetSnapshot ? await resolveAssetStyleSnapshot(input.assetSnapshot) : null
  if (assetSnapshot) return assetSnapshot
  return resolveProjectStyleSnapshot(input.projectId)
}

export function resolveStylePrompt(snapshot: StyleSnapshot, locale: 'zh' | 'en'): string {
  if (locale === 'en' && snapshot.promptEn?.trim()) return snapshot.promptEn
  return snapshot.promptZh
}

export function isGlobalStyleStale(snapshot: StyleSnapshot, styleUpdatedAt: Date | string | null | undefined): boolean {
  if (!styleUpdatedAt) return false
  const snapshotTime = Date.parse(snapshot.snapshotUpdatedAt)
  const styleTime = styleUpdatedAt instanceof Date ? styleUpdatedAt.getTime() : Date.parse(styleUpdatedAt)
  if (!Number.isFinite(snapshotTime) || !Number.isFinite(styleTime)) return false
  return styleTime > snapshotTime
}

function toSummary(style: GlobalStyleRecord): GlobalStyleSummary {
  return {
    id: style.id,
    userId: style.userId,
    folderId: style.folderId,
    name: style.name,
    promptZh: style.promptZh,
    promptEn: style.promptEn,
    referenceImageUrl: style.referenceImageUrl,
    referenceImageMediaId: style.referenceImageMediaId,
    previewImageUrl: style.previewImageUrl,
    previewImageMediaId: style.previewImageMediaId,
    isSystemSeed: style.isSystemSeed,
    createdAt: style.createdAt.toISOString(),
    updatedAt: style.updatedAt.toISOString(),
  }
}

function toSnapshotColumns(snapshot: StyleSnapshot) {
  return {
    styleAssetId: snapshot.styleAssetId,
    styleSnapshotName: snapshot.name,
    stylePromptZh: snapshot.promptZh,
    stylePromptEn: snapshot.promptEn,
    styleSnapshotUpdatedAt: new Date(snapshot.snapshotUpdatedAt),
  }
}

function snapshotFromRecord(record: StyleSnapshotRecord): StyleSnapshot | null {
  if (!record.styleSnapshotName || !record.stylePromptZh || !record.styleSnapshotUpdatedAt) return null
  const snapshotUpdatedAt = toIsoString(record.styleSnapshotUpdatedAt)
  if (!snapshotUpdatedAt) return null

  return {
    styleAssetId: record.styleAssetId ?? null,
    name: record.styleSnapshotName,
    promptZh: record.stylePromptZh,
    promptEn: record.stylePromptEn ?? null,
    snapshotUpdatedAt,
  }
}

function toIsoString(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return date.toISOString()
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function requireText(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throwStyleRequired()
  return trimmed
}

function assertRequired(value: string): void {
  if (!value.trim()) throwStyleRequired()
}

function throwStyleRequired(): never {
  throw new ApiError('INVALID_PARAMS', {
    code: 'STYLE_REQUIRED',
    message: 'Style is required',
  })
}

function throwStyleNotFound(): never {
  throw new ApiError('NOT_FOUND', {
    code: 'STYLE_NOT_FOUND',
    message: 'Style not found',
  })
}
