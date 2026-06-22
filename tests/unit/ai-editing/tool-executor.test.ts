import { describe, expect, it } from 'vitest'
import { EditorToolExecutor } from '@/lib/novel-promotion/ai-editing/tool-executor'
import type { VideoEditorProject } from '@/features/video-editor/types/editor.types'

function baseProject(): VideoEditorProject {
  return {
    id: 'editor-1',
    episodeId: 'episode-1',
    schemaVersion: '1.2',
    config: { fps: 30, width: 1920, height: 1080, videoRatio: '16:9', burnSubtitlesDefault: true },
    timeline: [{
      id: 'clip-1',
      kind: 'source',
      src: '/m/a',
      durationInFrames: 90,
      metadata: { storyboardId: 'storyboard-1', sourcePanelId: 'panel-1', storyOrder: 0, source: 'panel' },
    }, {
      id: 'clip-2',
      kind: 'source',
      src: '/m/b',
      durationInFrames: 90,
      metadata: { storyboardId: 'storyboard-2', sourcePanelId: 'panel-2', storyOrder: 1, source: 'panel' },
    }],
    audioTrack: [{ id: 'audio-2', src: '/m/audio-b', startFrame: 90, durationInFrames: 90, sourcePanelId: 'panel-2', clipId: 'clip-2', volume: 1 }],
    subtitleCues: [{ id: 'subtitle-2', text: 'second', startFrame: 90, endFrame: 180, sourcePanelId: 'panel-2', style: 'default' }],
    editorAssets: [],
    bgmTrack: [],
    pendingVersion: null,
  }
}

describe('EditorToolExecutor', () => {
  it('rejects pending media when inserting clips', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: { fps: 30, entries: [{ id: 'user_import_video:asset-pending', sourceType: 'user_import_video', kind: 'video', status: 'pending', eligibleForTimeline: false, url: null, label: 'pending' }] },
    })

    expect(() => executor.insertClips({ afterClipId: 'clip-1', mediaIds: ['user_import_video:asset-pending'] })).toThrow('EDITOR_TOOL_MEDIA_NOT_ELIGIBLE')
  })

  it('inserts completed video media and ripples later audio and subtitles', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: { fps: 30, entries: [{ id: 'user_import_video:asset-1', sourceType: 'user_import_video', kind: 'video', status: 'completed', eligibleForTimeline: true, url: '/m/import', durationInFrames: 45, label: 'imported' }] },
    })

    executor.getTimeline()
    executor.getMedia()
    const result = executor.insertClips({ afterClipId: 'clip-1', mediaIds: ['user_import_video:asset-1'] })

    expect(result.project.timeline.map((clip) => clip.id)).toEqual(['clip-1', 'clip_asset-1', 'clip-2'])
    expect(result.project.timeline[1]).toMatchObject({
      src: '/m/import',
      durationInFrames: 45,
      metadata: { editorAssetId: 'asset-1', source: 'user_import_video' },
    })
    expect(result.project.audioTrack[0].startFrame).toBe(135)
    expect(result.project.subtitleCues[0]).toMatchObject({ startFrame: 135, endFrame: 225 })
  })

  it('undo reverts only the latest draft mutation', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: { fps: 30, entries: [{ id: 'user_import_video:asset-1', sourceType: 'user_import_video', kind: 'video', status: 'completed', eligibleForTimeline: true, url: '/m/import', durationInFrames: 45, label: 'imported' }] },
    })

    executor.getTimeline()
    executor.getMedia()
    executor.insertClips({ afterClipId: 'clip-1', mediaIds: ['user_import_video:asset-1'] })
    const result = executor.undo()

    expect(result.project.timeline.map((clip) => clip.id)).toEqual(['clip-1', 'clip-2'])
    expect(result.changed).toBe(false)
  })
})
