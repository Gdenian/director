import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

type MockProjectData = {
  id: string
  projectId: string
  artStyle: string
  artStylePrompt: string | null
  styleAssetId: string | null
  episodes: unknown[]
  characters: unknown[]
  locations: unknown[]
}

type MockProjectStyleContext = {
  styleAssetId: string | null
  artStylePrompt: string | null
  artStyle: string
}

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(async () => ({
      id: 'project-1',
      userId: 'user-1',
      name: 'Project 1',
      user: { id: 'user-1' },
    })),
    update: vi.fn(async () => ({
      id: 'project-1',
    })),
  },
  novelPromotionProject: {
    findUnique: vi.fn<() => Promise<MockProjectData>>(async () => ({
      id: 'np-1',
      projectId: 'project-1',
      artStyle: 'realistic',
      artStylePrompt: null,
      styleAssetId: 'style-1',
      episodes: [],
      characters: [],
      locations: [],
    })),
    findFirst: vi.fn<() => Promise<MockProjectStyleContext>>(async () => ({
      styleAssetId: 'style-1',
      artStylePrompt: null,
      artStyle: 'realistic',
    })),
  },
  globalStyle: {
    findFirst: vi.fn(async () => ({
      id: 'style-1',
      name: '霓虹电影感',
      positivePrompt: 'neon cinematic',
      negativePrompt: null,
      legacyKey: null,
      source: 'system',
      updatedAt: new Date('2026-04-20T00:00:00.000Z'),
      previewMedia: {
        id: 'media-1',
        publicId: 'public-style-1',
        mimeType: 'image/png',
        sizeBytes: 2048,
        width: 1024,
        height: 1024,
        durationMs: null,
      },
    })),
  },
  userPreference: {
    findUnique: vi.fn(async () => ({
      artStyle: 'realistic',
    })),
  },
}))

const mediaAttachMock = vi.hoisted(() => ({
  attachMediaFieldsToProject: vi.fn(async (value: unknown) => value),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/media/attach', () => mediaAttachMock)

describe('api specific - project data style summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns resolvedStyle summary for a readable style asset while preserving legacy fields', async () => {
    const mod = await import('@/app/api/projects/[projectId]/data/route')
    const req = buildMockRequest({
      path: '/api/projects/project-1/data',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.project.novelPromotionData.artStyle).toBe('realistic')
    expect(body.project.novelPromotionData.artStylePrompt).toBeNull()
    expect(body.project.novelPromotionData.resolvedStyle).toEqual({
      styleAssetId: 'style-1',
      label: '霓虹电影感',
      source: 'style-asset',
      assetSource: 'system',
      previewMedia: {
        id: 'media-1',
        publicId: 'public-style-1',
        url: '/m/public-style-1',
        mimeType: 'image/png',
        sizeBytes: 2048,
        width: 1024,
        height: 1024,
        durationMs: null,
      },
    })
  })

  it('returns fallback resolvedStyle with null assetSource when the project uses legacy artStyle', async () => {
    prismaMock.novelPromotionProject.findUnique.mockResolvedValueOnce({
      id: 'np-1',
      projectId: 'project-1',
      artStyle: 'american-comic',
      artStylePrompt: null,
      styleAssetId: null,
      episodes: [],
      characters: [],
      locations: [],
    })
    prismaMock.novelPromotionProject.findFirst.mockResolvedValueOnce({
      styleAssetId: null,
      artStylePrompt: null,
      artStyle: 'american-comic',
    })

    const mod = await import('@/app/api/projects/[projectId]/data/route')
    const req = buildMockRequest({
      path: '/api/projects/project-1/data',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.project.novelPromotionData.resolvedStyle).toEqual({
      styleAssetId: null,
      label: expect.any(String),
      source: 'project-art-style',
      assetSource: null,
      previewMedia: null,
    })
    expect(prismaMock.globalStyle.findFirst).not.toHaveBeenCalled()
  })

  it('returns system assetSource for runtime system style ids without querying prisma.globalStyle', async () => {
    prismaMock.novelPromotionProject.findUnique.mockResolvedValueOnce({
      id: 'np-1',
      projectId: 'project-1',
      artStyle: 'american-comic',
      artStylePrompt: null,
      styleAssetId: 'system:american-comic',
      episodes: [],
      characters: [],
      locations: [],
    })
    prismaMock.novelPromotionProject.findFirst.mockResolvedValueOnce({
      styleAssetId: 'system:american-comic',
      artStylePrompt: null,
      artStyle: 'american-comic',
    })

    const mod = await import('@/app/api/projects/[projectId]/data/route')
    const req = buildMockRequest({
      path: '/api/projects/project-1/data',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.project.novelPromotionData.resolvedStyle).toEqual({
      styleAssetId: 'system:american-comic',
      label: '漫画风',
      source: 'style-asset',
      assetSource: 'system',
      previewMedia: null,
    })
    expect(prismaMock.globalStyle.findFirst).not.toHaveBeenCalled()
  })

  it('localizes compatibility style labels with the request locale', async () => {
    prismaMock.novelPromotionProject.findUnique.mockResolvedValueOnce({
      id: 'np-1',
      projectId: 'project-1',
      artStyle: 'american-comic',
      artStylePrompt: null,
      styleAssetId: null,
      episodes: [],
      characters: [],
      locations: [],
    })
    prismaMock.novelPromotionProject.findFirst.mockResolvedValueOnce({
      styleAssetId: null,
      artStylePrompt: null,
      artStyle: 'american-comic',
    })

    const mod = await import('@/app/api/projects/[projectId]/data/route')
    const req = buildMockRequest({
      path: '/api/projects/project-1/data',
      method: 'GET',
      headers: {
        'accept-language': 'en-US,en;q=0.9',
      },
    })

    const res = await mod.GET(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.project.novelPromotionData.resolvedStyle.label).toBe('Comic Style')
    expect(body.project.novelPromotionData.resolvedStyle.source).toBe('project-art-style')
    expect(body.project.novelPromotionData.resolvedStyle.assetSource).toBeNull()
    expect(body.project.novelPromotionData.resolvedStyle.styleAssetId).toBeNull()
  })
})
