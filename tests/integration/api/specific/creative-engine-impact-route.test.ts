import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
  mockUnauthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(),
  },
  project: {
    findMany: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('api specific - creative engine impact route', () => {
  const routeContext = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resetAuthMockState()
  })

  it('requires user auth', async () => {
    installAuthMocks()
    mockUnauthenticated()
    const route = await import('@/app/api/user/creative-engines/impact/route')

    const res = await route.POST(buildMockRequest({
      path: '/api/user/creative-engines/impact',
      method: 'POST',
      body: { target: { type: 'engine', engineId: 'engine-1' } },
    }), routeContext)

    expect(res.status).toBe(401)
    expect(prismaMock.userPreference.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.project.findMany).not.toHaveBeenCalled()
  })

  it('reports defaults and project selections affected by an engine', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    prismaMock.userPreference.findUnique.mockResolvedValue({
      customModels: JSON.stringify([
        {
          id: 'text-model',
          engineId: 'engine-1',
          name: 'GPT 5',
          callName: 'gpt-5',
          modelKey: 'engine-1::gpt-5',
          type: 'llm',
          purpose: 'text',
          enabled: true,
          status: 'available',
        },
        {
          id: 'video-model',
          engineId: 'engine-1',
          name: 'Veo',
          callName: 'veo',
          modelKey: 'engine-1::veo',
          type: 'video',
          purpose: 'video-generation',
          enabled: true,
          status: 'available',
        },
      ]),
      analysisModel: 'engine-1::gpt-5',
      characterModel: null,
      locationModel: null,
      storyboardModel: null,
      editModel: null,
      videoModel: null,
      audioModel: null,
      lipSyncModel: null,
      voiceDesignModel: null,
    })
    prismaMock.project.findMany.mockResolvedValue([
      {
        id: 'project-1',
        name: 'Project A',
        novelPromotionData: {
          analysisModel: null,
          characterModel: null,
          locationModel: null,
          storyboardModel: null,
          editModel: null,
          videoModel: 'engine-1::veo',
          audioModel: null,
        },
      },
    ])
    const route = await import('@/app/api/user/creative-engines/impact/route')

    const res = await route.POST(buildMockRequest({
      path: '/api/user/creative-engines/impact',
      method: 'POST',
      body: { target: { type: 'engine', engineId: 'engine-1' } },
    }), routeContext)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      affectedCount: 2,
      items: [
        {
          scope: 'user-default',
          field: 'analysisModel',
          label: '文本分析模型',
          modelKey: 'engine-1::gpt-5',
          modelName: 'GPT 5',
        },
        {
          scope: 'project',
          projectId: 'project-1',
          projectTitle: 'Project A',
          field: 'videoModel',
          label: '视频生成模型',
          modelKey: 'engine-1::veo',
          modelName: 'Veo',
        },
      ],
    })
    expect(prismaMock.userPreference.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: {
        customModels: true,
        analysisModel: true,
        characterModel: true,
        locationModel: true,
        storyboardModel: true,
        editModel: true,
        videoModel: true,
        audioModel: true,
        lipSyncModel: true,
        voiceDesignModel: true,
      },
    })
    expect(prismaMock.project.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: {
        id: true,
        name: true,
        novelPromotionData: {
          select: {
            analysisModel: true,
            characterModel: true,
            locationModel: true,
            storyboardModel: true,
            editModel: true,
            videoModel: true,
            audioModel: true,
          },
        },
      },
    })
  })

  it('rejects invalid targets', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/creative-engines/impact/route')

    const res = await route.POST(buildMockRequest({
      path: '/api/user/creative-engines/impact',
      method: 'POST',
      body: { target: { type: 'model', modelKey: '' } },
    }), routeContext)

    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.findUnique).not.toHaveBeenCalled()
  })
})
