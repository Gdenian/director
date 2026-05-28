import { NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE } from '@/lib/task/types'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const configMock = vi.hoisted(() => ({
  getUserModelConfig: vi.fn(async () => ({
    analysisModel: 'llm::analysis-model',
  })),
}))

const routeTaskMock = vi.hoisted(() => ({
  maybeSubmitLLMTask: vi.fn(async () => NextResponse.json({
    success: true,
    async: true,
    taskId: 'task-style-prompt-1',
    runId: null,
    status: 'queued',
    deduped: false,
  })),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/config-service', () => configMock)
vi.mock('@/lib/llm-observe/route-task', () => routeTaskMock)

describe('api specific - asset hub ai design style', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configMock.getUserModelConfig.mockResolvedValue({
      analysisModel: 'llm::analysis-model',
    })
  })

  it('submits a style prompt generation task with trimmed referenceImageUrl and analysisModel', async () => {
    const mod = await import('@/app/api/asset-hub/ai-design-style/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/ai-design-style',
      method: 'POST',
      body: {
        referenceImageUrl: '  https://example.com/style-ref.jpg  ',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.taskId).toBe('task-style-prompt-1')
    expect(configMock.getUserModelConfig).toHaveBeenCalledWith('user-1')
    expect(routeTaskMock.maybeSubmitLLMTask).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      projectId: 'global-asset-hub',
      type: TASK_TYPE.ASSET_HUB_AI_DESIGN_STYLE,
      targetType: 'GlobalAssetHubStyleDesign',
      targetId: 'user-1',
      routePath: '/api/asset-hub/ai-design-style',
      body: {
        referenceImageUrl: 'https://example.com/style-ref.jpg',
        analysisModel: 'llm::analysis-model',
        displayMode: 'detail',
      },
    }))
    const callArg = routeTaskMock.maybeSubmitLLMTask.mock.calls[0]?.[0]
    expect(callArg?.dedupeKey).toMatch(/^asset_hub_ai_design_style:/)
  })

  it('returns invalid params when referenceImageUrl is empty', async () => {
    const mod = await import('@/app/api/asset-hub/ai-design-style/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/ai-design-style',
      method: 'POST',
      body: {
        referenceImageUrl: '   ',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_PARAMS')
    expect(routeTaskMock.maybeSubmitLLMTask).not.toHaveBeenCalled()
  })

  it('returns missing config when analysisModel is not configured', async () => {
    configMock.getUserModelConfig.mockResolvedValueOnce({
      analysisModel: null,
    })
    const mod = await import('@/app/api/asset-hub/ai-design-style/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/ai-design-style',
      method: 'POST',
      body: {
        referenceImageUrl: 'https://example.com/style-ref.jpg',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('MISSING_CONFIG')
    expect(routeTaskMock.maybeSubmitLLMTask).not.toHaveBeenCalled()
  })
})
