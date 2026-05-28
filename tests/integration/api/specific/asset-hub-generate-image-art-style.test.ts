import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const submitTaskMock = vi.hoisted(() => vi.fn<(input: unknown) => Promise<{
  success: boolean
  async: boolean
  taskId: string
  status: string
  deduped: boolean
}>>(async () => ({
  success: true,
  async: true,
  taskId: 'task-1',
  status: 'queued',
  deduped: false,
})))

const configServiceMock = vi.hoisted(() => ({
  getUserModelConfig: vi.fn(async () => ({
    analysisModel: null,
    characterModel: 'img::character',
    locationModel: 'img::location',
    storyboardModel: null,
    editModel: null,
    videoModel: null,
    capabilityDefaults: {},
  })),
  buildImageBillingPayloadFromUserConfig: vi.fn((input: { basePayload: Record<string, unknown> }) => ({
    ...input.basePayload,
  })),
}))

const hasOutputMock = vi.hoisted(() => ({
  hasGlobalCharacterOutput: vi.fn(async () => false),
  hasGlobalLocationOutput: vi.fn(async () => false),
}))

const billingMock = vi.hoisted(() => ({
  buildDefaultTaskBillingInfo: vi.fn(() => ({ billable: false })),
}))

const prismaMock = vi.hoisted(() => ({
  globalCharacterAppearance: {
    findFirst: vi.fn(),
  },
  globalLocation: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  globalLocationImage: {
    findMany: vi.fn(async () => []),
    createMany: vi.fn(async () => ({})),
  },
}))

const styleFixtures = vi.hoisted(() => ({
  styleRecord: {
    styleAssetId: 'style-1',
    styleSnapshotName: '电影写实',
    stylePromptZh: '电影写实中文提示词',
    stylePromptEn: 'cinematic realistic prompt',
    styleSnapshotUpdatedAt: new Date('2026-05-28T01:00:00.000Z'),
  },
  styleSnapshot: {
    styleAssetId: 'style-1',
    name: '电影写实',
    promptZh: '电影写实中文提示词',
    promptEn: 'cinematic realistic prompt',
    snapshotUpdatedAt: '2026-05-28T01:00:00.000Z',
  },
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/task/submitter', () => ({ submitTask: submitTaskMock }))
vi.mock('@/lib/config-service', () => configServiceMock)
vi.mock('@/lib/task/has-output', () => hasOutputMock)
vi.mock('@/lib/billing', () => billingMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/task/resolve-locale', () => ({
  resolveRequiredTaskLocale: vi.fn(() => 'zh'),
}))

describe('api specific - asset hub generate image style snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses persisted appearance style snapshot when request payload does not provide one', async () => {
    prismaMock.globalCharacterAppearance.findFirst.mockResolvedValueOnce(styleFixtures.styleRecord)
    const mod = await import('@/app/api/asset-hub/generate-image/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/generate-image',
      method: 'POST',
      body: {
        type: 'character',
        id: 'character-1',
        appearanceIndex: 0,
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    expect(prismaMock.globalCharacterAppearance.findFirst).toHaveBeenCalled()
    const submitArg = submitTaskMock.mock.calls[0]?.[0] as { payload?: Record<string, unknown> } | undefined
    expect(submitArg?.payload?.styleSnapshot).toEqual(styleFixtures.styleSnapshot)
  })

  it('uses persisted location style snapshot when request payload does not provide one', async () => {
    prismaMock.globalLocation.findFirst
      .mockResolvedValueOnce(styleFixtures.styleRecord)
      .mockResolvedValueOnce({ name: 'Location 1', summary: 'Summary 1' })
    const mod = await import('@/app/api/asset-hub/generate-image/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/generate-image',
      method: 'POST',
      body: {
        type: 'location',
        id: 'location-1',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    expect(prismaMock.globalLocation.findFirst).toHaveBeenCalled()
    const submitArg = submitTaskMock.mock.calls[0]?.[0] as { payload?: Record<string, unknown> } | undefined
    expect(submitArg?.payload?.styleSnapshot).toEqual(styleFixtures.styleSnapshot)
    expect(submitArg?.payload?.count).toBe(3)
  })

  it('fails with invalid params when persisted style snapshot is missing', async () => {
    prismaMock.globalCharacterAppearance.findFirst.mockResolvedValueOnce({
      styleAssetId: null,
      styleSnapshotName: null,
      stylePromptZh: null,
      stylePromptEn: null,
      styleSnapshotUpdatedAt: null,
    })
    const mod = await import('@/app/api/asset-hub/generate-image/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/generate-image',
      method: 'POST',
      body: {
        type: 'character',
        id: 'character-1',
        appearanceIndex: 0,
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_PARAMS')
    expect(submitTaskMock).not.toHaveBeenCalled()
  })

  it('forwards requested count into asset hub image task payload', async () => {
    prismaMock.globalCharacterAppearance.findFirst.mockResolvedValueOnce(styleFixtures.styleRecord)
    const mod = await import('@/app/api/asset-hub/generate-image/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/generate-image',
      method: 'POST',
      body: {
        type: 'character',
        id: 'character-1',
        appearanceIndex: 0,
        count: 5,
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const submitArg = submitTaskMock.mock.calls[0]?.[0] as {
      payload?: Record<string, unknown>
      dedupeKey?: string
    } | undefined
    expect(submitArg?.payload?.count).toBe(5)
    expect(submitArg?.payload?.styleSnapshot).toEqual(styleFixtures.styleSnapshot)
    expect(submitArg?.dedupeKey).toContain(':5')
  })
})
