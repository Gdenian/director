import { describe, expect, it } from 'vitest'
import { migrateProjectData } from '@/features/video-editor/utils/migration'

describe('editor project migration', () => {
  it('migrates schema 1.0 projects to schema 1.2 without reordering clips', () => {
    const migrated = migrateProjectData({
      id: 'editor-1',
      episodeId: 'episode-1',
      schemaVersion: '1.0',
      config: { fps: 30, width: 1920, height: 1080 },
      timeline: [{
        id: 'clip-1',
        src: '/m/video',
        durationInFrames: 90,
        trim: { from: 10, to: 80 },
        attachment: {
          audio: { src: '/m/audio', volume: 1, voiceLineId: 'voice-1' },
          subtitle: { text: 'hello', style: 'default' },
        },
        metadata: { panelId: 'panel-1', storyboardId: 'storyboard-1', description: 'desc' },
      }],
      bgmTrack: [],
    })

    expect(migrated.schemaVersion).toBe('1.2')
    expect(migrated.config).toMatchObject({
      fps: 30,
      width: 1920,
      height: 1080,
      videoRatio: '16:9',
      burnSubtitlesDefault: true,
    })
    expect(migrated.timeline[0]).toMatchObject({
      id: 'clip-1',
      kind: 'source',
      sourceTrim: { fromFrame: 10, toFrame: 80 },
      metadata: {
        sourcePanelId: 'panel-1',
        storyboardId: 'storyboard-1',
      },
    })
    expect(migrated.audioTrack).toHaveLength(1)
    expect(migrated.subtitleCues).toEqual([expect.objectContaining({
      text: 'hello',
      startFrame: 0,
      endFrame: 90,
      sourcePanelId: 'panel-1',
      sourceVoiceLineId: 'voice-1',
    })])
    expect(migrated.editorAssets).toEqual([])
    expect(migrated.pendingVersion).toBeNull()
  })

  it('normalizes schema 1.2 projects instead of passing malformed timeline data through', () => {
    const migrated = migrateProjectData({
      id: 'editor-2',
      episodeId: 'episode-2',
      schemaVersion: '1.2',
      config: { fps: 24, width: 1080, height: 1920, videoRatio: '9:16', burnSubtitlesDefault: false },
      timeline: [{
        id: 'clip-1',
        src: '/m/video',
        durationInFrames: 45,
        trim: { from: 3, to: 40 },
        metadata: { panelId: 'panel-1', storyboardId: 'storyboard-1' },
      }],
      audioTrack: [{ id: 'audio-1', src: '/m/audio', startFrame: 0, durationInFrames: 40, volume: 1 }],
      subtitleCues: [{ id: 'sub-1', text: 'line', startFrame: 0, endFrame: 40, style: 'default' }],
      editorAssets: [{ id: 'asset-1', kind: 'render_output', status: 'completed', url: '/m/output.mp4' }],
      bgmTrack: [],
      pendingVersion: null,
    })

    expect(migrated.config).toMatchObject({ videoRatio: '9:16', burnSubtitlesDefault: false })
    expect(migrated.timeline[0]).toMatchObject({
      id: 'clip-1',
      kind: 'source',
      sourceTrim: { fromFrame: 3, toFrame: 40 },
      metadata: {
        sourcePanelId: 'panel-1',
        storyboardId: 'storyboard-1',
      },
    })
    expect(migrated.editorAssets).toEqual([
      expect.objectContaining({ id: 'asset-1', kind: 'render_output', status: 'completed', url: '/m/output.mp4' }),
    ])
  })

  it('preserves imported clip media source metadata and drops invalid media source types', () => {
    const migrated = migrateProjectData({
      id: 'editor-3',
      episodeId: 'episode-3',
      schemaVersion: '1.2',
      config: { fps: 30, width: 1920, height: 1080, videoRatio: '16:9', burnSubtitlesDefault: true },
      timeline: [{
        id: 'clip-import',
        kind: 'source',
        src: '/m/import',
        durationInFrames: 60,
        metadata: {
          storyboardId: 'storyboard-import',
          source: 'imported',
          mediaSourceType: 'user_import_video',
          editorAssetId: 'asset-1',
        },
      }, {
        id: 'clip-invalid-source',
        kind: 'source',
        src: '/m/invalid',
        durationInFrames: 60,
        metadata: {
          storyboardId: 'storyboard-invalid',
          source: 'imported',
          mediaSourceType: 'bad_source',
        },
      }],
      audioTrack: [],
      subtitleCues: [],
      editorAssets: [],
      bgmTrack: [],
      pendingVersion: null,
    })

    expect(migrated.timeline[0].metadata).toMatchObject({
      source: 'imported',
      mediaSourceType: 'user_import_video',
      editorAssetId: 'asset-1',
    })
    expect(migrated.timeline[1].metadata).toMatchObject({ source: 'imported' })
    expect(migrated.timeline[1].metadata.mediaSourceType).toBeUndefined()
  })
})
