import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { findScopedEditorProject } from '@/lib/novel-promotion/ai-editing/editor-auth'
import { restoreEditorVersion } from '@/lib/novel-promotion/ai-editing/versions'

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
  const versionId = typeof body?.versionId === 'string' ? body.versionId.trim() : ''
  if (!episodeId || !versionId) throw new ApiError('INVALID_PARAMS')

  const editorProject = await findScopedEditorProject({ projectId, episodeId, editorProjectId })
  if (!editorProject) throw new ApiError('NOT_FOUND')

  const version = await prisma.videoEditorProjectVersion.findUnique({
    where: { id: versionId },
    select: { editorProjectId: true },
  })
  if (!version || version.editorProjectId !== editorProject.id) {
    throw new ApiError('NOT_FOUND')
  }

  const restored = await restoreEditorVersion(versionId)
  if (!restored) throw new ApiError('NOT_FOUND')

  return NextResponse.json({
    success: true,
    editorProjectId: editorProject.id,
    version: restored.version,
    projectData: restored.snapshot,
  })
})
