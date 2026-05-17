import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import type { Locale } from '@/i18n/routing'
import { TASK_TYPE } from '@/lib/task/types'
import { submitTask } from '@/lib/task/submitter'
import { buildConsistencyLabSource } from './source-snapshot'
import {
  buildContactSheet9GridStrategyOutput,
  buildGridCoordinatesStrategyOutput,
  buildStructuredTextStrategyOutput,
} from './strategies'
import { buildConsistencyLabPanelDrafts } from './prompt-builder'
import {
  CONSISTENCY_LAB_ARTIFACT_STATUSES,
  CONSISTENCY_LAB_RUN_STATUSES,
  CONSISTENCY_LAB_STRATEGIES,
  type ConsistencyLabArtifactStatus,
  type ConsistencyLabPanelDto,
  type ConsistencyLabRunDto,
  type ConsistencyLabRunStatus,
  type ConsistencyLabSourceSnapshot,
  type ConsistencyLabStrategy,
  type ConsistencyLabStrategyOutput,
  type ConsistencyLabVideoDto,
  consistencyLabSourceSnapshotSchema,
} from './types'

interface CreateRunInput {
  readonly projectId: string
  readonly episodeId: string
  readonly editScriptId: string
  readonly userId: string
  readonly strategy: ConsistencyLabStrategy
  readonly locale: Locale
}

interface ListRunsInput {
  readonly projectId: string
  readonly episodeId: string
  readonly editScriptId: string
}

interface DeleteRunInput {
  readonly projectId: string
  readonly runId: string
}

interface SubmitRunTaskInput {
  readonly projectId: string
  readonly runId: string
  readonly userId: string
  readonly locale: Locale
  readonly requestId?: string | null
}

function isRunStatus(value: string): value is ConsistencyLabRunStatus {
  return CONSISTENCY_LAB_RUN_STATUSES.includes(value as ConsistencyLabRunStatus)
}

function isArtifactStatus(value: string): value is ConsistencyLabArtifactStatus {
  return CONSISTENCY_LAB_ARTIFACT_STATUSES.includes(value as ConsistencyLabArtifactStatus)
}

function assertRunStatus(value: string): ConsistencyLabRunStatus {
  if (!isRunStatus(value)) throw new Error(`CONSISTENCY_LAB_RUN_STATUS_INVALID:${value}`)
  return value
}

function assertArtifactStatus(value: string): ConsistencyLabArtifactStatus {
  if (!isArtifactStatus(value)) throw new Error(`CONSISTENCY_LAB_ARTIFACT_STATUS_INVALID:${value}`)
  return value
}

function assertStrategy(value: string): ConsistencyLabStrategy {
  const strategy = CONSISTENCY_LAB_STRATEGIES.find((item) => item === value)
  if (!strategy) throw new Error(`CONSISTENCY_LAB_STRATEGY_INVALID:${value}`)
  return strategy
}

