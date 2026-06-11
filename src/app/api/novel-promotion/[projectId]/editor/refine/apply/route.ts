import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { migrateProjectData } from '@/features/video-editor/utils/migration'
import { findScopedEditorProject } from '@/lib/novel-promotion/ai-editing/editor-auth'

export const POST = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const episodeId = typeof body?.episodeId === 'string' ? body.episodeId.trim() : ''
  const editorProjectId = typeof body?.editorProjectId === 'string' ? body.editorProjectId.trim() : null
  const pendingVersionId = typeof body?.pendingVersionId === 'string' ? body.pendingVersionId.trim() : ''
  if (!episodeId || !pendingVersionId) throw new ApiError('INVALID_PARAMS')

  const editorProject = await findScopedEditorProject({ projectId, episodeId, editorProjectId })
  if (!editorProject) throw new ApiError('NOT_FOUND')

  const version = await prisma.videoEditorProjectVersion.findUnique({
    where: { id: pendingVersionId },
  })
  if (!version || version.editorProjectId !== editorProject.id) {
    throw new ApiError('NOT_FOUND')
  }

  const snapshot = migrateProjectData(JSON.parse(version.snapshotJson))
  snapshot.id = editorProject.id
  snapshot.episodeId = editorProject.episodeId
  snapshot.pendingVersion = null

  await prisma.videoEditorProject.update({
    where: { id: editorProject.id },
    data: {
      projectData: JSON.stringify(snapshot),
      updatedAt: new Date(),
    },
  })

  return NextResponse.json({
    success: true,
    editorProjectId: editorProject.id,
    projectData: snapshot,
  })
})
