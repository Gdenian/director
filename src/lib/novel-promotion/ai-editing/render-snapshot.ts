import { migrateProjectData } from '@/features/video-editor/utils/migration'
import type { VideoEditorProject } from '@/features/video-editor/types/editor.types'
import { prisma } from '@/lib/prisma'

export type RenderSnapshot = {
  editorProjectId: string
  episodeId: string
  fps: number
  width: number
  height: number
  burnSubtitles: boolean
  projectData: VideoEditorProject
  createdAt: string
}

export async function createRenderSnapshot(input: {
  projectId: string
  editorProjectId: string
  burnSubtitles: boolean
}): Promise<RenderSnapshot> {
  const editorProject = await prisma.videoEditorProject.findFirst({
    where: {
      id: input.editorProjectId,
      episode: { novelPromotionProject: { projectId: input.projectId } },
    },
  })
  if (!editorProject) {
    throw new Error('EDITOR_RENDER_PROJECT_NOT_FOUND')
  }

  const projectData = migrateProjectData(JSON.parse(editorProject.projectData))
  return {
    editorProjectId: editorProject.id,
    episodeId: editorProject.episodeId,
    fps: projectData.config.fps,
    width: projectData.config.width,
    height: projectData.config.height,
    burnSubtitles: input.burnSubtitles,
    projectData,
    createdAt: new Date().toISOString(),
  }
}
