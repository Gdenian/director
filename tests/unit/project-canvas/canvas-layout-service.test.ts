import { beforeEach, describe, expect, it, vi } from 'vitest'

const txMock = vi.hoisted(() => ({
  projectCanvasLayout: {
    upsert: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  projectCanvasNodeLayout: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
}))

const prismaMock = vi.hoisted(() => ({
  projectEpisode: {
    findFirst: vi.fn(),
  },
  projectCanvasLayout: {
    findUnique: vi.fn(),
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn(async (callback: (tx: typeof txMock) => Promise<unknown>) => await callback(txMock)),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

describe('canvas layout service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.projectEpisode.findFirst.mockResolvedValue({ id: 'episode-1' })
    txMock.projectCanvasLayout.upsert.mockResolvedValue({
      id: 'layout-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      schemaVersion: 2,
      viewportX: 0,
      viewportY: 0,
      zoom: 1,
      createdAt: new Date('2026-05-15T00:00:00.000Z'),
      updatedAt: new Date('2026-05-15T00:00:00.000Z'),
    })
    txMock.projectCanvasLayout.findUniqueOrThrow.mockResolvedValue({
      id: 'layout-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      schemaVersion: 2,
      viewportX: 10,
      viewportY: 20,
      zoom: 0.8,
      createdAt: new Date('2026-05-15T00:00:00.000Z'),
      updatedAt: new Date('2026-05-15T00:00:00.000Z'),
      nodeLayouts: [],
    })
  })

  it('upserts canvas layout by episode id to avoid conflicting unique constraints', async () => {
    const { upsertProjectCanvasLayout } = await import('@/lib/project-canvas/layout/canvas-layout-service')

    const layout = await upsertProjectCanvasLayout({
      projectId: 'project-1',
      input: {
        episodeId: 'episode-1',
        viewport: { x: 10, y: 20, zoom: 0.8 },
        nodeLayouts: [],
      },
    })

    expect(layout).toMatchObject({
      projectId: 'project-1',
      episodeId: 'episode-1',
      schemaVersion: 2,
      viewport: { x: 10, y: 20, zoom: 0.8 },
    })
    const upsertArg = txMock.projectCanvasLayout.upsert.mock.calls[0]?.[0] as {
      where?: { episodeId?: string; projectId_episodeId?: unknown }
    }
    expect(upsertArg.where).toEqual({ episodeId: 'episode-1' })
    expect(upsertArg.where?.projectId_episodeId).toBeUndefined()
  })
})
