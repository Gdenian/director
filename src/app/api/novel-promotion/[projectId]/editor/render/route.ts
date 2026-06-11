import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { findScopedEditorProject } from '@/lib/novel-promotion/ai-editing/editor-auth'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readBool(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

async function requireScopedEditor(input: {
  projectId: string
  episodeId: string | null
  editorProjectId: string | null
}) {
  if (!input.episodeId && !input.editorProjectId) {
    throw new ApiError('INVALID_PARAMS')
  }

  if (input.episodeId) {
    const editorProject = await findScopedEditorProject({
      projectId: input.projectId,
      episodeId: input.episodeId,
      editorProjectId: input.editorProjectId,
    })
    if (!editorProject || editorProject.episodeId !== input.episodeId) {
      throw new ApiError('NOT_FOUND')
    }
    return editorProject
  }

  const editorProject = await prisma.videoEditorProject.findUnique({
    where: { id: input.editorProjectId || '' },
  })
  if (!editorProject) {
    throw new ApiError('NOT_FOUND')
  }
  const scopedEditorProject = await findScopedEditorProject({
    projectId: input.projectId,
    episodeId: editorProject.episodeId,
    editorProjectId: editorProject.id,
  })
  if (!scopedEditorProject) {
    throw new ApiError('NOT_FOUND')
  }
  return scopedEditorProject
}

export const POST = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json()
  const locale = resolveRequiredTaskLocale(request, body)
  const episodeId = readString(body?.episodeId)
  const editorProjectId = readString(body?.editorProjectId)
  const format = readString(body?.format) || 'mp4'
  const quality = readString(body?.quality) || 'high'
  const burnSubtitles = readBool(body?.burnSubtitles)

  const editorProject = await requireScopedEditor({ projectId, episodeId, editorProjectId })
  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    episodeId: editorProject.episodeId,
    type: TASK_TYPE.EDITOR_RENDER,
    targetType: 'VideoEditorProject',
    targetId: editorProject.id,
    payload: {
      editorProjectId: editorProject.id,
      episodeId: editorProject.episodeId,
      format,
      quality,
      ...(burnSubtitles === null ? {} : { burnSubtitles }),
    },
    dedupeKey: `editor_render:${editorProject.id}`,
  })

  await prisma.videoEditorProject.update({
    where: { id: editorProject.id },
    data: {
      renderStatus: 'pending',
      renderTaskId: result.taskId,
    },
  })

  return NextResponse.json({
    ...result,
    editorProjectId: editorProject.id,
    renderStatus: 'pending',
  }, { status: 202 })
})

export const GET = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const episodeId = request.nextUrl.searchParams.get('episodeId')
  const editorProjectId = request.nextUrl.searchParams.get('editorProjectId') || request.nextUrl.searchParams.get('id')
  const editorProject = await requireScopedEditor({ projectId, episodeId, editorProjectId })

  const taskId = editorProject.renderTaskId
  const task = taskId
    ? await prisma.task.findFirst({
      where: {
        id: taskId,
        projectId,
        episodeId: editorProject.episodeId,
        type: TASK_TYPE.EDITOR_RENDER,
        targetType: 'VideoEditorProject',
        targetId: editorProject.id,
      },
      select: {
        id: true,
        status: true,
        progress: true,
        errorCode: true,
        errorMessage: true,
        result: true,
        updatedAt: true,
      },
    })
    : null

  return NextResponse.json({
    editorProjectId: editorProject.id,
    taskId,
    status: task?.status || editorProject.renderStatus || 'idle',
    progress: task?.progress,
    errorCode: task?.errorCode,
    errorMessage: task?.errorMessage,
    result: task?.result,
    renderStatus: editorProject.renderStatus,
    outputUrl: editorProject.outputUrl,
    updatedAt: task?.updatedAt || editorProject.updatedAt,
  })
})
