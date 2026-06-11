import type { Locale } from '@/i18n/routing'
import { prisma } from '@/lib/prisma'
import { migrateProjectData } from '@/features/video-editor/utils/migration'
import { createEditorVersion } from './versions'

export type RefineResult = {
  editorProjectId: string
  pendingVersionId: string
  summary: string
  warnings: string[]
}

export async function refineAiEdit(input: {
  taskId: string
  projectId: string
  episodeId: string
  userId: string
  locale: Locale
  instruction: string
  payload: Record<string, unknown>
}): Promise<RefineResult> {
  void input.userId
  void input.locale
  void input.payload

  const editorProject = await prisma.videoEditorProject.findFirst({
    where: {
      episodeId: input.episodeId,
      episode: { novelPromotionProject: { projectId: input.projectId } },
    },
  })
  if (!editorProject) {
    throw new Error('AI_EDIT_REFINE_EDITOR_PROJECT_NOT_FOUND')
  }

  const projectData = migrateProjectData(JSON.parse(editorProject.projectData))
  const summary = `根据指令准备剪辑微调：${input.instruction}`
  const version = await createEditorVersion({
    editorProjectId: editorProject.id,
    reason: 'ai_refine',
    summary,
    snapshot: projectData,
    diff: { instruction: input.instruction },
    createdByTaskId: input.taskId,
  })

  projectData.pendingVersion = {
    versionId: version.id,
    summary,
    reason: 'ai_refine',
    createdAt: version.createdAt.toISOString(),
  }

  await prisma.videoEditorProject.update({
    where: { id: editorProject.id },
    data: {
      projectData: JSON.stringify(projectData),
      updatedAt: new Date(),
    },
  })

  return {
    editorProjectId: editorProject.id,
    pendingVersionId: version.id,
    summary,
    warnings: ['AI planner is not enabled yet; pending version keeps the current timeline.'],
  }
}
