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
  taskId: 'task-panel-image',
  status: 'queued',
  deduped: false,
})))

const configServiceMock = vi.hoisted(() => ({
  getProjectModelConfig: vi.fn(async () => ({
    storyboardModel: 'img::storyboard',
  })),
  resolveProjectModelCapabilityGenerationOptions: vi.fn(async () => ({
    resolution: '1024x1024',
  })),
}))

const apiConfigMock = vi.hoisted(() => ({
  resolveModelSelection: vi.fn(async () => ({
    provider: 'fal',
    modelId: 'storyboard',
  })),
}))

const hasOutputMock = vi.hoisted(() => ({
  hasPanelImageOutput: vi.fn(async () => false),
}))

const billingMock = vi.hoisted(() => ({
  buildDefaultTaskBillingInfo: vi.fn(() => ({ mode: 'default' })),
}))

const styleTaskPayloadMock = vi.hoisted(() => ({
  buildProjectStyleTaskPayload: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/task/submitter', () => ({ submitTask: submitTaskMock }))
vi.mock('@/lib/config-service', () => configServiceMock)
vi.mock('@/lib/api-config', () => apiConfigMock)
vi.mock('@/lib/task/has-output', () => hasOutputMock)
vi.mock('@/lib/billing', () => billingMock)
vi.mock('@/lib/style', () => styleTaskPayloadMock)
vi.mock('@/lib/task/resolve-locale', () => ({
  resolveRequiredTaskLocale: vi.fn(() => 'zh'),
}))

describe('api specific - regenerate panel image route', () => {
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

  it('submits regenerate panel image with stylePromptSnapshot', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/regenerate-panel-image/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/regenerate-panel-image',
      method: 'POST',
      body: {
        panelId: 'panel-1',
        count: 2,
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        candidateCount: 2,
        stylePromptSnapshot: expect.objectContaining({
          styleAssetId: 'style-1',
        }),
        ui: expect.objectContaining({
          intent: 'regenerate',
          hasOutputAtStart: false,
        }),
      }),
    }))
  })
})
