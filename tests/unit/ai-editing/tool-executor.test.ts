import { describe, expect, it } from 'vitest'
import { EditorToolExecutor } from '@/lib/novel-promotion/ai-editing/tool-executor'
import type { VideoEditorProject } from '@/features/video-editor/types/editor.types'
import type { AiEditableMediaLibrary } from '@/lib/novel-promotion/ai-editing/tool-types'

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

function completedVideoMedia(overrides: Partial<AiEditableMediaLibrary['entries'][number]> = {}): AiEditableMediaLibrary {
  return {
    fps: 30,
    entries: [{
      id: 'user_import_video:asset-1',
      sourceType: 'user_import_video',
      kind: 'video',
      status: 'completed',
      eligibleForTimeline: true,
      url: '/m/import',
      durationInFrames: 45,
      label: 'imported',
      ...overrides,
    }],
  }
}

function pendingVideoMedia(): AiEditableMediaLibrary {
  return {
    fps: 30,
    entries: [{
      id: 'user_import_video:asset-pending',
      sourceType: 'user_import_video',
      kind: 'video',
      status: 'pending',
      eligibleForTimeline: false,
      url: null,
      label: 'pending',
    }],
  }
}

describe('EditorToolExecutor', () => {
  it('clones constructor inputs before draft reads and mutations', () => {
    const project = baseProject()
    const media = completedVideoMedia()
    const executor = new EditorToolExecutor({ project, media })

    project.timeline[0].src = '/changed/project'
    media.entries[0].url = '/changed/media'

    executor.getTimeline()
    executor.getMedia()
    const result = executor.insertClips({ end: true, mediaIds: ['user_import_video:asset-1'] })

    expect(result.project.timeline[0].src).toBe('/m/a')
    expect(result.project.timeline[2].src).toBe('/m/import')
  })

  it('requires reading the timeline before validating pending media', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: pendingVideoMedia(),
    })

    expect(() => executor.insertClips({ afterClipId: 'clip-1', mediaIds: ['user_import_video:asset-pending'] })).toThrow('EDITOR_TOOL_TIMELINE_READ_REQUIRED')
  })

  it('requires reading media before validating pending media', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: pendingVideoMedia(),
    })

    executor.getTimeline()

    expect(() => executor.insertClips({ afterClipId: 'clip-1', mediaIds: ['user_import_video:asset-pending'] })).toThrow('EDITOR_TOOL_MEDIA_READ_REQUIRED')
  })

  it('rejects pending media after timeline and media reads', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: pendingVideoMedia(),
    })

    executor.getTimeline()
    executor.getMedia()

    expect(() => executor.insertClips({ afterClipId: 'clip-1', mediaIds: ['user_import_video:asset-pending'] })).toThrow('EDITOR_TOOL_MEDIA_NOT_ELIGIBLE')
  })

  it('requires reading the timeline before inserting completed media', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia(),
    })

    expect(() => executor.insertClips({ afterClipId: 'clip-1', mediaIds: ['user_import_video:asset-1'] })).toThrow('EDITOR_TOOL_TIMELINE_READ_REQUIRED')
  })

  it('requires reading media after the timeline before inserting completed media', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia(),
    })

    executor.getTimeline()

    expect(() => executor.insertClips({ afterClipId: 'clip-1', mediaIds: ['user_import_video:asset-1'] })).toThrow('EDITOR_TOOL_MEDIA_READ_REQUIRED')
  })

  it('inserts completed video media and ripples later audio and subtitles', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia(),
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

  it('inserts clips before the referenced clip', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia(),
    })

    executor.getTimeline()
    executor.getMedia()
    const result = executor.insertClips({ beforeClipId: 'clip-2', mediaIds: ['user_import_video:asset-1'] })

    expect(result.project.timeline.map((clip) => clip.id)).toEqual(['clip-1', 'clip_asset-1', 'clip-2'])
    expect(result.project.audioTrack[0].startFrame).toBe(135)
  })

  it('inserts clips at the requested index', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia(),
    })

    executor.getTimeline()
    executor.getMedia()
    const result = executor.insertClips({ atIndex: 0, mediaIds: ['user_import_video:asset-1'] })

    expect(result.project.timeline.map((clip) => clip.id)).toEqual(['clip_asset-1', 'clip-1', 'clip-2'])
    expect(result.project.audioTrack[0].startFrame).toBe(135)
  })

  it('inserts clips at the explicit end without rippling existing audio and subtitles', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia(),
    })

    executor.getTimeline()
    executor.getMedia()
    const result = executor.insertClips({ end: true, mediaIds: ['user_import_video:asset-1'] })

    expect(result.project.timeline.map((clip) => clip.id)).toEqual(['clip-1', 'clip-2', 'clip_asset-1'])
    expect(result.project.audioTrack[0].startFrame).toBe(90)
    expect(result.project.subtitleCues[0]).toMatchObject({ startFrame: 90, endFrame: 180 })
  })

  it('uses fps times three as the default duration for images without duration', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia({
        id: 'user_import_image:image-1',
        sourceType: 'user_import_image',
        kind: 'image',
        url: '/m/image',
        durationInFrames: undefined,
      }),
    })

    executor.getTimeline()
    executor.getMedia()
    const result = executor.insertClips({ end: true, mediaIds: ['user_import_image:image-1'] })

    expect(result.project.timeline[2]).toMatchObject({
      id: 'clip_image-1',
      src: '/m/image',
      durationInFrames: 90,
    })
  })

  it('returns operation log and changed state after inserting clips', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia(),
    })

    executor.getTimeline()
    executor.getMedia()
    const result = executor.insertClips({ end: true, mediaIds: ['user_import_video:asset-1'] })

    expect(result.changed).toBe(true)
    expect(result.operations).toEqual([expect.objectContaining({
      tool: 'insertClips',
      targetIds: ['clip_asset-1'],
    })])
  })

  it('preserves inserted clip metadata and falls back missing storyboard id to an empty string', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia({
        assetId: 'asset-from-field',
        id: 'user_import_video:asset-from-id',
        description: 'Imported description',
        storyboardId: undefined,
      }),
    })

    executor.getTimeline()
    executor.getMedia()
    const result = executor.insertClips({ end: true, mediaIds: ['user_import_video:asset-from-id'] })

    expect(result.project.timeline[2].metadata).toMatchObject({
      editorAssetId: 'asset-from-field',
      source: 'user_import_video',
      description: 'Imported description',
      storyboardId: '',
    })
  })

  it('preserves storyboard id when media provides one', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia({ storyboardId: 'storyboard-imported' }),
    })

    executor.getTimeline()
    executor.getMedia()
    const result = executor.insertClips({ end: true, mediaIds: ['user_import_video:asset-1'] })

    expect(result.project.timeline[2].metadata.storyboardId).toBe('storyboard-imported')
  })

  it('undo reverts only the latest draft mutation', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia(),
    })

    executor.getTimeline()
    executor.getMedia()
    executor.insertClips({ afterClipId: 'clip-1', mediaIds: ['user_import_video:asset-1'] })
    const result = executor.undo()

    expect(result.project.timeline.map((clip) => clip.id)).toEqual(['clip-1', 'clip-2'])
    expect(result.changed).toBe(false)
  })
})
