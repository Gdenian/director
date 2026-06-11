import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Locale } from '@/i18n/routing'
import { calculateTimelineDuration } from '@/features/video-editor/utils/time-utils'
import { prisma } from '@/lib/prisma'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import { generateUniqueKey, uploadObject } from '@/lib/storage'
import { createPendingEditorAsset, completeEditorAsset } from './editor-assets'
import { createRenderSnapshot, type RenderSnapshot } from './render-snapshot'

export type EditorRenderer = (snapshot: RenderSnapshot) => Promise<{
  storageKey: string
  mediaObjectId?: string | null
  durationMs?: number | null
}>
type EditorRenderOutput = Awaited<ReturnType<EditorRenderer>>

export async function renderEditorProject(input: {
  taskId: string
  projectId: string
  episodeId: string | null | undefined
  userId: string
  locale: Locale
  editorProjectId: string
  burnSubtitles: boolean
  quality: 'draft' | 'high'
  payload: Record<string, unknown>
  renderer?: EditorRenderer
}) {
  void input.userId
  void input.locale
  void input.quality
  void input.payload

  const snapshot = await createRenderSnapshot({
    projectId: input.projectId,
    editorProjectId: input.editorProjectId,
    burnSubtitles: input.burnSubtitles,
  })

  const renderer = input.renderer ?? renderWithRemotion
  const renderResult = await renderer(snapshot)
  const media = renderResult.mediaObjectId
    ? null
    : await ensureMediaObjectFromStorageKey(renderResult.storageKey, {
      mimeType: 'video/mp4',
      width: snapshot.width,
      height: snapshot.height,
      durationMs: renderResult.durationMs ?? undefined,
    })
  const asset = await createPendingEditorAsset({
    editorProjectId: input.editorProjectId,
    episodeId: snapshot.episodeId,
    kind: 'render_output',
    sourceClipIds: snapshot.projectData.timeline.map((clip) => clip.id),
    sourcePanelIds: snapshot.projectData.timeline.flatMap((clip) => clip.metadata.sourcePanelId ? [clip.metadata.sourcePanelId] : []),
    metadata: {
      width: snapshot.width,
      height: snapshot.height,
      fps: snapshot.fps,
      burnSubtitles: snapshot.burnSubtitles,
    },
  })
  const completed = await completeEditorAsset({
    id: asset.id,
    mediaObjectId: renderResult.mediaObjectId || media?.id || null,
    url: renderResult.storageKey,
    taskId: input.taskId,
    durationMs: renderResult.durationMs,
  })

  await prisma.videoEditorProject.update({
    where: { id: input.editorProjectId },
    data: {
      renderStatus: 'completed',
      renderTaskId: input.taskId,
      outputUrl: completed.url,
      updatedAt: new Date(),
    },
  })

  return {
    editorProjectId: input.editorProjectId,
    outputUrl: completed.url,
  }
}

export async function renderWithRemotion(snapshot: RenderSnapshot): Promise<EditorRenderOutput> {
  const [{ bundle }, { renderMedia, selectComposition }] = await Promise.all([
    import('@remotion/bundler'),
    import('@remotion/renderer'),
  ])
  const entryPoint = path.join(process.cwd(), 'src/features/video-editor/remotion/entry.tsx')
  const serveUrl = await bundle({
    entryPoint,
    onProgress: () => undefined,
  })
  const inputProps = {
    clips: snapshot.projectData.timeline,
    audioTrack: snapshot.projectData.audioTrack,
    subtitleCues: snapshot.projectData.subtitleCues,
    bgmTrack: snapshot.projectData.bgmTrack,
    config: snapshot.projectData.config,
    burnSubtitles: snapshot.burnSubtitles,
    durationInFrames: Math.max(1, calculateTimelineDuration(snapshot.projectData.timeline)),
  }
  const composition = await selectComposition({
    serveUrl,
    id: 'EditorVideo',
    inputProps,
  })
  const outputLocation = path.join(os.tmpdir(), `director-editor-render-${snapshot.editorProjectId}-${Date.now()}.mp4`)

  try {
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      codec: 'h264',
      outputLocation,
      overwrite: true,
      logLevel: 'warn',
      crf: snapshot.projectData.config.videoRatio === '9:16' ? 20 : 18,
    })

    const buffer = await fs.readFile(outputLocation)
    const storageKey = generateUniqueKey(`editor-render/${snapshot.editorProjectId}`, 'mp4')
    const uploadedKey = await uploadObject(buffer, storageKey, 1, 'video/mp4')
    return {
      storageKey: uploadedKey,
      durationMs: Math.round((inputProps.durationInFrames / snapshot.fps) * 1000),
    }
  } finally {
    await fs.unlink(outputLocation).catch(() => undefined)
  }
}
