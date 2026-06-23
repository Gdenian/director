import { prisma } from '@/lib/prisma'

import type { VideoEditorAsset } from '@prisma/client'

export type EditorAssetKind =
  | 'transition_bridge'
  | 'render_output'
  | 'user_import_video'
  | 'user_import_audio'
  | 'user_import_image'

export async function createPendingEditorAsset(input: {
  editorProjectId: string
  episodeId: string
  kind: EditorAssetKind
  sourceClipIds: string[]
  sourcePanelIds: string[]
  metadata?: Record<string, unknown>
}) {
  return await prisma.videoEditorAsset.create({
    data: {
      editorProjectId: input.editorProjectId,
      episodeId: input.episodeId,
      kind: input.kind,
      status: 'pending',
      sourceClipIds: JSON.stringify(input.sourceClipIds),
      sourcePanelIds: JSON.stringify(input.sourcePanelIds),
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  })
}

export async function completeEditorAsset(input: {
  id: string
  mediaObjectId?: string | null
  url?: string | null
  taskId?: string | null
  durationMs?: number | null
  metadata?: Record<string, unknown>
}) {
  const metadata = {
    ...(input.durationMs == null ? {} : { durationMs: input.durationMs }),
    ...(input.metadata || {}),
  }
  return await prisma.videoEditorAsset.update({
    where: { id: input.id },
    data: {
      status: 'completed',
      mediaObjectId: input.mediaObjectId || null,
      url: input.url || null,
      taskId: input.taskId || null,
      metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : undefined,
    },
  })
}

export async function failEditorAsset(input: {
  id: string
  taskId?: string | null
  error?: string | null
}) {
  return await prisma.videoEditorAsset.update({
    where: { id: input.id },
    data: {
      status: 'failed',
      taskId: input.taskId || null,
      metadata: input.error ? JSON.stringify({ error: input.error }) : undefined,
    },
  })
}

export async function listImportedEditorAssets(editorProjectId: string): Promise<VideoEditorAsset[]> {
  return await prisma.videoEditorAsset.findMany({
    where: {
      editorProjectId,
      kind: {
        in: ['user_import_video', 'user_import_audio', 'user_import_image'],
      },
    },
    orderBy: { createdAt: 'asc' },
  })
}
