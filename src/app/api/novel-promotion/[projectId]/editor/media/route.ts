import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { findScopedEditorProject } from '@/lib/novel-promotion/ai-editing/editor-auth'
import { listImportedEditorAssets } from '@/lib/novel-promotion/ai-editing/editor-assets'
import {
  EditorImportError,
  importEditorMediaFromBuffer,
  importEditorMediaFromUrl,
} from '@/lib/novel-promotion/ai-editing/import-media'
import { buildEditorManifest } from '@/lib/novel-promotion/ai-editing/manifest'
import { buildAiEditableMediaLibrary } from '@/lib/novel-promotion/ai-editing/media-library'

const MAX_MULTIPART_IMPORT_BYTES = 500 * 1024 * 1024

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function requireScopedEditor(input: {
  projectId: string
  episodeId: string | null
  editorProjectId: string | null
}) {
  if (!input.episodeId) throw new ApiError('INVALID_PARAMS')

  const editorProject = await findScopedEditorProject({
    projectId: input.projectId,
    episodeId: input.episodeId,
    editorProjectId: input.editorProjectId,
  })
  if (!editorProject) throw new ApiError('NOT_FOUND')
  return editorProject
}

function apiErrorFromImportError(error: unknown): never {
  if (error instanceof EditorImportError) {
    throw new ApiError('INVALID_PARAMS', { importCode: error.code })
  }
  throw error
}

export const GET = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const episodeId = readString(request.nextUrl.searchParams.get('episodeId'))
  const editorProjectId = readString(request.nextUrl.searchParams.get('editorProjectId'))
  const editorProject = await requireScopedEditor({ projectId, episodeId, editorProjectId })
  const manifest = await buildEditorManifest({
    projectId,
    episodeId: editorProject.episodeId,
    fps: readEditorFps(editorProject.projectData),
  })
  const importedAssets = await listImportedEditorAssets(editorProject.id)
  const media = await buildAiEditableMediaLibrary({
    fps: manifest.fps,
    manifest,
    importedAssets,
  })

  return NextResponse.json({ media })
})

export const POST = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const contentType = request.headers.get('content-type') || ''
  if (contentType.toLowerCase().includes('multipart/form-data')) {
    return await handleMultipartPost(request, projectId)
  }

  return await handleJsonPost(request, projectId)
})

async function handleJsonPost(request: NextRequest, projectId: string) {
  const body = await request.json()
  const episodeId = readString(body?.episodeId)
  const editorProjectId = readString(body?.editorProjectId)
  const url = readString(body?.url)
  const mimeType = readString(body?.mimeType)
  const label = readString(body?.label)
  if (!episodeId || !url || !mimeType) throw new ApiError('INVALID_PARAMS')

  const editorProject = await requireScopedEditor({ projectId, episodeId, editorProjectId })
  try {
    const asset = await importEditorMediaFromUrl({
      editorProjectId: editorProject.id,
      episodeId: editorProject.episodeId,
      url,
      mimeType,
      label,
    })
    return NextResponse.json({ asset })
  } catch (error) {
    apiErrorFromImportError(error)
  }
}

async function handleMultipartPost(request: NextRequest, projectId: string) {
  const contentLength = parseContentLength(request.headers.get('content-length'))
  if (contentLength != null && contentLength > MAX_MULTIPART_IMPORT_BYTES) {
    apiErrorFromImportError(new EditorImportError('EDITOR_IMPORT_TOO_LARGE'))
  }

  const form = await request.formData()
  const episodeId = readString(form.get('episodeId'))
  const editorProjectId = readString(form.get('editorProjectId'))
  const label = readString(form.get('label'))
  const file = form.get('file')
  if (!episodeId || !(file instanceof File)) throw new ApiError('INVALID_PARAMS')

  const editorProject = await requireScopedEditor({ projectId, episodeId, editorProjectId })
  try {
    const asset = await importEditorMediaFromBuffer({
      editorProjectId: editorProject.id,
      episodeId: editorProject.episodeId,
      fileName: file.name,
      mimeType: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
      label,
    })
    return NextResponse.json({ asset })
  } catch (error) {
    apiErrorFromImportError(error)
  }
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function readEditorFps(projectData: string | null | undefined) {
  if (!projectData) return undefined
  try {
    const parsed = JSON.parse(projectData) as { config?: { fps?: unknown } }
    return typeof parsed.config?.fps === 'number' && Number.isFinite(parsed.config.fps)
      ? parsed.config.fps
      : undefined
  } catch {
    return undefined
  }
}
