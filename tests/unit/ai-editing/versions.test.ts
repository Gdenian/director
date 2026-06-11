import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  videoEditorProjectVersion: {
    findMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { createEditorVersion, nextVersionIndex, trimVersionRowsForCap } from '@/lib/novel-promotion/ai-editing/versions'

describe('editor versions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('increments version indexes from existing rows', () => {
    expect(nextVersionIndex([{ versionIndex: 1 }, { versionIndex: 2 }])).toBe(3)
  })

  it('selects oldest rows beyond cap for deletion', () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      id: `v-${index + 1}`,
      versionIndex: index + 1,
    }))

    expect(trimVersionRowsForCap(rows, 10)).toEqual(['v-1', 'v-2'])
  })

  it('retries version creation when a concurrent writer takes the next version index', async () => {
    const collision = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    prismaMock.videoEditorProjectVersion.findMany
      .mockResolvedValueOnce([{ id: 'v-1', versionIndex: 1 }])
      .mockResolvedValueOnce([{ id: 'v-1', versionIndex: 1 }, { id: 'v-2', versionIndex: 2 }])
    prismaMock.videoEditorProjectVersion.create
      .mockRejectedValueOnce(collision)
      .mockResolvedValueOnce({ id: 'v-3', versionIndex: 3 })
    prismaMock.videoEditorProjectVersion.deleteMany.mockResolvedValue({ count: 0 })

    const version = await createEditorVersion({
      editorProjectId: 'editor-1',
      reason: 'refine',
      summary: 'summary',
      snapshot: {
        id: 'editor-1',
        episodeId: 'episode-1',
        schemaVersion: '1.2',
        config: { fps: 30, width: 1920, height: 1080, videoRatio: '16:9', burnSubtitlesDefault: true },
        timeline: [],
        audioTrack: [],
        subtitleCues: [],
        editorAssets: [],
        bgmTrack: [],
        pendingVersion: null,
      },
    })

    expect(version).toEqual({ id: 'v-3', versionIndex: 3 })
    expect(prismaMock.videoEditorProjectVersion.create).toHaveBeenCalledTimes(2)
    expect(prismaMock.videoEditorProjectVersion.create.mock.calls[0][0].data.versionIndex).toBe(2)
    expect(prismaMock.videoEditorProjectVersion.create.mock.calls[1][0].data.versionIndex).toBe(3)
  })
})
