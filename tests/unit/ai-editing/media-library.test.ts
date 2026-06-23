import { describe, expect, it } from 'vitest'
import { buildAiEditableMediaLibrary } from '@/lib/novel-promotion/ai-editing/media-library'

describe('AI editing media library', () => {
  it('returns generated and imported media with eligibility status', async () => {
    const library = await buildAiEditableMediaLibrary({
      fps: 30,
      manifest: {
        episodeId: 'episode-1',
        fps: 30,
        dimensions: { width: 1920, height: 1080 },
        clips: [{
          clipId: 'panel-1',
          sourcePanelId: 'panel-1',
          storyboardId: 'storyboard-1',
          storyOrder: 0,
          videoUrl: '/m/panel-video',
          durationInFrames: 90,
          description: 'opening shot',
        }],
        voiceLines: [{
          id: 'voice-1',
          sourcePanelId: 'panel-1',
          audioUrl: '/m/voice',
          durationInFrames: 72,
          text: 'hello',
        }],
        editorAssets: [{
          id: 'bridge-1',
          kind: 'transition_bridge',
          url: '/m/bridge',
          durationInFrames: 24,
        }],
      },
      importedAssets: [{
        id: 'asset-import-1',
        kind: 'user_import_video',
        status: 'completed',
        url: '/m/import-video',
        mediaObjectId: 'media-1',
        metadata: JSON.stringify({ durationMs: 2400, width: 1280, height: 720, label: 'uploaded close-up' }),
      }, {
        id: 'asset-import-pending',
        kind: 'user_import_video',
        status: 'pending',
        url: null,
        mediaObjectId: null,
        metadata: null,
      }],
    })

    expect(library.entries.map((entry) => entry.id)).toEqual([
      'generated_panel_video:panel-1',
      'voice_audio:voice-1',
      'generated_transition_bridge:bridge-1',
      'user_import_video:asset-import-1',
      'user_import_video:asset-import-pending',
    ])
    expect(library.entries.find((entry) => entry.id === 'user_import_video:asset-import-1')).toMatchObject({
      kind: 'video',
      sourceType: 'user_import_video',
      status: 'completed',
      eligibleForTimeline: true,
      durationInFrames: 72,
      width: 1280,
      height: 720,
      label: 'uploaded close-up',
    })
    expect(library.entries.find((entry) => entry.id === 'user_import_video:asset-import-pending')).toMatchObject({
      status: 'pending',
      eligibleForTimeline: false,
    })
  })

  it('marks voice audio without a URL as failed and stores a null URL', async () => {
    const library = await buildAiEditableMediaLibrary({
      fps: 30,
      manifest: {
        episodeId: 'episode-1',
        fps: 30,
        dimensions: { width: 1920, height: 1080 },
        clips: [],
        voiceLines: [{
          id: 'voice-missing',
          sourcePanelId: 'panel-1',
          durationInFrames: 72,
          text: 'missing voice',
        }],
        editorAssets: [],
      },
      importedAssets: [],
    })

    expect(library.entries[0]).toMatchObject({
      id: 'voice_audio:voice-missing',
      status: 'failed',
      eligibleForTimeline: false,
      url: null,
    })
  })

  it('ignores unsafe imported metadata values', async () => {
    const library = await buildAiEditableMediaLibrary({
      fps: 30,
      manifest: {
        episodeId: 'episode-1',
        fps: 30,
        dimensions: { width: 1920, height: 1080 },
        clips: [],
        voiceLines: [],
        editorAssets: [],
      },
      importedAssets: [{
        id: 'asset-zero-duration',
        kind: 'user_import_video',
        status: 'completed',
        url: '/m/zero',
        mediaObjectId: 'media-zero',
        metadata: JSON.stringify({ durationMs: 0, label: '   ' }),
      }, {
        id: 'asset-array-metadata',
        kind: 'user_import_video',
        status: 'completed',
        url: '/m/array',
        mediaObjectId: 'media-array',
        metadata: JSON.stringify([{ durationMs: 2400, label: 'array label' }]),
      }, {
        id: 'asset-invalid-json',
        kind: 'user_import_video',
        status: 'completed',
        url: '/m/invalid',
        mediaObjectId: 'media-invalid',
        metadata: '{bad json',
      }, {
        id: 'asset-unknown-kind',
        kind: 'unsupported_kind',
        status: 'completed',
        url: '/m/unknown',
        mediaObjectId: 'media-unknown',
        metadata: JSON.stringify({ durationMs: 2400 }),
      }],
    })

    expect(library.entries.map((entry) => entry.id)).toEqual([
      'user_import_video:asset-zero-duration',
      'user_import_video:asset-array-metadata',
      'user_import_video:asset-invalid-json',
    ])
    expect(library.entries[0]).toMatchObject({
      durationInFrames: undefined,
      label: '导入素材',
    })
    expect(library.entries[1]).toMatchObject({
      durationInFrames: undefined,
      label: '导入素材',
    })
    expect(library.entries[2]).toMatchObject({
      durationInFrames: undefined,
      label: '导入素材',
    })
  })
})
