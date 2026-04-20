import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const storageMock = vi.hoisted(() => ({
  uploadObject: vi.fn(async () => undefined),
  generateUniqueKey: vi.fn(() => 'style-preview.jpg'),
}))

const mediaServiceMock = vi.hoisted(() => ({
  ensureMediaObjectFromStorageKey: vi.fn(async () => ({
    id: 'media-1',
    publicId: 'style-preview',
    url: '/m/style-preview',
    mimeType: 'image/jpeg',
    sizeBytes: 2048,
    width: 1024,
    height: 1024,
    durationMs: null,
    storageKey: 'style-preview.jpg',
  })),
}))

const sharpMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/storage', () => storageMock)
vi.mock('@/lib/media/service', () => mediaServiceMock)
vi.mock('sharp', () => ({
  default: sharpMock,
}))

describe('api specific - asset hub style preview upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sharpMock.mockImplementation(() => {
      const chain = {
        jpeg: vi.fn(() => chain),
        toBuffer: vi.fn(async () => Buffer.from('processed-image')),
      }
      return chain
    })
  })

  it('uploads style preview and returns public media fields only', async () => {
    const mod = await import('@/app/api/asset-hub/upload-image/route')
    const formData = new FormData()
    formData.append('file', new File([new Uint8Array([1, 2, 3])], 'style.jpg', { type: 'image/jpeg' }))
    formData.append('type', 'style-preview')

    const req = new NextRequest('http://localhost:3000/api/asset-hub/upload-image', {
      method: 'POST',
      body: formData,
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(storageMock.generateUniqueKey).toHaveBeenCalledWith('global-style-preview-user-1-upload', 'jpg')
    expect(storageMock.uploadObject).toHaveBeenCalledWith(Buffer.from('processed-image'), 'style-preview.jpg')
    expect(mediaServiceMock.ensureMediaObjectFromStorageKey).toHaveBeenCalledWith('style-preview.jpg')
    expect(body.media).toEqual({
      id: 'media-1',
      publicId: 'style-preview',
      url: '/m/style-preview',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      width: 1024,
      height: 1024,
      durationMs: null,
    })
    expect(body.media).not.toHaveProperty('storageKey')
  })
})
