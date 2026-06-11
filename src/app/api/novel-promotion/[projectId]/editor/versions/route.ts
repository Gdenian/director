import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { findScopedEditorProject } from '@/lib/novel-promotion/ai-editing/editor-auth'
import { listEditorVersions } from '@/lib/novel-promotion/ai-editing/versions'

export const GET = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const episodeId = request.nextUrl.searchParams.get('episodeId')
  const editorProjectId = request.nextUrl.searchParams.get('editorProjectId')
  if (!episodeId) throw new ApiError('INVALID_PARAMS')

  const editorProject = await findScopedEditorProject({ projectId, episodeId, editorProjectId })
  if (!editorProject) throw new ApiError('NOT_FOUND')

  const versions = await listEditorVersions(editorProject.id)
  return NextResponse.json({
    editorProjectId: editorProject.id,
    versions: versions.map((version) => ({
      id: version.id,
      versionIndex: version.versionIndex,
      reason: version.reason,
      summary: version.summary,
      createdByTaskId: version.createdByTaskId,
      createdAt: version.createdAt,
    })),
  })
})
