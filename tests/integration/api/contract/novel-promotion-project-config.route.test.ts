import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1', name: 'User 1' } },
    project: { id: 'project-1', userId: 'user-1', name: 'Project 1' },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  novelPromotionProject: {
    findUnique: vi.fn(async () => ({
      id: 'np-1',
      analysisModel: 'llm::analysis',
      characterModel: 'img::character',
      locationModel: 'img::location',
      storyboardModel: 'img::storyboard',
      editModel: 'img::edit',
      videoModel: 'video::model',
      audioModel: 'audio::model',
      globalAssetText: '世界观设定',
    })),
    update: vi.fn(async () => ({
      id: 'np-1',
      globalAssetText: '世界观设定',
    })),
  },
}))

const mediaAttachMock = vi.hoisted(() => ({
  attachMediaFieldsToProject: vi.fn(async (value: unknown) => value),
}))

const styleServiceMock = vi.hoisted(() => ({
  applyProjectStyleSnapshot: vi.fn(),
  resolveStyleSnapshotState: vi.fn(async () => ({
    styleSnapshot: null,
    styleSnapshotStale: false,
    styleSnapshotStaleMessage: null,
  })),
}))

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
vi.mock('@/lib/styles/service', () => styleServiceMock)
vi.mock('@/lib/logging/semantic', () => logMock)
vi.mock('@/lib/model-config-contract', () => modelConfigContractMock)
vi.mock('@/lib/model-capabilities/lookup', () => capabilityLookupMock)

describe('api contract - novel promotion project config route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts globalAssetText updates', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1',
      method: 'PATCH',
      body: {
        globalAssetText: '世界观设定',
      },
    })

    const res = await mod.PATCH(req, { params: Promise.resolve({ projectId: 'project-1' }) })

    expect(res.status).toBe(200)
    expect(prismaMock.novelPromotionProject.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          globalAssetText: '世界观设定',
        }),
      }),
    )
  })
})
