import { type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { type TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '../shared'
import {
  assertTaskActive,
  resolveVideoSourceFromGeneration,
  uploadVideoSourceToCos,
} from '../utils'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import { composeAndStoreGridReferenceImage } from '@/lib/video-groups/grid-image'
import type { VideoGridMode } from '@/lib/video-groups/types'
import { parseModelKeyStrict } from '@/lib/ai-registry/selection'
import { getProviderConfig } from '@/lib/user-api/runtime-config'
import {
  consistencyLabSourceSnapshotSchema,
  type ConsistencyLabSourceSnapshot,
} from '@/lib/consistency-lab/types'

type ExperimentRunRecord = NonNullable<Awaited<ReturnType<typeof loadExperimentRun>>>
type ExperimentVideoRecord = ExperimentRunRecord['videos'][number]
type ExperimentPanelRecord = ExperimentRunRecord['panels'][number]

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function readShotNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) throw new Error('CONSISTENCY_EXPERIMENT_VIDEO_SHOT_NUMBERS_INVALID')
  const numbers = value.map((item) => Number(item))
  if (numbers.some((item) => !Number.isInteger(item) || item <= 0)) {
    throw new Error('CONSISTENCY_EXPERIMENT_VIDEO_SHOT_NUMBERS_INVALID')
  }
  return numbers
}

function readVideoModel(run: ExperimentRunRecord): string {
  const payload = readRecord(run.modelConfigSnapshot)
  const model = readString(payload.videoModel)
  if (!model) throw new Error('CONSISTENCY_EXPERIMENT_VIDEO_MODEL_REQUIRED')
  return model
}

function parseSnapshot(run: ExperimentRunRecord): ConsistencyLabSourceSnapshot {
  const parsed = consistencyLabSourceSnapshotSchema.safeParse(run.sourceSnapshotJson)
  if (!parsed.success) throw new Error('CONSISTENCY_EXPERIMENT_SOURCE_SNAPSHOT_INVALID')
  return parsed.data
}

async function loadExperimentRun(runId: string, projectId: string) {
  return await prisma.consistencyExperimentRun.findFirst({
    where: { id: runId, projectId },
    include: {
      panels: { orderBy: { panelIndex: 'asc' } },
      videos: { orderBy: { createdAt: 'asc' } },
    },
  })
}

function durationForShots(snapshot: ConsistencyLabSourceSnapshot, shotNumbers: readonly number[]): number {
  return shotNumbers.reduce((total, shotNumber) => {
    const shot = snapshot.shots.find((item) => item.shotNumber === shotNumber)
    if (!shot) throw new Error(`CONSISTENCY_EXPERIMENT_VIDEO_SHOT_MISSING:${shotNumber}`)
    return total + shot.durationSec
  }, 0)
}

function panelsForVideo(video: ExperimentVideoRecord, panels: readonly ExperimentPanelRecord[]): ExperimentPanelRecord[] {
  const shotNumbers = readShotNumbers(video.sourceShotNumbers)
  return shotNumbers.map((shotNumber) => {
    const panel = panels.find((item) => item.sourceShotNumber === shotNumber)
    if (!panel) throw new Error(`CONSISTENCY_EXPERIMENT_VIDEO_PANEL_MISSING:${shotNumber}`)
    if (!panel.imageUrl && !panel.imageMediaId) {
      throw new Error(`CONSISTENCY_EXPERIMENT_VIDEO_PANEL_IMAGE_MISSING:${shotNumber}`)
    }
    return panel
  })
}

function gridModeForPanelCount(count: number): VideoGridMode {
  if (count < 1 || count > 9) throw new Error(`CONSISTENCY_EXPERIMENT_VIDEO_PANEL_COUNT_UNSUPPORTED:${count}`)
  return count > 4 ? '3x3' : '2x2'
}

async function buildReferenceImage(params: {
  readonly video: ExperimentVideoRecord
  readonly panels: readonly ExperimentPanelRecord[]
}): Promise<{
  readonly source: string
  readonly metadata: Record<string, unknown>
}> {
  if (params.panels.length === 1) {
    const panel = params.panels[0]
    if (!panel?.imageUrl) throw new Error(`CONSISTENCY_EXPERIMENT_VIDEO_PANEL_IMAGE_MISSING:${params.video.id}`)
    return {
      source: await normalizeToBase64ForGeneration(panel.imageUrl),
      metadata: {
        referenceMode: 'single_panel',
        referencePanelIds: params.panels.map((item) => item.id),
        referencePanelImageIds: params.panels.map((item) => item.imageMediaId).filter((item): item is string => !!item),
      },
    }
  }

  const reference = await composeAndStoreGridReferenceImage({
    gridMode: gridModeForPanelCount(params.panels.length),
    targetId: params.video.id,
    cells: params.panels.map((panel) => ({
      imageUrl: panel.imageUrl,
      storageKey: null,
    })),
  })
  return {
    source: await normalizeToBase64ForGeneration(reference.storageKey ?? reference.url),
    metadata: {
      referenceMode: 'grid_panel_images',
      referenceImageUrl: reference.url,
      referenceImageMediaId: reference.id,
      referencePanelIds: params.panels.map((item) => item.id),
      referencePanelImageIds: params.panels.map((item) => item.imageMediaId).filter((item): item is string => !!item),
    },
  }
}

