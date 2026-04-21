import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1', name: 'User 1' } },
  })),
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1', name: 'User 1' } },
    project: { id: 'project-1', userId: 'user-1', name: 'Project 1' },
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
    update: vi.fn(async () => ({ id: 'project-1' })),
  },
  novelPromotionProject: {
    findUnique: vi.fn(async () => ({
      id: 'np-1',
      projectId: 'project-1',
      styleAssetId: 'style-1',
      artStyle: 'realistic',
      artStylePrompt: null,
      analysisModel: 'llm::analysis',
      characterModel: 'img::character',
      locationModel: 'img::location',
      storyboardModel: 'img::storyboard',
      editModel: 'img::edit',
      videoModel: 'video::model',
      audioModel: 'audio::model',
      episodes: [],
      characters: [],
      locations: [],
    })),
    update: vi.fn(async () => ({
      id: 'np-1',
      styleAssetId: 'system:american-comic',
      artStyle: 'realistic',
    })),
  },
}))

const mediaAttachMock = vi.hoisted(() => ({
  attachMediaFieldsToProject: vi.fn(async (value: unknown) => value),
}))

const resolveProjectStyleSummaryMock = vi.hoisted(() => vi.fn(async () => ({
  styleAssetId: 'style-1',
  label: 'Cinematic',
  source: 'style-asset',
  assetSource: 'system',
  previewMedia: null,
})))

const logMock = vi.hoisted(() => ({
  logProjectAction: vi.fn(),
}))

const modelConfigContractMock = vi.hoisted(() => ({
  parseModelKeyStrict: vi.fn(() => ({ provider: 'mock', modelId: 'mock-model' })),
}))

const capabilityLookupMock = vi.hoisted(() => ({
  resolveBuiltinModelContext: vi.fn(() => null),
  getCapabilityOptionFields: vi.fn(() => ({})),
  validateCapabilitySelectionsPayload: vi.fn(() => []),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/media/attach', () => mediaAttachMock)
vi.mock('@/lib/style', () => ({
  getLegacySystemStyleById: (id: string) => (
    id === 'system:american-comic'
      ? { id, key: 'american-comic', label: '漫画风', positivePrompt: 'comic style', negativePrompt: null }
      : null
  ),
  resolveProjectStyleSummary: resolveProjectStyleSummaryMock,
}))
vi.mock('@/lib/logging/semantic', () => logMock)
vi.mock('@/lib/model-config-contract', () => modelConfigContractMock)
vi.mock('@/lib/model-capabilities/lookup', () => capabilityLookupMock)

describe('api contract - project style routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes locale through project data route when resolving style summary', async () => {
    const mod = await import('@/app/api/projects/[projectId]/data/route')
    const req = buildMockRequest({
      path: '/api/projects/project-1/data',
      method: 'GET',
      query: {
        locale: 'en',
      },
    })

    const res = await mod.GET(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(resolveProjectStyleSummaryMock).toHaveBeenCalledWith({
      userId: 'user-1',
      projectId: 'project-1',
      locale: 'en',
    })
    expect(body.project.novelPromotionData.resolvedStyle).toEqual({
      styleAssetId: 'style-1',
      label: 'Cinematic',
      source: 'style-asset',
      assetSource: 'system',
      previewMedia: null,
    })
  })

  it('accepts system style ids in project style patch route', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1',
      method: 'PATCH',
      body: {
        styleAssetId: 'system:american-comic',
      },
    })

    const res = await mod.PATCH(req, { params: Promise.resolve({ projectId: 'project-1' }) })

    expect(res.status).toBe(200)
    expect(prismaMock.novelPromotionProject.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: 'project-1' },
        data: expect.objectContaining({
          styleAssetId: 'system:american-comic',
        }),
      }),
    )
  })
})
