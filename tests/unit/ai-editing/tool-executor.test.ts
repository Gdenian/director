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

function transitionProject(): VideoEditorProject {
  const project = baseProject()
  project.timeline[0].transition = { type: 'dissolve', durationInFrames: 30 }
  project.audioTrack[0].startFrame = 75
  project.subtitleCues[0].startFrame = 75
  project.subtitleCues[0].endFrame = 165
  return project
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
  it('returns readable computed timeline context', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia(),
    })

    const result = executor.getTimeline()

    expect(result.config).toEqual({ fps: 30, width: 1920, height: 1080, videoRatio: '16:9', burnSubtitlesDefault: true })
    expect(result.clips[0]).toMatchObject({ id: 'clip-1', startFrame: 0, endFrame: 90 })
    expect(result.clips[1]).toMatchObject({ id: 'clip-2', startFrame: 90, endFrame: 180 })
    expect(result.audioTrack).toEqual(baseProject().audioTrack)
    expect(result.subtitleCues).toEqual(baseProject().subtitleCues)
    expect(result.totalFrames).toBe(180)
  })

  it('returns readable media context with status and timeline eligibility', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: {
        fps: 30,
        entries: [
          completedVideoMedia().entries[0],
          pendingVideoMedia().entries[0],
        ],
      },
    })

    const result = executor.getMedia()

    expect(result.entries).toEqual([
      expect.objectContaining({ id: 'user_import_video:asset-1', status: 'completed', eligibleForTimeline: true }),
      expect.objectContaining({ id: 'user_import_video:asset-pending', status: 'pending', eligibleForTimeline: false }),
    ])
  })

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

  it('rejects completed audio media after timeline and media reads', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia({
        id: 'user_import_audio:audio-1',
        sourceType: 'user_import_audio',
        kind: 'audio',
        url: '/m/audio',
      }),
    })

    executor.getTimeline()
    executor.getMedia()

    expect(() => executor.insertClips({ afterClipId: 'clip-1', mediaIds: ['user_import_audio:audio-1'] })).toThrow('EDITOR_TOOL_MEDIA_NOT_ELIGIBLE')
  })

  it('rejects completed media without url after timeline and media reads', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia({
        url: null,
        eligibleForTimeline: true,
      }),
    })

    executor.getTimeline()
    executor.getMedia()

    expect(() => executor.insertClips({ afterClipId: 'clip-1', mediaIds: ['user_import_video:asset-1'] })).toThrow('EDITOR_TOOL_MEDIA_NOT_ELIGIBLE')
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
      metadata: { editorAssetId: 'asset-1', source: 'imported', mediaSourceType: 'user_import_video' },
    })
    expect(result.project.audioTrack[0].startFrame).toBe(135)
    expect(result.project.subtitleCues[0]).toMatchObject({ startFrame: 135, endFrame: 225 })
  })

  it('throws when the after clip anchor is missing', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia(),
    })

    executor.getTimeline()
    executor.getMedia()

    expect(() => executor.insertClips({ afterClipId: 'missing-clip', mediaIds: ['user_import_video:asset-1'] })).toThrow('EDITOR_TOOL_CLIP_NOT_FOUND')
  })

  it('throws when the before clip anchor is missing', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia(),
    })

    executor.getTimeline()
    executor.getMedia()

    expect(() => executor.insertClips({ beforeClipId: 'missing-clip', mediaIds: ['user_import_video:asset-1'] })).toThrow('EDITOR_TOOL_CLIP_NOT_FOUND')
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

  it('generates unique clip ids when inserting the same media multiple times', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia(),
    })

    executor.getTimeline()
    executor.getMedia()
    executor.insertClips({ end: true, mediaIds: ['user_import_video:asset-1'] })
    const result = executor.insertClips({ end: true, mediaIds: ['user_import_video:asset-1'] })

    expect(result.project.timeline.map((clip) => clip.id)).toEqual(['clip-1', 'clip-2', 'clip_asset-1', 'clip_asset-1_2'])
    expect(result.project.timeline[2].metadata.editorAssetId).toBe('asset-1')
    expect(result.project.timeline[3].metadata.editorAssetId).toBe('asset-1')
  })

  it('generates unique clip ids when inserting duplicate media in one operation', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia(),
    })

    executor.getTimeline()
    executor.getMedia()
    const result = executor.insertClips({
      end: true,
      mediaIds: ['user_import_video:asset-1', 'user_import_video:asset-1'],
    })

    expect(result.project.timeline.map((clip) => clip.id)).toEqual(['clip-1', 'clip-2', 'clip_asset-1', 'clip_asset-1_2'])
    expect(result.operations[0].targetIds).toEqual(['clip_asset-1', 'clip_asset-1_2'])
  })

  it('rejects empty media ids without recording a mutation', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia(),
    })

    executor.getTimeline()
    executor.getMedia()

    expect(() => executor.insertClips({ end: true, mediaIds: [] })).toThrow('EDITOR_TOOL_EMPTY_MEDIA_IDS')

    const result = executor.undo()
    expect(result.changed).toBe(false)
    expect(result.operations).toEqual([])
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

  it('uses fps times three as the default duration for video with non-positive duration', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia({ durationInFrames: 0 }),
    })

    executor.getTimeline()
    executor.getMedia()
    const result = executor.insertClips({ end: true, mediaIds: ['user_import_video:asset-1'] })

    expect(result.project.timeline[2].durationInFrames).toBe(90)
  })

  it('uses computed positions when rippling through a transition timeline', () => {
    const executor = new EditorToolExecutor({
      project: transitionProject(),
      media: completedVideoMedia(),
    })

    executor.getTimeline()
    executor.getMedia()
    const result = executor.insertClips({ beforeClipId: 'clip-2', mediaIds: ['user_import_video:asset-1'] })

    expect(result.project.timeline.map((clip) => clip.id)).toEqual(['clip-1', 'clip_asset-1', 'clip-2'])
    expect(result.project.audioTrack[0].startFrame).toBe(120)
    expect(result.project.subtitleCues[0]).toMatchObject({ startFrame: 120, endFrame: 210 })
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
      tool: 'insert_clips',
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
      source: 'imported',
      mediaSourceType: 'user_import_video',
      description: 'Imported description',
      storyboardId: '',
    })
  })

  it('maps generated media source types to editor semantic sources', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: {
        fps: 30,
        entries: [
          completedVideoMedia({ id: 'generated_panel_video:panel-asset', sourceType: 'generated_panel_video', assetId: undefined }).entries[0],
          completedVideoMedia({ id: 'generated_lip_sync_video:lip-asset', sourceType: 'generated_lip_sync_video', assetId: undefined }).entries[0],
          completedVideoMedia({ id: 'generated_transition_bridge:transition-asset', sourceType: 'generated_transition_bridge', assetId: 'transition-asset' }).entries[0],
          completedVideoMedia({ id: 'render_output:render-asset', sourceType: 'render_output', assetId: 'render-asset' }).entries[0],
        ],
      },
    })

    executor.getTimeline()
    executor.getMedia()
    const result = executor.insertClips({
      end: true,
      mediaIds: [
        'generated_panel_video:panel-asset',
        'generated_lip_sync_video:lip-asset',
        'generated_transition_bridge:transition-asset',
        'render_output:render-asset',
      ],
    })

    expect(result.project.timeline.slice(2).map((clip) => clip.metadata)).toEqual([
      expect.objectContaining({ source: 'panel', mediaSourceType: 'generated_panel_video' }),
      expect.objectContaining({ source: 'lip_sync', mediaSourceType: 'generated_lip_sync_video' }),
      expect.objectContaining({ source: 'ai_transition', mediaSourceType: 'generated_transition_bridge' }),
      expect.objectContaining({ source: 'imported', mediaSourceType: 'render_output' }),
    ])
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

  it('replaces a clip with completed media and clamps linked attachments', () => {
    const project = baseProject()
    project.timeline[1].transition = { type: 'fade', durationInFrames: 12 }
    project.audioTrack[0] = { ...project.audioTrack[0], durationInFrames: 90, sourceVoiceLineId: 'voice-2' }
    project.subtitleCues[0] = { ...project.subtitleCues[0], endFrame: 180, sourceVoiceLineId: 'voice-2' }
    const executor = new EditorToolExecutor({
      project,
      media: completedVideoMedia({ assetId: 'replacement', durationInFrames: 45, sourcePanelId: 'panel-2', voiceLineId: 'voice-2' }),
    })

    executor.getTimeline()
    executor.getMedia()
    const result = executor.replaceClip({ clipId: 'clip-2', mediaId: 'user_import_video:asset-1' })

    expect(result.project.timeline.map((clip) => clip.id)).toEqual(['clip-1', 'clip_replacement'])
    expect(result.project.timeline[1]).toMatchObject({
      src: '/m/import',
      durationInFrames: 45,
      transition: { type: 'fade', durationInFrames: 12 },
      metadata: { editorAssetId: 'replacement', source: 'imported', mediaSourceType: 'user_import_video' },
    })
    expect(result.project.audioTrack[0]).toMatchObject({ clipId: 'clip_replacement', startFrame: 90, durationInFrames: 45 })
    expect(result.project.subtitleCues[0]).toMatchObject({ startFrame: 90, endFrame: 135 })
    expect(result.operations[0]).toMatchObject({ tool: 'replace_clip', targetIds: ['clip_replacement'] })
  })

  it('sets clip duration, source trim, and validates transition frame bounds', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia(),
    })

    executor.getTimeline()
    executor.getMedia()
    const result = executor.setClipProperties({
      clipId: 'clip-2',
      durationInFrames: 45,
      sourceTrim: { fromFrame: 5, toFrame: 50 },
      transition: { type: 'dissolve', durationInFrames: 30 },
    })

    expect(result.project.timeline[1]).toMatchObject({
      durationInFrames: 45,
      sourceTrim: { fromFrame: 5, toFrame: 50 },
      transition: { type: 'dissolve', durationInFrames: 30 },
    })
    expect(result.project.audioTrack[0]).toMatchObject({ startFrame: 90, durationInFrames: 45 })
    expect(result.project.subtitleCues[0]).toMatchObject({ startFrame: 90, endFrame: 135 })
    expect(result.operations[0]).toMatchObject({ tool: 'set_clip_properties', targetIds: ['clip-2'] })

    expect(() => executor.setClipProperties({ clipId: 'clip-2', transition: { type: 'fade', durationInFrames: 31 } })).toThrow('EDITOR_TOOL_INVALID_TRANSITION')
    expect(() => executor.setClipProperties({ clipId: 'clip-2', sourceTrim: { fromFrame: 10, toFrame: 10 } })).toThrow('EDITOR_TOOL_INVALID_SOURCE_TRIM')
  })

  it('moves clips and recalculates anchored attachments', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia(),
    })

    executor.getTimeline()
    executor.getMedia()
    const result = executor.moveClips({ clipIds: ['clip-2'], toIndex: 0 })

    expect(result.project.timeline.map((clip) => clip.id)).toEqual(['clip-2', 'clip-1'])
    expect(result.project.audioTrack[0]).toMatchObject({ clipId: 'clip-2', sourcePanelId: 'panel-2', startFrame: 0, durationInFrames: 90 })
    expect(result.project.subtitleCues[0]).toMatchObject({ sourcePanelId: 'panel-2', startFrame: 0, endFrame: 90 })
    expect(result.operations[0]).toMatchObject({ tool: 'move_clips', targetIds: ['clip-2'] })
  })

  it('splits a clip at the requested frame and adjusts source trim', () => {
    const project = baseProject()
    project.timeline[0].sourceTrim = { fromFrame: 10, toFrame: 100 }
    const executor = new EditorToolExecutor({
      project,
      media: completedVideoMedia(),
    })

    executor.getTimeline()
    executor.getMedia()
    const result = executor.splitClip({ clipId: 'clip-1', atFrame: 30 })

    expect(result.project.timeline.map((clip) => clip.id)).toEqual(['clip-1', 'clip-1_split_30', 'clip-2'])
    expect(result.project.timeline.map((clip) => clip.durationInFrames)).toEqual([30, 60, 90])
    expect(result.project.timeline[0].sourceTrim).toEqual({ fromFrame: 10, toFrame: 40 })
    expect(result.project.timeline[1].sourceTrim).toEqual({ fromFrame: 40, toFrame: 100 })
    expect(result.operations[0]).toMatchObject({ tool: 'split_clip', targetIds: ['clip-1', 'clip-1_split_30'] })
  })

  it('ripple deletes ranges by removing, trimming, and shifting timeline attachments', () => {
    const project = baseProject()
    project.timeline = [
      project.timeline[0],
      { ...project.timeline[1], durationInFrames: 30 },
      {
        id: 'clip-3',
        kind: 'source',
        src: '/m/c',
        durationInFrames: 60,
        metadata: { storyboardId: 'storyboard-3', sourcePanelId: 'panel-3', storyOrder: 2, source: 'panel' },
      },
    ]
    project.audioTrack = [
      { id: 'audio-inside', src: '/m/inside', startFrame: 20, durationInFrames: 10, volume: 1 },
      { id: 'audio-overlap', src: '/m/overlap', startFrame: 80, durationInFrames: 30, sourcePanelId: 'panel-1', clipId: 'clip-1', volume: 1 },
      { id: 'audio-later', src: '/m/later', startFrame: 120, durationInFrames: 30, sourcePanelId: 'panel-3', clipId: 'clip-3', volume: 1 },
    ]
    project.subtitleCues = [
      { id: 'subtitle-inside', text: 'inside', startFrame: 25, endFrame: 35, style: 'default' },
      { id: 'subtitle-overlap', text: 'overlap', startFrame: 85, endFrame: 115, style: 'default' },
      { id: 'subtitle-later', text: 'later', startFrame: 120, endFrame: 150, sourcePanelId: 'panel-3', style: 'default' },
    ]
    const executor = new EditorToolExecutor({
      project,
      media: completedVideoMedia(),
    })

    executor.getTimeline()
    executor.getMedia()
    const result = executor.rippleDeleteRanges({ ranges: [{ startFrame: 30, endFrame: 120 }] })

    expect(result.project.timeline.map((clip) => ({ id: clip.id, durationInFrames: clip.durationInFrames }))).toEqual([
      { id: 'clip-1', durationInFrames: 30 },
      { id: 'clip-3', durationInFrames: 60 },
    ])
    expect(result.project.audioTrack).toEqual([
      expect.objectContaining({ id: 'audio-inside', startFrame: 20, durationInFrames: 10 }),
      expect.objectContaining({ id: 'audio-later', startFrame: 30, durationInFrames: 30 }),
    ])
    expect(result.project.subtitleCues).toEqual([
      expect.objectContaining({ id: 'subtitle-inside', startFrame: 25, endFrame: 30 }),
      expect.objectContaining({ id: 'subtitle-later', startFrame: 30, endFrame: 60 }),
    ])
    expect(result.operations[0]).toMatchObject({ tool: 'ripple_delete_ranges' })
  })

  it('rejects ripple delete ranges that are not sorted', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia(),
    })

    executor.getTimeline()
    executor.getMedia()

    expect(() => executor.rippleDeleteRanges({
      ranges: [
        { startFrame: 90, endFrame: 100 },
        { startFrame: 30, endFrame: 40 },
      ],
    })).toThrow('EDITOR_TOOL_INVALID_RANGES')
  })

  it('transforms attachments against multiple delete ranges in original timeline coordinates', () => {
    const project = baseProject()
    project.audioTrack = [
      { id: 'audio-multi-range', src: '/m/audio', startFrame: 95, durationInFrames: 30, volume: 1 },
    ]
    project.subtitleCues = [
      { id: 'subtitle-multi-range', text: 'multi', startFrame: 95, endFrame: 125, style: 'default' },
    ]
    const executor = new EditorToolExecutor({
      project,
      media: completedVideoMedia(),
    })

    executor.getTimeline()
    executor.getMedia()
    const result = executor.rippleDeleteRanges({
      ranges: [
        { startFrame: 30, endFrame: 40 },
        { startFrame: 90, endFrame: 100 },
      ],
    })

    expect(result.project.audioTrack).toEqual([
      expect.objectContaining({ id: 'audio-multi-range', startFrame: 80, durationInFrames: 25 }),
    ])
    expect(result.project.subtitleCues).toEqual([
      expect.objectContaining({ id: 'subtitle-multi-range', startFrame: 80, endFrame: 105 }),
    ])
  })

  it('returns transcript cues ordered by start frame', () => {
    const project = baseProject()
    project.subtitleCues = [
      { id: 'subtitle-2', text: 'second', startFrame: 90, endFrame: 120, sourcePanelId: 'panel-2', sourceVoiceLineId: 'voice-2', style: 'default' },
      { id: 'subtitle-1', text: 'first', startFrame: 0, endFrame: 45, sourcePanelId: 'panel-1', sourceVoiceLineId: 'voice-1', style: 'default' },
    ]
    const executor = new EditorToolExecutor({
      project,
      media: completedVideoMedia(),
    })

    expect(executor.getTranscript()).toEqual([
      { text: 'first', startFrame: 0, endFrame: 45, sourcePanelId: 'panel-1', sourceVoiceLineId: 'voice-1' },
      { text: 'second', startFrame: 90, endFrame: 120, sourcePanelId: 'panel-2', sourceVoiceLineId: 'voice-2' },
    ])
  })

  it('adds captions from voice audio media without duplicating voice line cues', () => {
    const project = baseProject()
    project.subtitleCues = [{ ...project.subtitleCues[0], sourceVoiceLineId: 'voice-existing' }]
    const executor = new EditorToolExecutor({
      project,
      media: {
        fps: 30,
        entries: [
          completedVideoMedia({
            id: 'voice_audio:voice-2',
            sourceType: 'voice_audio',
            kind: 'audio',
            durationInFrames: 42,
            sourcePanelId: 'panel-2',
            voiceLineId: 'voice-2',
            description: 'New line',
            url: '/m/voice-2',
          }).entries[0],
          completedVideoMedia({
            id: 'voice_audio:voice-existing',
            sourceType: 'voice_audio',
            kind: 'audio',
            durationInFrames: 30,
            sourcePanelId: 'panel-2',
            voiceLineId: 'voice-existing',
            description: 'Existing line',
            url: '/m/existing',
          }).entries[0],
        ],
      },
    })

    executor.getTimeline()
    executor.getMedia()
    const result = executor.addCaptions({})

    expect(result.project.subtitleCues).toEqual([
      expect.objectContaining({ id: 'subtitle-2', sourceVoiceLineId: 'voice-existing' }),
      expect.objectContaining({ text: 'New line', startFrame: 90, endFrame: 132, sourcePanelId: 'panel-2', sourceVoiceLineId: 'voice-2', style: 'default' }),
    ])
    expect(result.operations[0]).toMatchObject({ tool: 'add_captions', targetIds: ['caption_voice-2'] })
  })

  it('inspects cloned media entries and rejects missing media', () => {
    const executor = new EditorToolExecutor({
      project: baseProject(),
      media: completedVideoMedia({ description: 'Imported description' }),
    })

    executor.getMedia()
    const media = executor.inspectMedia({ mediaId: 'user_import_video:asset-1' })

    media.description = 'mutated clone'
    expect(executor.inspectMedia({ mediaId: 'user_import_video:asset-1' }).description).toBe('Imported description')
    expect(() => executor.inspectMedia({ mediaId: 'missing-media' })).toThrow('EDITOR_TOOL_MEDIA_NOT_FOUND')
  })
})