async function resolveDownloadHeaders(params: {
  readonly userId: string
  readonly modelId: string
  readonly videoSource: string
  readonly fallbackHeaders?: Record<string, string>
}) {
  if (params.fallbackHeaders) return params.fallbackHeaders
  const parsedModel = parseModelKeyStrict(params.modelId)
  const isGoogleDownloadUrl = params.videoSource.includes('generativelanguage.googleapis.com/')
    && params.videoSource.includes('/files/')
    && params.videoSource.includes(':download')
  if (parsedModel?.provider === 'google' && isGoogleDownloadUrl) {
    const { apiKey } = await getProviderConfig(params.userId, 'google')
    return { 'x-goog-api-key': apiKey }
  }
  return undefined
}

async function generateExperimentVideo(params: {
  readonly job: Job<TaskJobData>
  readonly run: ExperimentRunRecord
  readonly snapshot: ConsistencyLabSourceSnapshot
  readonly video: ExperimentVideoRecord
  readonly modelId: string
}) {
  const panels = panelsForVideo(params.video, params.run.panels)
  const shotNumbers = readShotNumbers(params.video.sourceShotNumbers)
  const durationSec = durationForShots(params.snapshot, shotNumbers)
  const reference = await buildReferenceImage({ video: params.video, panels })
  const generatedVideo = await resolveVideoSourceFromGeneration(params.job, {
    userId: params.job.data.userId,
    modelId: params.modelId,
    referenceImages: [{
      url: reference.source,
      role: 'reference',
      order: 1,
      source: 'generated',
    }],
    options: {
      prompt: params.video.prompt,
      aspectRatio: params.snapshot.project.videoRatio,
      duration: durationSec,
      generationMode: 'normal',
    },
    pollProgress: { start: 38, end: 90 },
  })
  const downloadHeaders = await resolveDownloadHeaders({
    userId: params.job.data.userId,
    modelId: params.modelId,
    videoSource: generatedVideo.url,
    fallbackHeaders: generatedVideo.downloadHeaders,
  })
  const storageKey = await uploadVideoSourceToCos(
    generatedVideo.url,
    'consistency-experiment-video',
    params.video.id,
    downloadHeaders,
  )
  const media = await ensureMediaObjectFromStorageKey(storageKey, {
    mimeType: 'video/mp4',
    durationMs: durationSec * 1000,
  })
  await prisma.consistencyExperimentVideo.update({
    where: { id: params.video.id },
    data: {
      videoUrl: media.url,
      videoMediaId: media.id,
      status: 'ready',
      errorMessage: null,
      metadataJson: {
        ...readRecord(params.video.metadataJson),
        ...reference.metadata,
        durationSec,
        modelId: params.modelId,
        ...(typeof generatedVideo.actualVideoTokens === 'number'
          ? { actualVideoTokens: generatedVideo.actualVideoTokens }
          : {}),
      },
    },
  })
}

export async function handleConsistencyExperimentVideoTask(job: Job<TaskJobData>) {
  const run = await loadExperimentRun(job.data.targetId, job.data.projectId)
  if (!run) throw new Error('CONSISTENCY_EXPERIMENT_RUN_NOT_FOUND')
  if (run.videos.length === 0) throw new Error('CONSISTENCY_EXPERIMENT_VIDEOS_REQUIRED')
  const snapshot = parseSnapshot(run)
  const modelId = readVideoModel(run)
  try {
    await prisma.consistencyExperimentRun.update({
      where: { id: run.id },
      data: { status: 'generating', errorMessage: null },
    })
    for (const [index, video] of run.videos.entries()) {
      await reportTaskProgress(job, 12 + Math.floor(index / Math.max(run.videos.length, 1) * 78), {
        stage: 'consistency_experiment_video_generate',
        videoId: video.id,
      })
      await prisma.consistencyExperimentVideo.update({
        where: { id: video.id },
        data: { status: 'generating', errorMessage: null },
      })
      await generateExperimentVideo({ job, run, snapshot, video, modelId })
    }
    await assertTaskActive(job, 'persist_consistency_experiment_video_complete')
    await prisma.consistencyExperimentRun.update({
      where: { id: run.id },
      data: { status: 'ready', errorMessage: null },
    })
    return {
      runId: run.id,
      videoCount: run.videos.length,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await prisma.consistencyExperimentRun.update({
      where: { id: run.id },
      data: { status: 'failed', errorMessage: message },
    }).catch(() => undefined)
    await prisma.consistencyExperimentVideo.updateMany({
      where: { runId: run.id, status: 'generating' },
      data: { status: 'failed', errorMessage: message },
    }).catch(() => undefined)
    throw error
  }
}
