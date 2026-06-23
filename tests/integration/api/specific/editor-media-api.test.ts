import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const editorAuthMock = vi.hoisted(() => ({
  findScopedEditorProject: vi.fn(async () => ({
    id: 'editor-1',
    episodeId: 'episode-1',
    projectData: JSON.stringify({
      config: { fps: 30 },
    }),
  })),
}))

const manifestMock = vi.hoisted(() => ({
  buildEditorManifest: vi.fn(async () => ({
    episodeId: 'episode-1',
    fps: 30,
    dimensions: { width: 1920, height: 1080 },
    clips: [],
    voiceLines: [],
    editorAssets: [],
  })),
}))

const editorAssetsMock = vi.hoisted(() => ({
  listImportedEditorAssets: vi.fn(async () => []),
}))

const importMediaMock = vi.hoisted(() => ({
  EditorImportError: class EditorImportError extends Error {
    constructor(public code: string) {
      super(code)
    }
  },
  importEditorMediaFromUrl: vi.fn(async () => ({
    id: 'asset-1',
    editorProjectId: 'editor-1',
    episodeId: 'episode-1',
    kind: 'user_import_video',
    status: 'completed',
    url: '/m/imported',
    mediaObjectId: 'media-1',
    metadata: JSON.stringify({ label: 'Imported' }),
  })),
  importEditorMediaFromBuffer: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/novel-promotion/ai-editing/editor-auth', () => editorAuthMock)
vi.mock('@/lib/novel-promotion/ai-editing/manifest', () => manifestMock)
vi.mock('@/lib/novel-promotion/ai-editing/editor-assets', () => editorAssetsMock)
vi.mock('@/lib/novel-promotion/ai-editing/import-media', () => importMediaMock)

describe('api specific - editor media route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns an empty media library for an empty manifest and no imported assets', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/editor/media/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/editor/media',
      method: 'GET',
      query: { episodeId: 'episode-1', editorProjectId: 'editor-1' },
    })

    const res = await mod.GET(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ media: { fps: 30, entries: [] } })
    expect(editorAuthMock.findScopedEditorProject).toHaveBeenCalledWith({
      projectId: 'project-1',
      episodeId: 'episode-1',
      editorProjectId: 'editor-1',
    })
    expect(editorAssetsMock.listImportedEditorAssets).toHaveBeenCalledWith('editor-1')
  })

  it('POST JSON imports media from a URL and returns the asset', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/editor/media/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/editor/media',
      method: 'POST',
      body: {
        episodeId: 'episode-1',
        editorProjectId: 'editor-1',
        url: 'https://example.com/video.mp4',
        mimeType: 'video/mp4',
        label: 'Imported',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(importMediaMock.importEditorMediaFromUrl).toHaveBeenCalledWith({
      editorProjectId: 'editor-1',
      episodeId: 'episode-1',
      url: 'https://example.com/video.mp4',
      mimeType: 'video/mp4',
      label: 'Imported',
    })
    expect(body).toEqual({ asset: expect.objectContaining({ id: 'asset-1' }) })
  })

  it('POST multipart rejects huge content-length before parsing form data', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/editor/media/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/editor/media',
      method: 'POST',
      headers: {
        'content-type': 'multipart/form-data; boundary=test',
        'content-length': String(500 * 1024 * 1024 + 1),
      },
    })
    const formDataSpy = vi.spyOn(req, 'formData')

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body).toMatchObject({
      code: 'INVALID_PARAMS',
      importCode: 'EDITOR_IMPORT_TOO_LARGE',
    })
    expect(formDataSpy).not.toHaveBeenCalled()
    expect(importMediaMock.importEditorMediaFromBuffer).not.toHaveBeenCalled()
  })
})
