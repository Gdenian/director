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
  taskId: 'task-render-1',
  status: 'queued',
  deduped: false,
})))

const resolveLocaleMock = vi.hoisted(() => vi.fn(() => 'zh'))

const prismaMock = vi.hoisted(() => ({
  novelPromotionEpisode: {
    findFirst: vi.fn(),
  },
  videoEditorProject: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  task: {
    findFirst: vi.fn(),
  },
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/task/submitter', () => ({ submitTask: submitTaskMock }))
vi.mock('@/lib/task/resolve-locale', () => ({ resolveRequiredTaskLocale: resolveLocaleMock }))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('api specific - editor render route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.novelPromotionEpisode.findFirst.mockResolvedValue({ id: 'episode-1' })
    prismaMock.videoEditorProject.findUnique.mockResolvedValue({
      id: 'editor-1',
      episodeId: 'episode-1',
      renderStatus: null,
      renderTaskId: 'task-render-1',
      outputUrl: null,
      updatedAt: new Date('2026-06-10T00:00:00.000Z'),
    })
    prismaMock.videoEditorProject.update.mockResolvedValue({
      id: 'editor-1',
      episodeId: 'episode-1',
      renderStatus: 'pending',
      renderTaskId: 'task-render-1',
      outputUrl: null,
      updatedAt: new Date('2026-06-10T00:00:00.000Z'),
    })
    prismaMock.task.findFirst.mockResolvedValue(null)
    submitTaskMock.mockResolvedValue({
      success: true,
      async: true,
      taskId: 'task-render-1',
      status: 'queued',
      deduped: false,
    })
  })

  it('POST submits an editor render task for the project episode editor', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/editor/render/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/editor/render',
      method: 'POST',
      body: { episodeId: 'episode-1' },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()

    expect(res.status).toBe(202)
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      type: 'editor_render',
      targetType: 'VideoEditorProject',
      targetId: 'editor-1',
      dedupeKey: 'editor_render:editor-1',
    }))
    expect(prismaMock.videoEditorProject.update).toHaveBeenCalledWith({
      where: { id: 'editor-1' },
      data: {
        renderStatus: 'pending',
        renderTaskId: 'task-render-1',
      },
    })
    expect(body).toEqual(expect.objectContaining({
      success: true,
      taskId: 'task-render-1',
      status: 'queued',
      editorProjectId: 'editor-1',
      renderStatus: 'pending',
    }))
  })

  it('POST rejects an editor project outside project scope', async () => {
    prismaMock.novelPromotionEpisode.findFirst.mockResolvedValueOnce(null)
    const mod = await import('@/app/api/novel-promotion/[projectId]/editor/render/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-a/editor/render',
      method: 'POST',
      body: { episodeId: 'episode-b' },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-a' }) })

    expect(res.status).toBe(404)
    expect(submitTaskMock).not.toHaveBeenCalled()
  })

  it('GET returns task status scoped by editorProjectId', async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce({
      id: 'task-render-1',
      status: 'processing',
      progress: 45,
      errorCode: null,
      errorMessage: null,
      result: null,
      updatedAt: new Date('2026-06-10T00:02:00.000Z'),
    })
    const mod = await import('@/app/api/novel-promotion/[projectId]/editor/render/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/editor/render',
      method: 'GET',
      query: { episodeId: 'episode-1', editorProjectId: 'editor-1' },
    })

    const res = await mod.GET(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(prismaMock.task.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'task-render-1',
        projectId: 'project-1',
        episodeId: 'episode-1',
        type: 'editor_render',
        targetType: 'VideoEditorProject',
        targetId: 'editor-1',
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
    expect(body).toEqual(expect.objectContaining({
      editorProjectId: 'editor-1',
      taskId: 'task-render-1',
      status: 'processing',
      progress: 45,
      renderStatus: null,
    }))
  })
})
