import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import type { Locale } from '@/i18n/routing'
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
