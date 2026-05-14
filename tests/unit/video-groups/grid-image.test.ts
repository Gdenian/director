import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storageMocks = vi.hoisted(() => ({
  getObjectBuffer: vi.fn(async () => Buffer.from('stored-image')),
  uploadObject: vi.fn(async () => 'images/video-group-reference/group-1.png'),
  generateUniqueKey: vi.fn(() => 'images/video-group-reference/group-1.png'),
  toFetchableUrl: vi.fn((value: string) => value),
}))

const mediaMocks = vi.hoisted(() => ({
  ensureMediaObjectFromStorageKey: vi.fn(async (storageKey: string) => ({
    id: 'media-1',
    url: storageKey,
    storageKey,
    mimeType: 'image/png',
    width: 1548,
    height: 1548,
    durationMs: null,
  })),
  resolveStorageKeyFromMediaValue: vi.fn(async (value: unknown) =>
    typeof value === 'string' && value.startsWith('images/') ? value : null,
  ),
}))

vi.mock('@/lib/storage', () => storageMocks)
vi.mock('@/lib/media/service', () => mediaMocks)
vi.mock('sharp', () => {
  const createChain = () => {
    const chain = {
      resize: vi.fn(() => chain),
      png: vi.fn(() => chain),
      composite: vi.fn(() => chain),
      toBuffer: vi.fn(async () => Buffer.from('png-output')),
    }
    return chain
  }
  return {
    default: vi.fn(() => createChain()),
  }
})

describe('video group grid image composition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads legacy storage-key imageUrl values through storage instead of fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const { composeAndStoreGridReferenceImage } = await import('@/lib/video-groups/grid-image')
    const result = await composeAndStoreGridReferenceImage({
      gridMode: '2x2',
      targetId: 'group-1',
      cells: [
        { imageUrl: 'images/panel-candidate-1.jpg' },
      ],
    })

    expect(mediaMocks.resolveStorageKeyFromMediaValue).toHaveBeenCalledWith('images/panel-candidate-1.jpg')
    expect(storageMocks.getObjectBuffer).toHaveBeenCalledWith('images/panel-candidate-1.jpg')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.storageKey).toBe('images/video-group-reference/group-1.png')
  })
})