function buildStrategyOutput(
  strategy: ConsistencyLabStrategy,
  snapshot: ConsistencyLabSourceSnapshot,
): ConsistencyLabStrategyOutput {
  if (strategy === 'structured_text') return buildStructuredTextStrategyOutput(snapshot)
  if (strategy === 'grid_coordinates') return buildGridCoordinatesStrategyOutput(snapshot)
  return buildContactSheet9GridStrategyOutput(snapshot)
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function readModelConfigSnapshot(value: unknown): {
  readonly storyboardModel: string | null
  readonly videoModel: string | null
} {
  const snapshot = readRecord(value)
  return {
    storyboardModel: readString(snapshot.storyboardModel),
    videoModel: readString(snapshot.videoModel),
  }
}

function sourceSnapshotFromRun(run: {
  readonly sourceSnapshotJson: Prisma.JsonValue
}): ConsistencyLabSourceSnapshot {
  const parsed = consistencyLabSourceSnapshotSchema.safeParse(run.sourceSnapshotJson)
  if (!parsed.success) throw new Error('CONSISTENCY_LAB_SOURCE_SNAPSHOT_INVALID')
  return parsed.data
}

function mapPanel(panel: {
  readonly id: string
  readonly runId: string
  readonly sourceShotNumber: number
  readonly sourceVideoBlockId: string
  readonly panelIndex: number
  readonly prompt: string
  readonly imageUrl: string | null
  readonly imageMediaId: string | null
  readonly candidateImages: string | null
  readonly metadataJson: Prisma.JsonValue | null
  readonly status: string
  readonly errorMessage: string | null
}): ConsistencyLabPanelDto {
  return {
    id: panel.id,
    runId: panel.runId,
    sourceShotNumber: panel.sourceShotNumber,
    sourceVideoBlockId: panel.sourceVideoBlockId,
    panelIndex: panel.panelIndex,
    prompt: panel.prompt,
    imageUrl: panel.imageUrl,
    imageMediaId: panel.imageMediaId,
    candidateImages: panel.candidateImages,
    metadataJson: panel.metadataJson,
    status: assertArtifactStatus(panel.status),
    errorMessage: panel.errorMessage,
  }
}

function mapVideo(video: {
  readonly id: string
  readonly runId: string
  readonly sourceVideoBlockId: string
  readonly sourceShotNumbers: Prisma.JsonValue
  readonly prompt: string
  readonly referencePanelImageIds: Prisma.JsonValue
  readonly videoUrl: string | null
  readonly videoMediaId: string | null
  readonly metadataJson: Prisma.JsonValue | null
  readonly status: string
  readonly errorMessage: string | null
}): ConsistencyLabVideoDto {
  return {
    id: video.id,
    runId: video.runId,
    sourceVideoBlockId: video.sourceVideoBlockId,
    sourceShotNumbers: video.sourceShotNumbers,
    prompt: video.prompt,
    referencePanelImageIds: video.referencePanelImageIds,
    videoUrl: video.videoUrl,
    videoMediaId: video.videoMediaId,
    metadataJson: video.metadataJson,
    status: assertArtifactStatus(video.status),
    errorMessage: video.errorMessage,
  }
}

function mapRun(run: {
  readonly id: string
  readonly projectId: string
  readonly episodeId: string
  readonly sourceEditScriptId: string
  readonly strategy: string
  readonly status: string
  readonly modelConfigSnapshot: Prisma.JsonValue
  readonly sourceSnapshotJson: Prisma.JsonValue
  readonly strategyInputJson: Prisma.JsonValue
  readonly strategyOutputJson: Prisma.JsonValue
  readonly errorMessage: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly panels: readonly Parameters<typeof mapPanel>[0][]
  readonly videos: readonly Parameters<typeof mapVideo>[0][]
}): ConsistencyLabRunDto {
  return {
    id: run.id,
    projectId: run.projectId,
    episodeId: run.episodeId,
    sourceEditScriptId: run.sourceEditScriptId,
    strategy: assertStrategy(run.strategy),
    status: assertRunStatus(run.status),
    modelConfigSnapshot: run.modelConfigSnapshot,
    sourceSnapshotJson: run.sourceSnapshotJson,
    strategyInputJson: run.strategyInputJson,
    strategyOutputJson: run.strategyOutputJson,
    errorMessage: run.errorMessage,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    panels: run.panels.map(mapPanel),
    videos: run.videos.map(mapVideo),
  }
}

export async function listConsistencyExperimentRuns(input: ListRunsInput): Promise<ConsistencyLabRunDto[]> {
  const runs = await prisma.consistencyExperimentRun.findMany({
    where: {
      projectId: input.projectId,
      episodeId: input.episodeId,
      sourceEditScriptId: input.editScriptId,
    },
    orderBy: { createdAt: 'desc' },
    include: {
      panels: { orderBy: { panelIndex: 'asc' } },
      videos: { orderBy: { createdAt: 'asc' } },
    },
  })
  return runs.map(mapRun)
}

export async function createConsistencyExperimentRun(input: CreateRunInput): Promise<ConsistencyLabRunDto> {
  const { sourceSnapshot, modelConfigSnapshot } = await buildConsistencyLabSource({
    projectId: input.projectId,
    episodeId: input.episodeId,
    editScriptId: input.editScriptId,
    userId: input.userId,
  })
  const strategyOutput = buildStrategyOutput(input.strategy, sourceSnapshot)
  const panelDrafts = buildConsistencyLabPanelDrafts({
    snapshot: sourceSnapshot,
    strategy: input.strategy,
    strategyOutput,
    locale: input.locale,
  })
  const run = await prisma.consistencyExperimentRun.create({
    data: {
      projectId: input.projectId,
      episodeId: input.episodeId,
      sourceEditScriptId: input.editScriptId,
      strategy: input.strategy,
      status: 'ready',
      modelConfigSnapshot: modelConfigSnapshot as unknown as Prisma.InputJsonValue,
      sourceSnapshotJson: sourceSnapshot as unknown as Prisma.InputJsonValue,
      strategyInputJson: {
        strategy: input.strategy,
        sourceEditScriptId: input.editScriptId,
        episodeId: input.episodeId,
      } as Prisma.InputJsonValue,
      strategyOutputJson: strategyOutput as unknown as Prisma.InputJsonValue,
      panels: {
        create: panelDrafts.map((draft) => ({
          sourceShotNumber: draft.sourceShotNumber,
          sourceVideoBlockId: draft.sourceVideoBlockId,
          panelIndex: draft.panelIndex,
          prompt: draft.prompt,
          metadataJson: draft.metadata as Prisma.InputJsonValue,
          status: 'ready',
        })),
      },
    },
    include: {
      panels: { orderBy: { panelIndex: 'asc' } },
      videos: { orderBy: { createdAt: 'asc' } },
    },
  })
  return mapRun(run)
}

export async function deleteConsistencyExperimentRun(input: DeleteRunInput): Promise<{ readonly success: true }> {
  const run = await prisma.consistencyExperimentRun.findFirst({
    where: {
      id: input.runId,
      projectId: input.projectId,
    },
    select: { id: true },
  })
  if (!run) throw new ApiError('NOT_FOUND')
  await prisma.consistencyExperimentRun.delete({ where: { id: run.id } })
  return { success: true }
}

export async function submitConsistencyExperimentImageGeneration(input: SubmitRunTaskInput) {
  const run = await prisma.consistencyExperimentRun.findFirst({
    where: {
      id: input.runId,
      projectId: input.projectId,
    },
    include: {
      panels: true,
    },
  })
  if (!run) throw new ApiError('NOT_FOUND')
  if (run.panels.length === 0) {
    throw new ApiError('CONFLICT', {
      code: 'CONSISTENCY_LAB_RUN_EMPTY',
      message: 'Consistency lab run has no panels to generate',
    })
  }
  const modelConfig = readModelConfigSnapshot(run.modelConfigSnapshot)
  if (!modelConfig.storyboardModel) {
    throw new ApiError('CONFLICT', {
      code: 'CONSISTENCY_LAB_STORYBOARD_MODEL_REQUIRED',
      message: 'Storyboard model is required before generating experiment images',
    })
  }
  await prisma.$transaction([
    prisma.consistencyExperimentRun.update({
      where: { id: run.id },
      data: { status: 'generating', errorMessage: null },
    }),
    prisma.consistencyExperimentPanel.updateMany({
      where: { runId: run.id },
      data: { status: 'pending', errorMessage: null },
    }),
  ])
  try {
    return await submitTask({
      userId: input.userId,
      locale: input.locale,
      projectId: input.projectId,
      episodeId: run.episodeId,
      type: TASK_TYPE.CONSISTENCY_EXPERIMENT_IMAGE,
      targetType: 'ConsistencyExperimentRun',
      targetId: run.id,
      operationId: 'consistency_lab_generate_images',
      operationSource: 'project-ui',
      requestId: input.requestId || null,
      payload: {
        runId: run.id,
        imageModel: modelConfig.storyboardModel,
        count: run.strategy === 'contact_sheet_9grid' ? 1 : run.panels.length,
      },
      dedupeKey: `consistency_lab_images:${run.id}`,
    })
  } catch (error) {
    await prisma.$transaction([
      prisma.consistencyExperimentRun.update({
        where: { id: run.id },
        data: { status: 'failed', errorMessage: error instanceof Error ? error.message : String(error) },
      }),
      prisma.consistencyExperimentPanel.updateMany({
        where: { runId: run.id },
        data: { status: 'failed', errorMessage: error instanceof Error ? error.message : String(error) },
      }),
    ]).catch(() => undefined)
    throw error
  }
}

export async function submitConsistencyExperimentVideoGeneration(input: SubmitRunTaskInput) {
  const run = await prisma.consistencyExperimentRun.findFirst({
    where: {
      id: input.runId,
      projectId: input.projectId,
    },
    include: {
      panels: true,
    },
  })
  if (!run) throw new ApiError('NOT_FOUND')
  const snapshot = sourceSnapshotFromRun(run)
  const modelConfig = readModelConfigSnapshot(run.modelConfigSnapshot)
  if (!modelConfig.videoModel) {
    throw new ApiError('CONFLICT', {
      code: 'CONSISTENCY_LAB_VIDEO_MODEL_REQUIRED',
      message: 'Video model is required before generating experiment videos',
    })
  }
  const panelByShotNumber = new Map(run.panels.map((panel) => [panel.sourceShotNumber, panel]))
  const videoDrafts = snapshot.videoBlocks.map((block) => {
    const panels = block.shotNumbers.map((shotNumber) => {
      const panel = panelByShotNumber.get(shotNumber)
      if (!panel) throw new Error(`CONSISTENCY_LAB_VIDEO_PANEL_MISSING:${shotNumber}`)
      if (!panel.imageUrl || !panel.imageMediaId) throw new Error(`CONSISTENCY_LAB_VIDEO_PANEL_IMAGE_REQUIRED:${shotNumber}`)
      return panel
    })
    return {
      sourceVideoBlockId: block.sourceVideoBlockId,
      sourceShotNumbers: block.shotNumbers,
      prompt: block.prompt,
      referencePanelImageIds: panels.map((panel) => panel.imageMediaId),
      metadataJson: {
        strategy: run.strategy,
        sourceEditScriptId: run.sourceEditScriptId,
        videoModel: modelConfig.videoModel,
      },
      status: 'pending',
    }
  })
  await prisma.$transaction(async (tx) => {
    await tx.consistencyExperimentVideo.deleteMany({ where: { runId: run.id } })
    await tx.consistencyExperimentVideo.createMany({
      data: videoDrafts.map((draft) => ({
        runId: run.id,
        sourceVideoBlockId: draft.sourceVideoBlockId,
        sourceShotNumbers: draft.sourceShotNumbers as Prisma.InputJsonValue,
        prompt: draft.prompt,
        referencePanelImageIds: draft.referencePanelImageIds as Prisma.InputJsonValue,
        metadataJson: draft.metadataJson as Prisma.InputJsonValue,
        status: draft.status,
      })),
    })
    await tx.consistencyExperimentRun.update({
      where: { id: run.id },
      data: { status: 'generating', errorMessage: null },
    })
  })
  try {
    return await submitTask({
      userId: input.userId,
      locale: input.locale,
      projectId: input.projectId,
      episodeId: run.episodeId,
      type: TASK_TYPE.CONSISTENCY_EXPERIMENT_VIDEO,
      targetType: 'ConsistencyExperimentRun',
      targetId: run.id,
      operationId: 'consistency_lab_generate_videos',
      operationSource: 'project-ui',
      requestId: input.requestId || null,
      payload: {
        runId: run.id,
        videoModel: modelConfig.videoModel,
        count: videoDrafts.length,
      },
      dedupeKey: `consistency_lab_videos:${run.id}`,
    })
  } catch (error) {
    await prisma.$transaction([
      prisma.consistencyExperimentRun.update({
        where: { id: run.id },
        data: { status: 'failed', errorMessage: error instanceof Error ? error.message : String(error) },
      }),
      prisma.consistencyExperimentVideo.updateMany({
        where: { runId: run.id },
        data: { status: 'failed', errorMessage: error instanceof Error ? error.message : String(error) },
      }),
    ]).catch(() => undefined)
    throw error
  }
}
