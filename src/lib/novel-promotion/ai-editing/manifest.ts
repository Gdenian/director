import { prisma } from '@/lib/prisma'
import type { EditorManifest, EditorManifestClip } from './types'
import { dimensionsForVideoRatio } from './dimensions'
import { resolveDurationFrames } from './media-probe'

type ProbeFn = (url: string) => Promise<number | null>

function toSeconds(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return value > 1000 ? value / 1000 : value
}

function parseDurationFromAssetMetadata(metadata: string | null): number | undefined {
  if (!metadata) return undefined
  try {
    const parsed = JSON.parse(metadata) as { durationMs?: unknown }
    return typeof parsed.durationMs === 'number' && parsed.durationMs > 0 ? parsed.durationMs : undefined
  } catch {
    return undefined
  }
}

function buildPanelIdByStoryboardIndex(
  storyboards: Array<{ id: string; panels: Array<{ id: string; panelIndex: number }> }>,
) {
  const panelIdByKey = new Map<string, string>()
  for (const storyboard of storyboards) {
    for (const panel of storyboard.panels) {
      panelIdByKey.set(`${storyboard.id}:${panel.panelIndex}`, panel.id)
    }
  }
  return panelIdByKey
}

function resolveVoiceLinePanelId(
  line: { matchedPanelId?: string | null; matchedStoryboardId?: string | null; matchedPanelIndex?: number | null },
  panelIdByKey: Map<string, string>,
) {
  if (line.matchedPanelId) return line.matchedPanelId
  if (line.matchedStoryboardId && typeof line.matchedPanelIndex === 'number') {
    return panelIdByKey.get(`${line.matchedStoryboardId}:${line.matchedPanelIndex}`)
  }
  return undefined
}

export async function buildEditorManifest(input: {
  projectId: string
  episodeId: string
  fps?: number
  probe?: ProbeFn
}): Promise<EditorManifest> {
  const fps = input.fps ?? 30
  const episode = await prisma.novelPromotionEpisode.findFirst({
    where: {
      id: input.episodeId,
      novelPromotionProject: { projectId: input.projectId },
    },
    include: {
      novelPromotionProject: { select: { videoRatio: true } },
      storyboards: {
        include: {
          panels: {
            include: {
              videoMedia: true,
              lipSyncVideoMedia: true,
            },
            orderBy: { panelIndex: 'asc' },
          },
          clip: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      voiceLines: {
        include: { audioMedia: true },
        orderBy: { lineIndex: 'asc' },
      },
      editorProject: {
        include: {
          assets: true,
        },
      },
    },
  })

  if (!episode) {
    throw new Error('AI_EDIT_MANIFEST_EPISODE_NOT_FOUND')
  }

  const clips: EditorManifestClip[] = []
  const panelIdByKey = buildPanelIdByStoryboardIndex(episode.storyboards)
  let storyOrder = 0
  for (const storyboard of episode.storyboards) {
    for (const panel of storyboard.panels) {
      const videoUrl = panel.lipSyncVideoUrl || panel.videoUrl
      if (!videoUrl) continue
      const media = panel.lipSyncVideoMedia || panel.videoMedia
      const duration = await resolveDurationFrames({
        fps,
        mediaDurationMs: media?.durationMs,
        fallbackSeconds: toSeconds(panel.duration),
        probeUrl: videoUrl,
        probe: input.probe,
      })
      const matchedVoice = episode.voiceLines.find((voiceLine) => {
        if (voiceLine.matchedPanelId) return voiceLine.matchedPanelId === panel.id
        if (voiceLine.matchedStoryboardId && typeof voiceLine.matchedPanelIndex === 'number') {
          return voiceLine.matchedStoryboardId === storyboard.id && voiceLine.matchedPanelIndex === panel.panelIndex
        }
        return false
      })

      clips.push({
        clipId: panel.id,
        sourcePanelId: panel.id,
        storyboardId: storyboard.id,
        storyOrder,
        videoUrl,
        durationInFrames: duration.durationInFrames,
        voiceDurationInFrames: typeof matchedVoice?.audioDuration === 'number'
          ? Math.max(1, Math.round((matchedVoice.audioDuration / 1000) * fps))
          : undefined,
        linkedToNextPanel: panel.linkedToNextPanel,
        description: panel.description || storyboard.clip.summary || undefined,
      })
      storyOrder += 1
    }
  }

  const voiceLines = episode.voiceLines.map((line) => ({
    id: line.id,
    sourcePanelId: resolveVoiceLinePanelId(line, panelIdByKey),
    audioUrl: line.audioUrl,
    durationInFrames: typeof line.audioMedia?.durationMs === 'number' && line.audioMedia.durationMs > 0
      ? Math.max(1, Math.round((line.audioMedia.durationMs / 1000) * fps))
      : typeof line.audioDuration === 'number' && line.audioDuration > 0
        ? Math.max(1, Math.round((line.audioDuration / 1000) * fps))
        : undefined,
    text: line.content,
  }))

  const editorAssets = (episode.editorProject?.assets || [])
    .filter((asset) => (
      asset.status === 'completed'
      && asset.url
      && (asset.kind === 'transition_bridge' || asset.kind === 'render_output')
    ))
    .map((asset) => ({
      id: asset.id,
      kind: asset.kind === 'render_output' ? 'render_output' as const : 'transition_bridge' as const,
      url: asset.url || '',
      durationInFrames: parseDurationFromAssetMetadata(asset.metadata) == null
        ? undefined
        : Math.max(1, Math.round((parseDurationFromAssetMetadata(asset.metadata)! / 1000) * fps)),
    }))

  return {
    episodeId: episode.id,
    fps,
    dimensions: dimensionsForVideoRatio(episode.novelPromotionProject.videoRatio),
    clips,
    voiceLines,
    editorAssets,
  }
}
