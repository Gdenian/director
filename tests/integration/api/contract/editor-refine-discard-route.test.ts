import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({
  authenticated: true,
}))

const prismaMock = vi.hoisted(() => ({
  novelPromotionEpisode: {
    findFirst: vi.fn(),
  },
  videoEditorProject: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireProjectAuthLight: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1' },
      }
    },
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('api contract - editor refine discard route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = true
    prismaMock.novelPromotionEpisode.findFirst.mockResolvedValue({ id: 'episode-1' })
    prismaMock.videoEditorProject.findUnique.mockResolvedValue({
      id: 'editor-1',
      episodeId: 'episode-1',
      projectData: JSON.stringify({
        id: 'editor-1',
        episodeId: 'episode-1',
        schemaVersion: '1.2',
        config: { fps: 30, width: 1920, height: 1080, videoRatio: '16:9', burnSubtitlesDefault: true },
        timeline: [],
        audioTrack: [],
        subtitleCues: [],
        editorAssets: [],
        bgmTrack: [],
        pendingVersion: {
          versionId: 'version-1',
          summary: '待应用',
          reason: 'ai_refine',
          createdAt: '2026-06-22T00:00:00.000Z',
        },
      }),
    })
    prismaMock.videoEditorProject.update.mockResolvedValue({ id: 'editor-1' })
  })

  it('requires project auth and clears pendingVersion without applying the pending snapshot', async () => {
    const { POST } = await import('@/app/api/novel-promotion/[projectId]/editor/refine/discard/route')

    authState.authenticated = false
    const unauthorizedReq = buildMockRequest({
      path: '/api/novel-promotion/project-1/editor/refine/discard',
      method: 'POST',
      body: { episodeId: 'episode-1', editorProjectId: 'editor-1' },
    })
    const unauthorizedRes = await POST(unauthorizedReq, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(unauthorizedRes.status).toBe(401)

    authState.authenticated = true
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/editor/refine/discard',
      method: 'POST',
      body: { episodeId: 'episode-1', editorProjectId: 'editor-1' },
    })
    const res = await POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(prismaMock.videoEditorProject.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'editor-1' },
    }))
    const updateArg = prismaMock.videoEditorProject.update.mock.calls[0]?.[0]
    const persistedProject = JSON.parse(updateArg.data.projectData)
    expect(persistedProject.pendingVersion).toBeNull()
    expect(body.projectData.pendingVersion).toBeNull()
  })
})
