import { describe, expect, it, vi } from 'vitest'

const mediaObjectMock = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
}))

const extractStorageKeyMock = vi.hoisted(() => vi.fn((value: string) => value.replace(/^\/+/, '')))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    mediaObject: mediaObjectMock,
  },
}))

vi.mock('@/lib/storage', () => ({
  extractStorageKey: extractStorageKeyMock,
}))

describe('media service', () => {
  it('resolveStorageKeyFromMediaValue reads storageKey from media object values', async () => {
    const { resolveStorageKeyFromMediaValue } = await import('@/lib/media/service')

    const storageKey = await resolveStorageKeyFromMediaValue({
      id: 'media-1',
      url: null,
      storageKey: '/group-video/final.mp4',
    })

    expect(storageKey).toBe('group-video/final.mp4')
    expect(extractStorageKeyMock).toHaveBeenCalledWith('/group-video/final.mp4')
    expect(mediaObjectMock.findUnique).not.toHaveBeenCalled()
  })
})
