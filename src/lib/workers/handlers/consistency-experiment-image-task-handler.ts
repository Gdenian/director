import { type Job } from 'bullmq'
import type { Prisma } from '@prisma/client'
import sharp from 'sharp'
import { prisma } from '@/lib/prisma'
import { getObjectBuffer, uploadObject, generateUniqueKey } from '@/lib/storage'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import { type TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '../shared'
import {
  assertTaskActive,
  resolveImageSourceFromGeneration,
  toSignedUrlIfCos,
  uploadImageSourceToCos,
} from '../utils'
import {
  normalizeReferenceImageItemsForGeneration,
  type ReferenceImageItem,
} from './image-task-handler-shared'
import {
  consistencyLabSourceSnapshotSchema,
  type ConsistencyLabAssetSnapshot,
  type ConsistencyLabSourceSnapshot,
} from '@/lib/consistency-lab/types'

type ExperimentRunRecord = NonNullable<Awaited<ReturnType<typeof loadExperimentRun>>>
type ExperimentPanelRecord = ExperimentRunRecord['panels'][number]

interface ContactSheetCellMetadata {
  readonly shotNumber: number
  readonly cellIndex: number
  readonly row: number
  readonly column: number
}

interface ContactSheetMetadata {
  readonly sourceVideoBlockId: string
  readonly groupIndex: number
  readonly shotNumbers: readonly number[]
  readonly cells: readonly ContactSheetCellMetadata[]
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

function readPositiveInteger(value: unknown): number | null {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

function readContactSheetMetadata(panel: ExperimentPanelRecord): ContactSheetMetadata {
  const metadata = readRecord(panel.metadataJson)
  const contactSheet = readRecord(metadata.contactSheet)
  const group = readRecord(contactSheet.group)
  const cellsRaw = Array.isArray(group.cells) ? group.cells : []
  const cells = cellsRaw.map((item) => {
    const cell = readRecord(item)
    const shotNumber = readPositiveInteger(cell.shotNumber)
    const cellIndex = Number(cell.cellIndex)
    const row = Number(cell.row)
    const column = Number(cell.column)
    if (
      shotNumber === null ||
      !Number.isInteger(cellIndex) ||
      cellIndex < 0 ||
      !Number.isInteger(row) ||
      row < 0 ||
      row > 2 ||
      !Number.isInteger(column) ||
      column < 0 ||
      column > 2
    ) {
      throw new Error(`CONSISTENCY_EXPERIMENT_CONTACT_SHEET_CELL_INVALID:${panel.id}`)
    }
    return { shotNumber, cellIndex, row, column }
  })
  const sourceVideoBlockId = readString(group.sourceVideoBlockId)
  const groupIndex = Number(group.groupIndex)
  const shotNumbers = Array.isArray(group.shotNumbers)
    ? group.shotNumbers.map(readPositiveInteger).filter((item): item is number => item !== null)
    : []
  if (!sourceVideoBlockId || !Number.isInteger(groupIndex) || groupIndex < 0 || shotNumbers.length === 0 || cells.length === 0) {
    throw new Error(`CONSISTENCY_EXPERIMENT_CONTACT_SHEET_METADATA_INVALID:${panel.id}`)
  }
  return {
    sourceVideoBlockId,
    groupIndex,
    shotNumbers,
    cells,
  }
}

async function loadExperimentRun(runId: string, projectId: string) {
  return await prisma.consistencyExperimentRun.findFirst({
    where: { id: runId, projectId },
    include: {
      panels: { orderBy: { panelIndex: 'asc' } },
    },
  })
}

function parseSnapshot(run: ExperimentRunRecord): ConsistencyLabSourceSnapshot {
  const parsed = consistencyLabSourceSnapshotSchema.safeParse(run.sourceSnapshotJson)
  if (!parsed.success) throw new Error('CONSISTENCY_EXPERIMENT_SOURCE_SNAPSHOT_INVALID')
  return parsed.data
}

function readStoryboardModel(run: ExperimentRunRecord): string {
  const snapshot = readRecord(run.modelConfigSnapshot)
  const storyboardModel = readString(snapshot.storyboardModel)
  if (!storyboardModel) throw new Error('CONSISTENCY_EXPERIMENT_STORYBOARD_MODEL_REQUIRED')
  return storyboardModel
}

function assetsForPanel(snapshot: ConsistencyLabSourceSnapshot, panel: ExperimentPanelRecord): ConsistencyLabAssetSnapshot[] {
  const block = snapshot.videoBlocks.find((item) => item.sourceVideoBlockId === panel.sourceVideoBlockId)
  const shotNumbers = block?.shotNumbers ?? [panel.sourceShotNumber]
  return snapshot.assets.filter((asset) => asset.shotNumbers.some((shotNumber) => shotNumbers.includes(shotNumber)))
}

async function referenceImagesForPanel(
  snapshot: ConsistencyLabSourceSnapshot,
  panel: ExperimentPanelRecord,
  locale: TaskJobData['locale'],
): Promise<string[]> {
  const items: ReferenceImageItem[] = assetsForPanel(snapshot, panel)
    .map((asset): ReferenceImageItem => {
      if (!asset.previewImageUrl) {
        throw new Error(`CONSISTENCY_EXPERIMENT_ASSET_PREVIEW_REQUIRED:${asset.kind}:${asset.name}`)
      }
      const signed = toSignedUrlIfCos(asset.previewImageUrl, 3600)
      if (!signed) throw new Error(`CONSISTENCY_EXPERIMENT_ASSET_PREVIEW_INVALID:${asset.kind}:${asset.name}`)
      return {
        url: signed,
        role: asset.kind === 'location' ? 'location' : 'character',
        name: asset.name,
      }
    })
  const normalized = await normalizeReferenceImageItemsForGeneration(items, {
    locale,
    context: { taskType: 'consistency_experiment_image', scope: 'consistency-lab.refs' },
  })
  return normalized.referenceImages
}

function groupContactSheetPanels(panels: readonly ExperimentPanelRecord[]) {
  const groups = new Map<string, {
    readonly metadata: ContactSheetMetadata
    readonly panels: ExperimentPanelRecord[]
  }>()
  for (const panel of panels) {
    const metadata = readContactSheetMetadata(panel)
    const key = `${metadata.sourceVideoBlockId}:${metadata.groupIndex}`
    const existing = groups.get(key)
    if (existing) {
      existing.panels.push(panel)
    } else {
      groups.set(key, { metadata, panels: [panel] })
    }
  }
  return Array.from(groups.values())
}

function buildContactSheetPrompt(params: {
  readonly metadata: ContactSheetMetadata
  readonly panels: readonly ExperimentPanelRecord[]
  readonly videoRatio: string
}) {
  const panelByShot = new Map(params.panels.map((panel) => [panel.sourceShotNumber, panel]))
  const cells = params.metadata.cells.map((cell) => {
    const panel = panelByShot.get(cell.shotNumber)
    if (!panel) throw new Error(`CONSISTENCY_EXPERIMENT_CONTACT_SHEET_PANEL_MISSING:${cell.shotNumber}`)
    return [
      `Cell ${cell.cellIndex + 1} (row ${cell.row + 1}, column ${cell.column + 1}, shot #${cell.shotNumber}):`,
      panel.prompt,
    ].join('\n')
  })
  return [
    `Generate one contact sheet image with aspect ratio ${params.videoRatio}.`,
    'The image must be a clean 3x3 grid. Every cell has the same size and the same internal shot aspect ratio.',
    'Keep character identity, wardrobe, location, lighting, camera language, and spatial anchors consistent across all occupied cells.',
    'Do not add text, numbers, subtitles, labels, watermarks, borders with captions, or UI.',
    'Unused cells must stay visually empty and simple so fixed 3x3 cropping remains safe.',
    ...cells,
  ].join('\n\n')
}

async function persistPanelImage(params: {
  readonly panel: ExperimentPanelRecord
  readonly storageKey: string
  readonly metadataPatch?: Record<string, unknown>
}) {
  const media = await ensureMediaObjectFromStorageKey(params.storageKey, {
    mimeType: 'image/png',
  })
  const existingMetadata = readRecord(params.panel.metadataJson)
  await prisma.consistencyExperimentPanel.update({
    where: { id: params.panel.id },
    data: {
      imageUrl: media.url,
      imageMediaId: media.id,
      candidateImages: JSON.stringify([media.url]),
      metadataJson: {
        ...existingMetadata,
        ...(params.metadataPatch || {}),
      } as Prisma.InputJsonValue,
      status: 'ready',
      errorMessage: null,
    },
  })
}

async function generateRegularPanelImages(params: {
  readonly job: Job<TaskJobData>
  readonly run: ExperimentRunRecord
  readonly snapshot: ConsistencyLabSourceSnapshot
  readonly modelId: string
}) {
  const total = params.run.panels.length
  for (const [index, panel] of params.run.panels.entries()) {
    await reportTaskProgress(params.job, 10 + Math.floor(index / Math.max(total, 1) * 80), {
      stage: 'generate_consistency_experiment_panel',
      panelId: panel.id,
    })
    await prisma.consistencyExperimentPanel.update({
      where: { id: panel.id },
      data: { status: 'generating', errorMessage: null },
    })
    const referenceImages = await referenceImagesForPanel(params.snapshot, panel, params.job.data.locale)
    const source = await resolveImageSourceFromGeneration(params.job, {
      userId: params.job.data.userId,
      modelId: params.modelId,
      prompt: panel.prompt,
      options: {
        referenceImages,
        aspectRatio: params.snapshot.project.videoRatio,
      },
      allowTaskExternalIdResume: false,
      pollProgress: { start: 20, end: 88 },
    })
    const storageKey = await uploadImageSourceToCos(source, 'consistency-experiment-panel', panel.id)
    await assertTaskActive(params.job, 'persist_consistency_experiment_panel')
    await persistPanelImage({ panel, storageKey })
  }
}

async function cropContactSheetPanels(params: {
  readonly fullStorageKey: string
  readonly fullMediaId: string
  readonly fullImageUrl: string
  readonly metadata: ContactSheetMetadata
  readonly panels: readonly ExperimentPanelRecord[]
}) {
  const buffer = await getObjectBuffer(params.fullStorageKey)
  const metadata = await sharp(buffer).metadata()
  const width = metadata.width
  const height = metadata.height
  if (!width || !height) throw new Error('CONSISTENCY_EXPERIMENT_CONTACT_SHEET_DIMENSIONS_REQUIRED')
  const cellWidth = Math.floor(width / 3)
  const cellHeight = Math.floor(height / 3)
  const panelByShot = new Map(params.panels.map((panel) => [panel.sourceShotNumber, panel]))
  for (const cell of params.metadata.cells) {
    const panel = panelByShot.get(cell.shotNumber)
    if (!panel) throw new Error(`CONSISTENCY_EXPERIMENT_CONTACT_SHEET_PANEL_MISSING:${cell.shotNumber}`)
    const left = cell.column * cellWidth
    const top = cell.row * cellHeight
    const extracted = await sharp(buffer)
      .extract({
        left,
        top,
        width: cell.column === 2 ? width - left : cellWidth,
        height: cell.row === 2 ? height - top : cellHeight,
      })
      .png()
      .toBuffer()
    const storageKey = await uploadObject(
      extracted,
      generateUniqueKey(`images/consistency-experiment-panel/${panel.id}`, 'png'),
      1,
      'image/png',
    )
    await persistPanelImage({
      panel,
      storageKey,
      metadataPatch: {
        contactSheetImageUrl: params.fullImageUrl,
        contactSheetImageMediaId: params.fullMediaId,
        crop: {
          left,
          top,
          width: cell.column === 2 ? width - left : cellWidth,
          height: cell.row === 2 ? height - top : cellHeight,
        },
      },
    })
  }
}

async function generateContactSheetImages(params: {
  readonly job: Job<TaskJobData>
  readonly run: ExperimentRunRecord
  readonly snapshot: ConsistencyLabSourceSnapshot
  readonly modelId: string
}) {
  const groups = groupContactSheetPanels(params.run.panels)
  for (const [index, group] of groups.entries()) {
    await reportTaskProgress(params.job, 10 + Math.floor(index / Math.max(groups.length, 1) * 70), {
      stage: 'generate_consistency_experiment_contact_sheet',
      sourceVideoBlockId: group.metadata.sourceVideoBlockId,
      groupIndex: group.metadata.groupIndex,
    })
    await prisma.consistencyExperimentPanel.updateMany({
      where: { id: { in: group.panels.map((panel) => panel.id) } },
      data: { status: 'generating', errorMessage: null },
    })
    const referenceImages = await referenceImagesForPanel(params.snapshot, group.panels[0], params.job.data.locale)
    const source = await resolveImageSourceFromGeneration(params.job, {
      userId: params.job.data.userId,
      modelId: params.modelId,
      prompt: buildContactSheetPrompt({
        metadata: group.metadata,
        panels: group.panels,
        videoRatio: params.snapshot.project.videoRatio,
      }),
      options: {
        referenceImages,
        aspectRatio: params.snapshot.project.videoRatio,
      },
      allowTaskExternalIdResume: false,
      pollProgress: { start: 20, end: 78 },
    })
    const fullStorageKey = await uploadImageSourceToCos(
      source,
      'consistency-experiment-contact-sheet',
      `${params.run.id}-${group.metadata.groupIndex}`,
    )
    const fullMedia = await ensureMediaObjectFromStorageKey(fullStorageKey, {
      mimeType: 'image/png',
    })
    await reportTaskProgress(params.job, 82, {
      stage: 'crop_consistency_experiment_contact_sheet',
      groupIndex: group.metadata.groupIndex,
    })
    await cropContactSheetPanels({
      fullStorageKey,
      fullMediaId: fullMedia.id,
      fullImageUrl: fullMedia.url,
      metadata: group.metadata,
      panels: group.panels,
    })
  }
}

export async function handleConsistencyExperimentImageTask(job: Job<TaskJobData>) {
  const run = await loadExperimentRun(job.data.targetId, job.data.projectId)
  if (!run) throw new Error('CONSISTENCY_EXPERIMENT_RUN_NOT_FOUND')
  if (run.panels.length === 0) throw new Error('CONSISTENCY_EXPERIMENT_PANELS_REQUIRED')
  const snapshot = parseSnapshot(run)
  const modelId = readStoryboardModel(run)
  try {
    await prisma.consistencyExperimentRun.update({
      where: { id: run.id },
      data: { status: 'generating', errorMessage: null },
    })
    if (run.strategy === 'contact_sheet_9grid') {
      await generateContactSheetImages({ job, run, snapshot, modelId })
    } else {
      await generateRegularPanelImages({ job, run, snapshot, modelId })
    }
    await assertTaskActive(job, 'persist_consistency_experiment_images_complete')
    await prisma.consistencyExperimentRun.update({
      where: { id: run.id },
      data: { status: 'ready', errorMessage: null },
    })
    return {
      runId: run.id,
      panelCount: run.panels.length,
      strategy: run.strategy,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await prisma.consistencyExperimentRun.update({
      where: { id: run.id },
      data: { status: 'failed', errorMessage: message },
    }).catch(() => undefined)
    await prisma.consistencyExperimentPanel.updateMany({
      where: { runId: run.id, status: 'generating' },
      data: { status: 'failed', errorMessage: message },
    }).catch(() => undefined)
    throw error
  }
}
