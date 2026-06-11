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
  taskId: 'task-ai-edit-1',
  status: 'queued',
  deduped: false,
})))

const resolveLocaleMock = vi.hoisted(() => vi.fn(() => 'zh'))

const prismaMock = vi.hoisted(() => ({
  novelPromotionEpisode: {
    findFirst: vi.fn(),
  },
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/task/submitter', () => ({ submitTask: submitTaskMock }))
vi.mock('@/lib/task/resolve-locale', () => ({ resolveRequiredTaskLocale: resolveLocaleMock }))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('api specific - editor ai edit route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.novelPromotionEpisode.findFirst.mockResolvedValue({ id: 'episode-1' })
  })

  it('POST submits an AI edit assemble task for the scoped episode', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/editor/ai-edit/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/editor/ai-edit',
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
      type: 'ai_edit_assemble',
      targetType: 'VideoEditorProject',
      targetId: 'episode-1',
      dedupeKey: 'ai_edit_assemble:episode-1',
    }))
    expect(body).toEqual(expect.objectContaining({ taskId: 'task-ai-edit-1', status: 'queued' }))
  })

  it('POST rejects episodes outside project scope', async () => {
    prismaMock.novelPromotionEpisode.findFirst.mockResolvedValueOnce(null)
    const mod = await import('@/app/api/novel-promotion/[projectId]/editor/ai-edit/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-a/editor/ai-edit',
      method: 'POST',
      body: { episodeId: 'episode-b' },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-a' }) })

    expect(res.status).toBe(404)
    expect(submitTaskMock).not.toHaveBeenCalled()
  })
})
