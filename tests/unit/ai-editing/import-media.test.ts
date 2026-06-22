import { beforeEach, describe, expect, it, vi } from 'vitest'

const editorAssetsMock = vi.hoisted(() => ({
  completeEditorAsset: vi.fn(async (input) => ({
    id: input.id,
    status: 'completed',
    kind: 'user_import_video',
    url: input.url,
    mediaObjectId: input.mediaObjectId,
    metadata: JSON.stringify(input.metadata),
  })),
  createPendingEditorAsset: vi.fn(async () => ({ id: 'asset-1' })),
  failEditorAsset: vi.fn(),
}))

const storageMock = vi.hoisted(() => ({
  generateUniqueKey: vi.fn(() => 'editor-import/editor-1/imported.mp4'),
  getSignedObjectUrl: vi.fn(async () => 'https://storage.example.com/imported.mp4'),
  toFetchableUrl: vi.fn((value: string) => value),
  uploadObject: vi.fn(async () => 'stored/imported.mp4'),
}))

const mediaServiceMock = vi.hoisted(() => ({
  ensureMediaObjectFromStorageKey: vi.fn(async () => ({
    id: 'media-1',
    url: '/media/stored-imported.mp4',
  })),
}))

const probeMock = vi.hoisted(() => ({
  probeMediaMetadata: vi.fn(async () => ({ durationMs: 2000 })),
}))

const dnsMock = vi.hoisted(() => ({
  lookup: vi.fn(async () => [{ address: '203.0.113.10', family: 4 }]),
}))

vi.mock('./editor-assets', () => editorAssetsMock)
vi.mock('@/lib/novel-promotion/ai-editing/editor-assets', () => editorAssetsMock)
vi.mock('@/lib/storage', () => storageMock)
vi.mock('@/lib/media/service', () => mediaServiceMock)
vi.mock('@/lib/novel-promotion/ai-editing/media-probe', () => probeMock)
vi.mock('node:dns/promises', () => dnsMock)

import {
  EditorImportError,
  assertSafeEditorImportUrl,
  classifyEditorImportMimeType,
  importEditorMediaFromBuffer,
  importEditorMediaFromUrl,
  normalizeEditorImportMetadata,
} from '@/lib/novel-promotion/ai-editing/import-media'

describe('AI editing media import helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dnsMock.lookup.mockResolvedValue([{ address: '203.0.113.10', family: 4 }])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('video-data'), {
      status: 200,
      headers: {
        'content-type': 'video/mp4',
        'content-length': '10',
      },
    })))
  })

  it('accepts supported video, audio, and image mime types', () => {
    expect(classifyEditorImportMimeType('video/mp4')).toBe('user_import_video')
    expect(classifyEditorImportMimeType('video/quicktime')).toBe('user_import_video')
    expect(classifyEditorImportMimeType('audio/mpeg')).toBe('user_import_audio')
    expect(classifyEditorImportMimeType('audio/wav')).toBe('user_import_audio')
    expect(classifyEditorImportMimeType('image/png')).toBe('user_import_image')
    expect(classifyEditorImportMimeType('application/pdf')).toBeNull()
  })

  it('normalizes metadata needed by timeline tools', () => {
    expect(normalizeEditorImportMetadata({
      label: '  close up  ',
      mimeType: 'video/mp4',
      sizeBytes: 1234,
      durationMs: 2500,
      width: 1280,
      height: 720,
    })).toEqual({
      label: 'close up',
      mimeType: 'video/mp4',
      sizeBytes: 1234,
      durationMs: 2500,
      width: 1280,
      height: 720,
    })
  })

  it('rejects localhost and private import URLs before download', async () => {
    await expect(assertSafeEditorImportUrl('http://localhost/video.mp4'))
      .rejects.toMatchObject({ code: 'EDITOR_IMPORT_URL_INVALID' })
    await expect(assertSafeEditorImportUrl('http://media.localhost/video.mp4'))
      .rejects.toMatchObject({ code: 'EDITOR_IMPORT_URL_INVALID' })
    await expect(assertSafeEditorImportUrl('http://[fe90::1]/video.mp4'))
      .rejects.toMatchObject({ code: 'EDITOR_IMPORT_URL_INVALID' })
    await expect(assertSafeEditorImportUrl('http://[::ffff:127.0.0.1]/video.mp4'))
      .rejects.toMatchObject({ code: 'EDITOR_IMPORT_URL_INVALID' })

    dnsMock.lookup.mockResolvedValue([{ address: '10.0.0.7', family: 4 }])

    await expect(assertSafeEditorImportUrl('https://media.example.com/video.mp4'))
      .rejects.toMatchObject({ code: 'EDITOR_IMPORT_URL_INVALID' })
  })

  it('rejects oversized buffers before creating a pending asset', async () => {
    const oversizedImage = Buffer.alloc(25 * 1024 * 1024 + 1)

    await expect(importEditorMediaFromBuffer({
      editorProjectId: 'editor-1',
      episodeId: 'episode-1',
      fileName: 'large.png',
      mimeType: 'image/png',
      buffer: oversizedImage,
    })).rejects.toMatchObject({ code: 'EDITOR_IMPORT_TOO_LARGE' })

    expect(editorAssetsMock.createPendingEditorAsset).not.toHaveBeenCalled()
  })

  it('rejects oversized URL imports from content-length', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-length': String(25 * 1024 * 1024 + 1),
      },
    }))

    await expect(importEditorMediaFromUrl({
      editorProjectId: 'editor-1',
      episodeId: 'episode-1',
      url: 'https://media.example.com/large.png',
      mimeType: 'image/png',
    })).rejects.toMatchObject({ code: 'EDITOR_IMPORT_TOO_LARGE' })
  })

  it('stores successful URL imports with the completed media object URL', async () => {
    const asset = await importEditorMediaFromUrl({
      editorProjectId: 'editor-1',
      episodeId: 'episode-1',
      url: 'https://media.example.com/video.mp4',
      mimeType: 'video/mp4',
      label: 'Imported clip',
    })

    expect(fetch).toHaveBeenCalledWith('https://media.example.com/video.mp4', expect.objectContaining({
      redirect: 'manual',
    }))
    expect(mediaServiceMock.ensureMediaObjectFromStorageKey).toHaveBeenCalledWith(
      'stored/imported.mp4',
      expect.objectContaining({ label: 'Imported clip' }),
    )
    expect(editorAssetsMock.completeEditorAsset).toHaveBeenCalledWith(expect.objectContaining({
      id: 'asset-1',
      mediaObjectId: 'media-1',
      url: '/media/stored-imported.mp4',
    }))
    expect(asset.url).toBe('/media/stored-imported.mp4')
    expect(asset.url).not.toBe('https://media.example.com/video.mp4')
  })
})
