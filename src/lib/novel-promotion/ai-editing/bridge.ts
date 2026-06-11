import type { Locale } from '@/i18n/routing'
import { prisma } from '@/lib/prisma'
import { failEditorAsset } from './editor-assets'

export type TransitionBridgeResult = {
  editorAssetId: string
  url?: string | null
  durationMs?: number | null
}

export async function generateTransitionBridgeAsset(input: {
  taskId: string
  projectId: string
  episodeId: string
  userId: string
  locale: Locale
  editorAssetId: string
  payload: Record<string, unknown>
}): Promise<TransitionBridgeResult> {
  void input.userId
  void input.locale
  void input.payload

  const asset = await prisma.videoEditorAsset.findFirst({
    where: {
      id: input.editorAssetId,
      episodeId: input.episodeId,
      editorProject: {
        episode: { novelPromotionProject: { projectId: input.projectId } },
      },
    },
  })
  if (!asset) {
    throw new Error('AI_EDIT_TRANSITION_BRIDGE_ASSET_NOT_FOUND')
  }

  if (asset.status === 'completed' && asset.url) {
    return {
      editorAssetId: asset.id,
      url: asset.url,
      durationMs: readDurationMs(asset.metadata),
    }
  }

  await failEditorAsset({
    id: asset.id,
    taskId: input.taskId,
    error: 'AI_EDIT_TRANSITION_BRIDGE_GENERATION_NOT_CONFIGURED',
  })
  throw new Error('AI_EDIT_TRANSITION_BRIDGE_GENERATION_NOT_CONFIGURED')
}

function readDurationMs(metadata: string | null) {
  if (!metadata) return null
  try {
    const parsed = JSON.parse(metadata) as { durationMs?: unknown }
    return typeof parsed.durationMs === 'number' ? parsed.durationMs : null
  } catch {
    return null
  }
}
