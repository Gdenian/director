import { prisma } from '@/lib/prisma'
import type { VideoEditorProject } from '@/features/video-editor/types/editor.types'

export type VersionIndexRow = { versionIndex: number }
export type VersionTrimRow = { id: string; versionIndex: number }

export function nextVersionIndex(rows: VersionIndexRow[]) {
  return rows.reduce((max, row) => Math.max(max, row.versionIndex), 0) + 1
}

export function trimVersionRowsForCap(rows: VersionTrimRow[], cap = 10) {
  return [...rows]
    .sort((a, b) => a.versionIndex - b.versionIndex)
    .slice(0, Math.max(0, rows.length - cap))
    .map((row) => row.id)
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}

export async function createEditorVersion(input: {
  editorProjectId: string
  reason: string
  summary: string
  snapshot: VideoEditorProject
  diff?: Record<string, unknown> | null
  createdByTaskId?: string | null
  cap?: number
}) {
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const existing = await prisma.videoEditorProjectVersion.findMany({
      where: { editorProjectId: input.editorProjectId },
      select: { id: true, versionIndex: true },
      orderBy: { versionIndex: 'asc' },
    })

    try {
      const version = await prisma.videoEditorProjectVersion.create({
        data: {
          editorProjectId: input.editorProjectId,
          versionIndex: nextVersionIndex(existing),
          reason: input.reason,
          summary: input.summary,
          snapshotJson: JSON.stringify(input.snapshot),
          diffJson: input.diff ? JSON.stringify(input.diff) : null,
          createdByTaskId: input.createdByTaskId || null,
        },
      })

      const staleIds = trimVersionRowsForCap([...existing, version], input.cap ?? 10)
      if (staleIds.length > 0) {
        await prisma.videoEditorProjectVersion.deleteMany({ where: { id: { in: staleIds } } })
      }

      return version
    } catch (error) {
      if (!isUniqueConstraintError(error) || attempt === maxAttempts) {
        throw error
      }
    }
  }

  throw new Error('EDITOR_VERSION_CREATE_RETRY_EXHAUSTED')
}

export async function listEditorVersions(editorProjectId: string) {
  return await prisma.videoEditorProjectVersion.findMany({
    where: { editorProjectId },
    orderBy: { versionIndex: 'desc' },
  })
}

export async function restoreEditorVersion(versionId: string) {
  const version = await prisma.videoEditorProjectVersion.findUnique({
    where: { id: versionId },
  })
  if (!version) return null

  const snapshot = JSON.parse(version.snapshotJson) as VideoEditorProject
  await prisma.videoEditorProject.update({
    where: { id: version.editorProjectId },
    data: {
      projectData: version.snapshotJson,
      updatedAt: new Date(),
    },
  })

  return { version, snapshot }
}
