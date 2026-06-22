import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const submitTaskMock = vi.hoisted(() => vi.fn(async () => ({
  success: true,
  async: true,
  taskId: 'task-refine-1',
  status: 'queued',
  deduped: false,
})))

const resolveLocaleMock = vi.hoisted(() => vi.fn(() => 'zh'))

const versionsMock = vi.hoisted(() => ({
  listEditorVersions: vi.fn(async () => [
    { id: 'version-2', versionIndex: 2, reason: 'ai_refine', summary: '更快', createdAt: new Date('2026-06-10T00:00:00.000Z') },
  ]),
  restoreEditorVersion: vi.fn(async () => ({
    version: { id: 'version-1', editorProjectId: 'editor-1', versionIndex: 1, reason: 'ai_initial', summary: '初稿' },
    snapshot: { id: 'editor-1', episodeId: 'episode-1', pendingVersion: null },
  })),
}))

const prismaMock = vi.hoisted(() => ({
  novelPromotionEpisode: {
    findFirst: vi.fn(),
  },
  videoEditorProject: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  videoEditorProjectVersion: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/task/submitter', () => ({ submitTask: submitTaskMock }))
vi.mock('@/lib/task/resolve-locale', () => ({ resolveRequiredTaskLocale: resolveLocaleMock }))
vi.mock('@/lib/novel-promotion/ai-editing/versions', () => versionsMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('api specific - editor refine routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
        pendingVersion: { versionId: 'version-2', summary: '更快', reason: 'ai_refine', createdAt: '2026-06-10T00:00:00.000Z' },
      }),
      updatedAt: new Date('2026-06-10T00:00:00.000Z'),
    })
    prismaMock.videoEditorProject.findFirst.mockResolvedValue({
      id: 'editor-1',
      episodeId: 'episode-1',
      projectData: JSON.stringify({ id: 'editor-1', episodeId: 'episode-1', pendingVersion: null }),
    })
    prismaMock.videoEditorProject.update.mockResolvedValue({ id: 'editor-1' })
    prismaMock.videoEditorProjectVersion.findUnique.mockResolvedValue({
      id: 'version-2',
      editorProjectId: 'editor-1',
      snapshotJson: JSON.stringify({
        id: 'editor-1',
        episodeId: 'episode-1',
        schemaVersion: '1.2',
        config: { fps: 30, width: 1920, height: 1080, videoRatio: '16:9', burnSubtitlesDefault: true },
        timeline: [],
        audioTrack: [],
        subtitleCues: [],
        editorAssets: [],
        bgmTrack: [],
        pendingVersion: null,
      }),
    })
  })

  it('POST /refine submits an AI edit refine task', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/editor/refine/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/editor/refine',
      method: 'POST',
      body: { episodeId: 'episode-1', editorProjectId: 'editor-1', instruction: '节奏更快', targetDurationSeconds: 12, selectedClipId: 'clip-1' },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()

    expect(res.status).toBe(202)
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ai_edit_refine',
      targetId: 'editor-1',
      dedupeKey: 'ai_edit_refine:editor-1',
      payload: expect.objectContaining({
        editorProjectId: 'editor-1',
        instruction: '节奏更快',
        targetDurationSeconds: 12,
        selectedClipId: 'clip-1',
      }),
    }))
    expect(body).toEqual(expect.objectContaining({ taskId: 'task-refine-1' }))
  })

  it('GET /versions lists scoped editor versions', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/editor/versions/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/editor/versions',
      method: 'GET',
      query: { episodeId: 'episode-1', editorProjectId: 'editor-1' },
    })

    const res = await mod.GET(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(versionsMock.listEditorVersions).toHaveBeenCalledWith('editor-1')
    expect(body.versions).toEqual([expect.objectContaining({ id: 'version-2', versionIndex: 2 })])
  })

  it('POST /refine/apply applies the pending version snapshot', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/editor/refine/apply/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/editor/refine/apply',
      method: 'POST',
      body: { episodeId: 'episode-1', editorProjectId: 'editor-1', pendingVersionId: 'version-2' },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(prismaMock.videoEditorProject.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'editor-1' },
    }))
    expect(body).toEqual(expect.objectContaining({ success: true, editorProjectId: 'editor-1' }))
  })

  it('POST /refine/discard clears only the pending version pointer', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/editor/refine/discard/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/editor/refine/discard',
      method: 'POST',
      body: { episodeId: 'episode-1', editorProjectId: 'editor-1' },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(prismaMock.videoEditorProject.update).toHaveBeenCalledWith({
      where: { id: 'editor-1' },
      data: {
        projectData: expect.stringContaining('"pendingVersion":null'),
        updatedAt: expect.any(Date),
      },
    })
    const updateArg = prismaMock.videoEditorProject.update.mock.calls[0]?.[0]
    const persisted = JSON.parse(updateArg.data.projectData)
    expect(persisted.timeline).toEqual([])
    expect(persisted.pendingVersion).toBeNull()
    expect(body).toEqual(expect.objectContaining({ success: true, editorProjectId: 'editor-1' }))
    expect(body.projectData.pendingVersion).toBeNull()
  })

  it('POST /rollback restores a scoped version', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/editor/rollback/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/editor/rollback',
      method: 'POST',
      body: { episodeId: 'episode-1', editorProjectId: 'editor-1', versionId: 'version-1' },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(versionsMock.restoreEditorVersion).toHaveBeenCalledWith('version-1')
    expect(body).toEqual(expect.objectContaining({ success: true, editorProjectId: 'editor-1' }))
  })
})
