import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { sourceBlockForPanel, sourceShotForPanel } from './prompt-builder'
import {
  consistencyLabSourceSnapshotSchema,
  type ConsistencyLabSourceSnapshot,
} from './types'

function parseSnapshot(value: Prisma.JsonValue): ConsistencyLabSourceSnapshot {
  const parsed = consistencyLabSourceSnapshotSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error('CONSISTENCY_LAB_SOURCE_SNAPSHOT_INVALID')
  }
  return parsed.data
}

function editStoryboardMarker(editScriptId: string): string {
  return JSON.stringify({
    source: 'edit_script',
    editScriptId,
  })
}

function buildShotTimingByNumber(snapshot: ConsistencyLabSourceSnapshot): Map<number, {
  readonly start: number
  readonly end: number
}> {
  let cursor = 0
  const timings = new Map<number, { readonly start: number; readonly end: number }>()
  for (const shot of snapshot.shots) {
    const start = cursor
    const end = cursor + shot.durationSec
    cursor = end
    timings.set(shot.shotNumber, { start, end })
  }
  return timings
}

export async function adoptConsistencyExperimentRun(input: {
  readonly projectId: string
  readonly runId: string
}): Promise<{
  readonly storyboardId: string
  readonly panelCount: number
}> {
  const run = await prisma.consistencyExperimentRun.findFirst({
    where: {
      id: input.runId,
      projectId: input.projectId,
    },
    include: {
      panels: { orderBy: { panelIndex: 'asc' } },
    },
  })
  if (!run) throw new ApiError('NOT_FOUND')
  if (run.status !== 'ready') {
    throw new ApiError('CONFLICT', {
      code: 'CONSISTENCY_LAB_RUN_NOT_READY',
      message: 'Only ready consistency lab runs can be adopted',
    })
  }
  if (run.panels.length === 0) {
    throw new ApiError('CONFLICT', {
      code: 'CONSISTENCY_LAB_RUN_EMPTY',
      message: 'Consistency lab run has no panels to adopt',
    })
  }

  const snapshot = parseSnapshot(run.sourceSnapshotJson)
  const shotTimingByNumber = buildShotTimingByNumber(snapshot)
  const markerNeedle = `"editScriptId":"${snapshot.sourceEditScriptId}"`
  const existing = await prisma.projectStoryboard.findFirst({
    where: {
      episodeId: snapshot.episodeId,
      clip: {
        screenplay: {
          contains: markerNeedle,
        },
      },
    },
    include: {
      clip: true,
      panels: { orderBy: { panelIndex: 'asc' } },
    },
  })
  const storyboardTextJson = JSON.stringify({
    source: 'consistency_lab',
    sourceType: 'consistencyExperimentRun',
    adoptedRunId: run.id,
    strategy: run.strategy,
    editScriptId: snapshot.sourceEditScriptId,
    shots: snapshot.shots,
    videoBlocks: snapshot.videoBlocks,
  })
  const photographyPlan = JSON.stringify({
    source: 'consistency_lab',
    sourceType: 'consistencyExperimentRun',
    adoptedRunId: run.id,
    strategy: run.strategy,
  })
  const storyboard = existing
    ? await prisma.$transaction(async (tx) => {
        await tx.projectClip.update({
          where: { id: existing.clipId },
          data: {
            end: snapshot.editScript.durationSec,
            duration: snapshot.editScript.durationSec,
            summary: snapshot.editScript.title,
            location: snapshot.assets.filter((asset) => asset.kind === 'location').map((asset) => asset.name).join('、') || null,
            characters: JSON.stringify(snapshot.assets.filter((asset) => asset.kind === 'character').map((asset) => asset.name)),
            content: snapshot.editScript.logline || snapshot.editScript.userPrompt || snapshot.editScript.title,
            shotCount: snapshot.editScript.shotCount,
            screenplay: editStoryboardMarker(snapshot.sourceEditScriptId),
          },
        })
        return await tx.projectStoryboard.update({
          where: { id: existing.id },
          data: {
            panelCount: run.panels.length,
            storyboardTextJson,
            photographyPlan,
          },
          include: { panels: true },
        })
      })
    : await prisma.$transaction(async (tx) => {
        const clip = await tx.projectClip.create({
          data: {
            episodeId: snapshot.episodeId,
            start: 0,
            end: snapshot.editScript.durationSec,
            duration: snapshot.editScript.durationSec,
            summary: snapshot.editScript.title,
            location: snapshot.assets.filter((asset) => asset.kind === 'location').map((asset) => asset.name).join('、') || null,
            characters: JSON.stringify(snapshot.assets.filter((asset) => asset.kind === 'character').map((asset) => asset.name)),
            props: null,
            content: snapshot.editScript.logline || snapshot.editScript.userPrompt || snapshot.editScript.title,
            shotCount: snapshot.editScript.shotCount,
            screenplay: editStoryboardMarker(snapshot.sourceEditScriptId),
          },
        })
        return await tx.projectStoryboard.create({
          data: {
            episodeId: snapshot.episodeId,
            clipId: clip.id,
            panelCount: run.panels.length,
            storyboardTextJson,
            photographyPlan,
          },
          include: { panels: true },
        })
      })

  const existingPanels = new Map(storyboard.panels.map((panel) => [panel.panelIndex, panel.id]))
  for (const panel of run.panels) {
    const shot = sourceShotForPanel(snapshot, panel.sourceShotNumber)
    const block = sourceBlockForPanel(snapshot, panel.sourceVideoBlockId)
    const timing = shotTimingByNumber.get(shot.shotNumber)
    if (!timing) {
      throw new Error('CONSISTENCY_LAB_PANEL_SHOT_TIMING_MISSING')
    }
    const location = snapshot.assets.find((asset) => asset.kind === 'location' && asset.shotNumbers.includes(shot.shotNumber))
    const characters = snapshot.assets.filter((asset) => asset.kind === 'character' && asset.shotNumbers.includes(shot.shotNumber))
    const data = {
      panelNumber: shot.shotNumber,
      shotType: shot.camera,
      cameraMove: shot.camera,
      description: shot.visualAction,
      location: location?.name ?? null,
      characters: characters.length > 0 ? JSON.stringify(characters.map((asset) => ({
        name: asset.name,
        targetId: asset.targetId,
        requirementId: asset.requirementId,
      }))) : null,
      props: null,
      srtSegment: shot.visualAction,
      srtStart: timing.start,
      srtEnd: timing.end,
      duration: shot.durationSec,
      imagePrompt: panel.prompt,
      imageUrl: panel.imageUrl,
      imageMediaId: panel.imageMediaId,
      candidateImages: panel.candidateImages,
      videoPrompt: shot.videoPrompt,
      photographyRules: JSON.stringify({
        source: 'consistency_lab',
        runId: run.id,
        strategy: run.strategy,
        sourceShotNumber: shot.shotNumber,
        sourceVideoBlockId: block.sourceVideoBlockId,
      }),
      actingNotes: null,
    }
    const existingPanelId = existingPanels.get(panel.panelIndex)
    if (existingPanelId) {
      await prisma.projectPanel.update({
        where: { id: existingPanelId },
        data,
      })
    } else {
      await prisma.projectPanel.create({
        data: {
          storyboardId: storyboard.id,
          panelIndex: panel.panelIndex,
          ...data,
        },
      })
    }
  }
  await prisma.projectStoryboard.update({
    where: { id: storyboard.id },
    data: { panelCount: run.panels.length },
  })
  return {
    storyboardId: storyboard.id,
    panelCount: run.panels.length,
  }
}
