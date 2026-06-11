import type { Locale } from '@/i18n/routing'
import { prisma } from '@/lib/prisma'
import { buildConservativeTimeline } from './conservative-timeline'
import { buildEditorManifest } from './manifest'
import { createEditorVersion } from './versions'

export type AssembleResult = {
  editorProjectId: string
  summary: string
  degraded: boolean
  warnings: string[]
}

export async function assembleInitialAiEdit(input: {
  taskId: string
  projectId: string
  episodeId: string
  userId: string
  locale: Locale
  payload: Record<string, unknown>
}): Promise<AssembleResult> {
  void input.userId
  void input.locale
  void input.payload

  const manifest = await buildEditorManifest({
    projectId: input.projectId,
    episodeId: input.episodeId,
  })
  const projectData = buildConservativeTimeline(manifest)
  const editorProject = await prisma.videoEditorProject.upsert({
    where: { episodeId: input.episodeId },
    create: {
      episodeId: input.episodeId,
      projectData: JSON.stringify(projectData),
    },
    update: {
      projectData: JSON.stringify(projectData),
      updatedAt: new Date(),
    },
  })

  projectData.id = editorProject.id
  await prisma.videoEditorProject.update({
    where: { id: editorProject.id },
    data: { projectData: JSON.stringify(projectData) },
  })

  await createEditorVersion({
    editorProjectId: editorProject.id,
    reason: 'ai_initial',
    summary: '按原剧情顺序生成完整剪辑初稿',
    snapshot: projectData,
    createdByTaskId: input.taskId,
  })

  return {
    editorProjectId: editorProject.id,
    summary: '按原剧情顺序生成完整剪辑初稿',
    degraded: true,
    warnings: ['AI planner is not enabled yet; used conservative story-order assembly.'],
  }
}
