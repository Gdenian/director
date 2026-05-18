import { ApiError } from '@/lib/api-errors'
import type { Locale } from '@/i18n/routing'
import { TASK_TYPE } from '@/lib/task/types'
import { submitTask } from '@/lib/task/submitter'
import { prisma } from '@/lib/prisma'
import { buildStoryboardConsistencySource } from './source-snapshot'
import { classifyStoryboardConsistencyBlocks } from './strategies'

interface SubmitCoordinateStoryboardInput {
  readonly projectId: string
  readonly episodeId: string
  readonly editScriptId?: string
  readonly userId: string
  readonly locale: Locale
  readonly requestId?: string | null
}

function assertRequiredLocationPreviews(input: {
  readonly sourceSnapshot: Awaited<ReturnType<typeof buildStoryboardConsistencySource>>['sourceSnapshot']
}) {
  const classifications = classifyStoryboardConsistencyBlocks(input.sourceSnapshot)
  const missing = classifications.flatMap((classification) => {
    if (classification.classification === 'no_fixed_space') return []
    const block = input.sourceSnapshot.videoBlocks.find((item) => item.sourceVideoBlockId === classification.sourceVideoBlockId)
    if (!block) throw new Error(`EDIT_SCRIPT_STORYBOARD_BLOCK_MISSING:${classification.sourceVideoBlockId}`)
    return input.sourceSnapshot.assets
      .filter((asset) => (
        asset.kind === 'location'
        && asset.shotNumbers.some((shotNumber) => block.shotNumbers.includes(shotNumber))
        && !asset.previewImageUrl
      ))
      .map((asset) => asset.name)
  })
  const uniqueMissing = Array.from(new Set(missing))
  if (uniqueMissing.length > 0) {
    throw new ApiError('CONFLICT', {
      code: 'EDIT_SCRIPT_STORYBOARD_LOCATION_REFERENCE_REQUIRED',
      message: `Location reference images are required before coordinate storyboard generation: ${uniqueMissing.join(', ')}`,
    })
  }
}

export async function submitEditScriptCoordinateStoryboard(input: SubmitCoordinateStoryboardInput) {
  const editScript = input.editScriptId
    ? { id: input.editScriptId }
    : await prisma.projectEditScript.findFirst({
      where: {
        projectId: input.projectId,
        episodeId: input.episodeId,
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    })
  if (!editScript?.id) throw new ApiError('NOT_FOUND')
  const { sourceSnapshot, modelConfigSnapshot } = await buildStoryboardConsistencySource({
    projectId: input.projectId,
    episodeId: input.episodeId,
    editScriptId: editScript.id,
    userId: input.userId,
  })
  assertRequiredLocationPreviews({ sourceSnapshot })
  return await submitTask({
    userId: input.userId,
    locale: input.locale,
    projectId: input.projectId,
    episodeId: input.episodeId,
    type: TASK_TYPE.EDIT_SCRIPT_STORYBOARD_PREPARE,
    targetType: 'ProjectEditScript',
    targetId: editScript.id,
    operationId: 'generate_edit_script_storyboard',
    operationSource: 'project-ui',
    requestId: input.requestId || null,
    payload: {
      editScriptId: editScript.id,
      sourceSnapshot,
      modelConfigSnapshot,
      count: sourceSnapshot.shots.length,
    },
    dedupeKey: `edit_script_storyboard_prepare:${input.projectId}:${input.episodeId}:${editScript.id}`,
  })
}
