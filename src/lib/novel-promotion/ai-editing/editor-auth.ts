import { prisma } from '@/lib/prisma'

export async function assertEpisodeInProject(projectId: string, episodeId: string) {
  const episode = await prisma.novelPromotionEpisode.findFirst({
    where: {
      id: episodeId,
      novelPromotionProject: { projectId },
    },
    select: { id: true },
  })

  return episode
}

export async function findScopedEditorProject(input: {
  projectId: string
  episodeId: string
  editorProjectId?: string | null
}) {
  const episode = await assertEpisodeInProject(input.projectId, input.episodeId)
  if (!episode) return null

  if (input.editorProjectId) {
    const editorProject = await prisma.videoEditorProject.findUnique({
      where: { id: input.editorProjectId },
    })
    if (!editorProject || editorProject.episodeId !== input.episodeId) return null
    return editorProject
  }

  return await prisma.videoEditorProject.findUnique({
    where: { episodeId: input.episodeId },
  })
}

export async function requireScopedEditorProject(input: {
  projectId: string
  episodeId: string
  editorProjectId?: string | null
}) {
  const editorProject = await findScopedEditorProject(input)
  if (!editorProject) {
    throw new Error('EDITOR_PROJECT_NOT_FOUND')
  }
  return editorProject
}
