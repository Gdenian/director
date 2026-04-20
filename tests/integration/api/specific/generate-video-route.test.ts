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
  taskId: 'task-video-1',
  status: 'queued',
  deduped: false,
})))

const prismaMock = vi.hoisted(() => ({
  novelPromotionPanel: {
    findFirst: vi.fn(async () => ({ id: 'panel-1' })),
    findMany: vi.fn(async () => [{ id: 'panel-1' }, { id: 'panel-2' }]),
  },
}))

const hasOutputMock = vi.hoisted(() => ({
  hasPanelVideoOutput: vi.fn(async () => false),
}))

const billingMock = vi.hoisted(() => ({
  buildDefaultTaskBillingInfo: vi.fn(() => ({ mode: 'default' })),
}))

const configServiceMock = vi.hoisted(() => ({
  resolveProjectModelCapabilityGenerationOptions: vi.fn(async () => ({
    duration: 5,
    resolution: '720p',
  })),
}))

const modelConfigContractMock = vi.hoisted(() => ({
  parseModelKeyStrict: vi.fn((value: string) => {
    if (!value) return null
    return { provider: 'fal', modelId: value.split('::').pop() || 'video-1' }
  }),
}))

const modelCapabilitiesMock = vi.hoisted(() => ({
  resolveBuiltinCapabilitiesByModelKey: vi.fn(() => null),
}))

const modelPricingMock = vi.hoisted(() => ({
  resolveBuiltinPricing: vi.fn(() => ({ status: 'ok' })),
}))

const styleTaskPayloadMock = vi.hoisted(() => ({
  buildProjectStyleTaskPayload: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/task/submitter', () => ({ submitTask: submitTaskMock }))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/task/has-output', () => hasOutputMock)
vi.mock('@/lib/billing', () => billingMock)
vi.mock('@/lib/config-service', () => configServiceMock)
vi.mock('@/lib/model-config-contract', () => modelConfigContractMock)
vi.mock('@/lib/model-capabilities/lookup', () => modelCapabilitiesMock)
vi.mock('@/lib/model-pricing/lookup', () => modelPricingMock)
vi.mock('@/lib/style', () => styleTaskPayloadMock)
vi.mock('@/lib/task/resolve-locale', () => ({
  resolveRequiredTaskLocale: vi.fn(() => 'zh'),
}))

describe('api specific - generate video route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    styleTaskPayloadMock.buildProjectStyleTaskPayload.mockResolvedValue({
      styleContext: {
        source: 'style-asset',
        fallbackReason: 'none',
        styleAssetId: 'style-1',
        legacyKey: null,
        label: '电影黑金',
        positivePrompt: 'cinematic gold and black',
        negativePrompt: 'no blur',
        sourceUpdatedAt: '2026-04-20T10:00:00.000Z',
      },
      stylePromptSnapshot: {
        version: 1,
        source: 'style-asset',
        fallbackReason: 'none',
        styleAssetId: 'style-1',
        legacyKey: null,
        label: '电影黑金',
        positivePrompt: 'cinematic gold and black',
        negativePrompt: 'no blur',
        sourceUpdatedAt: '2026-04-20T10:00:00.000Z',
        capturedAt: '2026-04-20T10:01:00.000Z',
      },
      legacyArtStyle: null,
    })
  })

  it('submits single-panel video task with stylePromptSnapshot', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/generate-video/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/generate-video',
      method: 'POST',
      body: {
        storyboardId: 'storyboard-1',
        panelIndex: 0,
        videoModel: 'fal::video-1',
        generationOptions: {
          duration: 5,
          resolution: '720p',
        },
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        stylePromptSnapshot: expect.objectContaining({
          styleAssetId: 'style-1',
        }),
        ui: expect.objectContaining({
          hasOutputAtStart: false,
        }),
      }),
    }))
  })

  it('submits batch video tasks with stylePromptSnapshot', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/generate-video/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/generate-video',
      method: 'POST',
      body: {
        all: true,
        episodeId: 'episode-1',
        videoModel: 'fal::video-1',
        generationOptions: {
          duration: 5,
          resolution: '720p',
        },
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json() as { total: number }

    expect(res.status).toBe(200)
    expect(body.total).toBe(2)
    expect(submitTaskMock).toHaveBeenCalledTimes(2)
    const submitCalls = submitTaskMock.mock.calls as unknown as Array<[{
      payload?: Record<string, unknown>
    }]>
    for (const [call] of submitCalls) {
      expect(call).toEqual(expect.objectContaining({
        payload: expect.objectContaining({
          stylePromptSnapshot: expect.objectContaining({
            styleAssetId: 'style-1',
          }),
        }),
      }))
    }
  })
})
