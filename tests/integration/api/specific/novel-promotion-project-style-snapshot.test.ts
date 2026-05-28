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
      styleAssetId: 'style-1',
      styleSnapshotName: '电影写实',
      stylePromptZh: '电影写实中文提示词',
      stylePromptEn: 'cinematic realistic prompt',
      styleSnapshotUpdatedAt: new Date('2026-05-28T01:00:00.000Z'),
    })),
    update: vi.fn(async () => ({
      id: 'np-1',
      audioModel: 'bailian::qwen3-tts-vd-2026-01-26',
      styleAssetId: 'style-1',
      styleSnapshotName: '电影写实',
      stylePromptZh: '电影写实中文提示词',
      stylePromptEn: 'cinematic realistic prompt',
      styleSnapshotUpdatedAt: new Date('2026-05-28T01:00:00.000Z'),
    })),
  },
  userPreference: {
    upsert: vi.fn(async () => ({ userId: 'user-1', defaultStyleId: 'style-1' })),
  },
}))

const styleFixtures = vi.hoisted(() => ({
  styleSnapshot: {
    styleAssetId: 'style-1',
    name: '电影写实',
    promptZh: '电影写实中文提示词',
    promptEn: 'cinematic realistic prompt',
    snapshotUpdatedAt: '2026-05-28T01:00:00.000Z',
  },
}))

const mediaAttachMock = vi.hoisted(() => ({
  attachMediaFieldsToProject: vi.fn(async (value: unknown) => value),
}))

const styleServiceMock = vi.hoisted(() => ({
  applyProjectStyleSnapshot: vi.fn(async () => styleFixtures.styleSnapshot),
  resolveStyleSnapshotState: vi.fn(async () => ({
    styleSnapshot: styleFixtures.styleSnapshot,
    styleSnapshotStale: false,
    styleSnapshotStaleMessage: null as string | null,
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

describe('api specific - novel promotion project style snapshot validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts styleAssetId and stores a project style snapshot', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1',
      method: 'PATCH',
      body: {
        styleAssetId: '  style-1  ',
      },
    })

    const res = await mod.PATCH(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(styleServiceMock.applyProjectStyleSnapshot).toHaveBeenCalledWith('project-1', 'user-1', 'style-1')
    expect(body.project.novelPromotionData.styleSnapshot).toEqual(styleFixtures.styleSnapshot)
    expect(body.project.novelPromotionData.styleSnapshotStale).toBe(false)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('rejects invalid styleAssetId with invalid params', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1',
      method: 'PATCH',
      body: {
        styleAssetId: '   ',
      },
    })

    const res = await mod.PATCH(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_PARAMS')
    expect(styleServiceMock.applyProjectStyleSnapshot).not.toHaveBeenCalled()
    expect(prismaMock.novelPromotionProject.update).not.toHaveBeenCalled()
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('accepts audioModel and keeps user preference unchanged', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1',
      method: 'PATCH',
      body: {
        audioModel: 'bailian::qwen3-tts-vd-2026-01-26',
      },
    })

    const res = await mod.PATCH(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    expect(prismaMock.novelPromotionProject.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          audioModel: 'bailian::qwen3-tts-vd-2026-01-26',
        }),
      }),
    )
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('returns stale project style snapshot state when global style changed later', async () => {
    styleServiceMock.resolveStyleSnapshotState.mockResolvedValueOnce({
      styleSnapshot: styleFixtures.styleSnapshot,
      styleSnapshotStale: true,
      styleSnapshotStaleMessage: '该风格已有更新，可重新选择刷新状态',
    })
    const mod = await import('@/app/api/novel-promotion/[projectId]/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1',
      method: 'PATCH',
      body: {
        audioModel: 'bailian::qwen3-tts-vd-2026-01-26',
      },
    })

    const res = await mod.PATCH(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.project.novelPromotionData.styleSnapshotStale).toBe(true)
    expect(body.project.novelPromotionData.styleSnapshotStaleMessage).toBe('该风格已有更新，可重新选择刷新状态')
  })
})
