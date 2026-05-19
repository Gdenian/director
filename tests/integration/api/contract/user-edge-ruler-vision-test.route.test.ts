import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { buildMockRequest } from '../../../helpers/request'

type UserAuthResult = { session: { user: { id: string } } } | Response

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn<() => Promise<UserAuthResult>>(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const runEdgeRulerVisionLabMock = vi.hoisted(() => vi.fn(async () => ({
  model: 'openrouter::vision-model',
  rawText: '{"understandsEdgeRuler":true}',
  parsedJson: { understandsEdgeRuler: true },
  usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
})))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/edit-script/storyboard-consistency/edge-ruler-vision-lab', async () => {
  const actual = await vi.importActual<typeof import('@/lib/edit-script/storyboard-consistency/edge-ruler-vision-lab')>(
    '@/lib/edit-script/storyboard-consistency/edge-ruler-vision-lab',
  )
  return {
    ...actual,
    runEdgeRulerVisionLab: runEdgeRulerVisionLabMock,
  }
})

describe('POST /api/user/edge-ruler-vision-test', () => {
  const routeContext = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.clearAllMocks()
    authMock.requireUserAuth.mockResolvedValue({
      session: { user: { id: 'user-1' } },
    })
  })

  it('requires user auth and delegates a validated edge-ruler Vision request', async () => {
    const route = await import('@/app/api/user/edge-ruler-vision-test/route')
    const req = buildMockRequest({
      path: '/api/user/edge-ruler-vision-test',
      method: 'POST',
      body: {
        model: 'openrouter::vision-model',
        imageDataUrl: 'data:image/png;base64,abc',
        prompt: 'Inspect this edge ruler image and return strict JSON.',
        columns: 16,
        rows: 9,
        temperature: 0.1,
      },
    })

    const res = await route.POST(req, routeContext)
    expect(res.status).toBe(200)
    const body = await res.json() as { parsedJson?: { understandsEdgeRuler?: boolean } }
    expect(body.parsedJson?.understandsEdgeRuler).toBe(true)
    expect(runEdgeRulerVisionLabMock).toHaveBeenCalledWith({
      userId: 'user-1',
      request: {
        model: 'openrouter::vision-model',
        imageDataUrl: 'data:image/png;base64,abc',
        prompt: 'Inspect this edge ruler image and return strict JSON.',
        columns: 16,
        rows: 9,
        temperature: 0.1,
      },
    })
  })

  it('rejects invalid payloads before running Vision', async () => {
    const route = await import('@/app/api/user/edge-ruler-vision-test/route')
    const req = buildMockRequest({
      path: '/api/user/edge-ruler-vision-test',
      method: 'POST',
      body: {
        model: 'openrouter::vision-model',
        imageDataUrl: 'https://example.com/image.png',
        prompt: 'too short',
        columns: 16,
        rows: 9,
      },
    })

    const res = await route.POST(req, routeContext)
    expect(res.status).toBe(400)
    const body = await res.json() as { error?: { code?: string; details?: { field?: string } } }
    expect(body.error?.code).toBe('INVALID_PARAMS')
    expect(body.error?.details?.field).toBe('body')
    expect(runEdgeRulerVisionLabMock).not.toHaveBeenCalled()
  })

  it('returns the auth response when the user is not authenticated', async () => {
    authMock.requireUserAuth.mockResolvedValueOnce(NextResponse.json(
      { error: { code: 'UNAUTHORIZED' } },
      { status: 401 },
    ))

    const route = await import('@/app/api/user/edge-ruler-vision-test/route')
    const req = buildMockRequest({
      path: '/api/user/edge-ruler-vision-test',
      method: 'POST',
      body: {
        model: 'openrouter::vision-model',
        imageDataUrl: 'data:image/png;base64,abc',
        prompt: 'Inspect this edge ruler image and return strict JSON.',
        columns: 16,
        rows: 9,
      },
    })

    const res = await route.POST(req, routeContext)
    expect(res.status).toBe(401)
    expect(runEdgeRulerVisionLabMock).not.toHaveBeenCalled()
  })
})
