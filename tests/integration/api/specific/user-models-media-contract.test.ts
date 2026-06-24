import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/model-capabilities/catalog', () => ({
  findBuiltinCapabilities: vi.fn(() => undefined),
}))
vi.mock('@/lib/model-pricing/catalog', () => ({
  findBuiltinPricingCatalogEntry: vi.fn(() => undefined),
}))

describe('api specific - user models media contract metadata', () => {
  const routeContext = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('filters video workflow options to passed or trusted media capabilities', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValue({
      customProviders: JSON.stringify([
        {
          id: 'engine-video',
          name: 'Relay Engine',
          providerKey: 'openai-compatible',
          apiKey: 'k-video',
          status: 'available',
        },
      ]),
      customModels: JSON.stringify([
        {
          id: 'video-model',
          engineId: 'engine-video',
          name: 'Relay Video',
          callName: 'relay-video',
          modelKey: 'engine-video::relay-video',
          type: 'video',
          purpose: 'video-generation',
          enabled: true,
          status: 'available',
          mediaContract: {
            version: 1,
            mediaType: 'video',
            executor: 'openai-compat-template',
            capabilities: ['image-to-video'],
            input: { image: 'publicUrl' },
            output: { kind: 'asyncTask', urlPath: '$.video.url' },
            testStatus: { imageToVideo: 'unchecked' },
            source: 'llm',
          },
          compatMediaTemplate: {
            version: 1,
            mediaType: 'video',
            mode: 'async',
            create: {
              method: 'POST',
              path: '/v1/video/create',
              bodyTemplate: {
                model: '{{model}}',
                prompt: '{{prompt}}',
                image: '{{image}}',
              },
            },
            status: {
              method: 'GET',
              path: '/v1/video/query?id={{task_id}}',
            },
            response: {
              taskIdPath: '$.id',
              statusPath: '$.status',
            },
            polling: {
              intervalMs: 5000,
              timeoutMs: 600000,
              doneStates: ['completed'],
              failStates: ['failed'],
            },
          },
          mediaContractCheckedAt: '2026-06-15T00:00:00.000Z',
          mediaContractSource: 'llm',
        },
        {
          id: 'legacy-video',
          engineId: 'engine-video',
          name: 'Legacy Video',
          callName: 'legacy-video',
          modelKey: 'engine-video::legacy-video',
          type: 'video',
          purpose: 'video-generation',
          enabled: true,
          status: 'available',
        },
        {
          id: 'passed-video-model',
          engineId: 'engine-video',
          name: 'Passed Relay Video',
          callName: 'passed-relay-video',
          modelKey: 'engine-video::passed-relay-video',
          type: 'video',
          purpose: 'video-generation',
          enabled: true,
          status: 'available',
          mediaContract: {
            version: 1,
            mediaType: 'video',
            executor: 'openai-compat-template',
            capabilities: ['image-to-video'],
            input: { image: 'publicUrl' },
            output: { kind: 'asyncTask', urlPath: '$.video.url' },
            testStatus: { imageToVideo: 'passed' },
            source: 'manual',
          },
          compatMediaTemplate: {
            version: 1,
            mediaType: 'video',
            mode: 'async',
            create: {
              method: 'POST',
              path: '/v1/video/create',
              bodyTemplate: {
                model: '{{model}}',
                prompt: '{{prompt}}',
                image: '{{image}}',
              },
            },
            status: {
              method: 'GET',
              path: '/v1/video/query?id={{task_id}}',
            },
            response: {
              taskIdPath: '$.id',
              statusPath: '$.status',
            },
            polling: {
              intervalMs: 5000,
              timeoutMs: 600000,
              doneStates: ['completed'],
              failStates: ['failed'],
            },
          },
          mediaContractCheckedAt: '2026-06-15T00:00:00.000Z',
          mediaContractSource: 'manual',
        },
      ]),
    })

    const mod = await import('@/app/api/user/models/route')
    const req = buildMockRequest({
      path: '/api/user/models',
      method: 'GET',
    })
    const res = await mod.GET(req, routeContext)

    expect(res.status).toBe(200)
    const body = await res.json() as {
      video: Array<{
        value: string
        mediaContract?: unknown
        mediaCapabilitySummary?: {
          available: string[]
          unchecked: string[]
          failed: string[]
          unavailable: string[]
        }
      }>
    }

    expect(body.video).toHaveLength(1)
    expect(body.video[0]).toMatchObject({
      value: 'engine-video::passed-relay-video',
      mediaContract: expect.objectContaining({
        mediaType: 'video',
        capabilities: ['image-to-video'],
      }),
      mediaCapabilitySummary: {
        available: ['image-to-video'],
        unchecked: [],
        failed: [],
        unavailable: [],
      },
    })
    expect(body.video.map((item) => item.value)).not.toContain('engine-video::relay-video')
    expect(body.video.map((item) => item.value)).not.toContain('engine-video::legacy-video')
  })
})
