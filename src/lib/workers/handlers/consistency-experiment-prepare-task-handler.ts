import { type Job } from 'bullmq'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { type TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '../shared'
import {
  analyzeGridCoordinates,
  generateContactSheetPlan,
  generateGridFloorPlan,
  generateStructuredTextPlan,
  type ContactSheetPlanModelOutput,
  type GridFloorPlanModelOutput,
} from '@/lib/consistency-lab/model-generation'
import {
  consistencyLabSourceSnapshotSchema,
  type ConsistencyLabPanelDraft,
  type ConsistencyLabSourceSnapshot,
} from '@/lib/consistency-lab/types'
import { toSignedUrlIfCos } from '../utils'

type ExperimentRunRecord = NonNullable<Awaited<ReturnType<typeof loadRun>>>

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function readAnalysisModel(run: ExperimentRunRecord): string {
  const modelConfig = readRecord(run.modelConfigSnapshot)
  const analysisModel = readString(modelConfig.analysisModel)
  if (!analysisModel) throw new Error('CONSISTENCY_EXPERIMENT_ANALYSIS_MODEL_REQUIRED')
  return analysisModel
}

function parseSnapshot(run: ExperimentRunRecord): ConsistencyLabSourceSnapshot {
  const parsed = consistencyLabSourceSnapshotSchema.safeParse(run.sourceSnapshotJson)
  if (!parsed.success) throw new Error('CONSISTENCY_EXPERIMENT_SOURCE_SNAPSHOT_INVALID')
  return parsed.data
}

async function loadRun(runId: string, projectId: string) {
  return await prisma.consistencyExperimentRun.findFirst({
    where: { id: runId, projectId },
    include: {
      artifacts: { orderBy: [{ createdAt: 'asc' }, { groupIndex: 'asc' }] },
    },
  })
}

async function replacePanels(runId: string, panels: readonly ConsistencyLabPanelDraft[]) {
  await prisma.consistencyExperimentPanel.deleteMany({ where: { runId } })
  await prisma.consistencyExperimentPanel.createMany({
    data: panels.map((panel) => ({
      runId,
      sourceShotNumber: panel.sourceShotNumber,
      sourceVideoBlockId: panel.sourceVideoBlockId,
      panelIndex: panel.panelIndex,
      prompt: panel.prompt,
      metadataJson: panel.metadata as Prisma.InputJsonValue,
      status: 'ready',
    })),
  })
}

async function persistStructuredTextRun(params: {
  readonly run: ExperimentRunRecord
  readonly strategyOutput: unknown
  readonly panels: readonly ConsistencyLabPanelDraft[]
}) {
  await prisma.$transaction(async (tx) => {
    await tx.consistencyExperimentArtifact.deleteMany({ where: { runId: params.run.id } })
    await tx.consistencyExperimentArtifact.create({
      data: {
        runId: params.run.id,
        kind: 'structured_text_plan',
        metadataJson: params.strategyOutput as Prisma.InputJsonValue,
        status: 'ready',
      },
    })
    await tx.consistencyExperimentPanel.deleteMany({ where: { runId: params.run.id } })
    await tx.consistencyExperimentPanel.createMany({
      data: params.panels.map((panel) => ({
        runId: params.run.id,
        sourceShotNumber: panel.sourceShotNumber,
        sourceVideoBlockId: panel.sourceVideoBlockId,
        panelIndex: panel.panelIndex,
        prompt: panel.prompt,
        metadataJson: panel.metadata as Prisma.InputJsonValue,
        status: 'ready',
      })),
    })
    await tx.consistencyExperimentRun.update({
      where: { id: params.run.id },
      data: {
        status: 'ready',
        currentStage: 'panel_prompts_ready',
        strategyOutputJson: params.strategyOutput as Prisma.InputJsonValue,
        errorMessage: null,
      },
    })
  })
}

async function persistGridFloorPlanRun(params: {
  readonly run: ExperimentRunRecord
  readonly strategyOutput: GridFloorPlanModelOutput
}) {
  await prisma.$transaction(async (tx) => {
    await tx.consistencyExperimentPanel.deleteMany({ where: { runId: params.run.id } })
    await tx.consistencyExperimentArtifact.deleteMany({ where: { runId: params.run.id } })
    await tx.consistencyExperimentArtifact.createMany({
      data: params.strategyOutput.floorPlans.map((plan) => ({
        runId: params.run.id,
        kind: 'grid_floor_plan',
        sourceVideoBlockId: plan.sourceVideoBlockId,
        groupIndex: plan.groupIndex,
        prompt: plan.skipped ? null : plan.prompt,
        metadataJson: {
          classification: plan.classification,
          location: plan.location,
          participants: plan.participants,
          anchors: plan.anchors,
          skipped: plan.skipped,
          reason: plan.reason,
          grid: params.strategyOutput.grid,
        } as Prisma.InputJsonValue,
        status: plan.skipped ? 'ready' : 'pending',
      })),
    })
    await tx.consistencyExperimentRun.update({
      where: { id: params.run.id },
      data: {
        status: 'ready',
        currentStage: 'floor_plan_prompts_ready',
        strategyOutputJson: params.strategyOutput as Prisma.InputJsonValue,
        errorMessage: null,
      },
    })
  })
}

function contactSheetCellsForGroup(group: ContactSheetPlanModelOutput['groups'][number]) {
  return group.cells.map((cell) => ({
    shotNumber: cell.shotNumber,
    cellIndex: cell.cellIndex,
    row: cell.row,
    column: cell.column,
  }))
}

async function persistContactSheetRun(params: {
  readonly run: ExperimentRunRecord
  readonly strategyOutput: ContactSheetPlanModelOutput
  readonly panels: readonly ConsistencyLabPanelDraft[]
}) {
  await prisma.$transaction(async (tx) => {
    await tx.consistencyExperimentArtifact.deleteMany({ where: { runId: params.run.id } })
    await tx.consistencyExperimentArtifact.createMany({
      data: params.strategyOutput.groups.map((group) => ({
        runId: params.run.id,
        kind: 'contact_sheet_full',
        sourceVideoBlockId: group.sourceVideoBlockId,
        groupIndex: group.groupIndex,
        prompt: group.prompt,
        metadataJson: {
          sourceVideoBlockId: group.sourceVideoBlockId,
          groupIndex: group.groupIndex,
          shotNumbers: group.shotNumbers,
          cells: contactSheetCellsForGroup(group),
        } as Prisma.InputJsonValue,
        status: 'pending',
      })),
    })
    await tx.consistencyExperimentPanel.deleteMany({ where: { runId: params.run.id } })
    await tx.consistencyExperimentPanel.createMany({
      data: params.panels.map((panel) => ({
        runId: params.run.id,
        sourceShotNumber: panel.sourceShotNumber,
        sourceVideoBlockId: panel.sourceVideoBlockId,
        panelIndex: panel.panelIndex,
        prompt: panel.prompt,
        metadataJson: panel.metadata as Prisma.InputJsonValue,
        status: 'ready',
      })),
    })
    await tx.consistencyExperimentRun.update({
      where: { id: params.run.id },
      data: {
        status: 'ready',
        currentStage: 'panel_prompts_ready',
        strategyOutputJson: params.strategyOutput as Prisma.InputJsonValue,
        errorMessage: null,
      },
    })
  })
}

export async function handleConsistencyExperimentPrepareTask(job: Job<TaskJobData>) {
  const run = await loadRun(job.data.targetId, job.data.projectId)
  if (!run) throw new Error('CONSISTENCY_EXPERIMENT_RUN_NOT_FOUND')
  const snapshot = parseSnapshot(run)
  const model = readAnalysisModel(run)
  await reportTaskProgress(job, 15, { stage: 'consistency_experiment_prepare' })
  try {
    if (run.strategy === 'structured_text') {
      const generated = await generateStructuredTextPlan({
        userId: job.data.userId,
        projectId: job.data.projectId,
        model,
        locale: job.data.locale,
        snapshot,
      })
      await persistStructuredTextRun({
        run,
        strategyOutput: generated.strategyOutput,
        panels: generated.panels,
      })
      return { runId: run.id, strategy: run.strategy, panelCount: generated.panels.length }
    }
    if (run.strategy === 'grid_coordinates') {
      const strategyOutput = await generateGridFloorPlan({
        userId: job.data.userId,
        projectId: job.data.projectId,
        model,
        locale: job.data.locale,
        snapshot,
      })
      await persistGridFloorPlanRun({ run, strategyOutput })
      return { runId: run.id, strategy: run.strategy, floorPlanCount: strategyOutput.floorPlans.length }
    }
    if (run.strategy === 'contact_sheet_9grid') {
      const generated = await generateContactSheetPlan({
        userId: job.data.userId,
        projectId: job.data.projectId,
        model,
        locale: job.data.locale,
        snapshot,
      })
      await persistContactSheetRun({
        run,
        strategyOutput: generated.strategyOutput,
        panels: generated.panels,
      })
      return { runId: run.id, strategy: run.strategy, panelCount: generated.panels.length }
    }
    throw new Error(`CONSISTENCY_EXPERIMENT_STRATEGY_UNSUPPORTED:${run.strategy}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await prisma.consistencyExperimentRun.update({
      where: { id: run.id },
      data: { status: 'failed', currentStage: 'failed', errorMessage: message },
    }).catch(() => undefined)
    throw error
  }
}

export async function handleConsistencyExperimentGridAnalyzeTask(job: Job<TaskJobData>) {
  const run = await loadRun(job.data.targetId, job.data.projectId)
  if (!run) throw new Error('CONSISTENCY_EXPERIMENT_RUN_NOT_FOUND')
  if (run.strategy !== 'grid_coordinates') throw new Error('CONSISTENCY_EXPERIMENT_GRID_STRATEGY_REQUIRED')
  const snapshot = parseSnapshot(run)
  const model = readAnalysisModel(run)
  const overlays = run.artifacts.filter((artifact) => (
    artifact.kind === 'grid_coordinate_overlay'
    && artifact.status === 'ready'
    && artifact.imageUrl
  ))
  if (overlays.length === 0) throw new Error('CONSISTENCY_EXPERIMENT_GRID_OVERLAY_REQUIRED')
  const overlayImageUrls = overlays.map((artifact) => {
    if (!artifact.imageUrl) throw new Error(`CONSISTENCY_EXPERIMENT_GRID_OVERLAY_URL_REQUIRED:${artifact.id}`)
    const signed = toSignedUrlIfCos(artifact.imageUrl, 3600)
    if (!signed) throw new Error(`CONSISTENCY_EXPERIMENT_GRID_OVERLAY_URL_INVALID:${artifact.id}`)
    return signed
  })
  await reportTaskProgress(job, 20, { stage: 'consistency_experiment_grid_analyze' })
  try {
    const generated = await analyzeGridCoordinates({
      userId: job.data.userId,
      projectId: job.data.projectId,
      model,
      locale: job.data.locale,
      snapshot,
      overlayImageUrls,
      floorPlanArtifacts: run.artifacts.map((artifact) => ({
        id: artifact.id,
        kind: artifact.kind,
        sourceVideoBlockId: artifact.sourceVideoBlockId,
        groupIndex: artifact.groupIndex,
        imageUrl: artifact.imageUrl,
        metadataJson: artifact.metadataJson,
      })),
    })
    await replacePanels(run.id, generated.panels)
    await prisma.consistencyExperimentRun.update({
      where: { id: run.id },
      data: {
        status: 'ready',
        currentStage: 'panel_prompts_ready',
        strategyOutputJson: generated.strategyOutput as unknown as Prisma.InputJsonValue,
        errorMessage: null,
      },
    })
    return { runId: run.id, strategy: run.strategy, panelCount: generated.panels.length }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await prisma.consistencyExperimentRun.update({
      where: { id: run.id },
      data: { status: 'failed', currentStage: 'failed', errorMessage: message },
    }).catch(() => undefined)
    throw error
  }
}
