import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
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

describe('api contract - creative engine impact route', () => {
  const routeContext = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resetAuthMockState()
  })

  it('returns affected defaults and projects without mutating user config', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    prismaMock.userPreference.findUnique.mockResolvedValue({
      customModels: JSON.stringify([
        {
          id: 'text-model',
          engineId: 'openai-compatible:abc',
          name: 'Claude Sonnet',
          callName: 'anthropic/claude-sonnet-4.5',
          modelKey: 'openai-compatible:abc::anthropic/claude-sonnet-4.5',
          type: 'llm',
          purpose: 'text',
          enabled: true,
          status: 'available',
        },
      ]),
      analysisModel: 'openai-compatible:abc::anthropic/claude-sonnet-4.5',
      characterModel: null,
      locationModel: null,
      storyboardModel: null,
      editModel: null,
      videoModel: null,
      audioModel: null,
      lipSyncModel: null,
      voiceDesignModel: null,
    })
    prismaMock.project.findMany.mockResolvedValue([])
    const route = await import('@/app/api/user/creative-engines/impact/route')

    const res = await route.POST(buildMockRequest({
      path: '/api/user/creative-engines/impact',
      method: 'POST',
      body: { target: { type: 'model', modelKey: 'openai-compatible:abc::anthropic/claude-sonnet-4.5' } },
    }), routeContext)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      affectedCount: 1,
      items: [
        {
          scope: 'user-default',
          field: 'analysisModel',
          label: '文本分析模型',
          modelKey: 'openai-compatible:abc::anthropic/claude-sonnet-4.5',
          modelName: 'Claude Sonnet',
        },
      ],
    })
  })
})
