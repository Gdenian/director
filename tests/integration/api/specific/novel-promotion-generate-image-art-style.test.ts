import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({
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
  getProjectModelConfig: vi.fn(async () => ({
    analysisModel: null,
    characterModel: 'img::character',
    locationModel: 'img::location',
    storyboardModel: null,
    editModel: null,
    videoModel: null,
    videoRatio: '16:9',
    capabilityDefaults: {},
    capabilityOverrides: {},
  })),
  buildImageBillingPayload: vi.fn(async (input: { basePayload: Record<string, unknown> }) => ({
    ...input.basePayload,
  })),
}))

const styleFixtures = vi.hoisted(() => ({
  styleRecord: {
    styleAssetId: 'style-1' as string | null,
    styleSnapshotName: '电影写实' as string | null,
    stylePromptZh: '电影写实中文提示词' as string | null,
    stylePromptEn: 'cinematic realistic prompt' as string | null,
    styleSnapshotUpdatedAt: new Date('2026-05-28T01:00:00.000Z') as Date | null,
  },
  styleSnapshot: {
    styleAssetId: 'style-1',
    name: '电影写实',
    promptZh: '电影写实中文提示词',
    promptEn: 'cinematic realistic prompt',
    snapshotUpdatedAt: '2026-05-28T01:00:00.000Z',
  },
  projectRecord: {
    styleAssetId: 'style-project' as string | null,
    styleSnapshotName: '项目风格' as string | null,
    stylePromptZh: '项目中文提示词' as string | null,
    stylePromptEn: 'project english prompt' as string | null,
    styleSnapshotUpdatedAt: new Date('2026-05-28T02:00:00.000Z') as Date | null,
  },
  projectSnapshot: {
    styleAssetId: 'style-project',
    name: '项目风格',
    promptZh: '项目中文提示词',
    promptEn: 'project english prompt',
    snapshotUpdatedAt: '2026-05-28T02:00:00.000Z',
  },
}))

const hasOutputMock = vi.hoisted(() => ({
  hasCharacterAppearanceOutput: vi.fn(async () => false),
  hasLocationImageOutput: vi.fn(async () => false),
}))

const billingMock = vi.hoisted(() => ({
  buildDefaultTaskBillingInfo: vi.fn(() => ({ billable: false })),
}))

const prismaMock = vi.hoisted(() => ({
  characterAppearance: {
    findUnique: vi.fn(async () => styleFixtures.styleRecord),
  },
  novelPromotionLocation: {
    findUnique: vi.fn(async () => styleFixtures.styleRecord),
  },
  novelPromotionProject: {
    findUnique: vi.fn(async () => styleFixtures.projectRecord),
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

describe('api specific - novel promotion generate image style snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards persisted character appearance style snapshot into task payload', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/generate-image/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/generate-image',
      method: 'POST',
      body: {
        type: 'character',
        id: 'character-1',
        appearanceId: 'appearance-1',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    const submitArg = submitTaskMock.mock.calls[0]?.[0] as { payload?: Record<string, unknown> } | undefined
    expect(prismaMock.characterAppearance.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'appearance-1' },
    }))
    expect(submitArg?.payload?.styleSnapshot).toEqual(styleFixtures.styleSnapshot)
  })

  it('falls back to project style snapshot when asset snapshot is missing', async () => {
    prismaMock.characterAppearance.findUnique.mockResolvedValueOnce({
      styleAssetId: null,
      styleSnapshotName: null,
      stylePromptZh: null,
      stylePromptEn: null,
      styleSnapshotUpdatedAt: null,
    })
    const mod = await import('@/app/api/novel-promotion/[projectId]/generate-image/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/generate-image',
      method: 'POST',
      body: {
        type: 'character',
        id: 'character-1',
        appearanceId: 'appearance-1',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    const submitArg = submitTaskMock.mock.calls[0]?.[0] as { payload?: Record<string, unknown> } | undefined
    expect(submitArg?.payload?.styleSnapshot).toEqual(styleFixtures.projectSnapshot)
  })

  it('forwards requested count into task payload and dedupe key', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/generate-image/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/generate-image',
      method: 'POST',
      body: {
        type: 'character',
        id: 'character-1',
        appearanceId: 'appearance-1',
        count: 6,
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    const submitArg = submitTaskMock.mock.calls[0]?.[0] as {
      payload?: Record<string, unknown>
      dedupeKey?: string
    } | undefined
    expect(submitArg?.payload?.count).toBe(6)
    expect(submitArg?.payload?.styleSnapshot).toEqual(styleFixtures.styleSnapshot)
    expect(submitArg?.dedupeKey).toBe('image_character:appearance-1:6')
  })
})
