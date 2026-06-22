import { describe, expect, it } from 'vitest'
import { classifyEditorImportMimeType, normalizeEditorImportMetadata } from '@/lib/novel-promotion/ai-editing/import-media'

describe('AI editing media import helpers', () => {
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
})
