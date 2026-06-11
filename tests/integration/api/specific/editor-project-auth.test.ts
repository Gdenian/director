import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  novelPromotionEpisode: {
    findFirst: vi.fn(),
  },
  videoEditorProject: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('api specific - editor project auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.novelPromotionEpisode.findFirst.mockResolvedValue(null)
    prismaMock.videoEditorProject.findUnique.mockResolvedValue(null)
    prismaMock.videoEditorProject.upsert.mockResolvedValue({
      id: 'editor-1',
      updatedAt: new Date('2026-06-10T00:00:00.000Z'),
    })
    prismaMock.videoEditorProject.delete.mockResolvedValue({ id: 'editor-1' })
  })

  it('GET cannot read another project episode editor', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/editor/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-a/editor',
      method: 'GET',
      query: { episodeId: 'episode-b' },
    })

    const res = await mod.GET(req, { params: Promise.resolve({ projectId: 'project-a' }) })

    expect(res.status).toBe(404)
    expect(prismaMock.novelPromotionEpisode.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'episode-b',
        novelPromotionProject: { projectId: 'project-a' },
      },
      select: { id: true },
    })
    expect(prismaMock.videoEditorProject.findUnique).not.toHaveBeenCalled()
  })

  it('DELETE cannot delete another project episode editor', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/editor/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-a/editor',
      method: 'DELETE',
      query: { episodeId: 'episode-b' },
    })

    const res = await mod.DELETE(req, { params: Promise.resolve({ projectId: 'project-a' }) })

    expect(res.status).toBe(404)
    expect(prismaMock.videoEditorProject.delete).not.toHaveBeenCalled()
  })

  it('PUT keeps episode scoped to project before upsert', async () => {
    prismaMock.novelPromotionEpisode.findFirst.mockResolvedValueOnce({ id: 'episode-a' })
    const mod = await import('@/app/api/novel-promotion/[projectId]/editor/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-a/editor',
      method: 'PUT',
      body: {
        episodeId: 'episode-a',
        projectData: { tracks: [] },
      },
    })

    const res = await mod.PUT(req, { params: Promise.resolve({ projectId: 'project-a' }) })

    expect(res.status).toBe(200)
    expect(prismaMock.novelPromotionEpisode.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'episode-a',
        novelPromotionProject: { projectId: 'project-a' },
      },
    })
    expect(prismaMock.videoEditorProject.upsert).toHaveBeenCalled()
  })
})
